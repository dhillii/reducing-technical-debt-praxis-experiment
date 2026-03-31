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
const DEFAULT_RETRY_CONFIG = {
    BEFORE: {maxRetries: 10, maxTime: 10 * 60 * 1000, sleep: 2000},
    AFTER: {maxRetries: 20, maxTime: 30 * 60 * 1000, sleep: 2000},
    MAILGUN_API: {sleep: 10 * 1000, maxRetries: 6}
};
const TEST_RETRY_CONFIG = {maxRetries: 0};

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
    #retryConfigs;

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

        this.#retryConfigs = {
            before: this.#initRetryConfig(BEFORE_RETRY_CONFIG, DEFAULT_RETRY_CONFIG.BEFORE),
            after: this.#initRetryConfig(AFTER_RETRY_CONFIG, DEFAULT_RETRY_CONFIG.AFTER),
            mailgunApi: this.#initRetryConfig(MAILGUN_API_RETRY_CONFIG, DEFAULT_RETRY_CONFIG.MAILGUN_API)
        };
    }

    #initRetryConfig(customConfig, defaultConfig) {
        if (customConfig) {
            return customConfig;
        }
        return this.#isTestOrDevelopment() ? TEST_RETRY_CONFIG : defaultConfig;
    }

    #isTestOrDevelopment() {
        return process.env.NODE_ENV?.startsWith('test') || process.env.NODE_ENV === 'development';
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#retryConfigs.before, stopAfterDate: email._retryCutOffTime};
        }
        return this.#retryConfigs.before;
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
     * @param {{emailId: string}} data Data passed from the job service.
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const startTime = Date.now();

        let email = await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
            },
            {...this.#retryConfigs.before, description: `updateStatusLock email ${emailId} -> submitting`}
        );

        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        const retryCutOffTime = this.#calculateRetryCutOffTime(startTime, email.get('email_count'));
        email._retryCutOffTime = retryCutOffTime;

        try {
            await this.sendEmail(email);
            await this.retryDb(
                async () => {
                    await email.save({
                        status: 'submitted',
                        submitted_at: new Date(),
                        error: null
                    }, {patch: true, autoRefresh: false});
                },
                {...this.#retryConfigs.after, description: `email ${emailId} -> submitted`}
            );
        } catch (e) {
            this.#handleEmailError(e, email, emailId);
            await this.retryDb(
                async () => {
                    await email.save({
                        status: 'failed',
                        error: e.message || 'Something went wrong while sending the email'
                    }, {patch: true, autoRefresh: false});
                },
                {...this.#retryConfigs.after, description: `email ${emailId} -> failed`}
            );
        }
    }

    #calculateRetryCutOffTime(startTime, emailCount) {
        const expectedBatchCount = Math.ceil(emailCount / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#retryConfigs.before.maxTime
        );
        return new Date(startTime + stopAfter);
    }

    #handleEmailError(error, email, emailId) {
        const ghostError = new errors.EmailError({
            err: error,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });

        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(error);
        }
    }

    /**
     * @private
     * @param {Email} email
     * @throws {errors.EmailError} If one of the batches fails
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.retryDb(
            async () => {
                return await email.getLazyRelation('newsletter', {require: true});
            },
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
        );

        const post = await this.retryDb(
            async () => {
                return await email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']});
            },
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
        );

        let batches = await this.retryDb(
            async () => {
                return await this.getBatches(email);
            },
            {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
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

        const domainWarmupLimit = this.#calculateDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            totalCount += await this.#processMembersForSegment({
                email,
                segment,
                newsletter,
                batches,
                domainWarmupLimit,
                BATCH_SIZE,
                totalCount
            });
        }

        await this.#updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit);
        return batches;
    }

    #calculateDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    async #processMembersForSegment({email, segment, newsletter, batches, domainWarmupLimit, BATCH_SIZE, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        let segmentCount = 0;

        while (lastId) {
            const members = await this.#fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE);

            if (members.length === 0) {
                break;
            }

            segmentCount += await this.#processMemberBatch({
                email,
                segment,
                members,
                batches,
                domainWarmupLimit,
                BATCH_SIZE,
                totalCount: totalCount + segmentCount
            });

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }

        return segmentCount;
    }

    async #fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, filter: ${filter}`);

        return await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    async #processMemberBatch({email, segment, members, batches, domainWarmupLimit, BATCH_SIZE, totalCount}) {
        const remainingCapacity = domainWarmupLimit - totalCount;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);
        let processedCount = 0;

        if (remainingCapacity > 0 && remainingCapacity < membersToProcess) {
            // Split batch between custom and fallback domains
            processedCount += await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, remainingCapacity),
                useFallbackDomain: false,
                batches
            });
            processedCount += await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(remainingCapacity, membersToProcess),
                useFallbackDomain: true,
                batches
            });
        } else {
            processedCount += await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: totalCount >= domainWarmupLimit,
                batches
            });
        }

        return processedCount;
    }

    async #updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit) {
        if (email.get('email_count') === totalCount) {
            return;
        }

        logging.error(
            `Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`
        );

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(
                `Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`
            );
        }

        const newEmailUpdate = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
    }

    /**
     * Creates a batch with retry logic and adds it to the batches array
     * @param {object} params
     * @param {Email} params.email
     * @param {import('./email-renderer').Segment} params.segment
     * @param {object[]} params.members
     * @param {boolean} params.useFallbackDomain
     * @param {EmailBatch[]} params.batches
     * @returns {Promise<number>} The number of members added
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return