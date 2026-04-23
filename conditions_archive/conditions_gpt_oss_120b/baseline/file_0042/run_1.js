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

        this.#applyEnvOverrides('BEFORE_RETRY_CONFIG', BEFORE_RETRY_CONFIG);
        this.#applyEnvOverrides('AFTER_RETRY_CONFIG', AFTER_RETRY_CONFIG);
        this.#applyEnvOverrides('MAILGUN_API_RETRY_CONFIG', MAILGUN_API_RETRY_CONFIG);
    }

    #applyEnvOverrides(prop, config) {
        if (config) {
            this[`#${prop}`] = config;
        } else if (process.env.NODE_ENV?.startsWith('test') || process.env.NODE_ENV === 'development') {
            this[`#${prop}`] = {maxRetries: 0};
        }
    }

    #getBeforeRetryConfig(email) {
        return email._retryCutOffTime
            ? {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime}
            : this.#BEFORE_RETRY_CONFIG;
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

        const email = await this.retryDb(
            () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );

        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const stopAfter = Math.max(expectedBatchCount * 26 * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        email._retryCutOffTime = new Date(startTime + stopAfter);

        try {
            await this.sendEmail(email);
            await this.retryDb(
                () => email.save({status: 'submitted', submitted_at: new Date(), error: null}, {patch: true, autoRefresh: false}),
                {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> submitted`}
            );
        } catch (e) {
            const ghostError = new errors.EmailError({err: e, code: 'BULK_EMAIL_SEND_FAILED', message: `Error sending email ${email.id}`});
            logging.error(ghostError);
            this.#sentry?.captureException(e);
            await this.retryDb(
                () => email.save({status: 'failed', error: e.message || 'Something went wrong while sending the email'}, {patch: true, autoRefresh: false}),
                {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> failed`}
            );
        }
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.retryDb(
            () => email.getLazyRelation('newsletter', {require: true}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
        );

        const post = await this.retryDb(
            () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
        );

        let batches = await this.retryDb(
            () => this.getBatches(email),
            {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
        );

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }

        await this.sendBatches({email, batches, post, newsletter});
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const collection = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return collection.models;
    }

    async createBatches({email, newsletter, post}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#determineDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
            totalCount = await this.#processSegment({email, segment, segmentFilter, domainWarmupLimit, totalCount, BATCH_SIZE, batches});
        }

        await this.#finalizeBatchCount(email, totalCount, domainWarmupLimit);
        return batches;
    }

    #determineDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    async #processSegment({email, segment, segmentFilter, domainWarmupLimit, totalCount, BATCH_SIZE, batches}) {
        let lastId = email.id;
        let continueFetching = true;

        while (continueFetching) {
            const members = await this.#fetchMembers({segmentFilter, lastId, BATCH_SIZE});
            if (members.length === 0) break;

            const remainingCapacity = domainWarmupLimit - totalCount;
            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const shouldSplit = remainingCapacity > 0 && remainingCapacity < membersToProcess;

            if (shouldSplit) {
                totalCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(0, remainingCapacity),
                    useFallbackDomain: false,
                    batches
                });
                totalCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(remainingCapacity, membersToProcess),
                    useFallbackDomain: true,
                    batches
                });
            } else {
                totalCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(0, membersToProcess),
                    useFallbackDomain: totalCount >= domainWarmupLimit,
                    batches
                });
            }

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                continueFetching = false;
            }
        }

        return totalCount;
    }

    async #fetchMembers({segmentFilter, lastId, BATCH_SIZE}) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch with filter ${filter}`);

        const collection = await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);

        return collection;
    }

    async #finalizeBatchCount(email, totalCount, domainWarmupLimit) {
        logging.info(`Created ${totalCount} recipients for email ${email.id}`);

        if (email.get('email_count') === totalCount) return;

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

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (!members.length) return 0;

        const batch = await this.retryDb(
            () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {...this.#getBeforeRetryConfig(email), description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`}
        );

        batches.push(batch);
        return members.length;
    }

    async createBatch(email, segment, members, options) {
        if (!options?.transacting) {
            return this.#models.EmailBatch.transaction(async (transacting) => {
                return this.createBatch(email, segment, members, {...options, transacting});
            });
        }

        logging.info(`Creating batch for email ${email.id} segment ${segment} with ${members.length} members`);

        const batch = await this.#models.EmailBatch.add({
            email_id: email.id,
            member_segment: segment,
            status: 'pending',
            fallback_sending_domain: Boolean(options.useFallbackDomain)
        }, options);

        const recipientData = members
            .filter(m => m.id && m.uuid && m.email)
            .map(m => ({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: m.id,
                batch_id: batch.id,
                member_uuid: m.uuid,
                member_email: m.email,
                member_name: m.name
            }));

        const insert = this.#db.knex('email_recipients').insert(recipientData);
        if (options.transacting) insert.transacting(options.transacting);

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insert;
        return batch;
    }

    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);
        const deadline = this.getDeliveryDeadline(email);
        if (deadline) logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);
        const queue = batches.slice();
        let succeededCount = 0;

        const runNext = async () => {
            const batch = queue.shift();
            if (!batch) return;

            const batchData = {email, batch, post, newsletter, emailBodyCache, deliveryTime: undefined};

            if (deadline && deadline.getTime() > Date.now()) {
                const dt = deliveryTimes.shift();
                if (dt && dt >= Date.now()) batchData.deliveryTime = dt;
            }

            if (await this.sendBatch(batchData)) succeededCount++;
            await runNext();
        };

        await Promise.all(Array.from({length: MAX_SENDING_CONCURRENCY}, () => runNext()));

        if (succeededCount < batches.length) {
            const msg = succeededCount > 0 ? messages.emailErrorPartialFailure : messages.emailError;
            throw new errors.EmailError({message: tpl(msg)});
        }
    }

    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this.retryDb(
            () => this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']),
            {...this.#getBeforeRetryConfig(email), description: `updateStatusLock batch ${originalBatch.id} -> submitting`}
        );

        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${originalBatch.id}`);
            return true;
        }

        let succeeded = false;
        try {
            const members = await this.retryDb(
                async () => {
                    const m = await this.getBatchMembers(batch.id);
                    if (!m.length) throw new errors.EmailError({message: `No members found for batch ${batch.id}, possible replication lag`});
                    return m;
                },
                {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${originalBatch.id}`}
            );

            const response = await this.retryDb(
                () => this.#sendingService.send({
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
                {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${originalBatch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`}
            );

            succeeded = true;
            await this.retryDb(
                () => batch.save({
                    status: 'submitted',
                    provider_id: response.id,
                    error_status_code: null,
                    error_message: null,
                    error_data: null
                }, {patch: true, require: false, autoRefresh: false}),
                {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> submitted`}
            );
        } catch (err) {
            this.#handleBatchError(err, email, originalBatch, batch);
        }

        await this.retryDb(
            () => this.#models.EmailRecipient.where({batch_id: batch.id}).save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false}),
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${originalBatch.id} processed_at`}
        );

        return succeeded;
    }

    #handleBatchError(err, email, originalBatch, batch) {
        if (err.code === 'BULK_EMAIL_SEND_FAILED') {
            logging.error(err);
            this.#sentry?.captureException(err);
        } else {
            const ghostError = new errors.EmailError({
                err,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email batch ${batch.id}`,
                context: err.message
            });
            logging.error(ghostError);
            this.#sentry?.captureException(err);
        }

        this.retryDb(
            () => batch.save({
                status: 'failed',
                error_status_code: err.statusCode ?? null,
                error_message: err.message,
                error_data: err.errorDetails ?? null
            }, {patch: true, require: false, autoRefresh: false}),
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> failed`}
        ).catch(() => {});
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
        await Model.transaction(async (transacting) => {
            const found = await Model.findOne({id}, {require: true, transacting, forUpdate: true});
            if (!allowedStatuses.includes(found.get('status'))) return;
            await found.save({status}, {patch: true, transacting, autoRefresh: false});
            model = found;
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
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount ? `Retry ${retryCount + 1}` : 'Started'} (try ${retryCount + 1})`);
            const result = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished (after ${retryCount + 1} ${retryCount ? 'tries' : 'try'})`);
            return result;
        } catch (e) {
            const sleep = options.sleep ?? 0;
            const shouldStop = retryCount >= options.maxRetries ||
                (options.stopAfterDate && Date.now() + sleep > options.stopAfterDate.getTime());

            if (shouldStop) {
                if (retryCount) {
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
                message: `[BULK_EMAIL_DB_RETRY] ${options.description} - Failed (${retryCount + 1}${retryCount ? 'th' : 'st'} try)`,
                context: e.message
            });
            logging.error(ghostError);

            if (sleep) await new Promise(r => setTimeout(r, sleep));
            return this.retryDb(func, {...options, retryCount: retryCount + 1, sleep: sleep * 2});
        }
    }

    getDeliveryDeadline(email) {
        const targetDeliveryWindow = this.#sendingService.getTargetDeliveryWindow();
        if (!targetDeliveryWindow || targetDeliveryWindow <= 0) return undefined;
        try {
            const start = email.get('created_at');
            return new Date(start.getTime() + targetDeliveryWindow);
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

        const batchDelay = (deadline.getTime() - now.getTime()) / numBatches;
        return Array.from({length: numBatches}, (_, i) => new Date(now.getTime() + batchDelay * i));
    }
}

module.exports = BatchSendingService;
```