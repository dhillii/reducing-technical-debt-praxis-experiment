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

function createEmptyResult() {
    return {
        eventCount: 0,
        apiPollingTimeMs: 0,
        processingTimeMs: 0,
        aggregationTimeMs: 0,
        result: new EventProcessingResult()
    };
}

module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    #fetchLatestNonOpenedData = {running: false, jobName: 'email-analytics-latest-others'};
    #fetchMissingData = {running: false, jobName: 'email-analytics-missing'};
    #fetchLatestOpenedData = {running: false, jobName: 'email-analytics-latest-opened'};
    #fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};

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
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp ??
            (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName, ['delivered', 'failed'])) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp ??
            (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName, ['opened'])) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastMissingEventTimestamp() {
        return this.#fetchMissingData?.lastEventTimestamp ??
            (await this.queries.getLastJobRunTimestamp(this.#fetchMissingData.jobName)) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
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

        let {begin, end} = this.#fetchScheduledData.schedule;
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

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        this._initFetch(fetchData, begin);
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        const state = {
            apiPollingTimeMs: 0,
            processingTimeMs: 0,
            aggregationTimeMs: 0,
            eventCount: 0,
            lastAggregation: Date.now(),
            processingResult: new EventProcessingResult(),
            cumulativeResult: new EventProcessingResult(),
            allEmailIds: new Set(),
            allMemberIds: new Set(),
            error: null
        };

        await this._runProviders(fetchData, {begin, end, maxEvents, eventTypes, state, includeOpenedEvents});
        await this._finalAggregation(state, includeOpenedEvents);
        await this._finalizeFetch(fetchData, state);

        return {
            eventCount: state.eventCount,
            apiPollingTimeMs: state.apiPollingTimeMs,
            processingTimeMs: state.processingTimeMs,
            aggregationTimeMs: state.aggregationTimeMs,
            result: state.cumulativeResult
        };
    }

    _initFetch(fetchData, begin) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);
    }

    async _runProviders(fetchData, {begin, end, maxEvents, eventTypes, state, includeOpenedEvents}) {
        for (const provider of this.providers) {
            const apiStart = Date.now();
            try {
                await provider.fetchLatest(
                    async (events) => this._processBatch(events, fetchData, state, includeOpenedEvents),
                    {begin, end, maxEvents, events: eventTypes}
                );
            } catch (err) {
                if (err.message !== 'Fetching canceled') {
                    logging.error('[EmailAnalytics] Error while fetching');
                    logging.error(err);
                    state.error = err;
                } else {
                    logging.error('[EmailAnalytics] Canceled fetching');
                }
            }
            state.apiPollingTimeMs += Date.now() - apiStart;
        }
    }

    async _processBatch(events, fetchData, state, includeOpenedEvents) {
        const processingStart = Date.now();

        const before = {
            counts: {
                opened: state.processingResult.opened,
                delivered: state.processingResult.delivered,
                temporaryFailed: state.processingResult.temporaryFailed,
                permanentFailed: state.processingResult.permanentFailed,
                unsubscribed: state.processingResult.unsubscribed,
                complained: state.processingResult.complained,
                unhandled: state.processingResult.unhandled,
                unprocessable: state.processingResult.unprocessable
            },
            emailIds: new Set(state.processingResult.emailIds),
            memberIds: new Set(state.processingResult.memberIds)
        };

        await this.processEventBatch(events, state.processingResult, fetchData);
        state.processingTimeMs += Date.now() - processingStart;
        state.eventCount += events.length;

        const delta = new EventProcessingResult({
            opened: state.processingResult.opened - before.counts.opened,
            delivered: state.processingResult.delivered - before.counts.delivered,
            temporaryFailed: state.processingResult.temporaryFailed - before.counts.temporaryFailed,
            permanentFailed: state.processingResult.permanentFailed - before.counts.permanentFailed,
            unsubscribed: state.processingResult.unsubscribed - before.counts.unsubscribed,
            complained: state.processingResult.complained - before.counts.complained,
            unhandled: state.processingResult.unhandled - before.counts.unhandled,
            unprocessable: state.processingResult.unprocessable - before.counts.unprocessable,
            emailIds: state.processingResult.emailIds.filter(id => !before.emailIds.has(id)),
            memberIds: state.processingResult.memberIds.filter(id => !before.memberIds.has(id))
        });

        state.cumulativeResult.merge(delta);
        delta.emailIds.forEach(id => state.allEmailIds.add(id));
        delta.memberIds.forEach(id => state.allMemberIds.add(id));

        if ((Date.now() - state.lastAggregation > 5 * 60 * 1000 || state.processingResult.memberIds.length > 5000) && state.eventCount > 0) {
            await this._aggregateAndReset(state, includeOpenedEvents);
        }

        if (fetchData.canceled) {
            throw new errors.InternalServerError({message: 'Fetching canceled'});
        }
    }

    async _aggregateAndReset(state, includeOpenedEvents) {
        try {
            const start = Date.now();
            await this.aggregateStats(state.processingResult, includeOpenedEvents);
            state.aggregationTimeMs += Date.now() - start;
            state.lastAggregation = Date.now();

            state.processingResult.emailIds.forEach(id => state.allEmailIds.delete(id));
            state.processingResult.memberIds.forEach(id => state.allMemberIds.delete(id));
            state.processingResult = new EventProcessingResult();
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
        }
    }

    async _finalAggregation(state, includeOpenedEvents) {
        const finalEmailIds = Array.from(new Set([...state.processingResult.emailIds, ...state.allEmailIds]));
        const finalMemberIds = Array.from(new Set([...state.processingResult.memberIds, ...state.allMemberIds]));

        if (finalEmailIds.length || finalMemberIds.length) {
            try {
                const start = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, includeOpenedEvents);
                state.aggregationTimeMs += Date.now() - start;
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
                if (!state.error) state.error = err;
            }
        }
    }

    async _finalizeFetch(fetchData, state) {
        if (!state.error && state.eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
            fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(fetchData.jobName, 'finished');
        }

        fetchData.running = false;
        if (state.error) throw state.error;
    }

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

    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        for (const emailId of emailIds) {
            await this.aggregateEmailStats(emailId, includeOpenedEvents);
        }

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