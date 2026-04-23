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

        this.#initializeRetryConfig('BEFORE', BEFORE_RETRY_CONFIG);
        this.#initializeRetryConfig('AFTER', AFTER_RETRY_CONFIG);
        this.#initializeRetryConfig('MAILGUN_API', MAILGUN_API_RETRY_CONFIG);
    }

    /**
     * Initializes retry configuration based on environment
     * @private
     * @param {string} configType - Type of config to initialize
     * @param {object} providedConfig - Provided configuration
     */
    #initializeRetryConfig(configType, providedConfig) {
        if (providedConfig) {
            this[`#${configType}_RETRY_CONFIG`] = providedConfig;
            return;
        }

        if (this.#isTestOrDevEnvironment()) {
            this[`#${configType}_RETRY_CONFIG`] = {maxRetries: 0};
        }
    }

    /**
     * Checks if environment is test or development
     * @private
     * @returns {boolean}
     */
    #isTestOrDevEnvironment() {
        return process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development';
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

        let email = await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );

        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        const retryCutOffTime = this.#calculateRetryCutOffTime(startTime, email);
        email._retryCutOffTime = retryCutOffTime;

        try {
            await this.sendEmail(email);
            await this.#markEmailAsSubmitted(email, emailId);
        } catch (e) {
            await this.#handleEmailSendingError(e, email, emailId);
        }
    }

    /**
     * Calculates the retry cutoff time based on email count
     * @private
     * @param {number} startTime - Job start timestamp
     * @param {Email} email - Email model
     * @returns {Date}
     */
    #calculateRetryCutOffTime(startTime, email) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(expectedBatchCount * minimumSecondsPerBatch * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        return new Date(startTime + stopAfter);
    }

    /**
     * Marks email as submitted in database
     * @private
     * @param {Email} email - Email model
     * @param {string} emailId - Email ID
     */
    async #markEmailAsSubmitted(email, emailId) {
        await this.retryDb(async () => {
            await email.save({
                status: 'submitted',
                submitted_at: new Date(),
                error: null
            }, {patch: true, autoRefresh: false});
        }, {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> submitted`});
    }

    /**
     * Handles email sending errors
     * @private
     * @param {Error} e - Error thrown during sending
     * @param {Email} email - Email model
     * @param {string} emailId - Email ID
     */
    async #handleEmailSendingError(e, email, emailId) {
        const ghostError = new errors.EmailError({
            err: e,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });

        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(e);
        }

        await this.retryDb(async () => {
            await email.save({
                status: 'failed',
                error: e.message || 'Something went wrong while sending the email'
            }, {patch: true, autoRefresh: false});
        }, {...this.#AFTER_RETRY_CONFIG, description: `email ${emailId} -> failed`});
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.retryDb(async () => {
            return await email.getLazyRelation('newsletter', {require: true});
        }, {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`});

        const post = await this.retryDb(async () => {
            return await email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']});
        }, {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`});

        let batches = await this.retryDb(async () => {
            return await this.getBatches(email);
        }, {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`});

        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }
        await this.sendBatches({email, batches, post, newsletter});
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: 'email_id:\'' + email.id + '\''});
        return batches.models;
    }

    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#calculateDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            totalCount += await this.#processBatchSegment({
                email,
                segment,
                newsletter,
                batches,
                BATCH_SIZE,
                domainWarmupLimit,
                totalCount
            });
        }

        await this.#updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit);
        return batches;
    }

    /**
     * Calculates domain warmup limit based on service configuration
     * @private
     * @param {Email} email - Email model
     * @returns {number}
     */
    #calculateDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    /**
     * Processes a single batch segment
     * @private
     * @param {object} params - Processing parameters
     * @returns {Promise<number>} Total count of members processed
     */
    async #processBatchSegment({email, segment, newsletter, batches, BATCH_SIZE, domainWarmupLimit, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let lastId = email.id;
        let segmentTotalCount = 0;

        while (lastId) {
            const {members, newLastId} = await this.#fetchMembersBatch(email, segment, segmentFilter, lastId, BATCH_SIZE);

            if (members.length === 0) {
                break;
            }

            segmentTotalCount += await this.#processMembersBatch({
                email,
                segment,
                members,
                batches,
                BATCH_SIZE,
                domainWarmupLimit,
                totalCount: totalCount + segmentTotalCount
            });

            lastId = newLastId;
        }

        return segmentTotalCount;
    }

    /**
     * Fetches a batch of members for a segment
     * @private
     * @param {Email} email - Email model
     * @param {string} segment - Segment identifier
     * @param {string} segmentFilter - Filter string
     * @param {string} lastId - Last member ID for pagination
     * @param {number} BATCH_SIZE - Batch size limit
     * @returns {Promise<{members: object[], newLastId: string|null}>}
     */
    async #fetchMembersBatch(email, segment, segmentFilter, lastId, BATCH_SIZE) {
        const filter = segmentFilter + `+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

        const members = await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);

        let newLastId = null;
        if (members.length > BATCH_SIZE) {
            newLastId = members[members.length - 2].id;
        }

        return {members, newLastId};
    }

    /**
     * Processes a batch of members for sending
     * @private
     * @param {object} params - Processing parameters
     * @returns {Promise<number>} Count of members processed
     */
    async #processMembersBatch({email, segment, members, batches, BATCH_SIZE, domainWarmupLimit, totalCount}) {
        const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);

        if (this.#shouldSplitBatch(remainingCustomDomainCapacity, membersToProcess)) {
            return await this.#processSplitBatch({
                email,
                segment,
                members,
                batches,
                remainingCustomDomainCapacity,
                membersToProcess
            });
        }

        return await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, membersToProcess),
            useFallbackDomain: totalCount >= domainWarmupLimit,
            batches
        });
    }

    /**
     * Checks if batch should be split between custom and fallback domains
     * @private
     * @param {number} remainingCapacity - Remaining custom domain capacity
     * @param {number} membersToProcess - Number of members to process
     * @returns {boolean}
     */
    #shouldSplitBatch(remainingCapacity, membersToProcess) {
        return remainingCapacity > 0 && remainingCapacity < membersToProcess;
    }

    /**
     * Processes a batch split between custom and fallback domains
     * @private
     * @param {object} params - Processing parameters
     * @returns {Promise<number>} Total count of members processed
     */
    async #processSplitBatch({email, segment, members, batches, remainingCustomDomainCapacity, membersToProcess}) {
        let count = 0;

        count += await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(0, remainingCustomDomainCapacity),
            useFallbackDomain: false,
            batches
        });

        count += await this.#createBatchWithRetry({
            email,
            segment,
            members: members.slice(remainingCustomDomainCapacity, membersToProcess),
            useFallbackDomain: true,
            batches
        });

        return count;
    }

    /**
     * Updates email count if it differs from actual sent count
     * @private
     * @param {Email} email - Email model
     * @param {number} totalCount - Actual total count
     * @param {number} domainWarmupLimit - Domain warmup limit
     */
    async #updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit) {
        const storedCount = email.get('email_count');

        if (storedCount === totalCount) {
            return;
        }

        logging.error(`Email ${email.id} has wrong stored email_count ${storedCount}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - storedCount) / storedCount);
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${storedCount}, did expect ${totalCount}.`);
        }

        const newEmailUpdate = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }

        const batch = await this.retryDb(
            async () => {
                return await this.createBatch(email, segment, members, {useFallbackDomain});
            },
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

        const recipientData = this.#buildRecipientData(email, batch, members);

        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);

        if (options.transacting) {
            insertQuery.transacting(options.transacting);
        }

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
    }

    /**
     * Builds recipient data for batch insertion
     * @private
     * @param {Email} email - Email model
     * @param {EmailBatch} batch - Batch model
     * @param {object[]} members - Member records
     * @returns {object[]}
     */
    #buildRecipientData(email, batch, members) {
        const recipientData = [];

        members.forEach((memberRow) => {
            if (!this.#isValidMemberRow(memberRow)) {
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

        return recipientData;
    }

    /**
     * Validates member row has required fields
     * @private
     * @param {object} memberRow - Member row to validate
     * @returns {boolean}
     */
    #isValidMemberRow(memberRow) {
        return memberRow.id && memberRow.uuid && memberRow.email;
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

        let runNext;
        runNext = async () => {
            const batch = queue.shift();
            if (!batch) {
                return;
            }

            const batchData = this.#prepareBatchData({
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

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => runNext()));

        this.#validateSendingResults(succeededCount, batches.length);
    }

    /**
     * Prepares batch data for sending
     * @private
     * @param {object} params - Batch parameters
     * @returns {object}
     */
    #prepareBatchData({email, batch, post, newsletter, emailBodyCache, deadline, deliveryTimes}) {
        const batchData = {email, batch, post, newsletter, emailBodyCache, deliveryTime: undefined};

        if (!deadline || deadline.getTime() <= Date.now()) {
            return batchData;
        }

        const deliveryTime = deliveryTimes.shift();
        if (deliveryTime && deliveryTime >= Date.now()) {
            batchData.deliveryTime = deliveryTime;
        }

        return batchData;
    }

    /**
     * Validates sending results and throws appropriate error
     * @private
     * @param {number} succeededCount - Number of successful batches
     * @param {number} totalBatches - Total number of batches
     * @throws {errors.EmailError}
     */
    #validateSendingResults(succeededCount, totalBatches) {
        if (succeededCount === totalBatches) {
            return;
        }

        if (succeededCount > 0) {
            throw new errors.EmailError({
                message: tpl(messages.emailErrorPartialFailure)
            });
        }

        throw new errors.EmailError({
            message: tpl(messages.emailError)
        });
    }

    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']);
            },
            {...this.#getBeforeRetryConfig(email), description: `updateStatusLock batch ${originalBatch.id} -> submitting`}
        );

        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${originalBatch.id}`);
            return true;
        }

        let succeeded = false;

        try {
            const members = await this.#fetchBatchMembersWithRetry(email, originalBatch, batch);
            const response = await this.#sendBatchViaService(email, originalBatch, batch, post, newsletter, members, emailBodyCache, deliveryTime);
            succeeded = true;
            await this.#markBatchAsSubmitted(originalBatch, batch, response);
        } catch (err) {
            await this.#handleBatchSendingError(err, originalBatch, batch, succeeded);
        }

        await this.#markBatchRecipientsAsProcessed(originalBatch, batch);
        return succeeded;
    }

    /**
     * Fetches batch members with retry logic
     * @private
     * @param {Email} email - Email model
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @returns {Promise<object[]>}
     */
    async #fetchBatchMembersWithRetry(email, originalBatch, batch) {
        return await this.retryDb(
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
    }

    /**
     * Sends batch via sending service
     * @private
     * @param {Email} email - Email model
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @param {Post} post - Post model
     * @param {Newsletter} newsletter - Newsletter model
     * @param {object[]} members - Members to send to
     * @param {EmailBodyCache} emailBodyCache - Body cache
     * @param {Date|undefined} deliveryTime - Delivery time
     * @returns {Promise<object>}
     */
    async #sendBatchViaService(email, originalBatch, batch, post, newsletter, members, emailBodyCache, deliveryTime) {
        return await this.retryDb(async () => {
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
        }, {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${originalBatch.id} ${deliveryTime ? `with delivery time ${deliveryTime}` : ''}`});
    }

    /**
     * Marks batch as submitted
     * @private
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @param {object} response - Service response
     */
    async #markBatchAsSubmitted(originalBatch, batch, response) {
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
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> submitted`}
        );
    }

    /**
     * Handles batch sending errors
     * @private
     * @param {Error} err - Error thrown
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @param {boolean} succeeded - Whether sending succeeded
     */
    async #handleBatchSendingError(err, originalBatch, batch, succeeded) {
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

        if (!succeeded) {
            await this.retryDb(
                async () => {
                    await batch.save({
                        status: 'failed',
                        error_status_code: err.statusCode ?? null,
                        error_message: err.message,
                        error_data: err.errorDetails ?? null
                    }, {patch: true, require: false, autoRefresh: false});
                },
                {...this.#AFTER_RETRY_CONFIG, description: `save batch ${originalBatch.id} -> failed`}
            );
        }
    }

    /**
     * Marks batch recipients as processed
     * @private
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     */
    async #markBatchRecipientsAsProcessed(originalBatch, batch) {
        await this.retryDb(
            async () => {
                await this.#models.EmailRecipient
                    .where({batch_id: batch.id})
                    .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${originalBatch.id} processed_at`}
        );
    }

    async getBatchMembers(batchId) {
        let models = await this.#models.EmailRecipient.findAll({filter: `batch_id:'${batchId}'`, withRelated: ['member', 'member.stripeSubscriptions', 'member.products']});

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
            await model.save({
                status
            }, {patch: true, transacting, autoRefresh: false});
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
        const retryCount = (options.retryCount ?? 0);

        try {
            if (retryCount > 0) {
                logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Retrying ${retryCount + 1}th try`);
            } else {
                logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Started (1st try)`);
            }

            const response = await func();

            logging.info(`[BULK_EMAIL_DB_RETRY] ${options.description} - Finished (after ${retryCount + 1}${retryCount === 0 ? 'st try' : ' tries'})`);

            return response;
        } catch (e) {
            const sleep = (options.sleep ?? 0);
            if (retryCount >= options.maxRetries || (options.stopAfterDate && (new Date(Date.now() + sleep)) > options.stopAfterDate)) {
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
                await new Promise((resolve) => {
                    setTimeout(resolve, sleep);
                });
            }
            return await this.retryDb(func, {...options, retryCount: retryCount + 1, sleep: sleep * 2});
        }
    }

    getDeliveryDeadline(email) {
        const targetDeliveryWindow = this.#sendingService.getTargetDeliveryWindow();
        if (targetDeliveryWindow === undefined || targetDeliveryWindow <= 0) {
            return undefined;
        }
        try {
            const startTime = email.get('created_at');
            const deadline = new Date(startTime.getTime() + targetDeliveryWindow);
            return deadline;
        } catch (err) {
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
            const delay = batchDelay * i;
            const deliveryTime = new Date(now.getTime() + delay);
            deliveryTimes.push(deliveryTime);
        }

        return deliveryTimes;
    }
}

module.exports = BatchSendingService;