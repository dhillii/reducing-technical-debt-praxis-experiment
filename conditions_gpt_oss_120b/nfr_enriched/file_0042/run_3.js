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

        if (BEFORE_RETRY_CONFIG) this.#BEFORE_RETRY_CONFIG = BEFORE_RETRY_CONFIG;
        else if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') this.#BEFORE_RETRY_CONFIG = {maxRetries: 0};

        if (AFTER_RETRY_CONFIG) this.#AFTER_RETRY_CONFIG = AFTER_RETRY_CONFIG;
        else if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') this.#AFTER_RETRY_CONFIG = {maxRetries: 0};

        if (MAILGUN_API_RETRY_CONFIG) this.#MAILGUN_API_RETRY_CONFIG = MAILGUN_API_RETRY_CONFIG;
        else if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') this.#MAILGUN_API_RETRY_CONFIG = {maxRetries: 0};
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime};
        }
        return this.#BEFORE_RETRY_CONFIG;
    }

    /**
     * Schedule a background job for the given email.
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
     * Job entry point – locks the email, sends it and updates its status.
     * @private
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const startTime = Date.now();

        const email = await this._lockEmailForSending(emailId);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        email._retryCutOffTime = this._calculateRetryCutoff(email, startTime);

        try {
            await this.sendEmail(email);
            await this._finalizeEmailSuccess(email);
        } catch (e) {
            await this._handleEmailFailure(email, e);
        }
    }

    /** Lock email status to 'submitting' if it is pending/failed */
    async _lockEmailForSending(emailId) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    /** Compute the retry cut‑off time based on expected batch count */
    _calculateRetryCutoff(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        return new Date(startTime + stopAfter);
    }

    /** Persist successful email status */
    async _finalizeEmailSuccess(email) {
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

    /** Persist failed email status and log the error */
    async _handleEmailFailure(email, err) {
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
     * Orchestrates loading relations, batch creation and sending.
     * @private
     * @param {Email} email
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const {newsletter, post} = await this._loadEmailRelations(email);
        const batches = await this._obtainBatches(email, newsletter, post);
        await this.sendBatches({email, batches, post, newsletter});
    }

    /** Load newsletter and post relations for an email */
    async _loadEmailRelations(email) {
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

    /** Retrieve existing batches or create new ones */
    async _obtainBatches(email, newsletter, post) {
        let batches = await this.retryDb(
            async () => this.getBatches(email),
            {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
        );

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }
        return batches;
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return batches.models;
    }

    /**
     * Create batches for all segments.
     * @private
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     */
    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#domainWarmingService.isEnabled()
            ? Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity
            : Infinity;

        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        let totalCount = 0;
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();

        for (const segment of segments) {
            const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
                newsletter,
                email.get('recipient_filter'),
                segment
            );
            totalCount = await this._processSegment({
                email,
                segment,
                segmentFilter,
                domainWarmupLimit,
                totalCount,
                batches,
                BATCH_SIZE
            });
        }

        await this._finalizeBatchCreation(email, batches, totalCount);
        return batches;
    }

    /** Process a single segment, fetching members and creating batches */
    async _processSegment({email, segment, segmentFilter, domainWarmupLimit, totalCount, batches, BATCH_SIZE}) {
        let lastId = email.id;
        let more = true;

        while (more) {
            const members = await this._fetchMemberBatch(email, segment, segmentFilter, lastId, BATCH_SIZE);
            if (members.length === 0) break;

            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
            const shouldSplit = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;

            if (shouldSplit) {
                totalCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(0, remainingCustomDomainCapacity),
                    useFallbackDomain: false,
                    batches
                });
                totalCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(remainingCustomDomainCapacity, membersToProcess),
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
                more = false;
            }
        }

        return totalCount;
    }

    /** Fetch a batch of members for a segment */
    async _fetchMemberBatch(email, segment, segmentFilter, lastId, batchSize) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, filter ${filter}`);

        const members = await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(batchSize + 1);

        return members;
    }

    /** Update email model after batch creation (email_count, csd_email_count) */
    async _finalizeBatchCreation(email, batches, totalCount) {
        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

        if (email.get('email_count') !== totalCount) {
            logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

            const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
            if (this.#sentry && errorRate >= 0.01) {
                this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
            }

            const newEmailUpdate = {
                email_count: totalCount
            };
            if (this.#domainWarmingService.isEnabled()) {
                newEmailUpdate.csd_email_count = Math.min(totalCount, email.get('csd_email_count') ?? Infinity);
            }

            await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
        }
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
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
        if (!options || !options.transacting) {
            return this.#models.EmailBatch.transaction(async (transacting) => {
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

        const recipientData = [];

        members.forEach((memberRow) => {
            if (!memberRow.id || !memberRow.uuid || !memberRow.email) {
                logging.warn(`Member row not included as email recipient due to missing data - id: ${memberRow.id}, uuid: ${memberRow.uuid}, email: ${memberRow.email}`);
                return;
            }

            recipientData.push({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: memberRow.id,
                batch_id: batch.id,
                member_uuid: memberRow.uuid,
                member_email: memberRow.email,
                member_name: memberRow.name
            });
        });

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
        if (deadline) logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);

        const succeededCount = await this._processBatchQueue({
            queue: batches.slice(),
            email,
            post,
            newsletter,
            deadline,
            deliveryTimes,
            emailBodyCache
        });

        if (succeededCount < batches.length) {
            if (succeededCount > 0) {
                throw new errors.EmailError({message: tpl(messages.emailErrorPartialFailure)});
            }
            throw new errors.EmailError({message: tpl(messages.emailError)});
        }
    }

    /** Run batch processing with limited concurrency */
    async _processBatchQueue({queue, email, post, newsletter, deadline, deliveryTimes, emailBodyCache}) {
        let succeeded = 0;

        const worker = async () => {
            while (queue.length) {
                const batch = queue.shift();
                const deliveryTime = this._determineDeliveryTime(deadline, deliveryTimes);
                const success = await this.sendBatch({
                    email,
                    batch,
                    post,
                    newsletter,
                    emailBodyCache,
                    deliveryTime
                });
                if (success) succeeded++;
            }
        };

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => worker()));
        return succeeded;
    }

    /** Choose a delivery time if a deadline exists */
    _determineDeliveryTime(deadline, deliveryTimes) {
        if (!deadline || deadline.getTime() <= Date.now()) {
            return undefined;
        }
        const time = deliveryTimes.shift();
        return time && time >= Date.now() ? time : undefined;
    }

    /**
     * Send a single batch.
     * @param {{email: Email, batch: EmailBatch, post: Post, newsletter: Newsletter, emailBodyCache: EmailBodyCache, deliveryTime:(Date|undefined)}} data
     * @returns {Promise<boolean>}
     */
    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this._lockBatchForSending(email, originalBatch);
        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${originalBatch.id}`);
            return true;
        }

        let succeeded = false;
        try {
            const members = await this._fetchBatchMembers(email, batch);
            const response = await this._sendToProvider(email, post, newsletter, batch, members, deliveryTime, emailBodyCache);
            succeeded = true;
            await this._markBatchSubmitted(batch, response.id);
        } catch (err) {
            await this._handleBatchError(batch, err);
        }

        await this._markRecipientsProcessed(batch);
        return succeeded;
    }

    /** Lock a batch status to 'submitting' */
    async _lockBatchForSending(email, originalBatch) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']),
            {...this.#getBeforeRetryConfig(email), description: `updateStatusLock batch ${originalBatch.id} -> submitting`}
        );
    }

    /** Retrieve members for a batch, retrying on empty result */
    async _fetchBatchMembers(email, batch) {
        return this.retryDb(
            async () => {
                const members = await this.getBatchMembers(batch.id);
                if (members.length === 0) {
                    throw new errors.EmailError({message: `No members found for batch ${batch.id}, possible replication lag`});
                }
                return members;
            },
            {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${batch.id}`}
        );
    }

    /** Send the batch via the sending service */
    async _sendToProvider(email, post, newsletter, batch, members, deliveryTime, emailBodyCache) {
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

    /** Mark batch as submitted */
    async _markBatchSubmitted(batch, providerId) {
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

    /** Handle errors while sending a batch */
    async _handleBatchError(batch, err) {
        if (err.code && err.code === 'BULK_EMAIL_SEND_FAILED') {
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

    /** Mark all recipients of a batch as processed */
    async _markRecipientsProcessed(batch) {
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
            const subscriptions = model.related('member').related('stripeSubscriptions').toJSON();
            const tiers = model.related('member').related('products').toJSON();

            return {
                id: model.get('member_id'),
                uuid: model.get('member_uuid'),
                email: model.get('member_email'),
                name: model.get('member_name'),
                createdAt: model.related('member')?.get('created_at') ?? null,
                status: model.related('member')?.get('status') ?? 'free',
                subscriptions,
                tiers
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
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount > 0 ? `Retry ${retryCount + 1}` : 'Start'} (try ${retryCount + 1})`);
            const response = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished (after ${retryCount + 1} ${retryCount === 0 ? 'st' : 'tries'})`);
            return response;
        } catch (e) {
            const sleep = options.sleep ?? 0;
            if (retryCount >= options.maxRetries || (options.stopAfterDate && (Date.now() + sleep) > options.stopAfterDate.getTime())) {
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

module.exports = BatchSendingService;
```