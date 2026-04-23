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
     * Entry point for the job service.
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const email = await this._lockEmailForSending(emailId);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        const startTime = Date.now();
        this._setRetryCutoff(email, startTime);

        try {
            await this.sendEmail(email);
            await this._updateEmailStatus(email, 'submitted');
        } catch (err) {
            await this._handleEmailError(email, err);
        }
    }

    /**
     * Lock the email row and change status to 'submitting'.
     * @param {string} emailId
     * @returns {Promise<Email|undefined>}
     */
    async _lockEmailForSending(emailId) {
        return this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    /**
     * Set a strict cutoff time for DB retries.
     * @param {Email} email
     * @param {number} startTime
     */
    _setRetryCutoff(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        email._retryCutOffTime = new Date(startTime + stopAfter);
    }

    /**
     * Update email status after successful send.
     * @param {Email} email
     * @param {string} status
     */
    async _updateEmailStatus(email, status) {
        await this.retryDb(
            async () => {
                await email.save({
                    status,
                    submitted_at: new Date(),
                    error: null
                }, {patch: true, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> ${status}`}
        );
    }

    /**
     * Handle errors from sendEmail.
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

    /**
     * Send the email: load relations, get/create batches, then send them.
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
     * @param {Email} email
     * @returns {Promise<{newsletter: Newsletter, post: Post}>}
     */
    async _loadEmailRelations(email) {
        const newsletter = await this.retryDb(
            async () => await email.getLazyRelation('newsletter', {require: true}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
        );

        const post = await this.retryDb(
            async () => await email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
        );

        return {newsletter, post};
    }

    /**
     * Retrieve existing batches for an email.
     * @param {Email} email
     * @returns {Promise<EmailBatch[]>}
     */
    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
        return batches.models;
    }

    /**
     * Create batches when none exist.
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     * @returns {Promise<EmailBatch[]>}
     */
    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this._determineDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            totalCount = await this._processSegment({
                email,
                segment,
                newsletter,
                BATCH_SIZE,
                domainWarmupLimit,
                batches,
                totalCount
            });
        }

        await this._finalizeBatchCreation(email, batches, totalCount);
        return batches;
    }

    /**
     * Determine the warm‑up limit for custom domains.
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
     * Process a single segment: fetch members, split batches if needed, and create them.
     * @returns {Promise<number>} Updated totalCount
     */
    async _processSegment({email, segment, newsletter, BATCH_SIZE, domainWarmupLimit, batches, totalCount}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        let more = true;

        while (more) {
            const filter = `${segmentFilter}+id:<'${lastId}'`;
            const members = await this.#models.Member.getFilteredCollectionQuery({filter})
                .orderByRaw('id DESC')
                .select('members.id', 'members.uuid', 'members.email', 'members.name')
                .limit(BATCH_SIZE + 1);

            if (members.length === 0) {
                break;
            }

            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;

            if (remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess) {
                totalCount += await this._createSplitBatch({
                    email,
                    segment,
                    members,
                    remainingCustomDomainCapacity,
                    batches
                });
            } else {
                totalCount += await this._createSingleBatch({
                    email,
                    segment,
                    members,
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

    /**
     * Create two batches when a split is required.
     * @returns {Promise<number>} Number of members added
     */
    async _createSplitBatch({email, segment, members, remainingCustomDomainCapacity, batches}) {
        const firstSlice = members.slice(0, remainingCustomDomainCapacity);
        const secondSlice = members.slice(remainingCustomDomainCapacity, remainingCustomDomainCapacity + firstSlice.length);

        await this.#createBatchWithRetry({
            email,
            segment,
            members: firstSlice,
            useFallbackDomain: false,
            batches
        });

        await this.#createBatchWithRetry({
            email,
            segment,
            members: secondSlice,
            useFallbackDomain: true,
            batches
        });

        return firstSlice.length + secondSlice.length;
    }

    /**
     * Create a single batch.
     * @returns {Promise<number>}
     */
    async _createSingleBatch({email, segment, members, useFallbackDomain, batches}) {
        await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, members.length),
            useFallbackDomain,
            batches
        });
        return members.length;
    }

    /**
     * Final validation and possible email count correction after batch creation.
     */
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
                newEmailUpdate.csd_email_count = Math.min(totalCount, this._determineDomainWarmupLimit(email));
            }

            await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
        }
    }

    /**
     * Creates a batch with retry logic and adds it to the batches array.
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }

        const batch = await this.retryDb(
            async () => await this.createBatch(email, segment, members, {useFallbackDomain}),
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
     */
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
        if (options.transacting) {
            insertQuery.transacting(options.transacting);
        }

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
    }

    /**
     * Send all batches respecting concurrency limits.
     */
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

        const worker = async () => {
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
            await worker();
        };

        await Promise.all(
            new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => worker())
        );

        if (succeededCount < batches.length) {
            if (succeededCount > 0) {
                throw new errors.EmailError({message: tpl(messages.emailErrorPartialFailure)});
            }
            throw new errors.EmailError({message: tpl(messages.emailError)});
        }
    }

    /**
     * Send a single batch.
     */
    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this.retryDb(
            async () => await this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']),
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

            await this._markBatchSubmitted(batch, response.id);
            await this._markRecipientsProcessed(batch);
            return true;
        } catch (err) {
            await this._handleBatchError(batch, err);
            await this._markRecipientsProcessed(batch);
            return false;
        }
    }

    /**
     * Fetch members for a batch with retry.
     */
    async _fetchBatchMembers(email, batch) {
        return this.retryDb(
            async () => {
                const members = await this.getBatchMembers(batch.id);
                if (members.length === 0) {
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
     * Send the batch via the sending service.
     */
    async _sendToProvider({email, batch, post, newsletter, members, emailBodyCache, deliveryTime}) {
        return this.retryDb(
            async () => {
                return await this.#sendingService.send({
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
                });
            },
            {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${batch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`}
        );
    }

    /**
     * Mark a batch as submitted.
     */
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

    /**
     * Handle errors while sending a batch.
     */
    async _handleBatchError(batch, err) {
        if (err.code && err.code === 'BULK_EMAIL_SEND_FAILED') {
            logging.error(err);
            if (this.#sentry) {
                this.#sentry.captureException(err);
            }
        } else {
            const ghostError = new errors.EmailError({
                err,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email batch ${batch.id}`,
                context: err.message
            });
            logging.error(ghostError);
            if (this.#sentry) {
                this.#sentry.captureException(err);
            }
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

    /**
     * Mark all recipients of a batch as processed.
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

    /**
     * Update the status of an email or batch with a lock.
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
     * Retry a DB operation with exponential back‑off.
     */
    async retryDb(func, options) {
        if (options.maxTime !== undefined) {
            const stopAfterDate = new Date(Date.now() + options.maxTime);
            if (!options.stopAfterDate || stopAfterDate < options.stopAfterDate) {
                options = {...options, stopAfterDate};
            }
        }
        const retryCount = options.retryCount ?? 0;

        try {
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount === 0 ? 'Started' : `Retry ${retryCount + 1}`}`);
            const response = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished after ${retryCount + 1} ${retryCount === 0 ? 'try' : 'tries'}`);
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

    /**
     * Get the delivery deadline for an email.
     */
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

    /**
     * Calculate delivery times for each batch.
     */
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