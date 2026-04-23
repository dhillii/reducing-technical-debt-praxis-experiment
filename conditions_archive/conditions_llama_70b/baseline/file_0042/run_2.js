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

    async scheduleEmail(email) {
        return this.#jobsService.addJob({
            name: 'batch-sending-service-job',
            job: this.emailJob.bind(this),
            data: {emailId: email.id},
            offloaded: false
        });
    }

    async emailJob({emailId}) {
        logging.info(`Starting email job for email ${emailId}`);

        const email = await this.getEmail(emailId);
        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        try {
            await this.sendEmail(email);
            await this.updateEmailStatus(email, 'submitted');
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

            await this.updateEmailStatus(email, 'failed', e.message);
        }
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const newsletter = await this.getNewsletter(email);
        const post = await this.getPost(email);
        const batches = await this.getBatches(email);

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

        const domainWarmupLimit = this.#domainWarmingService.isEnabled() ? email.get('csd_email_count') : Infinity;
        const segments = await this.#emailRenderer.getSegments(post);
        const batches = [];

        for (const segment of segments) {
            logging.info(`Creating batches for email ${email.id} segment ${segment}`);

            const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
            const members = await this.getMembers(segmentFilter, email.id);

            for (const member of members) {
                const batch = await this.createBatch(email, segment, member, domainWarmupLimit);
                batches.push(batch);
            }
        }

        return batches;
    }

    async createBatch(email, segment, member, domainWarmupLimit) {
        const batch = await this.retryDb(
            async () => {
                return await this.#models.EmailBatch.add({
                    email_id: email.id,
                    member_segment: segment,
                    status: 'pending',
                    fallback_sending_domain: false
                });
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `createBatch email ${email.id} segment ${segment}`}
        );

        const recipientData = {
            id: ObjectID().toHexString(),
            email_id: email.id,
            member_id: member.id,
            batch_id: batch.id,
            member_uuid: member.uuid,
            member_email: member.email,
            member_name: member.name
        };

        await this.retryDb(
            async () => {
                await this.#db.knex('email_recipients').insert(recipientData);
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `insert recipient for email ${email.id} batch ${batch.id}`}
        );

        return batch;
    }

    async sendBatches({email, batches, post, newsletter}) {
        logging.info(`Sending ${batches.length} batches for email ${email.id}`);

        const deadline = this.getDeliveryDeadline(email);
        const deliveryTimes = this.calculateDeliveryTimes(email, batches.length);

        const queue = batches.slice();
        let succeededCount = 0;

        await Promise.all(new Array(MAX_SENDING_CONCURRENCY).fill(0).map(async () => {
            while (queue.length > 0) {
                const batch = queue.shift();
                if (batch) {
                    const batchData = {email, batch, post, newsletter, deliveryTime: undefined};
                    if (deadline && deadline.getTime() > Date.now()) {
                        const deliveryTime = deliveryTimes.shift();
                        if (deliveryTime && deliveryTime >= Date.now()) {
                            batchData.deliveryTime = deliveryTime;
                        }
                    }
                    if (await this.sendBatch(batchData)) {
                        succeededCount += 1;
                    }
                }
            }
        }));

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

    async sendBatch({email, batch, post, newsletter, deliveryTime}) {
        logging.info(`Sending batch ${batch.id} for email ${email.id}`);

        try {
            const members = await this.getBatchMembers(batch.id);
            const response = await this.retryDb(
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
                    });
                },
                {...this.#MAILGUN_API_RETRY_CONFIG, description: `Sending email batch ${batch.id} ${deliveryTime ? `with delivery time ${deliveryTime}` : ''}`}
            );

            await this.updateBatchStatus(batch, 'submitted', response.id);
            return true;
        } catch (e) {
            await this.updateBatchStatus(batch, 'failed', null, e.message);
            return false;
        }
    }

    async getBatchMembers(batchId) {
        const members = await this.#models.EmailRecipient.findAll({filter: `batch_id:'${batchId}'`, withRelated: ['member', 'member.stripeSubscriptions', 'member.products']});
        return members.map((model) => {
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

    async getEmail(emailId) {
        return await this.retryDb(
            async () => {
                return await this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']);
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `updateStatusLock email ${emailId} -> submitting`}
        );
    }

    async getNewsletter(email) {
        return await this.retryDb(
            async () => {
                return await email.getLazyRelation('newsletter', {require: true});
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `getLazyRelation newsletter for email ${email.id}`}
        );
    }

    async getPost(email) {
        return await this.retryDb(
            async () => {
                return await email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']});
            },
            {...this.#BEFORE_RETRY_CONFIG, description: `getLazyRelation post for email ${email.id}`}
        );
    }

    async getMembers(segmentFilter, emailId) {
        const members = await this.#models.Member.getFilteredCollectionQuery({filter: segmentFilter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(this.#sendingService.getMaximumRecipients() + 1);

        return members;
    }

    async updateEmailStatus(email, status, errorMessage) {
        await this.retryDb(
            async () => {
                await email.save({
                    status,
                    error: errorMessage
                }, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `update email ${email.id} status to ${status}`}
        );
    }

    async updateBatchStatus(batch, status, providerId, errorMessage) {
        await this.retryDb(
            async () => {
                await batch.save({
                    status,
                    provider_id: providerId,
                    error_status_code: null,
                    error_message: errorMessage,
                    error_data: null
                }, {patch: true, require: false, autoRefresh: false});
            },
            {...this.#AFTER_RETRY_CONFIG, description: `update batch ${batch.id} status to ${status}`}
        );
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