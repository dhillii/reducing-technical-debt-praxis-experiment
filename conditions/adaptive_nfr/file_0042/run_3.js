```javascript
const logging = require('@tryghost/logging');
const ObjectID = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const EmailBodyCache = require('./email-body-cache');

const messages = {
    emailErrorPartialFailure: 'An error occurred, and your newsletter was only partially sent. Please retry sending the remaining emails.',
    emailError: 'An unexpected error occurred, please retry sending your newsletter.'
};

const MAX_SENDING_CONCURRENCY = 2;

/**
 * @typedef {import('./sending-service')} SendingService
 * @typedef {import('./email-segmenter')} EmailSegmenter
 * @typedef {import('./email-renderer')} EmailRenderer
 * @typedef {import('./domain-warming-service').DomainWarmingService} DomainWarmingService
 * @typedef {import('./email-renderer').MemberLike} MemberLike
 * @typedef {object} JobsService
 * @typedef {object} Email
 * @typedef {object} Newsletter
 * @typedef {object} Post
 * @typedef {object} EmailBatch
 */

class BatchSendingService {
    #emailRenderer;
    #sendingService;
    #emailSegmenter;
    #domainWarmingService;
    #jobsService;
    #models;
    #db;
    #sentry;
    #debugStorageFilePath;

    // Retry database queries happening before sending the email
    #BEFORE_RETRY_CONFIG = {maxRetries: 10, maxTime: 10 * 60 * 1000, sleep: 2000};
    #AFTER_RETRY_CONFIG = {maxRetries: 20, maxTime: 30 * 60 * 1000, sleep: 2000};
    #MAILGUN_API_RETRY_CONFIG = {sleep: 10 * 1000, maxRetries: 6};

    /**
     * @param {Object} dependencies
     * @param {EmailRenderer} dependencies.emailRenderer
     * @param {SendingService} dependencies.sendingService
     * @param {JobsService} dependencies.jobsService
     * @param {EmailSegmenter} dependencies.emailSegmenter
     * @param {DomainWarmingService} dependencies.domainWarmingService
     * @param {object} dependencies.models
     * @param {object} dependencies.models.EmailRecipient
     * @param {EmailBatch} dependencies.models.EmailBatch
     * @param {Email} dependencies.models.Email
     * @param {object} dependencies.models.Member
     * @param {object} dependencies.db
     * @param {object} [dependencies.sentry]
     * @param {object} [dependencies.BEFORE_RETRY_CONFIG]
     * @param {object} [dependencies.AFTER_RETRY_CONFIG]
     * @param {object} [dependencies.MAILGUN_API_RETRY_CONFIG]
     * @param {string} [dependencies.debugStorageFilePath]
     */
    constructor({
        emailRenderer,
        sendingService,
        jobsService,
        emailSegmenter,
        domainWarmingService,
        models,
        db,
        sentry,
        BEFORE_RETRY_CONFIG,
        AFTER_RETRY_CONFIG,
        MAILGUN_API_RETRY_CONFIG,
        debugStorageFilePath
    }) {
        this.#emailRenderer = emailRenderer;
        this.#sendingService = sendingService;
        this.#jobsService = jobsService;
        this.#emailSegmenter = emailSegmenter;
        this.#domainWarmingService = domainWarmingService;
        this.#models = models;
        this.#db = db;
        this.#sentry = sentry;
        this.#debugStorageFilePath = debugStorageFilePath;

        this.#initializeRetryConfig('BEFORE', BEFORE_RETRY_CONFIG);
        this.#initializeRetryConfig('AFTER', AFTER_RETRY_CONFIG);
        this.#initializeRetryConfig('MAILGUN_API', MAILGUN_API_RETRY_CONFIG);
    }

    /**
     * Initializes retry configuration based on environment
     * @private
     * @param {string} configType - Type of config to initialize
     * @param {object} providedConfig - Provided configuration
     */
    #initializeRetryConfig(configType, providedConfig) {
        if (providedConfig) {
            this[`#${configType}_RETRY_CONFIG`] = providedConfig;
            return;
        }

        if (this.#isTestOrDevEnvironment()) {
            this[`#${configType}_RETRY_CONFIG`] = {maxRetries: 0};
        }
    }

    /**
     * Checks if environment is test or development
     * @private
     * @returns {boolean}
     */
    #isTestOrDevEnvironment() {
        return process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development';
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime};
        }
        return this.#BEFORE_RETRY_CONFIG;
    }

    /**
     * Schedules a background job that sends the email in the background if it is pending or failed.
     * @param {Email} email
     * @returns {void}
     */
    scheduleEmail(email) {
        return this.#jobsService.addJob({
            name: 'batch-sending-service-job',
            job: this.emailJob.bind(this),
            data: {emailId: email.id},
            offloaded: false
        });
    }

    /**
     * @private
     * @param {{emailId: string}} data Data passed from the job service. We only need the emailId because we need to refetch the email anyway to make sure the status is right and 'locked'.
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const startTime = Date.now();

        // Check if email is 'pending' only + change status to submitting in one transaction.
        // This allows us to have a lock around the email job that makes sure an email can only have one active job.
        let email = await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        // We'll stop all automatic DB retries after this date
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26; // In case of database issues, we make sure we expand the retry window relative to the amount of batches
        const stopAfter = Math.max(expectedBatchCount * minimumSecondsPerBatch * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        const retryCutOffTime = new Date(startTime + stopAfter);

        // Save a strict cutoff time for retries
        email._retryCutOffTime = retryCutOffTime;

        try {
            await this.sendEmail(email);
            await this.#saveEmailStatus(email, emailId, 'submitted', {submitted_at: new Date(), error: null});
        } catch (e) {
            await this.#handleEmailSendError(e, email, emailId);
        }
    }

    /**
     * Saves email status with retry logic
     * @private
     * @param {Email} email
     * @param {string} emailId
     * @param {string} status
     * @param {object} updates
     */
    async #saveEmailStatus(email, emailId, status, updates) {
        await this.retryDb(async () => {
            await email.save({
                status,
                ...updates
            }, {patch: true, autoRefresh: false});
        }, {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> ${status}`});
    }

    /**
     * Handles email send errors
     * @private
     * @param {Error} e
     * @param {Email} email
     * @param {string} emailId
     */
    async #handleEmailSendError(e, email, emailId) {
        const ghostError = new errors.EmailError({
            err: e,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });

        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(e);
        }

        await this.#saveEmailStatus(email, emailId, 'failed', {
            error: e.message || 'Something went wrong while sending the email'
        });
    }

    /**
     * @private
     * @param {Email} email
     * @throws {errors.EmailError} If one of the batches fails
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        // Load required relations
        const newsletter = await this.retryDb(async () => {
            return await email.getLazyRelation('newsletter', {require: true});
        }, {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`});

        const post = await this.retryDb(async () => {
            return await email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']});
        }, {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`});

        let batches = await this.retryDb(async () => {
            return await this.getBatches(email);
        }, {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`});

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }
        await this.sendBatches({email, batches, post, newsletter});
    }

    /**
     * @private
     * @param {Email} email
     * @returns {Promise<EmailBatch[]>}
     */
    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);

        // findAll returns a bookshelf collection, we want to return a plain array to align with the createBatches method
        const batches = await this.#models.EmailBatch.findAll({filter: 'email_id:\'' + email.id + '\''});
        return batches.models;
    }

    /**
     * @private
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     * @returns {Promise<EmailBatch[]>}
     */
    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        // Infinity implies all emails should be sent from the primary domain
        let domainWarmupLimit = Infinity;
        if (this.#domainWarmingService.isEnabled()) {
            domainWarmupLimit = Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
        }

        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            totalCount += await this.#processBatchSegment({
                email,
                segment,
                newsletter,
                batches,
                BATCH_SIZE,
                domainWarmupLimit
            });
        }

        await this.#validateAndUpdateEmailCount(email, totalCount, domainWarmupLimit);
        return batches;
    }

    /**
     * Processes a single segment for batch creation
     * @private
     * @param {object} params
     * @returns {Promise<number>} Total count of members processed
     */
    async #processBatchSegment({email, segment, newsletter, batches, BATCH_SIZE, domainWarmupLimit}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let totalCount = 0;
        let lastId = email.id;

        while (lastId) {
            const members = await this.#fetchMembersForSegment({
                email,
                segment,
                segmentFilter,
                lastId,
                BATCH_SIZE
            });

            if (members.length === 0) {
                break;
            }

            totalCount += await this.#processMemberBatch({
                email,
                segment,
                members,
                batches,
                BATCH_SIZE,
                domainWarmupLimit,
                totalCount
            });

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }

        return totalCount;
    }

    /**
     * Fetches members for a segment
     * @private
     * @param {object} params
     * @returns {Promise<object[]>}
     */
    async #fetchMembersForSegment({email, segment, segmentFilter, lastId, BATCH_SIZE}) {
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId}`);

        const filter = segmentFilter + `+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

        return await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(BATCH_SIZE + 1);
    }

    /**
     * Processes a batch of members
     * @private
     * @param {object} params
     * @returns {Promise<number>} Count of members processed
     */
    async #processMemberBatch({email, segment, members, batches, BATCH_SIZE, domainWarmupLimit, totalCount}) {
        const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);

        if (this.#shouldSplitBatch(remainingCustomDomainCapacity, membersToProcess)) {
            return await this.#processSplitBatch({
                email,
                segment,
                members,
                batches,
                remainingCustomDomainCapacity,
                membersToProcess
            });
        }

        return await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, membersToProcess),
            useFallbackDomain: totalCount >= domainWarmupLimit,
            batches
        });
    }

    /**
     * Checks if batch should be split
     * @private
     * @param {number} remainingCapacity
     * @param {number} membersToProcess
     * @returns {boolean}
     */
    #shouldSplitBatch(remainingCapacity, membersToProcess) {
        return remainingCapacity > 0 && remainingCapacity < membersToProcess;
    }

    /**
     * Processes a split batch
     * @private
     * @param {object} params
     * @returns {Promise<number>} Total count of members processed
     */
    async #processSplitBatch({email, segment