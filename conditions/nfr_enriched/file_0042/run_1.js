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
const BATCH_SIZE_MULTIPLIER = 1000;
const MINIMUM_SECONDS_PER_BATCH = 26;
const ERROR_RATE_THRESHOLD = 0.01;

class RetryConfig {
    constructor(maxRetries = 10, maxTime = 10 * 60 * 1000, sleep = 2000) {
        this.maxRetries = maxRetries;
        this.maxTime = maxTime;
        this.sleep = sleep;
    }

    withStopAfterDate(date) {
        return {...this, stopAfterDate: date};
    }

    static forEnvironment(env, defaults) {
        if (env.startsWith('test') || env === 'development') {
            return new RetryConfig(0, defaults.maxTime, defaults.sleep);
        }
        return new RetryConfig(defaults.maxRetries, defaults.maxTime, defaults.sleep);
    }
}

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
    #beforeRetryConfig;
    #afterRetryConfig;
    #mailgunApiRetryConfig;

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

        const nodeEnv = process.env.NODE_ENV;
        this.#beforeRetryConfig = BEFORE_RETRY_CONFIG || RetryConfig.forEnvironment(nodeEnv, {maxRetries: 10, maxTime: 10 * 60 * 1000, sleep: 2000});
        this.#afterRetryConfig = AFTER_RETRY_CONFIG || RetryConfig.forEnvironment(nodeEnv, {maxRetries: 20, maxTime: 30 * 60 * 1000, sleep: 2000});
        this.#mailgunApiRetryConfig = MAILGUN_API_RETRY_CONFIG || RetryConfig.forEnvironment(nodeEnv, {maxRetries: 6, maxTime: 0, sleep: 10 * 1000});
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return this.#beforeRetryConfig.withStopAfterDate(email._retryCutOffTime);
        }
        return this.#beforeRetryConfig;
    }

    scheduleEmail(email) {
        return this.#jobsService.addJob({
            name: 'batch-sending-service-job',
            job: this.emailJob.bind(this),
            data: {emailId: email.id},
            offloaded: false
        });
    }

    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);
        const startTime = Date.now();

        let email = await this.retryDb(
            () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#beforeRetryConfig, description: `updateStatusLock email ${emailId} -> submitting`}
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
                () => email.save({status: 'submitted', submitted_at: new Date(), error: null}, {patch: true, autoRefresh: false}),
                {...this.#afterRetryConfig, description: `email ${emailId} -> submitted`}
            );
        } catch (e) {
            this.#logError(new errors.EmailError({
                err: e,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email ${email.id}`
            }), e);

            await this.retryDb(
                () => email.save({status: 'failed', error: e.message || 'Something went wrong while sending the email'}, {patch: true, autoRefresh: false}),
                {...this.#afterRetryConfig, description: `email ${emailId} -> failed`}
            );
        }
    }

    #calculateRetryCutOffTime(startTime, emailCount) {
        const expectedBatchCount = Math.ceil(emailCount / BATCH_SIZE_MULTIPLIER);
        const stopAfter = Math.max(expectedBatchCount * MINIMUM_SECONDS_PER_BATCH * 1000, this.#beforeRetryConfig.maxTime);
        return new Date(startTime + stopAfter);
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const [newsletter, post, batches] = await Promise.all([
            this.retryDb(
                () => email.getLazyRelation('newsletter', {require: true}),
                {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
            ),
            this.retryDb(
                () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
                {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
            ),
            this.retryDb(
                () => this.getBatches(email),
                {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
            )
        ]);

        const finalBatches = batches.length > 0 ? batches : await this.createBatches({email, newsletter, post});
        await this.sendBatches({email, batches: finalBatches, post, newsletter});
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return batches.models;
    }

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
                BATCH_SIZE,
                domainWarmupLimit,
                currentTotal: totalCount
            });
        }

        await this.#updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit);
        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);
        return batches;
    }

    #calculateDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    async #processMembersForSegment({email, segment, newsletter, batches, BATCH_SIZE, domainWarmupLimit, currentTotal}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let lastId = email.id;
        let totalProcessed = 0;

        while (lastId) {
            const members = await this.#fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE);

            if (members.length === 0) {
                break;
            }

            totalProcessed += await this.#processMemberBatch({
                email,
                segment,
                members,
                batches,
                BATCH_SIZE,
                domainWarmupLimit,
                currentTotal: currentTotal + totalProcessed
            });

            lastId = members.length > BATCH_SIZE ? members[members.length - 2].id : null;
        }

        return totalProcessed;
    }

    async #fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, filter: ${filter}`);

        return await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    async #processMemberBatch({email, segment, members, batches, BATCH_SIZE, domainWarmupLimit, currentTotal}) {
        const remainingCapacity = domainWarmupLimit - currentTotal;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);

        if (remainingCapacity > 0 && remainingCapacity < membersToProcess) {
            // Split batch between custom and fallback domains
            await this.#createBatchWithRetry({email, segment, members: members.slice(0, remainingCapacity), useFallbackDomain: false, batches});
            await this.#createBatchWithRetry({email, segment, members: members.slice(remainingCapacity, membersToProcess), useFallbackDomain: true, batches});
        } else {
            // Single batch with consistent domain
            await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: currentTotal >= domainWarmupLimit,
                batches
            });
        }

        return membersToProcess;
    }

    async #updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit) {
        if (email.get('email_count') === totalCount) {
            return;
        }

        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= ERROR_RATE_THRESHOLD) {
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }

        const newEmailUpdate = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return;
        }

        const batch = await this.retryDb(
            () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {
                ...this.#getBeforeRetryConfig(email),
                description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`
            }
        );
        batches.push(batch);
    }

    async createBatch(email, segment, members, options) {
        if (!options?.transacting) {
            return this.#models.EmailBatch.transaction((transacting) => {
                return this.createBatch(email, segment, members, {transacting, ...options});
            });
        }

        logging.info(`Creating batch for email ${email.id} segment ${segment} with ${members.length} members`);

        const batch = await this.#models.EmailBatch.add({
            email_id: email.id,
            member_segment: segment,
            status: 'pending',
            fallback_sending_domain: Boolean(options.useFallbackDomain)
        }, options);

        const recipientData = this.#buildRecipientData(email, batch, members);

        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);
        if (options.transacting) {
            insertQuery.transacting(options.transacting);
        }

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
    }

    #buildRecipientData(email, batch, members) {
        return members
            .filter((memberRow) => {
                if (!memberRow.id || !memberRow.uuid || !memberRow.email) {
                    logging.warn(`Member row not included as email recipient due to missing data - id: ${memberRow.id}, uuid: ${memberRow.uuid}, email: ${memberRow.email}`);
                    return false;
                }
                return true;
            })
            .map((memberRow) => ({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: memberRow.id,
                batch_id: batch.id,
                member_uuid: memberRow.uuid,
                member_email: memberRow.email,
                member_name: memberRow.name
            }));
    }

    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);
        const deadline = this.getDeliveryDeadline(email);

        if (deadline) {
            logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);
        }

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);
        let succeededCount = 0;

        const queue = batches.slice();
        const runNext = async () => {
            const batch = queue.shift();
            if (!batch) return;

            const batchData = {email, batch, post, newsletter, emailBodyCache, deliveryTime: undefined};
            if (deadline && deadline.getTime