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

        this.#BEFORE_RETRY_CONFIG = BEFORE_RETRY_CONFIG ?? (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development' ? {maxRetries: 0} : this.#BEFORE_RETRY_CONFIG);
        this.#AFTER_RETRY_CONFIG = AFTER_RETRY_CONFIG ?? (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development' ? {maxRetries: 0} : this.#AFTER_RETRY_CONFIG);
        this.#MAILGUN_API_RETRY_CONFIG = MAILGUN_API_RETRY_CONFIG ?? (process.env.NODE_ENV.startsWith('test') || process.env.NODE_ENV === 'development' ? {maxRetries: 0} : this.#MAILGUN_API_RETRY_CONFIG);
    }

    #getBeforeRetryConfig(email) {
        return email._retryCutOffTime ? {...this.#BEFORE_RETRY_CONFIG, stopAfterDate: email._retryCutOffTime} : this.#BEFORE_RETRY_CONFIG;
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
        let email = await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }
        email._retryCutOffTime = new Date(startTime + Math.max(Math.ceil(email.get('email_count') / 1000) * 26 * 1000, this.#BEFORE_RETRY_CONFIG.maxTime));
        try {
            await this.sendEmail(email);
            await this.updateStatusLock(this.#models.Email, emailId, 'submitted', ['submitting']);
        } catch (e) {
            const ghostError = new errors.EmailError({
                err: e,
                code: 'BULK_EMAIL_SEND_FAILED',
                message: `Error sending email ${email.id}`
            });
            logging.error(ghostError);
            if (this.#sentry) {
                this.#sentry.captureException(e);
            }
            await this.updateStatusLock(this.#models.Email, emailId, 'failed', ['submitting']);
        }
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);
        const newsletter = await this.getLazyRelation('newsletter', email);
        const post = await this.getLazyRelation('post', email);
        const batches = await this.getBatches(email);
        if (batches.length === 0) {
            batches = await this.createBatches({email, newsletter, post});
        }
        await this.sendBatches({email, batches, post, newsletter});
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        return this.#models.EmailBatch.findAll({filter: 'email_id:\'' + email.id + '\''}).models;
    }

    async createBatches({email, post, newsletter}) {
        logging.info(`Creating batches for email ${email.id}`);
        let domainWarmupLimit = Infinity;
        if (this.#domainWarmingService.isEnabled()) {
            domainWarmupLimit = email.get('csd_email_count') ?? Infinity;
        }
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        let totalCount = 0;

        for (const segment of segments) {
            logging.info(`Creating batches for email ${email.id} segment ${segment}`);
            const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
            let lastId = email.id;
            while (true) {
                logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId}`);
                const members = await this.#models.Member.getFilteredCollectionQuery({filter: segmentFilter + `+id:<'${lastId}'`})
                    .orderByRaw('id DESC')
                    .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(BATCH_SIZE + 1);
                if (members.length > 0) {
                    const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
                    const membersToProcess = Math.min(members.length, BATCH_SIZE);
                    const shouldSplitBatch = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;
                    if (shouldSplitBatch) {
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
                }
                if (members.length > BATCH_SIZE) {
                    lastId = members[members.length - 2].id;
                } else {
                    break;
                }
            }
        }

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
                newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
            }
            await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
        }
        return batches;
    }

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return 0;
        }
        const batch = await this.updateStatusLock(this.#models.EmailBatch, members[0].id, 'submitting', ['pending', 'failed']);
        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${members[0].id}`);
            return 0;
        }
        const batchData = await this.createBatch(email, segment, members, {useFallbackDomain});
        batches.push(batchData);
        return members.length;
    }

    async createBatch(email, segment, members, options) {
        logging.info(`Creating batch for email ${email.id} segment ${segment} with ${members.length} members`);
        const batch = await this.#models.EmailBatch.add({
            email_id: email.id,
            member_segment: segment,
            status: 'pending',
            fallback_sending_domain: Boolean(options.useFallbackDomain)
        }, options);

        const recipientData = members.map(memberRow => ({
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
        let succeededCount = 0;
        const queue = batches.slice();

        let runNext;
        runNext = async () => {
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

    async sendBatch({email, batch: originalBatch, post, newsletter, emailBodyCache, deliveryTime}) {
        logging.info(`Sending batch ${originalBatch.id} for email ${email.id}`);
        const batch = await this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitting', ['pending', 'failed']);
        if (!batch) {
            logging.error(`Tried sending email batch that is not pending or failed ${originalBatch.id}`);
            return true;
        }
        let members = await this.getBatchMembers(batch.id);
        if (members.length === 0) {
            throw new errors.EmailError({
                message: `No members found for batch ${batch.id}, possible replication lag`
            });
        }
        let succeeded = false;
        try {
            const response = await this.#sendingService.send({
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
            succeeded = true;
            await this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'submitted', ['submitting']);
        } catch (err) {
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
                await this.updateStatusLock(this.#models.EmailBatch, originalBatch.id, 'failed', ['submitting']);
            }
        }

        await this.#models.EmailRecipient
            .where({batch_id: batch.id})
            .save({processed_at: new Date()}, {patch: true, require: false, autoRefresh: false});

        return succeeded;
    }

    async getBatchMembers(batchId) {
        let models = await this.#models.EmailRecipient.findAll({filter: `batch_id:'${batchId}'`, withRelated: ['member', 'member.stripeSubscriptions', 'member.products']});
        const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
        if (models.length > BATCH_SIZE) {
            throw new errors.EmailError({
                message: `Email batch ${batchId} has ${models.length} members, which exceeds the maximum of ${BATCH_SIZE} members per batch.`
            });
        }
        return models.map(model => ({
            id: model.get('member_id'),
            uuid: model.get('member_uuid'),
            email: model.get('member_email'),
            name: model.get('member_name'),
            createdAt: model.related('member')?.get('created_at') ?? null,
            status: model.related('member')?.get('status') ?? 'free',
            subscriptions: model.related('member').related('stripeSubscriptions').toJSON(),
            tiers: model.related('member').related('products').toJSON()
        }));
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
                await new Promise(resolve => setTimeout(resolve, sleep));
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

    async getLazyRelation(relation, email) {
        return await this.#models.Email.getLazyRelation(relation, {require: true, withRelated: ['posts_meta', 'authors']});
    }
}

module.exports = BatchSendingService;
```