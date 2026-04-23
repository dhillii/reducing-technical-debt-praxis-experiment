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
        } else if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') {
            this.#BEFORE_RETRY_CONFIG = {maxRetries: 0};
        }

        if (AFTER_RETRY_CONFIG) {
            this.#AFTER_RETRY_CONFIG = AFTER_RETRY_CONFIG;
        } else if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') {
            this.#AFTER_RETRY_CONFIG = {maxRetries: 0};
        }

        if (MAILGUN_API_RETRY_CONFIG) {
            this.#MAILGUN_API_RETRY_CONFIG = MAILGUN_API_RETRY_CONFIG;
        } else if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') {
            this.#MAILGUN_API_RETRY_CONFIG = {maxRetries: 0};
        }
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

        const email = await this.#lockEmail(emailId);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        this.#setRetryCutoff(email);
        try {
            await this.sendEmail(email);
            await this.#finalizeEmail(email, 'submitted');
        } catch (err) {
            await this.#handleEmailError(email, err);
        }
    }

    async #lockEmail(emailId) {
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

    async #finalizeEmail(email, status) {
        await this.retryDb(
            async () => {
                await email.save(
                    {
                        status,
                        submitted_at: new Date(),
                        error: null
                    },
                    {patch: true, autoRefresh: false}
                );
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
                await email.save(
                    {
                        status: 'failed',
                        error: err.message || 'Something went wrong while sending the email'
                    },
                    {patch: true, autoRefresh: false}
                );
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> failed`}
        );
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const {newsletter, post} = await this.#loadRelations(email);
        let batches = await this.retryDb(
            async () => this.getBatches(email),
            {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
        );

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }

        await this.sendBatches({email, batches, post, newsletter});
    }

    async #loadRelations(email) {
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
        const collection = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return collection.models;
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
                BATCH_SIZE,
                domainWarmupLimit,
                batches,
                totalCountRef: {value: totalCount}
            });
            totalCount = totalCountRef.value;
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

    async #processSegment({email, segment, newsletter, BATCH_SIZE, domainWarmupLimit, batches, totalCountRef}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        while (true) {
            const members = await this.#fetchMemberBatch({
                segmentFilter,
                lastId,
                BATCH_SIZE
            });

            if (members.length === 0) {
                break;
            }

            const {processed, newTotal} = await this.#handleMemberBatch({
                email,
                segment,
                members,
                domainWarmupLimit,
                totalCount: totalCountRef.value,
                batches
            });
            totalCountRef.value = newTotal;

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }
    }

    async #fetchMemberBatch({segmentFilter, lastId, BATCH_SIZE}) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch with filter ${filter}`);
        return this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    async #handleMemberBatch({email, segment, members, domainWarmupLimit, totalCount, batches}) {
        const remainingCapacity = domainWarmupLimit - totalCount;
        const membersToProcess = Math.min(members.length, this.#sendingService.getMaximumRecipients());

        if (remainingCapacity > 0 && remainingCapacity < membersToProcess) {
            await this.#createSplitBatches({
                email,
                segment,
                members,
                splitAt: remainingCapacity,
                batches
            });
            return {processed: membersToProcess, newTotal: totalCount + membersToProcess};
        }

        const useFallback = totalCount >= domainWarmupLimit;
        await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, membersToProcess),
            useFallbackDomain: useFallback,
            batches
        });
        return {processed: membersToProcess, newTotal: totalCount + membersToProcess};
    }

    async #createSplitBatches({email, segment, members, splitAt, batches}) {
        await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, splitAt),
            useFallbackDomain: false,
            batches
        });
        await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(splitAt, splitAt + this.#sendingService.getMaximumRecipients()),
            useFallbackDomain: true,
            batches
        });
    }

    async #finalizeBatchCreation(email, batches, totalCount) {
        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

        if (email.get('email_count') !== totalCount) {
            await this.#adjustEmailCount(email, totalCount, batches.length);
        }
    }

    async #adjustEmailCount(email, totalCount, batchCount) {
        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(
                `Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`
            );
        }

        const update = {
            email_count: totalCount
        };
        if (this.#domainWarmingService.isEnabled()) {
            update.csd_email_count = Math.min(totalCount, Infinity);
        }

        await email.save(update, {patch: true, require: false, autoRefresh: false});
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (!members.length) {
            return 0;
        }
        const batch = await this.retryDb(
            async () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {
                ...this.#getBeforeRetryConfig(email),
                description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`
            }
        );
        batches.push(batch);
        return members.length;
    }

    async createBatch(email, segment, members, options) {
        if (!options?.transacting) {
            return this.#models.EmailBatch.transaction(async (transacting) => {
                return this.createBatch(email, segment, members, {transacting, ...options});
            });
        }

        logging.info(`Creating batch for email ${email.id} segment ${segment} with ${members.length} members`);

        const batch = await this.#models.EmailBatch.add(
            {
                email_id: email.id,
                member_segment: segment,
                status: 'pending',
                fallback_sending_domain: Boolean(options.useFallbackDomain)
            },
            options
        );

        const recipientData = members
            .filter((m) => m.id && m.uuid && m.email)
            .map((memberRow) => ({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: memberRow.id,
                batch_id: batch.id,
                member_uuid: memberRow.uuid,
                member_email: memberRow.email,
                member_name: memberRow.name
            }));

        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);
        if (options.transacting) {
            insertQuery.transacting(options.transacting);
        }

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
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

            const batchData = {
                email,
                batch,
                post,
                newsletter,
                emailBodyCache,
                deliveryTime: undefined
            };

            if (deadline && deadline.getTime() > Date.now()) {
                const nextTime = deliveryTimes.shift();
                if (nextTime && nextTime >= Date.now()) {
                    batchData.deliveryTime = nextTime;
                }
            }

            if (await this.sendBatch(batchData)) {
                succeededCount += 1;
            }
            await runNext();
        };

        await Promise.all(
            new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => runNext())
        );

        if (succeededCount < batches.length) {
            const msg = succeededCount > 0 ? messages.emailErrorPartialFailure : messages.emailError;
            throw new errors.EmailError({message: tpl(msg)});
        }
    }

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
            const members = await this.#fetchMembersForBatch(email, batch);
            const response = await this.#sendToProvider({
                email,
                batch,
                post,
                newsletter,
                members,
                emailBodyCache,
                deliveryTime
            });
            await this.#markBatchSubmitted(batch, response.id);
            return true;
        } catch (err) {
            await this.#handleBatchError(batch, err);
            return false;
        } finally {
            await this.#markRecipientsProcessed(batch);
        }
    }

    async #fetchMembersForBatch(email, batch) {
        return this.retryDb(
            async () => {
                const members = await this.getBatchMembers(batch.id);
                if (!members.length) {
                    throw new errors.EmailError({
                        message: `No members found for batch ${batch.id}, possible replication lag`
                    });
                }
                return members;
            },
            {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${batch.id}`}
        );
    }

    async #sendToProvider({email, batch, post, newsletter, members, emailBodyCache, deliveryTime}) {
        return this.retryDb(
            async () => {
                return this.#sendingService.send(
                    {
                        emailId: email.id,
                        post,
                        newsletter,
                        segment: batch.get('member_segment'),
                        members
                    },
                    {
                        openTrackingEnabled: !!email.get('track_opens'),
                        clickTrackingEnabled: !!email.get('track_clicks'),
                        useFallbackAddress: batch.get('fallback_sending_domain'),
                        deliveryTime,
                        emailBodyCache
                    }
                );
            },
            {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${batch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`}
        );
    }

    async #markBatchSubmitted(batch, providerId) {
        await this.retryDb(
            async () => {
                await batch.save(
                    {
                        status: 'submitted',
                        provider_id: providerId,
                        error_status_code: null,
                        error_message: null,
                        error_data: null
                    },
                    {patch: true, require: false, autoRefresh: false}
                );
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${batch.id} -> submitted`}
        );
    }

    async #handleBatchError(batch, err) {
        const isBulkError = err.code === 'BULK_EMAIL_SEND_FAILED';
        if (isBulkError) {
            logging.error(err);
        } else {
            const ghostError = new errors.EmailError({
                err,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email batch ${batch.id}`,
                context: err.message
            });
            logging.error(ghostError);
        }

        if (this.#sentry) {
            this.#sentry.captureException(err);
        }

        await this.retryDb(
            async () => {
                await batch.save(
                    {
                        status: 'failed',
                        error_status_code: err.statusCode ?? null,
                        error_message: err.message,
                        error_data: err.errorDetails ?? null
                    },
                    {patch: true, require: false, autoRefresh: false}
                );
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
            logging.info(
                `[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount > 0 ? `Retrying ${retryCount + 1}th try` : 'Started (1st try)'}`
            );
            const response = await func();
            logging.info(
                `[BULK_EMAIL_DB_RETRY] ${options.description} - Finished (after ${retryCount + 1}${retryCount === 0 ? 'st' : ' tries'})`
            );
            return response;
        } catch (e) {
            const sleep = options.sleep ?? 0;
            const shouldStop =
                retryCount >= options.maxRetries ||
                (options.stopAfterDate && new Date(Date.now() + sleep) > options.stopAfterDate);

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
                await new Promise((resolve) => setTimeout(resolve, sleep));
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
        return Array.from({length: numBatches}, (_, i) => new Date(now.getTime() + batchDelay * i));
    }
}

module.exports = BatchSendingService