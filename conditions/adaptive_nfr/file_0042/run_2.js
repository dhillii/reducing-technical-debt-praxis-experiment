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
const IS_NON_PRODUCTION = () => process.env.NODE_ENV?.startsWith('test') || process.env.NODE_ENV === 'development';

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

        this.#BEFORE_RETRY_CONFIG = this.#resolveRetryConfig(BEFORE_RETRY_CONFIG, this.#BEFORE_RETRY_CONFIG);
        this.#AFTER_RETRY_CONFIG = this.#resolveRetryConfig(AFTER_RETRY_CONFIG, this.#AFTER_RETRY_CONFIG);
        this.#MAILGUN_API_RETRY_CONFIG = this.#resolveRetryConfig(MAILGUN_API_RETRY_CONFIG, this.#MAILGUN_API_RETRY_CONFIG);
    }

    #resolveRetryConfig(provided, defaultConfig) {
        if (provided) {
            return provided;
        }
        return IS_NON_PRODUCTION() ? {maxRetries: 0} : defaultConfig;
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime};
        }
        return this.#BEFORE_RETRY_CONFIG;
    }

    #captureException(err) {
        if (this.#sentry) {
            this.#sentry.captureException(err);
        }
    }

    #captureMessage(message) {
        if (this.#sentry) {
            this.#sentry.captureMessage(message);
        }
    }

    #logAndCapture(err) {
        logging.error(err);
        this.#captureException(err);
    }

    #wrapEmailError(err, message, context) {
        return new errors.EmailError({
            err,
            code: 'BULK_EMAIL_SEND_FAILED',
            message,
            context: context ?? err.message
        });
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
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const startTime = Date.now();

        let email = await this.retryDb(
            () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );

        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        email._retryCutOffTime = this.#calculateRetryCutOffTime(email, startTime);

        try {
            await this.sendEmail(email);
            await this.retryDb(
                () => email.save({status: 'submitted', submitted_at: new Date(), error: null}, {patch: true, autoRefresh: false}),
                {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> submitted`}
            );
        } catch (e) {
            const ghostError = this.#wrapEmailError(e, `Error sending email ${email.id}`);
            logging.error(ghostError);
            this.#captureException(e);

            await this.retryDb(
                () => email.save({status: 'failed', error: e.message || 'Something went wrong while sending the email'}, {patch: true, autoRefresh: false}),
                {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> failed`}
            );
        }
    }

    #calculateRetryCutOffTime(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(expectedBatchCount * minimumSecondsPerBatch * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        return new Date(startTime + stopAfter);
    }

    /**
     * @private
     * @param {Email} email
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const retryConfig = this.#getBeforeRetryConfig(email);

        const newsletter = await this.retryDb(
            () => email.getLazyRelation('newsletter', {require: true}),
            {...retryConfig, description: `getLazyRelation newsletter for email ${email.id}`}
        );

        const post = await this.retryDb(
            () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
            {...retryConfig, description: `getLazyRelation post for email ${email.id}`}
        );

        let batches = await this.retryDb(
            () => this.getBatches(email),
            {...retryConfig, description: `getBatches for email ${email.id}`}
        );

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
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return batches.models;
    }

    /**
     * @private
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     * @returns {Promise<EmailBatch[]>}
     */
    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#getDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            totalCount += await this.#createBatchesForSegment({email, newsletter, segment, batches, BATCH_SIZE, domainWarmupLimit, totalCount});
        }

        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

        await this.#reconcileEmailCount(email, totalCount, domainWarmupLimit);

        return batches;
    }

    #getDomainWarmupLimit(email) {
        if (this.#domainWarmingService.isEnabled()) {
            return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
        }
        return Infinity;
    }

    async #createBatchesForSegment({email, newsletter, segment, batches, BATCH_SIZE, domainWarmupLimit, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let members;
        let lastId = email.id;
        let segmentCount = 0;

        while (!members || lastId) {
            logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId}`);

            const filter = `${segmentFilter}+id:<'${lastId}'`;
            logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

            members = await this.#models.Member.getFilteredCollectionQuery({filter})
                .orderByRaw('id DESC')
                .select('members.id', 'members.uuid', 'members.email', 'members.name')
                .limit(BATCH_SIZE + 1);

            if (members.length > 0) {
                const membersToProcess = Math.min(members.length, BATCH_SIZE);
                const currentTotal = totalCount + segmentCount;
                const remainingCustomDomainCapacity = domainWarmupLimit - currentTotal;

                segmentCount += await this.#assignMembersToBatches({
                    email,
                    segment,
                    members,
                    membersToProcess,
                    remainingCustomDomainCapacity,
                    currentTotal,
                    domainWarmupLimit,
                    batches
                });
            }

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }

        return segmentCount;
    }

    async #assignMembersToBatches({email, segment, members, membersToProcess, remainingCustomDomainCapacity, currentTotal, domainWarmupLimit, batches}) {
        const shouldSplitBatch = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;

        if (shouldSplitBatch) {
            let count = 0;
            count += await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(0, remainingCustomDomainCapacity),
                useFallbackDomain: false,
                batches
            });
            count += await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(remainingCustomDomainCapacity, membersToProcess),
                useFallbackDomain: true,
                batches
            });
            return count;
        }

        return await this.#createBatchWithRetry({
            email, segment,
            members: members.slice(0, membersToProcess),
            useFallbackDomain: currentTotal >= domainWarmupLimit,
            batches
        });
    }

    async #reconcileEmailCount(email, totalCount, domainWarmupLimit) {
        if (email.get('email_count') === totalCount) {
            return;
        }

        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (errorRate >= 0.01) {
            this.#captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }

        const update = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            update.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(update, {patch: true, require: false, autoRefresh: false});
    }

    /**
     * @param {object} params
     * @param {Email} params.email
     * @param {import('./email-renderer').Segment} params.segment
     * @param {object[]} params.members
     * @param {boolean} params.useFallbackDomain
     * @param {EmailBatch[]} params.batches
     * @returns {Promise<number>}
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }

        const domainLabel = useFallbackDomain ? '(fallback domain)' : '(custom domain)';
        const batch = await this.retryDb(
            () => this.create