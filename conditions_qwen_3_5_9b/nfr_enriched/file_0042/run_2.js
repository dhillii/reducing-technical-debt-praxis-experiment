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

        this.#BEFORE_RETRY_CONFIG = this.#getRetryConfig(BEFORE_RETRY_CONFIG);
        this.#AFTER_RETRY_CONFIG = this.#getRetryConfig(AFTER_RETRY_CONFIG);
        this.#MAILGUN_API_RETRY_CONFIG = this.#getRetryConfig(MAILGUN_API_RETRY_CONFIG);
    }

    /**
     * @param {object} [config]
     * @returns {object}
     */
    #getRetryConfig(config) {
        if (config) {
            return config;
        }
        if (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development') {
            return {maxRetries: 0};
        }
        return {};
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
     * @param {{emailId: string}} data Data passed from the job service.
     */
    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);
        const startTime = Date.now();

        const email = await this.#fetchEmailWithLock(emailId, startTime);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        email._retryCutOffTime = this.#calculateRetryCutOffTime(email, startTime);

        try {
            await this.#sendEmail(email);
            await this.#markEmailSubmitted(email);
        } catch (e) {
            await this.#handleEmailError(email, e);
        }
    }

    /**
     * @private
     * @param {string} emailId
     * @param {number} startTime
     * @returns {Promise<Email|null>}
     */
    async #fetchEmailWithLock(emailId, startTime) {
        return await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    /**
     * @private
     * @param {Email} email
     * @param {number} startTime
     * @returns {Date}
     */
    #calculateRetryCutOffTime(email, startTime) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(expectedBatchCount * minimumSecondsPerBatch * 1000, this.#BEFORE_RETRY_CONFIG.maxTime);
        return new Date(startTime + stopAfter);
    }

    /**
     * @private
     * @param {Email} email
     * @returns {Promise<void>}
     */
    async #sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.#fetchLazyRelation(email, 'newsletter', {require: true});
        const post = await this.#fetchLazyRelation(email, 'post', {require: true, withRelated: ['posts_meta', 'authors']});
        const batches = await this.#getBatches(email);

        if (batches.length === 0) {
            batches = await this.#createBatches({email, newsletter, post});
        }
        await this.#sendBatches({email, batches, post, newsletter});
    }

    /**
     * @private
     * @param {Email} email
     * @param {string} relationName
     * @param {object} options
     * @returns {Promise<object>}
     */
    async #fetchLazyRelation(email, relationName, options) {
        return await this.retryDb(
            async () => {
                return await email.getLazyRelation(relationName, options);
            },
            {...this.#getBeforeRetryConfig(email), description: `getLazyRelation ${relationName} for email ${email.id}`}
        );
    }

    /**
     * @private
     * @param {Email} email
     * @returns {Promise<EmailBatch[]>}
     */
    async #getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: 'email_id:\'' + email.id + '\''});
        return batches.models;
    }

    /**
     * @private
     * @param {Email} email
     * @returns {Promise<void>}
     */
    async #markEmailSubmitted(email) {
        await this.retryDb(async () => {
            await email.save({
                status: 'submitted',
                submitted_at: new Date(),
                error: null
            }, {patch: true, autoRefresh: false});
        }, {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> submitted`});
    }

    /**
     * @private
     * @param {Email} email
     * @param {Error} error
     * @returns {Promise<void>}
     */
    async #handleEmailError(email, error) {
        const ghostError = new errors.EmailError({
            err: error,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });

        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(error);
        }

        await this.retryDb(async () => {
            await email.save({
                status: 'failed',
                error: error.message || 'Something went wrong while sending the email'
            }, {patch: true, autoRefresh: false});
        }, {...this.#AFTER_RETRY_CONFIG, description: `email ${email.id} -> failed`});
    }

    /**
     * @private
     * @param {{email: Email, newsletter: Newsletter, post: Post}} data
     * @returns {Promise<EmailBatch[]>}
     */
    async #createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);

        const domainWarmupLimit = this.#getDomainWarmupLimit(email);
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            await this.#createBatchesForSegment({email, segment, newsletter, domainWarmupLimit, BATCH_SIZE, batches, totalCount});
        }

        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

        await this.#updateEmailCountIfChanged(email, totalCount, domainWarmupLimit);
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
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    /**
     * @private
     * @param {object} params
     * @param {Email} params.email
     * @param {import('./email-renderer').Segment} params.segment
     * @param {Newsletter} params.newsletter
     * @param {number} params.domainWarmupLimit
     * @param {number} params.BATCH_SIZE
     * @param {EmailBatch[]} params.batches
     * @param {number} params.totalCount
     * @returns {Promise<void>}
     */
    async #createBatchesForSegment({email, segment, newsletter, domainWarmupLimit, BATCH_SIZE, batches, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let members;
        let lastId = email.id;

        while (!members || lastId) {
            const filter = segmentFilter + `+id:<'${lastId}'`;
            logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

            members = await this.#models.Member.getFilteredCollectionQuery({filter})
                .orderByRaw('id DESC')
                .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(BATCH_SIZE + 1);

            if (members.length > 0) {
                const membersToProcess = Math.min(members.length, BATCH_SIZE);
                const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
                const shouldSplitBatch = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;

                if (shouldSplitBatch) {
                    await this.#createBatchWithRetry({email, segment, members: members.slice(0, remainingCustomDomainCapacity), useFallbackDomain: false, batches});
                    await this.#createBatchWithRetry({email, segment, members: members.slice(remainingCustomDomainCapacity, membersToProcess), useFallbackDomain: true, batches});
                } else {
                    await this.#createBatchWithRetry({email, segment, members: members.slice(0, membersToProcess), useFallbackDomain: totalCount >= domainWarmupLimit, batches});
                }
                totalCount += membersToProcess;
            }

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }
    }

    /**
     * @private
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

    /**
     * @private
     * @param {Email} email
     * @param {number} totalCount
     * @param {number} domainWarmupLimit
     * @returns {Promise<void>}
     */
    async #updateEmailCountIfChanged(email, totalCount, domainWarmupLimit) {
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
                newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
            }

            await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
        }
    }

    /**
     * @private
     * @param {object} params
     * @param {Email} params.email
     * @param {EmailBatch[]} params.batches
     * @param {Post} params.post
     * @param {Newsletter} params.newsletter
     * @returns {Promise<void>}
     */
    async #sendBatches({email, batches, post, newsletter}) {
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
            if (batch) {
                const batchData = {email, batch, post, newsletter, emailBodyCache, deliveryTime: undefined};

                if (deadline && deadline.getTime() > Date.now()) {
                    const deliveryTime = deliveryTimes.shift();
                    if (deliveryTime && deliveryTime >= Date.now()) {
                        batchData.deliveryTime = deliveryTime;
                    }
                }

                if (await this.sendBatch(batchData)) {
                    succeededCount += 1;
                }
                await runNext();
            }
        };

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(() => runNext()));

        if (succeededCount < batches.length) {
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
     * @private
     * @param {object} params
     * @param {Email} params.email
     * @param {EmailBatch} params.batch
     * @param {Post} params.post
     * @param {Newsletter} params.newsletter
     * @param {EmailBodyCache} params.emailBodyCache
     * @param {Date|undefined} params.deliveryTime
     * @returns {Promise<boolean>}
     */
    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);

        const batch = await this.#fetchBatchWithLock(originalBatch.id, email);
        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${originalBatch.id}`);
            return true;
        }

        const members = await this.#fetchBatchMembers(batch.id, email);

        let succeeded = false;

        try {
            const response = await this.#sendEmailBatch(batch, email, post, newsletter, members, deliveryTime);
            succeeded = true;

            await this.#markBatchSubmitted(batch, response.id);
        } catch (err) {
            await this.#handleBatchError(batch, err);
        }

        await this.#markRecipientsProcessed(batch.id);
        return succeeded;
    }

    /**
     * @private
     * @param {string} batchId
     * @param {Email} email
     * @returns {Promise<EmailBatch|null>}
     */
    async #fetchBatchWithLock(batchId, email) {
        return await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.EmailBatch, batchId, 'submitting', ['pending', 'failed']);
            },
            {...this.#getBeforeRetryConfig(email), description: `updateStatusLock batch ${batchId} -> submitting`}
        );
    }

    /**
     * @private
     * @param {string} batchId
     * @param {Email} email
     * @returns {Promise<MemberLike[]>}
     */
    async #fetchBatchMembers(batchId, email) {
        return await this.retryDb(
            async () => {
                const m = await this.getBatchMembers(batchId);
                if (m.length === 0) {
                    throw new errors.EmailError({
                        message: `No members found for batch ${batchId}, possible replication lag`
                    });
                }
                return m;
            },
            {...this.#getBeforeRetryConfig(email), description: `getBatchMembers batch ${batchId}`}
        );
    }

    /**
     * @private
     * @param {EmailBatch} batch
     * @param {Email} email
     * @param {Post} post
     * @param {Newsletter} newsletter
     * @param {MemberLike[]} members
     * @param {Date|undefined} deliveryTime
     * @returns {Promise<object>}
     */
    async #sendEmailBatch(batch, email, post, newsletter, members, deliveryTime) {
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
        }, {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${batch.id} ${deliveryTime ? `with delivery time ${deliveryTime}` : ''}`});
    }

    /**
     * @private
     * @param {EmailBatch} batch
     * @param {string} providerId
     * @returns {Promise<void>}
     */
    async #markBatchSubmitted(batch, providerId) {
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
     * @private
     * @param {EmailBatch} batch
     * @param {Error} error
     * @returns {Promise<void>}
     */
    async #handleBatchError(batch, error) {
        if (error.code && error.code === 'BULK_EMAIL_SEND_FAILED') {
            logging.error(error);
            if (this.#sentry) {
                this.#sentry.captureException(error);
            }
        } else {
            const ghostError = new errors.EmailError({
                err: error,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email batch ${batch.id}`,
                context: error.message
            });

            logging.error(ghostError);
            if (this.#sentry) {
                this.#sentry.captureException(error);
            }
        }

        await this.retryDb(
            async () => {
                await batch.save({
                    status: 'failed',
                    error_status_code: error.statusCode ?? null,
                    error_message: error.message,
                    error_data: error.errorDetails ?? null
                }, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save batch ${batch.id} -> failed`}
        );
    }

    /**
     * @private
     * @param {string} batchId
     * @returns {Promise<void>}
     */
    async #markRecipientsProcessed(batchId) {
        await this.retryDb(
            async () => {
                await this.#models.EmailRecipient
                    .where({batch_id: batchId})
                    .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `save EmailRecipients ${batchId} processed_at`}
        );
    }

    /**
     * @private
     * @param {string} batchId
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
```