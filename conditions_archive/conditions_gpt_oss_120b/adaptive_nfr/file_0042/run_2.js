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

        if (BEFORE_RETRY_CONFIG) {
            this.#BEFORE_RETRY_CONFIG = BEFORE_RETRY_CONFIG;
        } else if (this.#isTestOrDev()) {
            this.#BEFORE_RETRY_CONFIG = {maxRetries: 0};
        }

        if (AFTER_RETRY_CONFIG) {
            this.#AFTER_RETRY_CONFIG = AFTER_RETRY_CONFIG;
        } else if (this.#isTestOrDev()) {
            this.#AFTER_RETRY_CONFIG = {maxRetries: 0};
        }

        if (MAILGUN_API_RETRY_CONFIG) {
            this.#MAILGUN_API_RETRY_CONFIG = MAILGUN_API_RETRY_CONFIG;
        } else if (this.#isTestOrDev()) {
            this.#MAILGUN_API_RETRY_CONFIG = {maxRetries: 0};
        }
    }

    /**
     * Guard predicate for test / development environments.
     * @returns {boolean}
     */
    #isTestOrDev() {
        const env = process.env.NODE_ENV || '';
        return env.startsWith('test') || env === 'development';
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime};
        }
        return this.#BEFORE_RETRY_CONFIG;
    }

    /**
     * Schedule background job.
     * @param {Email} email
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
     * Job entry point.
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const email = await this.#lockEmailForSending(emailId);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        this.#setRetryCutoff(email);
        try {
            await this.sendEmail(email);
            await this.#finalizeEmailSuccess(email);
        } catch (err) {
            await this.#handleEmailError(email, err);
        }
    }

    async #lockEmailForSending(emailId) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    #setRetryCutoff(email) {
        const startTime = Date.now();
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        email._retryCutOffTime = new Date(startTime + stopAfter);
    }

    async #finalizeEmailSuccess(email) {
        await this.retryDb(
            async () => {
                await email.save({
                    status: 'submitted',
                    submitted_at: new Date(),
                    error: null
                }, {patch: true, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> submitted`}
        );
    }

    async #handleEmailError(email, err) {
        const ghostError = new errors.EmailError({
            err,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });
        logging.error(ghostError);
        if (this.#sentry) this.#sentry.captureException(err);
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

    /**
     * Send email workflow.
     * @param {Email} email
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const {newsletter, post} = await this.#loadEmailRelations(email);
        let batches = await this.retryDb(
            async () => this.getBatches(email),
            {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
        );

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }

        await this.sendBatches({email, batches, post, newsletter});
    }

    async #loadEmailRelations(email) {
        const newsletter = await this.retryDb(
            async () => email.getLazyRelation('newsletter', {require: true}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
        );
        const post = await this.retryDb(
            async () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
        );
        return {newsletter, post};
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return batches.models;
    }

    /**
     * Create batches for an email.
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     */
    async createBatches({email, newsletter, post}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#determineDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            await this.#processSegment({
                email,
                newsletter,
                segment,
                domainWarmupLimit,
                BATCH_SIZE,
                batches,
                totalCountRef: {value: totalCount}
            });
            totalCount = this.#totalCount; // updated by #processSegment
        }

        await this.#finalizeBatchCreation(email, batches, totalCount);
        return batches;
    }

    #determineDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    async #processSegment({email, newsletter, segment, domainWarmupLimit, BATCH_SIZE, batches, totalCountRef}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        let members;

        while (!members || lastId) {
            members = await this.#fetchMembers({segmentFilter, lastId, BATCH_SIZE});
            if (members.length === 0) break;

            const remainingCapacity = domainWarmupLimit - totalCountRef.value;
            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const shouldSplit = this.#shouldSplitBatch(remainingCapacity, membersToProcess);

            if (shouldSplit) {
                await this.#splitAndCreateBatches({
                    email,
                    segment,
                    members,
                    remainingCapacity,
                    batches,
                    totalCountRef
                });
            } else {
                await this.#createSingleBatch({
                    email,
                    segment,
                    members,
                    useFallbackDomain: totalCountRef.value >= domainWarmupLimit,
                    batches,
                    totalCountRef
                });
            }

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }
    }

    async #fetchMembers({segmentFilter, lastId, BATCH_SIZE}) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch with filter ${filter}`);
        return this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    #shouldSplitBatch(remainingCapacity, membersToProcess) {
        return remainingCapacity > 0 && remainingCapacity < membersToProcess;
    }

    async #splitAndCreateBatches({email, segment, members, remainingCapacity, batches, totalCountRef}) {
        const firstSlice = members.slice(0, remainingCapacity);
        const secondSlice = members.slice(remainingCapacity, Math.min(members.length, this.#sendingService.getMaximumRecipients()));

        await this.#createBatchWithRetry({
            email,
            segment,
            members: firstSlice,
            useFallbackDomain: false,
            batches,
            totalCountRef
        });
        await this.#createBatchWithRetry({
            email,
            segment,
            members: secondSlice,
            useFallbackDomain: true,
            batches,
            totalCountRef
        });
    }

    async #createSingleBatch({email, segment, members, useFallbackDomain, batches, totalCountRef}) {
        await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, Math.min(members.length, this.#sendingService.getMaximumRecipients())),
            useFallbackDomain,
            batches,
            totalCountRef
        });
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches, totalCountRef}) {
        if (members.length === 0) return;
        const batch = await this.retryDb(
            async () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {...this.#getBeforeRetryConfig(email), description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`}
        );
        batches.push(batch);
        totalCountRef.value += members.length;
        this.#totalCount = totalCountRef.value;
    }

    async #finalizeBatchCreation(email, batches, totalCount) {
        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);
        if (email.get('email_count') !== totalCount) {
            await this.#reconcileEmailCount(email, totalCount);
        }
    }

    async #reconcileEmailCount(email, totalCount) {
        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);
        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }
        const update = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            update.csd_email_count = Math.min(totalCount, this.#determineDomainWarmupLimit(email));
        }
        await email.save(update, {patch: true, require: false, autoRefresh: false});
    }

    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);
        const deadline = this.getDeliveryDeadline(email);
        if (deadline) logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);
        const queue = batches.slice();
        let succeededCount = 0;

        const worker = async () => {
            const batch = queue.shift();
            if (!batch) return;
            const batchData = {
                email,
                batch,
                post,
                newsletter,
                emailBodyCache,
                deliveryTime: undefined
            };
            if (this.#shouldScheduleDelivery(deadline)) {
                const nextTime = deliveryTimes.shift();
                if (nextTime && nextTime >= Date.now()) {
                    batchData.deliveryTime = nextTime;
                }
            }
            if (await this.sendBatch(batchData)) succeededCount += 1;
            await worker();
        };

        await Promise.all(Array.from({length: MAX_SENDING_CONCURRENCY}, () => worker()));

        if (succeededCount < batches.length) {
            const msg = succeededCount > 0 ? messages.emailErrorPartialFailure : messages.emailError;
            throw new errors.EmailError({message: tpl(msg)});
        }
    }

    #shouldScheduleDelivery(deadline) {
        return deadline && deadline.getTime() > Date.now();
    }

    /**
     * @param {{email: Email, batch: EmailBatch, post: Post, newsletter: Newsletter, emailBodyCache: EmailBodyCache, deliveryTime:(Date|undefined)}} data
     * @returns {Promise<boolean>}
     */
    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this.retryDb(
            async () => this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']),
            {...this.#getBeforeRetryConfig(email), description: `updateStatusLock batch ${originalBatch.id} -> submitting`}
        );
        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${originalBatch.id}`);
            return true;
        }

        try {
            const members = await this.#fetchBatchMembers(email, batch);
            const response = await this.#sendToProvider({
                email,
                batch,
                post,
                newsletter,
                members,
                deliveryTime,
                emailBodyCache
            });
            await this.#markBatchSubmitted(batch, response);
            return true;
        } catch (err) {
            await this.#handleBatchError(batch, err);
            return false;
        } finally {
            await this.#markRecipientsProcessed(batch);
        }
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

    async #sendToProvider({email, batch, post, newsletter, members, deliveryTime, emailBodyCache}) {
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

    async #markBatchSubmitted(batch, response) {
        await this.retryDb(
            async () => {
                await batch.save({
                    status: 'submitted',
                    provider_id: response.id,
                    error_status_code: null,
                    error_message: null,
                    error_data: null
                }, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${batch.id} -> submitted`}
        );
    }

    async #handleBatchError(batch, err) {
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

    async #markRecipientsProcessed(batch) {
        await this.retryDb(
            async () => {
                await this.#models.EmailRecipient
                    .where({batch_id: batch.id})
                    .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${batch.id} processed_at`}
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
        return models.map((model) => {
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
        await Model.transaction(async (transacting) => {
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
                (options.stopAfterDate && (Date.now() + sleep) > options.stopAfterDate);
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
            if (sleep) await new Promise((resolve) => setTimeout(resolve, sleep));
            return this.retryDb(func, {...options, retryCount: retryCount + 1, sleep: sleep * 2});
        }
    }

    getDeliveryDeadline(email) {
        const targetDeliveryWindow = this.#sendingService.getTargetDeliveryWindow();
        if (!targetDeliveryWindow || targetDeliveryWindow <= 0) return undefined;
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
        return Array.from({length: numBatches}, (_, i) => new Date(now.getTime() + batchDelay * i));
    }
}

module.exports = BatchSendingService;
```