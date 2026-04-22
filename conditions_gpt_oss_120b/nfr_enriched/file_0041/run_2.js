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
 * Helper to decide whether opened events should be aggregated
 * @param {EmailAnalyticsEvent[]|null} eventTypes
 * @returns {boolean}
 */
function shouldIncludeOpened(eventTypes) {
    return eventTypes?.includes('opened') ?? false;
}

/**
 * Helper to compute the end time for missing fetches
 * @param {FetchData} latestData
 * @returns {Date}
 */
function computeMissingEnd(latestData) {
    return new Date(
        Math.min(
            Date.now() - TRUST_THRESHOLD_MS,
            latestData?.lastBegin?.getTime() || Date.now()
        )
    );
}

/**
 * Helper to log and return an empty result when the time window is invalid
 * @param {string} fnName
 * @param {Date} begin
 * @param {Date} end
 * @returns {EmailAnalyticsFetchResult|null}
 */
function earlyExitIfInvalidWindow(fnName, begin, end) {
    if (end <= begin) {
        logging.info(`[EmailAnalytics] Skipping ${fnName} because end (${end}) is before begin (${begin})`);
        return createEmptyResult();
    }
    return null;
}

/**
 * Helper to reset scheduled fetch data
 * @param {FetchDataScheduled} scheduledData
 * @returns {FetchDataScheduled}
 */
function resetScheduledData(scheduledData) {
    return {
        running: false,
        jobName: 'email-analytics-scheduled'
    };
}

/**
 * Helper to build the final fetch result object
 * @param {object} state
 * @returns {EmailAnalyticsFetchResult}
 */
function buildFetchResult(state) {
    return {
        eventCount: state.eventCount,
        apiPollingTimeMs: state.apiPollingTimeMs,
        processingTimeMs: state.processingTimeMs,
        aggregationTimeMs: state.aggregationTimeMs,
        result: state.cumulativeResult
    };
}

/**
 * Helper to initialise the mutable state used during a fetch
 * @returns {object}
 */
