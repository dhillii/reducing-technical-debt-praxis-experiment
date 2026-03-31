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
const DEFAULT_RETRY_CONFIG = {
    BEFORE: {maxRetries: 10, maxTime: 10 * 60 * 1000, sleep: 2000},
    AFTER: {maxRetries: 20, maxTime: 30 * 60 * 1000, sleep: 2000},
    MAILGUN_API: {sleep: 10 * 1000, maxRetries: 6}
};
const TEST_RETRY_CONFIG = {maxRetries: 0};

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
    #retryConfigs;

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

        this.#retryConfigs = this.#initializeRetryConfigs({
            BEFORE_RETRY_CONFIG,
            AFTER_RETRY_CONFIG,
            MAILGUN_API_RETRY_CONFIG
        });
    }

    #initializeRetryConfigs({BEFORE_RETRY_CONFIG, AFTER_RETRY_CONFIG, MAILGUN_API_RETRY_CONFIG}) {
        const isTestOrDev = process.env.NODE_ENV?.startsWith('test') || process.env.NODE_ENV === 'development';
        const fallbackConfig = isTestOrDev ? TEST_RETRY_CONFIG : null;

        return {
            before: BEFORE_RETRY_CONFIG || fallbackConfig || DEFAULT_RETRY_CONFIG.BEFORE,
            after: AFTER_RETRY_CONFIG || fallbackConfig || DEFAULT_RETRY_CONFIG.AFTER,
            mailgunApi: MAILGUN_API_RETRY_CONFIG || fallbackConfig || DEFAULT_RETRY_CONFIG.MAILGUN_API
        };
    }

    #getBeforeRetryConfig(email) {
        if (email._retryCutOffTime) {
            return {...this.#retryConfigs.before, stopAfterDate: email._retryCutOffTime};
        }
        return this.#retryConfigs.before;
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
            () => this.updateStatusLock(this.#models.Email, emailId, 'submitting', ['pending', 'failed']),
            {...this.#retryConfigs.before, description: `updateStatusLock email ${emailId} -> submitting`}
        );

        if (!email) {
            logging.error(`Tried sending email that is not pending or failed ${emailId}`);
            return;
        }

        const retryCutOffTime = this.#calculateRetryCutOffTime(startTime, email);
        email._retryCutOffTime = retryCutOffTime;

        try {
            await this.sendEmail(email);
            await this.retryDb(
                () => email.save({status: 'submitted', submitted_at: new Date(), error: null}, {patch: true, autoRefresh: false}),
                {...this.#retryConfigs.after, description: `email ${emailId} -> submitted`}
            );
        } catch (e) {
            this.#handleEmailError(e, email, emailId);
            await this.retryDb(
                () => email.save({status: 'failed', error: e.message || 'Something went wrong while sending the email'}, {patch: true, autoRefresh: false}),
                {...this.#retryConfigs.after, description: `email ${emailId} -> failed`}
            );
        }
    }

    #calculateRetryCutOffTime(startTime, email) {
        const expectedBatchCount = Math.ceil(email.get('email_count') / 1000);
        const minimumSecondsPerBatch = 26;
        const stopAfter = Math.max(
            expectedBatchCount * minimumSecondsPerBatch * 1000,
            this.#retryConfigs.before.maxTime
        );
        return new Date(startTime + stopAfter);
    }

    #handleEmailError(error, email, emailId) {
        const ghostError = new errors.EmailError({
            err: error,
            code: 'BULK_EMAIL_SEND_FAILED',
            message: `Error sending email ${email.id}`
        });
        logging.error(ghostError);
        if (this.#sentry) {
            this.#sentry.captureException(error);
        }
    }

    async sendEmail(email) {
        logging.info(`Sending email ${email.id}`);

        const [newsletter, post, batches] = await Promise.all([
            this.retryDb(
                () => email.getLazyRelation('newsletter', {require: true}),
                {...this.#getBeforeRetryConfig(email), description: `getLazyRelation newsletter for email ${email.id}`}
            ),
            this.retryDb(
                () => email.getLazyRelation('post', {require: true, withRelated: ['posts_meta', 'authors']}),
                {...this.#getBeforeRetryConfig(email), description: `getLazyRelation post for email ${email.id}`}
            ),
            this.retryDb(
                () => this.getBatches(email),
                {...this.#getBeforeRetryConfig(email), description: `getBatches for email ${email.id}`}
            )
        ]);

        const finalBatches = batches.length > 0 ? batches : await this.createBatches({email, newsletter, post});
        await this.sendBatches({email, batches: finalBatches, post, newsletter});
    }

    async getBatches(email) {
        logging.info(`Getting batches for email ${email.id}`);
        const batches = await this.#models.EmailBatch.findAll({filter: `email_id:'${email.id}'`});
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
            totalCount += await this.#processMembersForSegment({
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
        logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);
        return batches;
    }

    #calculateDomainWarmupLimit(email) {
        if (!this.#domainWarmingService.isEnabled()) {
            return Infinity;
        }
        return Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    async #processMembersForSegment({email, segment, newsletter, batches, BATCH_SIZE, domainWarmupLimit, totalCount}) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);
        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        let lastId = email.id;
        let segmentCount = 0;

        while (lastId) {
            const members = await this.#fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE);
            if (members.length === 0) break;

            segmentCount += await this.#processMemberBatch({
                email,
                segment,
                members,
                batches,
                BATCH_SIZE,
                domainWarmupLimit,
                totalCount: totalCount + segmentCount
            });

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }

        return segmentCount;
    }

    async #fetchMembersForSegment(email, segment, segmentFilter, lastId, BATCH_SIZE) {
        const filter = `${segmentFilter}+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${email.id} segment ${segment}, filter: ${filter}`);

        return await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name')
            .limit(BATCH_SIZE + 1);
    }

    async #processMemberBatch({email, segment, members, batches, BATCH_SIZE, domainWarmupLimit, totalCount}) {
        const remainingCapacity = domainWarmupLimit - totalCount;
        const membersToProcess = Math.min(members.length, BATCH_SIZE);

        if (remainingCapacity > 0 && remainingCapacity < membersToProcess) {
            await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(0, remainingCapacity),
                useFallbackDomain: false,
                batches
            });
            await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(remainingCapacity, membersToProcess),
                useFallbackDomain: true,
                batches
            });
        } else {
            await this.#createBatchWithRetry({
                email, segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: totalCount >= domainWarmupLimit,
                batches
            });
        }

        return membersToProcess;
    }

    async #updateEmailCountIfNeeded(email, totalCount, domainWarmupLimit) {
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

    async #createBatchWithRetry({email, segment, members, useFallbackDomain, batches}) {
        if (members.length === 0) {
            return;
        }

        const batch = await this.retryDb(
            () => this.createBatch(email, segment, members, {useFallbackDomain}),
            {
                ...this.#getBeforeRetryConfig(email),
                description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`
            }
        );
        batches.push(batch);
    }

    async createBatch(email, segment, members, options) {
        if (!options?.transacting) {
            return this.#models.EmailBatch.transaction((transacting) => 
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
        const insertQuery = this.#db.knex('email_recipients').insert(recipientData);

        if (options.transacting) {
            insertQuery.transacting(options.transacting);
        }

        logging.info(`Inserting ${recipientData.length} recipients for email ${email.id} batch ${batch.id}`);
        await insertQuery;
        return batch;
    }

    #buildRecipientData(email, batch, members) {
        return members
            .filter((memberRow) => this.#validateMemberRow(memberRow))
            .map((memberRow) => ({
                id: ObjectID().toHexString(),
                email_id: email.id,
                member_id: memberRow.id,
                batch_id: batch.id,
                member_uuid: memberRow.uuid,
                member_email: memberRow.email,
                member_name: memberRow.name
            }));
    }

    #validateMemberRow(memberRow) {
        if (!memberRow.id || !memberRow.uuid || !memberRow.email) {
            logging.warn(`Member row not included as email recipient due to missing data - id: ${memberRow.id}, uuid: ${memberRow.uuid}, email: ${memberRow.email}`);
            return false;
        }
        return true;
    }

    async sendBatches({email, batches, post,