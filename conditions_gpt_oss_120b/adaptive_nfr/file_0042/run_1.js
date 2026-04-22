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

    #BEFORE_RETRY_CONFIG = {maxRetries: 10, maxTime: 10 * 60 * 1000, sleep: 2000};
    #AFTER_RETRY_CONFIG = {maxRetries: 20, maxTime: 30 * 60 * 1000, sleep: 2000};
    #MAILGUN_API_RETRY_CONFIG = {sleep: 10 * 1000, maxRetries: 6};

    /**
     * @param {Object} dependencies
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

        this.#applyRetryConfig(BEFORE_RETRY_CONFIG, '#BEFORE_RETRY_CONFIG');
        this.#applyRetryConfig(AFTER_RETRY_CONFIG, '#AFTER_RETRY_CONFIG');
        this.#applyRetryConfig(MAILGUN_API_RETRY_CONFIG, '#MAILGUN_API_RETRY_CONFIG');
    }

    #applyRetryConfig(config, targetProp) {
        if (config) {
            this[targetProp] = config;
            return;
        }
        if (this.#isTestOrDevelopmentEnv()) {
            this[targetProp] = {maxRetries: 0};
        }
    }

    #isTestOrDevelopmentEnv() {
        const env = process.env.NODE_ENV || '';
        return env.startsWith('test') || env === 'development';
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime};
        }
        return this.#BEFORE_RETRY_CONFIG;
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

        const email = await this.#fetchAndLockEmail(emailId);
        if (!email) {
            return;
        }

        this.#setRetryCutoff(email, startTime);
        try {
            await this.sendEmail(email);
            await this.#finalizeEmail(email, 'submitted');
        } catch (e) {
            await this.#handleEmailError(email, e);
        }
    }

    async #fetchAndLockEmail(emailId) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    #setRetryCutoff(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        email._retryCutOffTime = new Date(startTime + stopAfter);
    }

    async #finalizeEmail(email, status) {
        await this.retryDb(
            async () => {
                await email.save({
                    status,
                    submitted_at: status === 'submitted' ? new Date() : undefined,
                    error: null
                }, {patch: true, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> ${status}`}
        );
    }

    async #handleEmailError(email, err) {
        const ghostError = new errors.EmailError({
            err,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });
        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(err);
        }
        await this.retryDb(
            async () => {
                await email.save({
                    status: 'failed',
                    error: err.message || 'Something went wrong while sending the email'
                }, {patch: true, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> failed`}
        );
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.#loadRelation(email, 'newsletter', `getLazyRelation newsletter for email ${email.id}`);
        const post = await this.#loadRelation(email, 'post', `getLazyRelation post for email ${email.id}`, {withRelated: ['posts_meta', 'authors']});

        let batches = await this.retryDb(
            async () => this.getBatches(email),
            {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
        );

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }
        await this.sendBatches({email, batches, post, newsletter});
    }

    async #loadRelation(email, relation, description, options = {}) {
        return this.retryDb(
            async () => email.getLazyRelation(relation, {require: true, ...options}),
            {...this.#getBeforeRetryConfig(email), description}
        );
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return batches.models;
    }

    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#determineDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            await this.#processSegment({
                email,
                segment,
                newsletter,
                post,
                domainWarmupLimit,
                batches,
                BATCH_SIZE,
                totalCount
            }).then(count => {
                totalCount += count;
            });
        }

        await this.#finalizeBatchCreation(email, totalCount, domainWarmupLimit);
        return batches;
    }

    #determineDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    async #processSegment({email, segment, newsletter, post, domainWarmupLimit, batches, BATCH_SIZE, totalCount}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        let segmentCount = 0;

        while (true) {
            const members = await this.#fetchMembers(email, segmentFilter, lastId, BATCH_SIZE);
            if (members.length === 0) {
                break;
            }

            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const remainingCapacity = domainWarmupLimit - totalCount;
            const shouldSplit = this.#shouldSplitBatch(remainingCapacity, membersToProcess);

            if (shouldSplit) {
                segmentCount += await this.#createSplitBatches({
                    email,
                    segment,
                    members,
                    remainingCapacity,
                    batches
                });
            } else {
                const useFallback = totalCount >= domainWarmupLimit;
                segmentCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(0, membersToProcess),
                    useFallbackDomain: useFallback,
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

    async #fetchMembers(email, segmentFilter, lastId, batchSize) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id}, lastId: ${lastId}`);
        return this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(batchSize + 1);
    }

    #shouldSplitBatch(remainingCapacity, membersToProcess) {
        return remainingCapacity > 0 && remainingCapacity < membersToProcess;
    }

    async #createSplitBatches({email, segment, members, remainingCapacity, batches}) {
        const firstSlice = members.slice(0, remainingCapacity);
        const secondSlice = members.slice(remainingCapacity, Math.min(members.length, this.#sendingService.getMaximumRecipients()));
        let count = 0;
        count += await this.#createBatchWithRetry({
            email,
            segment,
            members: firstSlice,
            useFallbackDomain: false,
            batches
        });
        count += await this.#createBatchWithRetry({
            email,
            segment,
            members: secondSlice,
            useFallbackDomain: true,
            batches
        });
        return count;
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }
        const batch = await this.retryDb(
            async () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {
                ...this.#getBeforeRetryConfig(email),
                description: this.#batchDescription(email.id, segment, useFallbackDomain)
            }
        );
        batches.push(batch);
        return members.length;
    }

    #batchDescription(emailId, segment, useFallbackDomain) {
        const domainInfo = useFallbackDomain ? 'fallback domain' : 'custom domain';
        return `createBatch email ${emailId} segment ${segment} (${domainInfo})`;
    }

    async #finalizeBatchCreation(email, totalCount, domainWarmupLimit) {
        logging.info(`Created ${totalCount} recipients for email ${email.id}`);

        if (email.get('email_count') !== totalCount) {
            await this.#adjustEmailCount(email, totalCount, domainWarmupLimit);
        }
    }

    async #adjustEmailCount(email, totalCount, domainWarmupLimit) {
        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }

        const update = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            update.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(update, {patch: true, require: false, autoRefresh: false});
    }

    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);
        const deadline = this.getDeliveryDeadline(email);
        if (deadline) {
            logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);
        }

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);
        const queue = batches.slice();
        let succeededCount = 0;

        const runNext = async () => {
            const batch = queue.shift();
            if (!batch) {
                return;
            }
            const batchData = this.#buildBatchData({
                email,
                batch,
                post,
                newsletter,
                emailBodyCache,
                deadline,
                deliveryTimes
            });
            if (await this.sendBatch(batchData)) {
                succeededCount += 1;
            }
            await runNext();
        };

        await Promise.all(Array.from({length: MAX_SENDING_CONCURRENCY}, () => runNext()));

        if (succeededCount < batches.length) {
            const message = succeededCount > 0 ? messages.emailErrorPartialFailure : messages.emailError;
            throw new errors.EmailError({message: tpl(message)});
        }
    }

    #buildBatchData({email, batch, post, newsletter, emailBodyCache, deadline, deliveryTimes}) {
        let deliveryTime;
        if (deadline && deadline.getTime() > Date.now()) {
            const next = deliveryTimes.shift();
            if (next && next >= Date.now()) {
                deliveryTime = next;
            }
        }
        return {email, batch, post, newsletter, emailBodyCache, deliveryTime};
    }

    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this.#lockBatch(email, originalBatch);
        if (!batch) {
            return true;
        }

        let succeeded = false;
        try {
            const members = await this.#fetchBatchMembers(email, batch);
            const response = await this.#dispatchBatch({
                email,
                batch,
                post,
                newsletter,
                members,
                emailBodyCache,
                deliveryTime
            });
            succeeded = true;
            await this.#markBatchSubmitted(email, batch, response.id);
        } catch (err) {
            await this.#processBatchError(email, batch, err, succeeded);
        }

        await this.#markRecipientsProcessed(batch.id);
        return succeeded;
    }

    async #lockBatch(email, originalBatch) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']),
            {...this.#getBeforeRetryConfig(email), description: `updateStatusLock batch ${originalBatch.id} -> submitting`}
        );
    }

    async #fetchBatchMembers(email, batch) {
        const members = await this.retryDb(
            async () => {
                const m = await this.getBatchMembers(batch.id);
                if (m.length === 0) {
                    throw new errors.EmailError({message: `No members found for batch ${batch.id}, possible replication lag`});
                }
                return m;
            },
            {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${batch.id}`}
        );
        return members;
    }

    async #dispatchBatch({email, batch, post, newsletter, members, emailBodyCache, deliveryTime}) {
        return this.retryDb(
            async () => this.#sendingService.send({
                emailId: email.id,
                post,
                newsletter,
                segment: batch.get('member_segment'),
                members
            }, {
                openTrackingEnabled: !!email.get('track_opens'),
                clickTrackingEnabled: !!email.get('track_clicks'),
                useFallbackAddress: batch.get('fallback_sending_domain'),
                deliveryTime,
                emailBodyCache
            }),
            {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${batch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`}
        );
    }

    async #markBatchSubmitted(email, batch, providerId) {
        await this.retryDb(
            async () => {
                await batch.save({
                    status: 'submitted',
                    provider_id: providerId,
                    error_status_code: null,
                    error_message: null,
                    error_data: null
                }, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${batch.id} -> submitted`}
        );
    }

    async #processBatchError(email, batch, err, alreadySucceeded) {
        if (err.code === 'BULK_EMAIL_SEND_FAILED') {
            logging.error(err);
            if (this.#sentry) this.#sentry.captureException(err);
        } else {
            const ghostError = new errors.EmailError({
                err,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email batch ${batch.id}`,
                context: err.message
            });
            logging.error(ghostError);
            if (this.#sentry) this.#sentry.captureException(err);
        }

        if (!alreadySucceeded) {
            await this.retryDb(
                async () => {
                    await batch.save({
                        status: 'failed',
                        error_status_code: err.statusCode ?? null,
                        error_message: err.message,
                        error_data: err.errorDetails ?? null
                    }, {patch: true, require: false, autoRefresh: false});
                },
                {...this.#AFTER_RETRY_CONFIG, description: `save batch ${batch.id} -> failed`}
            );
        }
    }

    async #markRecipientsProcessed(batchId) {
        await this.retryDb(
            async () => {
                await this.#models.EmailRecipient
                    .where({batch_id: batchId})
                    .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${batchId} processed_at`}
        );
    }

    async getBatchMembers(batchId) {
        const models = await this.#models.EmailRecipient.findAll({
            filter: `batch_id:'${batchId}'`,
            withRelated: ['member', 'member.stripeSubscriptions', 'member.products']
        });

        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        if (models.length > BATCH_SIZE) {
            throw new errors.EmailError({
                message: `Email batch ${batchId} has ${models.length} members, which exceeds the maximum of ${BATCH_SIZE} members per batch.`
            });
        }

        return models.map(model => {
            const member = model.related('member');
            return {
                id: model.get('member_id'),
                uuid: model.get('member_uuid'),
                email: model.get('member_email'),
                name: model.get('member_name'),
                createdAt: member?.get('created_at') ?? null,
                status: member?.get('status') ?? 'free',
                subscriptions: member.related('stripeSubscriptions').toJSON(),
                tiers: member.related('products').toJSON()
            };
        });
    }

    async updateStatusLock(Model, id, status, allowedStatuses) {
        let model;
        await Model.transaction(async transacting => {
            model = await Model.findOne({id}, {require: true, transacting, forUpdate: true});
            if (!allowedStatuses.includes(model.get('status'))) {
                model = undefined;
                return;
            }
            await model.save({status}, {patch: true, transacting, autoRefresh: false});
        });
        return model;
    }

    async retryDb(func, options) {
        if (options.maxTime !== undefined) {
            const stopAfterDate = new Date(Date.now() + options.maxTime);
            if (!options.stopAfterDate || stopAfterDate < options.stopAfterDate) {
                options = {...options, stopAfterDate};
            }
        }
        const retryCount = options.retryCount ?? 0;

        try {
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount > 0 ? `Retry ${retryCount + 1}` : 'Started'} (1st try)`);
            const response = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished (after ${retryCount + 1}${retryCount === 0 ? 'st' : ' tries'})`);
            return response;
        } catch (e) {
            const sleep = options.sleep ?? 0;
            const shouldStop = retryCount >= options.maxRetries ||
                (options.stopAfterDate && (Date.now() + sleep) > options.stopAfterDate.getTime());

            if (shouldStop) {
                if (retryCount > 0) {
                    const ghostError = new errors.EmailError({
                        err: e,
                        code: 'BULK_EMAIL_DB_RETRY',
                        message: `[BULK_EMAIL_DB_RETRY] ${options.description} - Failed and stopped retrying: ${retryCount >= options.maxRetries ? 'max retries reached' : 'max time reached'}`,
                        context: e.message
                    });
                    logging.error(ghostError);
                }
                throw e;
            }

            const ghostError = new errors.EmailError({
                err: e,
                code: 'BULK_EMAIL_DB_RETRY',
                message: `[BULK_EMAIL_DB_RETRY] ${options.description} - Failed (${retryCount + 1}${retryCount === 0 ? 'st' : 'th'} try)`,
                context: e.message
            });
            logging.error(ghostError);

            if (sleep) {
                await new Promise(resolve => setTimeout(resolve, sleep));
            }
            return this.retryDb(func, {...options, retryCount: retryCount + 1, sleep: sleep * 2});
        }
    }

    getDeliveryDeadline(email) {
        const targetDeliveryWindow = this.#sendingService.getTargetDeliveryWindow();
        if (!targetDeliveryWindow || targetDeliveryWindow <= 0) {
            return undefined;
        }
        try {
            const startTime = email.get('created_at');
            return new Date(startTime.getTime() + targetDeliveryWindow);
        } catch {
            return undefined;
        }
    }

    calculateDeliveryTimes(email, numBatches) {
        const deadline = this.getDeliveryDeadline(email);
        const now = new Date();

        if (!deadline || now >= deadline) {
            return new Array(numBatches).fill(undefined);
        }

        const timeToDeadline = deadline.getTime() - now.getTime();
        const batchDelay = timeToDeadline / numBatches;
        const deliveryTimes = [];

        for (let i = 0; i < numBatches; i++) {
            deliveryTimes.push(new Date(now.getTime() + batchDelay * i));
        }

        return deliveryTimes;
    }
}

module.exports = BatchSendingService;
```