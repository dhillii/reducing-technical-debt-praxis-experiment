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
        if (AFTER_RETRY_CONFIG) this.#AFTER_RETRY_CONFIG = AFTER_RETRY_CONFIG;
        if (MAILGUN_API_RETRY_CONFIG) this.#MAILGUN_API_RETRY_CONFIG = MAILGUN_API_RETRY_CONFIG;

        // Reduce retries in test/dev environments
        const isTestEnv = process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development';
        if (isTestEnv) {
            this.#BEFORE_RETRY_CONFIG = {maxRetries: 0};
            this.#AFTER_RETRY_CONFIG = {maxRetries: 0};
            this.#MAILGUN_API_RETRY_CONFIG = {maxRetries: 0};
        }
    }

    #getBeforeRetryConfig(email) {
        return email._retryCutOffTime
            ? {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime}
            : this.#BEFORE_RETRY_CONFIG;
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
     * Entry point for the background job.
     * @private
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const email = await this._lockEmailForSending(emailId);
        if (!email) return;

        this._setRetryCutoff(email);
        try {
            await this.sendEmail(email);
            await this._finalizeEmail(email, 'submitted');
        } catch (err) {
            await this._handleEmailError(email, err);
        }
    }

    /**
     * Lock email row and change status to 'submitting'.
     * @private
     * @param {string} emailId
     * @returns {Promise<Email|undefined>}
     */
    async _lockEmailForSending(emailId) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    /**
     * Store a strict cutoff time for DB retries.
     * @private
     * @param {Email} email
     */
    _setRetryCutoff(email) {
        const startTime = Date.now();
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minSecPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minSecPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        email._retryCutOffTime = new Date(startTime + stopAfter);
    }

    /**
     * Update email status after processing.
     * @private
     * @param {Email} email
     * @param {string} status
     */
    async _finalizeEmail(email, status) {
        await this.retryDb(
            async () => {
                await email.save(
                    {status, submitted_at: new Date(), error: null},
                    {patch: true, autoRefresh: false}
                );
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> ${status}`}
        );
    }

    /**
     * Store error information on email failure.
     * @private
     * @param {Email} email
     * @param {Error} err
     */
    async _handleEmailError(email, err) {
        const ghostError = new errors.EmailError({
            err,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });
        logging.error(ghostError);
        if (this.#sentry) this.#sentry.captureException(err);
        await this.retryDb(
            async () => {
                await email.save(
                    {status: 'failed', error: err.message || 'Something went wrong while sending the email'},
                    {patch: true, autoRefresh: false}
                );
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> failed`}
        );
    }

    /**
     * Orchestrates the full email sending flow.
     * @private
     * @param {Email} email
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const {newsletter, post} = await this._loadEmailRelations(email);
        let batches = await this.getBatches(email);
        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }
        await this.sendBatches({email, batches, post, newsletter});
    }

    /**
     * Load newsletter and post relations for an email.
     * @private
     * @param {Email} email
     * @returns {Promise<{newsletter: Newsletter, post: Post}>}
     */
    async _loadEmailRelations(email) {
        const retryConfig = {...this.#getBeforeRetryConfig(email)};
        const newsletter = await this.retryDb(
            async () => email.getLazyRelation('newsletter', {require: true}),
            {...retryConfig, description: `getLazyRelation newsletter for email ${email.id}`}
        );
        const post = await this.retryDb(
            async () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
            {...retryConfig, description: `getLazyRelation post for email ${email.id}`}
        );
        return {newsletter, post};
    }

    /**
     * Retrieve existing batches for an email.
     * @private
     * @param {Email} email
     * @returns {Promise<EmailBatch[]>}
     */
    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const collection = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return collection.models;
    }

    /**
     * Create batches when none exist.
     * @private
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     * @returns {Promise<EmailBatch[]>}
     */
    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this._determineDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        let totalCount = 0;
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();

        for (const segment of segments) {
            totalCount = await this._processSegment({
                email,
                segment,
                newsletter,
                domainWarmupLimit,
                batches,
                totalCount,
                BATCH_SIZE
            });
        }

        await this._reconcileEmailCount(email, totalCount, domainWarmupLimit);
        return batches;
    }

    /**
     * Determine the warm‑up limit for custom domains.
     * @private
     * @param {Email} email
     * @returns {number}
     */
    _determineDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    /**
     * Process a single segment: fetch members, split batches if needed and create them.
     * @private
     * @returns {Promise<number>} Updated totalCount
     */
    async _processSegment({email, segment, newsletter, domainWarmupLimit, batches, totalCount, BATCH_SIZE}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        while (true) {
            const members = await this._fetchMembers(email, segmentFilter, lastId, BATCH_SIZE);
            if (!members.length) break;

            const remainingCapacity = domainWarmupLimit - totalCount;
            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const shouldSplit = remainingCapacity > 0 && remainingCapacity < membersToProcess;

            if (shouldSplit) {
                totalCount += await this._createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(0, remainingCapacity),
                    useFallbackDomain: false,
                    batches
                });
                totalCount += await this._createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(remainingCapacity, membersToProcess),
                    useFallbackDomain: true,
                    batches
                });
            } else {
                totalCount += await this._createBatchWithRetry({
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
                break;
            }
        }
        return totalCount;
    }

    /**
     * Fetch a batch of members for a segment.
     * @private
     * @returns {Promise<object[]>}
     */
    async _fetchMembers(email, segmentFilter, lastId, batchSize) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        const collection = await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(batchSize + 1);
        return collection;
    }

    /**
     * Reconcile stored email count with actual recipients.
     * @private
     */
    async _reconcileEmailCount(email, totalCount, domainWarmupLimit) {
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

    /**
     * Create a batch with retry logic.
     * @private
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (!members.length) return 0;
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

    /**
     * Create a batch and its recipients.
     * @private
     */
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

        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);
        if (options.transacting) insertQuery.transacting(options.transacting);

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
    }

    /**
     * Send all batches with concurrency control.
     * @private
     */
    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);
        const deadline = this.getDeliveryDeadline(email);
        if (deadline) logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);
        const queue = batches.slice();
        let succeeded = 0;

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
            if (deadline && deadline.getTime() > Date.now()) {
                const dt = deliveryTimes.shift();
                if (dt && dt >= Date.now()) batchData.deliveryTime = dt;
            }
            if (await this.sendBatch(batchData)) succeeded++;
            await worker();
        };

        await Promise.all(Array.from({length: MAX_SENDING_CONCURRENCY}, () => worker()));

        if (succeeded < batches.length) {
            const msg = succeeded > 0 ? messages.emailErrorPartialFailure : messages.emailError;
            throw new errors.EmailError({message: tpl(msg)});
        }
    }

    /**
     * Send a single batch.
     * @private
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
            const members = await this._fetchBatchMembers(email, batch);
            const response = await this._sendToProvider({
                email,
                batch,
                post,
                newsletter,
                members,
                emailBodyCache,
                deliveryTime
            });
            await this._updateBatchStatusSuccess(batch, response.id);
            return true;
        } catch (err) {
            await this._handleBatchError(batch, err);
            return false;
        } finally {
            await this._markRecipientsProcessed(batch);
        }
    }

    /**
     * Fetch members for a batch with retry.
     * @private
     */
    async _fetchBatchMembers(email, batch) {
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

    /**
     * Send batch data to the email provider.
     * @private
     */
    async _sendToProvider({email, batch, post, newsletter, members, emailBodyCache, deliveryTime}) {
        return this.retryDb(
            async () => this.#sendingService.send(
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
            ),
            {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${batch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`}
        );
    }

    /**
     * Update batch status to submitted.
     * @private
     */
    async _updateBatchStatusSuccess(batch, providerId) {
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

    /**
     * Handle errors while sending a batch.
     * @private
     */
    async _handleBatchError(batch, err) {
        const isBulkError = err.code === 'BULK_EMAIL_SEND_FAILED';
        const ghostError = new errors.EmailError({
            err,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email batch ${batch.id}`,
            context: err.message
        });

        logging.error(isBulkError ? err : ghostError);
        if (this.#sentry) this.#sentry.captureException(err);

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

    /**
     * Mark all recipients of a batch as processed.
     * @private
     */
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

    /**
     * Transform EmailRecipient models into MemberLike objects.
     * @returns {Promise<MemberLike[]>}
     */
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

    /**
     * Update status of a model with a lock.
     * @private
     */
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

    /**
     * Generic DB retry helper.
     * @private
     */
    async retryDb(func, options) {
        if (options.maxTime !== undefined) {
            const stopAfter = new Date(Date.now() + options.maxTime);
            if (!options.stopAfterDate || stopAfter < options.stopAfterDate) {
                options = {...options, stopAfterDate: stopAfter};
            }
        }
        const retryCount = options.retryCount ?? 0;

        try {
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount ? `Retry ${retryCount + 1}` : 'Start'} (try ${retryCount + 1})`);
            const result = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished after ${retryCount + 1} try`);
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

            if (sleep) await new Promise((resolve) => setTimeout(resolve, sleep));
            return this.retryDb(func, {...options, retryCount: retryCount + 1, sleep: sleep * 2});
        }
    }

    /**
     * Compute delivery deadline based on target window.
     * @param {Email} email
     * @returns {Date|undefined}
     */
    getDeliveryDeadline(email) {
        const target = this.#sendingService.getTargetDeliveryWindow();
        if (!target || target <= 0) return undefined;
        try {
            const start = email.get('created_at');
            return new Date(start.getTime() + target);
        } catch {
            return undefined;
        }
    }

    /**
     * Calculate delivery times for each batch.
     * @param {Email} email
     * @param {number} numBatches
     * @returns {(Date|undefined)[]}
     */
    calculateDeliveryTimes(email, numBatches) {
        const deadline = this.getDeliveryDeadline(email);
        const now = new Date();

        if (!deadline || now >= deadline) {
            return new Array(numBatches).fill(undefined);
        }

        const totalMs = deadline.getTime() - now.getTime();
        const interval = totalMs / numBatches;
        return Array.from({length: numBatches}, (_, i) => new Date(now.getTime() + i * interval));
    }
}

module.exports = BatchSendingService;
```