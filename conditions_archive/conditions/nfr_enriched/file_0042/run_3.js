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

        this.#initializeRetryConfig('BEFORE', BEFORE_RETRY_CONFIG);
        this.#initializeRetryConfig('AFTER', AFTER_RETRY_CONFIG);
        this.#initializeRetryConfig('MAILGUN_API', MAILGUN_API_RETRY_CONFIG);
    }

    /**
     * Initializes retry configuration, using test/dev defaults if not provided
     * @private
     * @param {string} configType - Type of config: 'BEFORE', 'AFTER', or 'MAILGUN_API'
     * @param {object} [providedConfig] - Configuration provided by caller
     */
    #initializeRetryConfig(configType, providedConfig) {
        const isTestOrDev = process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development';
        const configKey = `#${configType}_RETRY_CONFIG`;

        if (providedConfig) {
            this[configKey] = providedConfig;
        } else if (isTestOrDev) {
            this[configKey] = {maxRetries: 0};
        }
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
     * @param {{emailId: string}} data Data passed from the job service. We only need the emailId because we need to refetch the email anyway to make sure the status is right and 'locked'.
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const startTime = Date.now();

        // Check if email is 'pending' only + change status to submitting in one transaction.
        // This allows us to have a lock around the email job that makes sure an email can only have one active job.
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
     * Calculates the retry cutoff time based on email count and batch size
     * @private
     * @param {number} startTime - Job start timestamp
     * @param {Email} email - Email model
     * @returns {Date} Cutoff time for retries
     */
    #calculateRetryCutOffTime(startTime, email) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(expectedBatchCount * minimumSecondsPerBatch * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        return new Date(startTime + stopAfter);
    }

    /**
     * Marks an email as submitted after successful sending
     * @private
     * @param {Email} email - Email model
     * @param {string} emailId - Email ID for logging
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
     * Handles errors that occur during email sending
     * @private
     * @param {Error} e - The error that occurred
     * @param {Email} email - Email model
     * @param {string} emailId - Email ID for logging
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

    /**
     * @private
     * @param {Email} email
     * @throws {errors.EmailError} If one of the batches fails
     */
    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        // Load required relations
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

    /**
     * @private
     * @param {Email} email
     * @returns {Promise<EmailBatch[]>}
     */
    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);

        // findAll returns a bookshelf collection, we want to return a plain array to align with the createBatches method
        const batches = await this.#models.EmailBatch.findAll({filter: 'email_id:\'' + email.id + '\''});
        return batches.models;
    }

    /**
     * @private
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     * @returns {Promise<EmailBatch[]>}
     */
    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#calculateDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            totalCount += await this.#processBatchesForSegment({
                email,
                segment,
                newsletter,
                batches,
                domainWarmupLimit,
                BATCH_SIZE,
                totalCount
            });
        }

        await this.#validateAndUpdateEmailCount(email, totalCount, domainWarmupLimit);
        return batches;
    }

    /**
     * Calculates the domain warmup limit based on service configuration
     * @private
     * @param {Email} email - Email model
     * @returns {number} Domain warmup limit (Infinity if disabled)
     */
    #calculateDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    /**
     * Processes all batches for a specific segment
     * @private
     * @param {object} params - Processing parameters
     * @returns {Promise<number>} Total count of members processed
     */
    async #processBatchesForSegment({email, segment, newsletter, batches, domainWarmupLimit, BATCH_SIZE, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let lastId = email.id;
        let segmentTotalCount = totalCount;

        while (lastId) {
            const members = await this.#fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE);

            if (members.length === 0) {
                break;
            }

            segmentTotalCount += await this.#processMemberBatch({
                email,
                segment,
                members,
                batches,
                domainWarmupLimit,
                BATCH_SIZE,
                currentTotal: segmentTotalCount
            });

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }

        return segmentTotalCount - totalCount;
    }

    /**
     * Fetches a batch of members for a segment
     * @private
     * @param {Email} email - Email model
     * @param {string} segment - Segment identifier
     * @param {string} segmentFilter - Filter string for segment
     * @param {string} lastId - Last member ID for pagination
     * @param {number} batchSize - Size of batch to fetch
     * @returns {Promise<object[]>} Array of member objects
     */
    async #fetchMembersForSegment(email, segment, segmentFilter, lastId, batchSize) {
        const filter = segmentFilter + `+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, filter: ${filter}`);

        return await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(batchSize + 1);
    }

    /**
     * Processes a batch of members and creates email batches
     * @private
     * @param {object} params - Processing parameters
     * @returns {Promise<number>} Number of members processed
     */
    async #processMemberBatch({email, segment, members, batches, domainWarmupLimit, BATCH_SIZE, currentTotal}) {
        const remainingCustomDomainCapacity = domainWarmupLimit - currentTotal;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);
        let processedCount = 0;

        if (remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess) {
            // Split batch: some via custom domain, rest via fallback
            processedCount += await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, remainingCustomDomainCapacity),
                useFallbackDomain: false,
                batches
            });
            processedCount += await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(remainingCustomDomainCapacity, membersToProcess),
                useFallbackDomain: true,
                batches
            });
        } else {
            // Single batch: all members use same domain
            processedCount += await this.#createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: currentTotal >= domainWarmupLimit,
                batches
            });
        }

        return processedCount;
    }

    /**
     * Validates email count and updates if necessary
     * @private
     * @param {Email} email - Email model
     * @param {number} totalCount - Total count of recipients
     * @param {number} domainWarmupLimit - Domain warmup limit
     */
    async #validateAndUpdateEmailCount(email, totalCount, domainWarmupLimit) {
        if (email.get('email_count') === totalCount) {
            return;
        }

        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }

        const newEmailUpdate = {email_count: totalCount};
        if (this.#domainWarmingService.isEnabled()) {
            newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
    }

    /**
     * Creates a batch with retry logic and adds it to the batches array
     * @param {object} params
     * @param {Email} params.email
     * @param {import('./email-renderer').Segment} params.segment
     * @param {object[]} params.members
     * @param {boolean} params.useFallbackDomain
     * @param {EmailBatch[]} params.batches
     * @returns {Promise<number>} The number of members added
     */
    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }

        const batch = await this.retryDb(
            async () => {
                return await this.createBatch(email, segment, members, {
                    useFallbackDomain
                });
            },
            {
                ...this.#getBeforeRetryConfig(email),
                description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`
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
     * @param {object[]} members - Array of member objects
     * @returns {object[]} Array of recipient data objects
     */
    #buildRecipientData(email, batch, members) {
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

        return recipientData;
    }

    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);
        const deadline = this.getDeliveryDeadline(email);

        if (deadline) {
            logging.info(`Delivery deadline for email ${email.id} is ${deadline}`);
        }

        const emailBodyCache = new EmailBodyCache();
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);

        const succeededCount = await this.#sendBatchesConcurrently({
            batches,
            email,
            post,
            newsletter,
            emailBodyCache,
            deliveryTimes,
            deadline
        });

        this.#validateBatchSendingResults(succeededCount, batches.length);
    }

    /**
     * Sends batches concurrently with controlled concurrency
     * @private
     * @param {object} params - Sending parameters
     * @returns {Promise<number>} Number of successfully sent batches
     */
    async #sendBatchesConcurrently({batches, email, post, newsletter, emailBodyCache, deliveryTimes, deadline}) {
        let succeededCount = 0;
        const queue = batches.slice();

        const runNext = async () => {
            const batch = queue.shift();
            if (batch) {
                const batchData = this.#prepareBatchData({
                    email,
                    batch,
                    post,
                    newsletter,
                    emailBodyCache,
                    deliveryTimes,
                    deadline
                });

                if (await this.sendBatch(batchData)) {
                    succeededCount += 1;
                }
                await runNext();
            }
        };

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => runNext()));
        return succeededCount;
    }

    /**
     * Prepares batch data for sending
     * @private
     * @param {object} params - Preparation parameters
     * @returns {object} Prepared batch data
     */
    #prepareBatchData({email, batch, post, newsletter, emailBodyCache, deliveryTimes, deadline}) {
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
     * Validates batch sending results and throws appropriate errors
     * @private
     * @param {number} succeededCount - Number of successful batches
     * @param {number} totalBatches - Total number of batches
     * @throws {errors.EmailError} If batches failed
     */
    #validateBatchSendingResults(succeededCount, totalBatches) {
        if (succeededCount < totalBatches) {
            if (succeededCount > 0) {
                throw new errors.EmailError({
                    message: tpl(messages.emailErrorPartialFailure)
                });
            }
            throw new errors.EmailError({
                message: tpl(messages.emailError)
            });
        }
    }

    /**
     *
     * @param {{email: Email, batch: EmailBatch, post: Post, newsletter: Newsletter, emailBodyCache: EmailBodyCache, deliveryTime:(Date|undefined) }} data
     * @returns {Promise<boolean>} True when succeeded, false when failed with an error
     */
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
            const members = await this.#fetchBatchMembers(email, originalBatch, batch);
            const response = await this.#sendBatchToProvider(email, originalBatch, batch, {post, newsletter, members, emailBodyCache, deliveryTime});
            succeeded = true;

            await this.#markBatchAsSubmitted(originalBatch, batch, response);
        } catch (err) {
            await this.#handleBatchSendingError(err, originalBatch, batch, succeeded);
        }

        await this.#markBatchRecipientsAsProcessed(originalBatch, batch);
        return succeeded;
    }

    /**
     * Fetches members for a batch with retry logic
     * @private
     * @param {Email} email - Email model
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @returns {Promise<MemberLike[]>} Array of member objects
     */
    async #fetchBatchMembers(email, originalBatch, batch) {
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
     * Sends batch to email provider with retry logic
     * @private
     * @param {Email} email - Email model
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @param {object} batchParams - Batch parameters
     * @returns {Promise<object>} Provider response
     */
    async #sendBatchToProvider(email, originalBatch, batch, {post, newsletter, members, emailBodyCache, deliveryTime}) {
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
     * Marks batch as submitted after successful sending
     * @private
     * @param {EmailBatch} originalBatch - Original batch reference
     * @param {EmailBatch} batch - Batch model
     * @param {object} response - Provider response
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
     * Handles errors during batch sending
     * @private
     * @param {Error} err - Error that occurred
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

    /**
     * We don't want to pass EmailRecipient models to the sendingService.
     * So we transform them into the MemberLike interface.
     * That keeps the sending service nicely separated so it isn't dependent on the batch sending data structure.
     * @returns {Promise<MemberLike[]>}
     */
    async getBatchMembers(batchId) {
        let models = await this.#models.EmailRecipient.findAll({filter: `batch_id:'${batchId}'`, withRelated: ['member', 'member.stripeSubscriptions', 'member.products']});

        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        if (models.length > BATCH_SIZE) {
            throw new errors.EmailError({
                message: `Email batch ${batchId} has ${models.length} members, which exceeds the maximum of ${BATCH_SIZE} members per batch.`
            });
        }

        return models.map((model) => {
            // Map subscriptions
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
     * Update the status of an email or emailBatch to a given status, but first check if their current status is 'pending' or 'failed'.
     * @param {object} Model Bookshelf model constructor
     * @param {string} id id of the model
     * @param {string} status set the status of the model to this value
     * @param {string[]} allowedStatuses Check if the models current status is one of these values
     * @returns {Promise<object|undefined>} The updated model. Undefined if the model didn't pass the status check.
     */
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

    /**
     * @private
     * Retry a function until it doesn't throw an error or the max retries / max time are reached.
     * @template T
     * @param {() => Promise<T>} func
     * @param {object} options
     * @param {string} options.description Used for logging
     * @param {number} options.sleep time between each retry (ms), will get multiplied by the number of retries
     * @param {number} options.maxRetries note: retries, not tries. So 0 means maximum 1 try, 1 means maximum 2 tries, etc.
     * @param {number} [options.retryCount] (internal) Amount of retries already done. 0 intially.
     * @param {number} [options.maxTime] (ms)
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

    /**
     * Returns the sending deadline for an email
     * Based on the email.created_at timestamp and the configured target delivery window
     * @param {*} email
     * @returns Date | undefined
     */
    getDeliveryDeadline(email) {
        // Return undefined if targetDeliveryWindow is 0 (or less)
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

    /**
     * Adds deliverytimes to the passed in batches, based on the delivery deadline
     * @param {Email} email - the email model to be sent
     * @param {number} numBatches - the number of batches to be sent
     */
    calculateDeliveryTimes(email, numBatches) {
        const deadline = this.getDeliveryDeadline(email);
        const now = new Date();
        // If there is no deadline (target delivery window is not set) or the deadline is in the past, delivery immediately
        if (!deadline || now >= deadline) {
            return new Array(numBatches).fill(undefined);
        } else {
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
}

module.exports = BatchSendingService;
```