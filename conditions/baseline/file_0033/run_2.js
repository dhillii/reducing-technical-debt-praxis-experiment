Here's the refactored code with reduced complexity through better separation of concerns, extracted helper methods, and simplified logic:

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
const IS_NON_PRODUCTION = () => process.env.NODE_ENV?.startsWith('test') || process.env.NODE_ENV === 'development';
const NO_RETRY = {maxRetries: 0};

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

        this.#BEFORE_RETRY_CONFIG = this.#resolveRetryConfig(BEFORE_RETRY_CONFIG, this.#BEFORE_RETRY_CONFIG);
        this.#AFTER_RETRY_CONFIG = this.#resolveRetryConfig(AFTER_RETRY_CONFIG, this.#AFTER_RETRY_CONFIG);
        this.#MAILGUN_API_RETRY_CONFIG = this.#resolveRetryConfig(MAILGUN_API_RETRY_CONFIG, this.#MAILGUN_API_RETRY_CONFIG);
    }

    /**
     * Resolves retry config, falling back to no-retry in non-production environments
     * @param {object|undefined} provided
     * @param {object} defaultConfig
     * @returns {object}
     */
    #resolveRetryConfig(provided, defaultConfig) {
        if (provided) {
            return provided;
        }
        return IS_NON_PRODUCTION() ? NO_RETRY : defaultConfig;
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

        const startTime = Date.now();
        const email = await this.#lockEmailForSending(emailId);

        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        email._retryCutOffTime = this.#calculateRetryCutOffTime(email, startTime);

        try {
            await this.sendEmail(email);
            await this.retryDb(
                () => email.save({status: 'submitted', submitted_at: new Date(), error: null}, {patch: true, autoRefresh: false}),
                {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> submitted`}
            );
        } catch (e) {
            await this.#handleEmailJobError(e, email, emailId);
        }
    }

    /**
     * @private
     */
    async #lockEmailForSending(emailId) {
        return this.retryDb(
            () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    /**
     * @private
     */
    #calculateRetryCutOffTime(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(expectedBatchCount * minimumSecondsPerBatch * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        return new Date(startTime + stopAfter);
    }

    /**
     * @private
     */
    async #handleEmailJobError(e, email, emailId) {
        const ghostError = new errors.EmailError({
            err: e,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });

        logging.error(ghostError);
        this.#captureSentryException(e);

        await this.retryDb(
            () => email.save({
                status: 'failed',
                error: e.message || 'Something went wrong while sending the email'
            }, {patch: true, autoRefresh: false}),
            {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> failed`}
        );
    }

    /**
     * @private
     * @param {Email} email
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const [newsletter, post] = await Promise.all([
            this.retryDb(
                () => email.getLazyRelation('newsletter', {require: true}),
                {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
            ),
            this.retryDb(
                () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
                {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
            )
        ]);

        let batches = await this.retryDb(
            () => this.getBatches(email),
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
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        const batches = [];
        let totalCount = 0;

        for (const segment of segments) {
            totalCount += await this.#createBatchesForSegment({
                email, newsletter, segment, BATCH_SIZE, domainWarmupLimit, batches, totalCount
            });
        }

        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);
        await this.#reconcileEmailCount(email, totalCount, domainWarmupLimit);

        return batches;
    }

    /**
     * @private
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
     */
    async #createBatchesForSegment({email, newsletter, segment, BATCH_SIZE, domainWarmupLimit, batches, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let lastId = email.id;
        let members;
        let segmentCount = 0;

        while (!members || lastId) {
            members = await this.#fetchMembersBatch(email, segment, segmentFilter, lastId, BATCH_SIZE);

            if (members.length > 0) {
                segmentCount += await this.#distributeMembersIntoBatches({
                    email, segment, members, BATCH_SIZE,
                    domainWarmupLimit, batches,
                    totalCount: totalCount + segmentCount
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

    /**
     * @private
     */
    async #fetchMembersBatch(email, segment, segmentFilter, lastId, BATCH_SIZE) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

        return this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    /**
     * @private
     */
    async #distributeMembersIntoBatches({email, segment, members, BATCH_SIZE, domainWarmupLimit, batches, totalCount}) {
        const membersToProcess = Math.min(members.length, BATCH_SIZE);
        const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
        const shouldSplitBatch = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;

        if (shouldSplitBatch) {
            const customDomainCount = await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(0, remainingCustomDomainCapacity),
                useFallbackDomain: false,
                batches
            });
            const fallbackCount = await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(remainingCustomDomainCapacity, membersToProcess),
                useFallbackDomain: true,
                batches
            });
            return customDomainCount + fallbackCount;
        }

        return this.#createBatchWithRetry({
            email, segment,
            members: members.slice(0, membersToProcess),
            useFallbackDomain: totalCount >= domainWarmupLimit,
            batches
        });
    }

    /**
     * @private
     */
    async #reconcileEmailCount(email, totalCount, domainWarmupLimit) {
        if (email.get('email_count') === totalCount) {
            return;
        }

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
     * @private
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }

        const domainLabel = useFallbackDomain ? '(fallback domain)' : '(custom domain)';
        const batch = await this.retryDb(
            () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {
                ...this.#getBeforeRetryConfig(email),
                description: `createBatch email ${email.id} segment ${segment} ${domainLabel}`
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
     * @returns {Promise<EmailBatch>}
     */
    async createBatch(email, segment, members, options) {
        if (!options?.transacting) {
            return this.#models.EmailBatch.transaction(transacting =>
                this.createBatch(email, segment, members, {transacting, ...options})
            );
        }

        logging.info(`Creating batch for email ${email.id} segment ${segment} with ${members.length} members`);

        const batch = await this.#models.EmailBatch.add({
            email_id: email.id,
            member_segment: segment,
            status: 'pending',
            fallback_sending_domain: Boolean(options.useFallbackDomain)
        }, options);

        const recipientData = this.#buildRecipientData(email, batch, members);

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);

        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);
        if (options.transacting) {
            insertQuery.transacting(options.transacting);
        }
        await insertQuery;

        return batch;
    }

    /**
     * @private
     */
    #buildRecipientData(email, batch, members) {
        return members.reduce((acc, memberRow) => {
            if (!memberRow.id || !memberRow.uuid || !memberRow.email) {
                logging.warn(`Member row not included as email recipient due to missing data - id: ${memberRow.id}, uuid: ${memberRow.uuid}, email: ${memberRow.email}`);
                return acc;
            }

            acc.push({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: memberRow.id,
                batch_id: batch.id,
                member_uuid: memberRow.uuid,
                member_email: memberRow.email,
                member_name: memberRow.name
            });

            return acc;
        }, []);
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

            const batchData = this.#buildBatchData({email, batch, post, newsletter, emailBodyCache, deadline, deliveryTimes});
            if (await this.sendBatch(batchData)) {
                succeededCount += 1;
            }
            await runNext();
        };

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(null).map(() => runNext()));

        this.#assertAllBatchesSent(succeededCount, batches.length);
    }

    /**
     * @private
     */
    #buildBatchData({email, batch, post, newsletter, emailBodyCache, deadline, deliveryTimes}) {
        const batchData = {email, batch, post, newsletter, emailBodyCache, deliveryTime: undefined};

        if (deadline && deadline.getTime() > Date.now()) {
            const deliveryTime = deliveryTimes.shift();
            if (deliveryTime && deliveryTime >= Date.now()) {
                batchData.deliveryTime = deliveryTime;
            }
        }

        return batchData;
    }

    /**
     * @private
     */
    #assertAllBatchesSent(succeededCount, totalBatches) {
        if (succeededCount >= totalBatches) {
            return;
        }

        const messageKey = succeededCount > 0 ? 'emailErrorPartialFailure' : 'emailError';
        throw new errors.EmailError({message: tpl(messages[messageKey])});
    }

    /**
     * @param {{email: Email, batch: EmailBatch, post: Post, newsletter: Newsletter, emailBodyCache: EmailBodyCache, deliveryTime:(Date|undefined)}} data
     * @returns {Promise<boolean>}
     */
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
            const members = await this.#fetchBatchMembers(batch, email, originalBatch);
            await this.#sendBatchToProvider({batch, originalBatch, email, post, newsletter, members, emailBodyCache, deliveryTime});
            succeeded = true;

            await this.#saveBatchStatus(batch, originalBatch, 'submitted', {});
        } catch (err) {
            this.#handleBatchError(err, batch, originalBatch);

            if (!succeeded) {
                await this.#saveBatchStatus(batch, originalBatch, 'failed', {
                    error_status_code: err.statusCode ?? null,
                    error_message: err.message,
                    error_data: err.errorDetails ?? null
                });
            }
        }

        await this.#markRecipientsProcessed(batch, originalBatch);

        return succeeded;
    }

    /**
     * @private
     */
    async #fetchBatchMembers(batch, email, originalBatch) {
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
            {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${originalBatch.id}`}
        );
    }

    /**
     * @private
     */
    async #sendBatchToProvider({batch, originalBatch, email, post, newsletter, members, emailBodyCache, deliveryTime}) {
        return this.retryDb(
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
            {
                ...this.#MAILGUN_API_RETRY_CONFIG,
                description: `Sending email batch ${originalBatch.id}${deliveryTime ? ` with delivery time ${deliveryTime}` : ''}`
            }
        );
    }

    /**
     * @private
     */
    async #saveBatchStatus(batch, originalBatch, status, extraFields) {
        const baseFields = status === 'submitted'
            ? {status, provider_id: undefined, error_status_code: null, error_message: null, error_data: null}
            : {status};

        await this.retryDb(
            () => batch.save({...baseFields, ...extraFields}, {patch: true, require: false, autoRefresh: false}),
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> ${status}`}
        );
    }

    /**
     * @private
     */
    #handleBatchError(err, batch, originalBatch) {
        const isBulkEmailError = err.code === 'BULK_EMAIL_SEND_FAILED';

        const errorToLog = isBulkEmailError ? err : new errors.EmailError({
            err,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email batch ${batch.id}`,
            context: err.message
        });

        logging.error(errorToLog);
        this.#captureSentryException(err);
    }

    /**
     * @private
     */
    async #markRecipientsProcessed(batch, originalBatch) {
        await this.retryDb(
            () => this.#models.EmailRecipient
                .where({batch_id: batch.id})
                .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false}),
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${originalBatch.id} processed_at`}
        );
    }

    /**
     * @private
     */
    #captureSentryException(err) {
        if (this.#sentry) {
            this.#sentry.captureException(err);
        }
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

        return models.map(model => this.#mapRecipientToMember(model));
    }

    /**
     * @private
     */
    #mapRecipientToMember(model) {
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
     * @returns {Promise<T>}
     */
    async retryDb(func, options) {
        const resolvedOptions = this.#resolveRetryOptions(options);
        const retryCount = resolvedOptions.retryCount ?? 0;

        this.#logRetryAttempt(resolvedOptions.description, retryCount);

        try {
            const response = await func();
            logging.info(`[BULK_EMAIL_DB_RETRY] ${resolvedOptions.description} - Finished (after ${retryCount + 1}${retryCount === 0 ? 'st try' : ' tries'})`);
            return response;
        } catch (e) {
            return this.#handleRetryError(e, func, resolvedOptions, retryCount);
        }
    }

    /**
     * @private
     */
    #resolveRetryOptions(options) {
        if (options.maxTime === undefined) {
            return options;
        }

        const stopAfterDate = new Date(Date.now() + options.maxTime);
        if (!options.stopAfterDate || stopAfterDate < options.stopAfterDate) {
            return {...options, stopAfterDate};
        }

        return options;
    }

    /**
     * @private
     */
    #logRetryAttempt(description, retryCount) {
        const attempt = retryCount > 0 ? `Retrying ${retryCount + 1}th try` : 'Started (1st try)';
        logging.info(`[BULK_EMAIL_DB_RETRY] ${description} - ${attempt}`);
    }

    /**
     * @private
     */
    async #handleRetryError(e, func, options, retryCount) {
        const sleep = options.sleep ?? 0;
        const hasExceededRetries = retryCount >= options.maxRetries;
        const hasExceededTime = options.stopAfterDate && new Date(Date.now() + sleep) > options.stopAfterDate;

        if (hasExceededRetries || hasExceededTime) {
            if (retryCount > 0) {
                const reason = hasExceededRetries ? 'max retries reached' : 'max time reached';
                logging.error(new errors.EmailError({
                    err: e,
                    code: 'BULK_EMAIL_DB_RETRY',
                    message: `[BULK_EMAIL_DB_RETRY] ${options.description} - Failed and stopped retrying: ${reason}`,
                    context: e.message
                }));
            }
            throw e;
        }

        logging.error(new errors.EmailError({
            err: e,
            code: 'BULK_EMAIL_DB_RETRY',
            message: `[BULK_EMAIL_DB_RETRY] ${options.description} - Failed (${retryCount + 1}${retryCount === 0 ? 'st' : 'th'} try)`,
            context: e.message
        }));

        if (sleep) {
            await new Promise(resolve => setTimeout(resolve, sleep));
        }

        return this.retryDb(func, {...options, retryCount: retryCount + 1, sleep: sleep * 2});
    }

    /**
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

        return Array.from({length: numBatches}, (_, i) =>
            new Date(now.getTime() + batchDelay * i)
        );
    }
}

module.exports = BatchSendingService;
```

Key refactoring changes made:

1. **Extracted helper methods** to reduce method length and improve readability:
   - `#resolveRetryConfig()` — consolidates the repetitive retry config initialization
   - `#lockEmailForSending()`, `#calculateRetryCutOffTime()`, `#handleEmailJobError()` — decompose `emailJob()`
   - `#getDomainWarmupLimit()`, `#createBatchesForSegment()`, `#fetchMembersBatch()`, `#distributeMembersIntoBatches()`, `#reconcileEmailCount()` — decompose `createBatches()`
   - `#buildRecipientData()` — extracted from `createBatch()`, using `reduce` instead of `forEach`
   - `#buildBatchData()`, `#assertAllBatchesSent()` — decompose `sendBatches()`
   - `#fetchBatchMembers()`, `#sendBatchToProvider()`, `#saveBatchStatus()`, `#handleBatchError()`, `#markRecipientsProcessed()` — decompose `sendBatch()`
   - `#resolveRetryOptions()`, `#logRetryAttempt()`, `#handleRetryError()` — decompose `retryDb()`
   - `#mapRecipientToMember()` — extracted from `getBatchMembers()`
   - `#captureSentryException()` — eliminates repeated null-check pattern

2. **Parallelized** `newsletter` and `post` fetching in `sendEmail()` using `Promise.all`

3. **Simplified conditionals** — replaced `if/else` chains with early returns and guard clauses

4. **Replaced `forEach` with `reduce`** in `#buildRecipientData()` for more functional style

5. **Used `Array.from`** in `calculateDeliveryTimes()` for cleaner array generation

6. **Extracted constant** `IS_NON_PRODUCTION` as a function and `NO_RETRY` as a constant to avoid repetition