function initFetchState() {
    return {
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
}

/**
 * Helper to finalize aggregation after all providers have been processed
 * @param {object} state
 * @param {boolean} includeOpenedEvents
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function finalizeAggregation(state, includeOpenedEvents, service) {
    const finalEmailIds = Array.from(new Set([...state.processingResult.emailIds, ...state.allEmailIds]));
    const finalMemberIds = Array.from(new Set([...state.processingResult.memberIds, ...state.allMemberIds]));

    if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
        try {
            const start = Date.now();
            await service.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, includeOpenedEvents);
            state.aggregationTimeMs += Date.now() - start;
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
            if (!state.error) {
                state.error = err;
            }
        }
    }
}

/**
 * Helper to store the final job timestamps/status
 * @param {FetchData} fetchData
 * @param {object} state
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function finalizeJob(fetchData, state, service) {
    if (!state.error && state.eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
        await service.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
        fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
    } else {
        await service.queries.setJobStatus(fetchData.jobName, 'finished');
    }
    fetchData.running = false;
}

/**
 * Helper to process a batch of events and handle intermediate aggregation
 * @param {Array<Object>} events
 * @param {object} state
 * @param {FetchData} fetchData
 * @param {boolean} includeOpenedEvents
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function processBatch(events, state, fetchData, includeOpenedEvents, service) {
    const processingStart = Date.now();

    const beforeCounts = {
        opened: state.processingResult.opened,
        delivered: state.processingResult.delivered,
        temporaryFailed: state.processingResult.temporaryFailed,
        permanentFailed: state.processingResult.permanentFailed,
        unsubscribed: state.processingResult.unsubscribed,
        complained: state.processingResult.complained,
        unhandled: state.processingResult.unhandled,
        unprocessable: state.processingResult.unprocessable
    };
    const beforeEmailIds = new Set(state.processingResult.emailIds);
    const beforeMemberIds = new Set(state.processingResult.memberIds);

    await service.processEventBatch(events, state.processingResult, fetchData);
    state.processingTimeMs += Date.now() - processingStart;
    state.eventCount += events.length;

    const batchDelta = new EventProcessingResult({
        opened: state.processingResult.opened - beforeCounts.opened,
        delivered: state.processingResult.delivered - beforeCounts.delivered,
        temporaryFailed: state.processingResult.temporaryFailed - beforeCounts.temporaryFailed,
        permanentFailed: state.processingResult.permanentFailed - beforeCounts.permanentFailed,
        unsubscribed: state.processingResult.unsubscribed - beforeCounts.unsubscribed,
        complained: state.processingResult.complained - beforeCounts.complained,
        unhandled: state.processingResult.unhandled - beforeCounts.unhandled,
        unprocessable: state.processingResult.unprocessable - beforeCounts.unprocessable,
        emailIds: state.processingResult.emailIds.filter(id => !beforeEmailIds.has(id)),
        memberIds: state.processingResult.memberIds.filter(id => !beforeMemberIds.has(id))
    });

    state.cumulativeResult.merge(batchDelta);
    batchDelta.emailIds.forEach(id => state.allEmailIds.add(id));
    batchDelta.memberIds.forEach(id => state.allMemberIds.add(id));

    const needAgg = (Date.now() - state.lastAggregation > 5 * 60 * 1000) ||
        (state.processingResult.memberIds.length > 5000);
    if (needAgg && state.eventCount > 0) {
        try {
            const aggStart = Date.now();
            await service.aggregateStats(state.processingResult, includeOpenedEvents);
            state.aggregationTimeMs += Date.now() - aggStart;
            state.lastAggregation = Date.now();
            state.processingResult.emailIds.forEach(id => state.allEmailIds.delete(id));
            state.processingResult.memberIds.forEach(id => state.allMemberIds.delete(id));
            state.processingResult = new EventProcessingResult();
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
        }
    }

    if (fetchData.canceled) {
        throw new errors.InternalServerError({message: 'Fetching canceled'});
    }
}

/**
 * Helper to fetch events from all providers
 * @param {Array<any>} providers
 * @param {function} batchHandler
 * @param {object} options
 * @param {object} state
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function fetchFromProviders(providers, batchHandler, options, state, service) {
    for (const provider of providers) {
        const apiStart = Date.now();
        await provider.fetchLatest(batchHandler, options);
        state.apiPollingTimeMs += Date.now() - apiStart;
    }
}

/**
 * Helper to start a fetch operation (set flags & timestamps)
 * @param {FetchData} fetchData
 * @param {Date} begin
 * @param {EmailAnalyticsService} service
 */
function startFetch(fetchData, begin, service) {
    fetchData.running = true;
    fetchData.lastStarted = new Date();
    fetchData.lastBegin = begin;
    service.queries.setJobTimestamp(fetchData.jobName, 'started', begin);
}

/**
 * Helper to handle errors from provider fetching
 * @param {Error} err
 * @param {object} state
 */
function handleProviderError(err, state) {
    if (err.message !== 'Fetching canceled') {
        logging.error('[EmailAnalytics] Error while fetching');
        logging.error(err);
        state.error = err;
    } else {
        logging.error('[EmailAnalytics] Canceled fetching');
    }
}

/**
 * EmailAnalyticsService
 */
module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    /**
     * @type {FetchData}
     */
    #fetchLatestNonOpenedData = {
        running: false,
        jobName: 'email-analytics-latest-others'
    };

    /**
     * @type {FetchData}
     */
    #fetchMissingData = {
        running: false,
        jobName: 'email-analytics-missing'
    };

    /**
     * @type {FetchData}
     */
    #fetchLatestOpenedData = {
        running: false,
        jobName: 'email-analytics-latest-opened'
    };

    /**
     * @type {FetchDataScheduled}
     */
    #fetchScheduledData = {
        running: false,
        jobName: 'email-analytics-scheduled'
    };

    /**
     * @param {object} dependencies
     * @param {object} dependencies.config
     * @param {object} dependencies.settings
     * @param {object} dependencies.queries
     * @param {EmailEventProcessor} dependencies.eventProcessor
     * @param {object} dependencies.providers
     * @param {import('@tryghost/domain-events')} dependencies.domainEvents
     * @param {import('@tryghost/prometheus-metrics')} dependencies.prometheusClient
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
        const early = earlyExitIfInvalidWindow('fetchLatestOpenedEvents', begin, end);
        if (early) return early;

        return await this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);
        const early = earlyExitIfInvalidWindow('fetchLatestNonOpenedEvents', begin, end);
        if (early) return early;

        return await this.#fetchEvents(this.#fetchLatestNonOpenedData, {begin, end, maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const end = computeMissingEnd(this.#fetchLatestNonOpenedData);
        const early = earlyExitIfInvalidWindow('fetchMissing', begin, end);
        if (early) return early;

        return await this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        if (this.#fetchScheduledData && this.#fetchScheduledData.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }
        logging.info('[EmailAnalytics] Scheduling fetch from ' + begin.toISOString() + ' until ' + end.toISOString());
        this.#fetchScheduledData = {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    cancelScheduled() {
        if (this.#fetchScheduledData) {
            if (this.#fetchScheduledData.running) {
                this.#fetchScheduledData.canceled = true;
            } else {
                this.#fetchScheduledData = resetScheduledData(this.#fetchScheduledData);
            }
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData?.schedule) {
            return createEmptyResult();
        }

        if (this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = null;
            return createEmptyResult();
        }

        let begin = this.#fetchScheduledData.schedule.begin;
        const end = this.#fetchScheduledData.schedule.end;

        if (this.#fetchScheduledData.lastEventTimestamp && this.#fetchScheduledData.lastEventTimestamp > begin) {
            begin = this.#fetchScheduledData.lastEventTimestamp;
        }

        const early = earlyExitIfInvalidWindow('fetchScheduled', begin, end);
        if (early) {
            this.#fetchScheduledData = resetScheduledData(this.#fetchScheduledData);
            return early;
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = resetScheduledData(this.#fetchScheduledData);
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        startFetch(fetchData, begin, this);
        const includeOpenedEvents = shouldIncludeOpened(eventTypes);
        const state = initFetchState();

        const batchHandler = async (events) => {
            await processBatch(events, state, fetchData, includeOpenedEvents, this);
        };

        try {
            await fetchFromProviders(this.providers, batchHandler, {begin, end, maxEvents, events: eventTypes}, state, this);
        } catch (err) {
            handleProviderError(err, state);
        }

        await finalizeAggregation(state, includeOpenedEvents, this);
        await finalizeJob(fetchData, state, this);

        if (state.error) {
            throw state.error;
        }

        return buildFetchResult(state);
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