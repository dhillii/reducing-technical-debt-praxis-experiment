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

        if (BEFORE_RETRY_CONFIG) {
            this.#BEFORE_RETRY_CONFIG = BEFORE_RETRY_CONFIG;
        } else if (this.#isTestOrDevEnv()) {
            this.#BEFORE_RETRY_CONFIG = {maxRetries: 0};
        }

        if (AFTER_RETRY_CONFIG) {
            this.#AFTER_RETRY_CONFIG = AFTER_RETRY_CONFIG;
        } else if (this.#isTestOrDevEnv()) {
            this.#AFTER_RETRY_CONFIG = {maxRetries: 0};
        }

        if (MAILGUN_API_RETRY_CONFIG) {
            this.#MAILGUN_API_RETRY_CONFIG = MAILGUN_API_RETRY_CONFIG;
        } else if (this.#isTestOrDevEnv()) {
            this.#MAILGUN_API_RETRY_CONFIG = {maxRetries: 0};
        }
    }

    /**
     * @private
     * @returns {boolean}
     */
    #isTestOrDevEnv() {
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
     * @param {{emailId: string}} data
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const email = await this.#fetchAndLockEmail(emailId);
        if (!email) {
            return;
        }

        const retryCutOffTime = this.#calculateRetryCutOff(email);
        email._retryCutOffTime = retryCutOffTime;

        try {
            await this.sendEmail(email);
            await this.#markEmailSubmitted(email);
        } catch (e) {
            await this.#handleEmailJobError(email, e);
        }
    }

    async #fetchAndLockEmail(emailId) {
        return this.retryDb(
            async () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    #calculateRetryCutOff(email) {
        const startTime = Date.now();
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#BEFORE_RETRY_CONFIG.maxTime
        );
        return new Date(startTime + stopAfter);
    }

    async #markEmailSubmitted(email) {
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

    async #handleEmailJobError(email, err) {
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
                    {status: 'failed', error: err.message || 'Something went wrong while sending the email'},
                    {patch: true, autoRefresh: false}
                );
            },
            {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> failed`}
        );
    }

    /**
     * @private
     * @param {Email} email
     * @throws {errors.EmailError}
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.retryDb(
            async () => email.getLazyRelation('newsletter', {require: true}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
        );

        const post = await this.retryDb(
            async () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
        );

        let batches = await this.retryDb(
            async () => this.getBatches(email),
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

        const domainWarmupLimit = this.#getDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            const added = await this.#processSegment({
                email,
                segment,
                newsletter,
                BATCH_SIZE,
                domainWarmupLimit,
                batches
            });
            totalCount += added;
        }

        await this.#finalizeBatchCreation(email, batches, totalCount);
        return batches;
    }

    /**
     * @private
     * @param {Email} email
     * @returns {number}
     */
    #getDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        const count = email.get('csd_email_count');
        return Number.isInteger(count) ? count : Infinity;
    }

    /**
     * @private
     * @param {object} params
     * @param {Email} params.email
     * @param {string} params.segment
     * @param {Newsletter} params.newsletter
     * @param {number} params.BATCH_SIZE
     * @param {number} params.domainWarmupLimit
     * @param {EmailBatch[]} params.batches
     * @returns {Promise<number>} Number of members added in this segment
     */
    async #processSegment({email, segment, newsletter, BATCH_SIZE, domainWarmupLimit, batches}) {
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(
            newsletter,
            email.get('recipient_filter'),
            segment
        );

        let lastId = email.id;
        let addedCount = 0;

        while (true) {
            const filter = `${segmentFilter}+id:<'${lastId}'`;
            const members = await this.#models.Member.getFilteredCollectionQuery({filter})
                .orderByRaw('id DESC')
                .select('members.id', 'members.uuid', 'members.email', 'members.name')
                .limit(BATCH_SIZE + 1);

            if (members.length === 0) {
                break;
            }

            const membersToProcess = Math.min(members.length, BATCH_SIZE);
            const remainingCustomDomainCapacity = domainWarmupLimit - addedCount;
            const useFallback = addedCount >= domainWarmupLimit;

            if (this.#shouldSplitBatch(remainingCustomDomainCapacity, membersToProcess)) {
                const split = remainingCustomDomainCapacity;
                addedCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(0, split),
                    useFallbackDomain: false,
                    batches
                });
                addedCount += await this.#createBatchWithRetry({
                    email,
                    segment,
                    members: members.slice(split, membersToProcess),
                    useFallbackDomain: true,
                    batches
                });
            } else {
                addedCount += await this.#createBatchWithRetry({
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

        return addedCount;
    }

    /**
     * @private
     * @param {number} remainingCapacity
     * @param {number} membersToProcess
     * @returns {boolean}
     */
    #shouldSplitBatch(remainingCapacity, membersToProcess) {
        return remainingCapacity > 0 && remainingCapacity < membersToProcess;
    }

    async #finalizeBatchCreation(email, batches, totalCount) {
        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

        if (email.get('email_count') !== totalCount) {
            await this.#handleMismatchedEmailCount(email, totalCount);
        }
    }

    async #handleMismatchedEmailCount(email, totalCount) {
        logging.error(
            `Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`
        );

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(
                `Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`
            );
        }

        const update = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            update.csd_email_count = Math.min(totalCount, this.#getDomainWarmupLimit(email));
        }

        await email.save(update, {patch: true, require: false, autoRefresh: false});
    }

    /**
     * Creates a batch with retry logic and adds it to the batches array
     * @param {object} params
     * @param {Email} params.email
     * @param {import('./email-renderer').Segment} params.segment
     * @param {object[]} params.members
     * @param {boolean} params.useFallbackDomain
     * @param {EmailBatch[]} params.batches
     * @returns {Promise<number>}
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }

        const domainDesc = useFallbackDomain ? 'fallback domain' : 'custom domain';
        const batch = await this.retryDb(
            async () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {
                ...this.#getBeforeRetryConfig(email),
                description: `createBatch email ${email.id} segment ${segment} (${domainDesc})`
            }
        );
        batches.push(batch);
        return members.length;
    }

    /**
     * @private
     * @param {Email} email
     * @param {import('./email-renderer').Segment} segment
     * @param {object[]} members
     * @param {object} options
     * @param {boolean} options.useFallbackDomain
     * @param {import('knex').Knex} [options.transacting]
     * @returns {Promise<EmailBatch>}
     */
    async createBatch(email, segment, members, options) {
        if (!options || !options.transacting) {
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

        const recipientData = [];

        members.forEach((memberRow) => {
            if (!memberRow.id || !memberRow.uuid || !memberRow.email) {
                logging.warn(
                    `Member row not included as email recipient due to missing data - id: ${memberRow.id}, uuid: ${memberRow.uuid}, email: ${memberRow.email}`
                );
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
        if (deadline) {
            logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);
        }

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);
        let succeededCount = 0;
        const queue = batches.slice();

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
                const nextDelivery = deliveryTimes.shift();
                if (nextDelivery && nextDelivery >= Date.now()) {
                    batchData.deliveryTime = nextDelivery;
                }
            }

            if (await this.sendBatch(batchData)) {
                succeededCount += 1;
            }
            await runNext();
        };

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => runNext()));

        if (succeededCount < batches.length) {
            if (succeededCount > 0) {
                throw new errors.EmailError({message: tpl(messages.emailErrorPartialFailure)});
            }
            throw new errors.EmailError({message: tpl(messages.emailError)});
        }
    }

    /**
     *
     * @param {{email: Email, batch: EmailBatch, post: Post, newsletter: Newsletter, emailBodyCache: EmailBodyCache, deliveryTime:(Date|undefined) }} data
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

        let succeeded = false;

        try {
            const members = await this.retryDb(
                async () => {
                    const m = await this.getBatchMembers(batch.id);
                    if (m.length === 0) {
                        throw new errors.EmailError({
                            message: `No members found for batch ${batch.id}, possible replication lag`
                        });
                    }
                    return m;
                },
                {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${originalBatch.id}`}
            );

            const response = await this.retryDb(
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
                {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${originalBatch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`}
            );

            succeeded = true;

            await this.retryDb(
                async () => {
                    await batch.save(
                        {
                            status: 'submitted',
                            provider_id: response.id,
                            error_status_code: null,
                            error_message: null,
                            error_data: null
                        },
                        {patch: true, require: false, autoRefresh: false}
                    );
                },
                {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> submitted`}
            );
        } catch (err) {
            await this.#handleSendBatchError(err, batch, originalBatch);
        }

        await this.retryDb(
            async () => {
                await this.#models.EmailRecipient
                    .where({batch_id: batch.id})
                    .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${originalBatch.id} processed_at`}
        );

        return succeeded;
    }

    /**
     * @private
     * @param {Error} err
     * @param {object} batch
     * @param {EmailBatch} originalBatch
     */
    async #handleSendBatchError(err, batch, originalBatch) {
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
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> failed`}
        );
    }

    /**
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
     * @private
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
     * @private
     * @template T
     * @param {() => Promise<T>} func
     * @param {object} options
     * @param {string} options.description
     * @param {number} options.sleep
     * @param {number} options.maxRetries
     * @param {number} [options.retryCount]
     * @param {number} [options.maxTime]
     * @param {Date} [options.stopAfterDate]
     * @returns {Promise<T>}
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
            if (retryCount >= options.maxRetries || (options.stopAfterDate && Date.now() + sleep > options.stopAfterDate)) {
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
     * Returns the sending deadline for an email
     * @param {Email} email
     * @returns {Date|undefined}
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
     * Adds delivery times to the passed in batches, based on the delivery deadline
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