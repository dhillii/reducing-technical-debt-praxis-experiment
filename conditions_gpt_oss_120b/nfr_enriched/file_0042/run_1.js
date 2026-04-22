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
     * Job entry point – fetches the email, locks it and delegates to send logic.
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);
        const startTime = Date.now();

        const email = await this.#lockEmailForSending(emailId);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        this.#setRetryCutoff(email, startTime);
        try {
            await this.sendEmail(email);
            await this.#finalizeEmailSuccess(email);
        } catch (err) {
            await this.#handleEmailFailure(email, err);
        }
    }

    /** Lock email status to 'submitting' if it is pending/failed */
    async #lockEmailForSending(emailId) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    /** Compute and store a strict retry cut‑off time */
    #setRetryCutoff(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minSecPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minSecPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        email._retryCutOffTime = new Date(startTime + stopAfter);
    }

    /** Persist successful email status */
    async #finalizeEmailSuccess(email) {
        await this.retryDb(
            async () => {
                await email.save(
                    {status: 'submitted', submitted_at: new Date(), error: null},
                    {patch: true, autoRefresh: false}
                );
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> submitted`}
        );
    }

    /** Persist failed email status and log the error */
    async #handleEmailFailure(email, err) {
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
     * Orchestrates loading relations, batch creation and sending.
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

    /** Load newsletter and post relations for an email */
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
     * Create batches for an email when none exist.
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     */
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
                domainWarmupLimit,
                BATCH_SIZE,
                batches,
                totalCount
            }).then(count => totalCount += count);
        }

        await this.#finalizeBatchCreation(email, totalCount, domainWarmupLimit);
        return batches;
    }

    /** Determine the warm‑up limit for custom domains */
    #determineDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) return Infinity;
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    /** Process a single segment – fetch members and create batches */
    async #processSegment({email, segment, newsletter, domainWarmupLimit, BATCH_SIZE, batches, totalCount}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        let processed = 0;

        while (lastId) {
            const members = await this.#fetchMembersBatch({segmentFilter, lastId, BATCH_SIZE});
            if (members.length === 0) break;

            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const remainingCapacity = domainWarmupLimit - totalCount;

            if (remainingCapacity > 0 && remainingCapacity < membersToProcess) {
                processed += await this.#createSplitBatch({
                    email,
                    segment,
                    members,
                    splitAt: remainingCapacity,
                    batches
                });
            } else {
                processed += await this.#createBatchWithRetry({
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
                lastId = null;
            }
        }
        return processed;
    }

    /** Fetch a batch of members for a segment */
    async #fetchMembersBatch({segmentFilter, lastId, BATCH_SIZE}) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch with filter ${filter}`);
        return this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    /** Create two batches when a split is required */
    async #createSplitBatch({email, segment, members, splitAt, batches}) {
        let added = 0;
        added += await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, splitAt),
            useFallbackDomain: false,
            batches
        });
        added += await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(splitAt, splitAt + (members.length - splitAt)),
            useFallbackDomain: true,
            batches
        });
        return added;
    }

    /**
     * Creates a batch with retry logic and adds it to the batches array
     * @param {object} params
     * @returns {Promise<number>} Number of members added
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (!members.length) return 0;
        const batch = await this.retryDb(
            async () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {...this.#getBeforeRetryConfig(email), description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`}
        );
        batches.push(batch);
        return members.length;
    }

    /**
     * Create a batch and its recipients.
     * @param {Email} email
     * @param {import('./email-renderer').Segment} segment
     * @param {object[]} members
     * @param {object} options
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

        const recipientData = members.reduce((arr, memberRow) => {
            if (!memberRow.id || !memberRow.uuid || !memberRow.email) {
                logging.warn(`Member row missing data – id:${memberRow.id} uuid:${memberRow.uuid} email:${memberRow.email}`);
                return arr;
            }
            arr.push({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: memberRow.id,
                batch_id: batch.id,
                member_uuid: memberRow.uuid,
                member_email: memberRow.email,
                member_name: memberRow.name
            });
            return arr;
        }, []);

        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);
        if (options.transacting) insertQuery.transacting(options.transacting);
        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
    }

    /** Final checks after batch creation – update email counts if needed */
    async #finalizeBatchCreation(email, totalCount, domainWarmupLimit) {
        logging.info(`Created ${totalCount} recipients for email ${email.id}`);
        if (email.get('email_count') !== totalCount) {
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
                if (nextTime && nextTime >= Date.now()) batchData.deliveryTime = nextTime;
            }
            if (await this.sendBatch(batchData)) succeededCount += 1;
            await runNext();
        };

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => runNext()));

        if (succeededCount < batches.length) {
            const msg = succeededCount > 0 ? messages.emailErrorPartialFailure : messages.emailError;
            throw new errors.EmailError({message: tpl(msg)});
        }
    }

    /**
     * Send a single batch.
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
            const response = await this.#sendToProvider({email, post, newsletter, batch, members, deliveryTime, emailBodyCache});
            await this.#markBatchSubmitted(batch, response.id);
            return true;
        } catch (err) {
            await this.#handleBatchError(batch, err);
            return false;
        } finally {
            await this.#markRecipientsProcessed(batch);
        }
    }

    /** Fetch members for a batch with retry */
    async #fetchBatchMembers(email, batch) {
        return this.retryDb(
            async () => {
                const members = await this.getBatchMembers(batch.id);
                if (!members.length) {
                    throw new errors.EmailError({message: `No members found for batch ${batch.id}, possible replication lag`});
                }
                return members;
            },
            {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${batch.id}`}
        );
    }

    /** Send the batch via the sending service */
    async #sendToProvider({email, post, newsletter, batch, members, deliveryTime, emailBodyCache}) {
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

    /** Mark batch as submitted */
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

    /** Handle errors while sending a batch */
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

    /** Mark all recipients of a batch as processed */
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
     * @param {object} Model
     * @param {string} id
     * @param {string} status
     * @param {string[]} allowedStatuses
     * @returns {Promise<object|undefined>}
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
     * @template T
     * @param {() => Promise<T>} func
     * @param {object} options
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
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - ${retryCount ? `Retry ${retryCount + 1}` : 'Start'} (try ${retryCount + 1})`);
            const result = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished after ${retryCount + 1} try`);
            return result;
        } catch (e) {
            const sleep = options.sleep ?? 0;
            const shouldStop = retryCount >= options.maxRetries ||
                (options.stopAfterDate && (Date.now() + sleep) > options.stopAfterDate);
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
     * Compute the delivery deadline for an email.
     * @param {*} email
     * @returns {Date|undefined}
     */
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

    /**
     * Calculate delivery times for each batch based on the deadline.
     * @param {Email} email
     * @param {number} numBatches
     * @returns {Array<Date|undefined>}
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

module.exports = BatchSendingService;
```