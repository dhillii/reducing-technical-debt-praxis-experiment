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

    #initializeRetryConfig(configType, providedConfig) {
        const isDevEnvironment = process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development';
        const configKey = `#${configType}_RETRY_CONFIG`;
        
        if (providedConfig) {
            this[configKey] = providedConfig;
        } else if (isDevEnvironment) {
            this[configKey] = {maxRetries: 0};
        }
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
            await this.#updateEmailStatus(emailId, 'submitted', {submitted_at: new Date(), error: null});
        } catch (e) {
            await this.#handleEmailJobError(emailId, email, e);
        }
    }

    async #updateEmailStatus(emailId, status, updates) {
        await this.retryDb(async () => {
            const email = await this.#models.Email.findOne({id: emailId});
            await email.save({
                status,
                ...updates
            }, {patch: true, autoRefresh: false});
        }, {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> ${status}`});
    }

    async #handleEmailJobError(emailId, email, e) {
        const ghostError = new errors.EmailError({
            err: e,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });

        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(e);
        }

        await this.#updateEmailStatus(emailId, 'failed', {
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
            logging.info(`Creating batches for email ${email.id} segment ${segment}`);

            const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);

            // Avoiding Bookshelf for performance reasons
            let members;

            // Start with the id of the email, which is an objectId. We'll only fetch members that are created before the email. This is a special property of ObjectIds.
            // Note: we use ID and not created_at, because imported members could set a created_at in the future or past and avoid limit checking.
            let lastId = email.id;

            while (!members || lastId) {
                logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId}`);

                const filter = segmentFilter + `+id:<'${lastId}'`;
                logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

                members = await this.#models.Member.getFilteredCollectionQuery({filter})
                    .orderByRaw('id DESC')
                    .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(BATCH_SIZE + 1);

                if (members.length > 0) {
                    totalCount += await this.#processMemberBatch({
                        email,
                        segment,
                        members,
                        domainWarmupLimit,
                        totalCount,
                        batches,
                        BATCH_SIZE
                    });
                }

                if (members.length > BATCH_SIZE) {
                    lastId = members[members.length - 2].id;
                } else {
                    break;
                }
            }
        }

        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

        await this.#validateAndUpdateEmailCount(email, totalCount, domainWarmupLimit);
        return batches;
    }

    async #processMemberBatch({email, segment, members, domainWarmupLimit, totalCount, batches, BATCH_SIZE}) {
        const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);

        const shouldSplitBatch = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;
        
        if (shouldSplitBatch) {
            // Split batch: some via custom domain, rest via fallback
            await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, remainingCustomDomainCapacity),
                useFallbackDomain: false,
                batches
            });
            await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(remainingCustomDomainCapacity, membersToProcess),
                useFallbackDomain: true,
                batches
            });
        } else {
            // Single batch: all members use same domain
            await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: totalCount >= domainWarmupLimit,
                batches
            });
        }

        return membersToProcess;
    }

    async #validateAndUpdateEmailCount(email, totalCount, domainWarmupLimit) {
        if (email.get('email_count') !== totalCount) {
            logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

            // If the error rate is greater than 1%, we log it to Sentry so we can investigate
            // Some differences are expected, e.g. if a new member signs up while we are sending the email
            const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
            if (this.#sentry && errorRate >= 0.01) {
                // we don't have a real exception, so just log a message to Sentry
                this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
            }

            // We update the email model because this might happen in rare cases where the initial member count changed (e.g. deleted members)
            // between creating the email and sending it
            const newEmailUpdate = {
                email_count: totalCount
            };
            if (this.#domainWarmingService.isEnabled()) {
                newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
            }

            await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
        }
    }

    /**
     * Creates a batch with retry logic and adds it to the batches array