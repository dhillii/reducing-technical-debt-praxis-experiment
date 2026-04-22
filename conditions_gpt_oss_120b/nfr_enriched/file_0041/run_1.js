```javascript
const EventProcessingResult = require('./event-processing-result');
const logging = require('@tryghost/logging');
const errors = require('@tryghost/errors');

/**
 * @typedef {import('../email-service/email-event-processor')} EmailEventProcessor
 */

/**
 * @typedef {object} FetchData
 * @property {boolean} running
 * @property {('email-analytics-latest-others'|'email-analytics-missing'|'email-analytics-latest-opened'|'email-analytics-scheduled')} jobName Name of the job that is running
 * @property {Date} [lastStarted] Date the last fetch started on
 * @property {Date} [lastBegin] The begin time used during the last fetch
 * @property {Date} [lastEventTimestamp]
 * @property {boolean} [canceled] Set to quit the job early
 */

/**
 * @typedef {FetchData & {schedule?: {begin: Date, end: Date}}} FetchDataScheduled
 */

/**
 * @typedef {'delivered' | 'opened' | 'failed' | 'unsubscribed' | 'complained'} EmailAnalyticsEvent
 */

/**
 * @typedef {object} EmailAnalyticsFetchResult
 * @property {number} eventCount - The number of events fetched
 * @property {number} apiPollingTimeMs - Time spent polling the API in milliseconds
 * @property {number} processingTimeMs - Time spent processing events in milliseconds
 * @property {number} aggregationTimeMs - Time spent aggregating stats in milliseconds
 * @property {EventProcessingResult} result - The processing result with event breakdown
 */

const TRUST_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const FETCH_LATEST_END_MARGIN_MS = 1 * 60 * 1000; // Do not fetch events newer than 1 minute (yet). Reduces the chance of having missed events in fetchLatest.

/**
 * Helper function to create an empty fetch result
 * @returns {EmailAnalyticsFetchResult}
 */
function createEmptyResult() {
    return {
        eventCount: 0,
        apiPollingTimeMs: 0,
        processingTimeMs: 0,
        aggregationTimeMs: 0,
        result: new EventProcessingResult()
    };
}

/**
 * Extracts the timestamp of the last processed event for a given job.
 * @param {FetchData} fetchData
 * @param {Function} queryFn
 * @param {string[]} [eventTypes]
 * @param {number} [multiplier=1]
 * @returns {Promise<Date>}
 */
async function resolveLastTimestamp(fetchData, queryFn, eventTypes, multiplier = 1) {
    const fallback = new Date(Date.now() - TRUST_THRESHOLD_MS * multiplier);
    return fetchData?.lastEventTimestamp ??
        (await queryFn(fetchData.jobName, eventTypes)) ??
        fallback;
}

module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    /** @type {FetchData} */
    #fetchLatestNonOpenedData = {running: false, jobName: 'email-analytics-latest-others'};
    /** @type {FetchData} */
    #fetchMissingData = {running: false, jobName: 'email-analytics-missing'};
    /** @type {FetchData} */
    #fetchLatestOpenedData = {running: false, jobName: 'email-analytics-latest-opened'};
    /** @type {FetchDataScheduled} */
    #fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};

    /**
     * @param {object} dependencies
     */
    constructor({config, settings, queries, eventProcessor, providers, domainEvents, prometheusClient}) {
        this.config = config;
        this.settings = settings;
        this.queries = queries;
        this.eventProcessor = eventProcessor;
        this.providers = providers;
        this.domainEvents = domainEvents;
        this.prometheusClient = prometheusClient;

        if (prometheusClient) {
            // @ts-expect-error
            prometheusClient.registerCounter({name: 'email_analytics_aggregate_member_stats_count', help: 'Count of member stats aggregations'});
        }
    }

    getStatus() {
        return {
            latest: this.#fetchLatestNonOpenedData,
            missing: this.#fetchMissingData,
            scheduled: this.#fetchScheduledData,
            latestOpened: this.#fetchLatestOpenedData
        };
    }

    async getLastNonOpenedEventTimestamp() {
        return resolveLastTimestamp(this.#fetchLatestNonOpenedData, this.queries.getLastEventTimestamp, ['delivered', 'failed']);
    }

    async getLastOpenedEventTimestamp() {
        return resolveLastTimestamp(this.#fetchLatestOpenedData, this.queries.getLastEventTimestamp, ['opened']);
    }

    async getLastMissingEventTimestamp() {
        return resolveLastTimestamp(this.#fetchMissingData, this.queries.getLastJobRunTimestamp, null, 4);
    }

    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);
        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }
        return this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);
        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }
        return this.#fetchEvents(this.#fetchLatestNonOpenedData, {begin, end, maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
            )
        );
        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchMissing because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }
        return this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        if (this.#fetchScheduledData?.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }
        logging.info(`[EmailAnalytics] Scheduling fetch from ${begin.toISOString()} until ${end.toISOString()}`);
        this.#fetchScheduledData = {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    cancelScheduled() {
        if (!this.#fetchScheduledData) return;
        if (this.#fetchScheduledData.running) {
            this.#fetchScheduledData.canceled = true;
        } else {
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData?.schedule) return createEmptyResult();
        if (this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = null;
            return createEmptyResult();
        }

        let begin = this.#fetchScheduledData.schedule.begin;
        const end = this.#fetchScheduledData.schedule.end;

        if (this.#fetchScheduledData.lastEventTimestamp && this.#fetchScheduledData.lastEventTimestamp > begin) {
            begin = this.#fetchScheduledData.lastEventTimestamp;
        }

        if (end <= begin) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
            return createEmptyResult();
        }

        const result = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        if (result.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return result;
    }

    /**
     * Core fetch implementation – orchestrates provider calls, processing and aggregation.
     */
    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        // initialise fetch state
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const ctx = {
            apiPollingTimeMs: 0,
            processingTimeMs: 0,
            aggregationTimeMs: 0,
            lastAggregation: Date.now(),
            eventCount: 0,
            includeOpenedEvents: eventTypes?.includes('opened') ?? false,
            processingResult: new EventProcessingResult(),
            cumulativeResult: new EventProcessingResult(),
            allEmailIds: new Set(),
            allMemberIds: new Set(),
            error: null,
            fetchData
        };

        await this._fetchFromProviders(ctx, this.providers, {begin, end, maxEvents, eventTypes});
        return await this._finalizeFetch(ctx, begin);
    }

    /**
     * Calls each provider and feeds batches to the batch processor.
     */
    async _fetchFromProviders(ctx, providers, {begin, end, maxEvents, eventTypes}) {
        const batchProcessor = async (events) => this._processBatch(ctx, events);
        for (const provider of providers) {
            const apiStart = Date.now();
            try {
                await provider.fetchLatest(batchProcessor, {begin, end, maxEvents, events: eventTypes});
            } catch (err) {
                if (err.message !== 'Fetching canceled') {
                    logging.error('[EmailAnalytics] Error while fetching');
                    logging.error(err);
                    ctx.error = err;
                } else {
                    logging.error('[EmailAnalytics] Canceled fetching');
                }
            }
            ctx.apiPollingTimeMs += Date.now() - apiStart;
        }
    }

    /**
     * Handles a single batch of events: processing, delta calculation and conditional aggregation.
     */
    async _processBatch(ctx, events) {
        const processingStart = Date.now();

        const beforeCounts = {
            opened: ctx.processingResult.opened,
            delivered: ctx.processingResult.delivered,
            temporaryFailed: ctx.processingResult.temporaryFailed,
            permanentFailed: ctx.processingResult.permanentFailed,
            unsubscribed: ctx.processingResult.unsubscribed,
            complained: ctx.processingResult.complained,
            unhandled: ctx.processingResult.unhandled,
            unprocessable: ctx.processingResult.unprocessable
        };
        const beforeEmailIds = new Set(ctx.processingResult.emailIds);
        const beforeMemberIds = new Set(ctx.processingResult.memberIds);

        await this.processEventBatch(events, ctx.processingResult, ctx.fetchData);
        ctx.processingTimeMs += Date.now() - processingStart;
        ctx.eventCount += events.length;

        const batchDelta = new EventProcessingResult({
            opened: ctx.processingResult.opened - beforeCounts.opened,
            delivered: ctx.processingResult.delivered - beforeCounts.delivered,
            temporaryFailed: ctx.processingResult.temporaryFailed - beforeCounts.temporaryFailed,
            permanentFailed: ctx.processingResult.permanentFailed - beforeCounts.permanentFailed,
            unsubscribed: ctx.processingResult.unsubscribed - beforeCounts.unsubscribed,
            complained: ctx.processingResult.complained - beforeCounts.complained,
            unhandled: ctx.processingResult.unhandled - beforeCounts.unhandled,
            unprocessable: ctx.processingResult.unprocessable - beforeCounts.unprocessable,
            emailIds: ctx.processingResult.emailIds.filter(id => !beforeEmailIds.has(id)),
            memberIds: ctx.processingResult.memberIds.filter(id => !beforeMemberIds.has(id))
        });

        ctx.cumulativeResult.merge(batchDelta);
        batchDelta.emailIds.forEach(id => ctx.allEmailIds.add(id));
        batchDelta.memberIds.forEach(id => ctx.allMemberIds.add(id));

        if ((Date.now() - ctx.lastAggregation > 5 * 60 * 1000 || ctx.processingResult.memberIds.length > 5000) && ctx.eventCount > 0) {
            await this._aggregateAndReset(ctx);
        }

        if (ctx.fetchData.canceled) {
            throw new errors.InternalServerError({message: 'Fetching canceled'});
        }
    }

    /**
     * Performs aggregation when thresholds are met and resets the processing result.
     */
    async _aggregateAndReset(ctx) {
        try {
            const aggStart = Date.now();
            await this.aggregateStats(ctx.processingResult, ctx.includeOpenedEvents);
            ctx.aggregationTimeMs += Date.now() - aggStart;
            ctx.lastAggregation = Date.now();

            ctx.processingResult.emailIds.forEach(id => ctx.allEmailIds.delete(id));
            ctx.processingResult.memberIds.forEach(id => ctx.allMemberIds.delete(id));
            ctx.processingResult = new EventProcessingResult();
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
        }
    }

    /**
     * Final aggregation step, job status updates and result construction.
     */
    async _finalizeFetch(ctx, begin) {
        // final aggregation of any remaining ids
        const finalEmailIds = Array.from(new Set([...ctx.processingResult.emailIds, ...ctx.allEmailIds]));
        const finalMemberIds = Array.from(new Set([...ctx.processingResult.memberIds, ...ctx.allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggStart = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, ctx.includeOpenedEvents);
                ctx.aggregationTimeMs += Date.now() - aggStart;
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
                if (!ctx.error) ctx.error = err;
            }
        }

        // update timestamps / status
        if (!ctx.error && ctx.eventCount > 0 && ctx.fetchData.lastEventTimestamp && ctx.fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(ctx.fetchData.jobName, 'finished', new Date(ctx.fetchData.lastEventTimestamp.getTime()));
            ctx.fetchData.lastEventTimestamp = new Date(ctx.fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(ctx.fetchData.jobName, 'finished');
        }

        ctx.fetchData.running = false;

        if (ctx.error) {
            throw ctx.error;
        }

        return {
            eventCount: ctx.eventCount,
            apiPollingTimeMs: ctx.apiPollingTimeMs,
            processingTimeMs: ctx.processingTimeMs,
            aggregationTimeMs: ctx.aggregationTimeMs,
            result: ctx.cumulativeResult
        };
    }

    /**
     * Process a batch of email analytics events.
     */
    async processEventBatch(events, result, fetchData) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            const emailIdentifications = events.map(event => ({
                emailId: event.emailId,
                providerId: event.providerId,
                email: event.recipientEmail
            }));
            const recipientCache = await this.eventProcessor.batchGetRecipients(emailIdentifications);

            for (const event of events) {
                const batchResult = await this.processEvent(event, recipientCache);
                if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                    fetchData.lastEventTimestamp = event.timestamp;
                }
                result.merge(batchResult);
            }
            await this.eventProcessor.flushBatchedUpdates();
        } else {
            for (const event of events) {
                const batchResult = await this.processEvent(event);
                if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                    fetchData.lastEventTimestamp = event.timestamp;
                }
                result.merge(batchResult);
            }
        }
    }

    /**
     * Handles a single event and returns its processing result.
     */
    async processEvent(event, recipientCache) {
        if (event.type === 'delivered') {
            const recipient = await this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({delivered: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'opened') {
            const recipient = await this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({opened: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'failed') {
            if (event.severity === 'permanent') {
                const recipient = await this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
                return recipient ? new EventProcessingResult({permanentFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
            }
            const recipient = await this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
            return recipient ? new EventProcessingResult({temporaryFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'unsubscribed') {
            const recipient = await this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({unsubscribed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'complained') {
            const recipient = await this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({complained: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        return new EventProcessingResult({unhandled: 1});
    }

    /**
     * Aggregates stats for given email and member ids.
     */
    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        for (const emailId of emailIds) {
            await this.aggregateEmailStats(emailId, includeOpenedEvents);
        }

        // @ts-expect-error
        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');

        if (useBatchProcessing) {
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: 100)`);
            const BATCH_SIZE = 100;
            for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
                const batch = memberIds.slice(i, i + BATCH_SIZE);
                await this.aggregateMemberStatsBatch(batch);
                memberMetric?.inc(batch.length);
            }
        } else {
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using SEQUENTIAL mode`);
            for (const memberId of memberIds) {
                await this.aggregateMemberStats(memberId);
                memberMetric?.inc();
            }
        }
    }

    async aggregateEmailStats(emailId, includeOpenedEvents) {
        return this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
    }

    async aggregateMemberStats(memberId) {
        return this.queries.aggregateMemberStats(memberId);
    }

    async aggregateMemberStatsBatch(memberIds) {
        return this.queries.aggregateMemberStatsBatch(memberIds);
    }
};
```