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

const TRUST_THRESHOLD_MS = 30 * 60 * 1000;
const FETCH_LATEST_END_MARGIN_MS = 1 * 60 * 1000;
const AGGREGATION_INTERVAL_MS = 5 * 60 * 1000;
const AGGREGATION_MEMBER_THRESHOLD = 5000;
const BATCH_SIZE = 100;

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
 * Event type handlers mapping
 */
const EVENT_HANDLERS = {
    delivered: 'handleDelivered',
    opened: 'handleOpened',
    failed: 'handleFailed',
    unsubscribed: 'handleUnsubscribed',
    complained: 'handleComplained'
};

/**
 * Factory for creating fetch data objects
 */
class FetchDataFactory {
    static createLatestNonOpened() {
        return {running: false, jobName: 'email-analytics-latest-others'};
    }

    static createMissing() {
        return {running: false, jobName: 'email-analytics-missing'};
    }

    static createLatestOpened() {
        return {running: false, jobName: 'email-analytics-latest-opened'};
    }

    static createScheduled() {
        return {running: false, jobName: 'email-analytics-scheduled'};
    }

    static createScheduledWithDates(begin, end) {
        return {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    static createEmpty() {
        return {running: false, jobName: 'email-analytics-scheduled'};
    }
}

/**
 * Manages timing metrics for fetch operations
 */
class TimingMetrics {
    constructor() {
        this.apiPollingTimeMs = 0;
        this.processingTimeMs = 0;
        this.aggregationTimeMs = 0;
    }

    addApiTime(ms) {
        this.apiPollingTimeMs += ms;
    }

    addProcessingTime(ms) {
        this.processingTimeMs += ms;
    }

    addAggregationTime(ms) {
        this.aggregationTimeMs += ms;
    }

    toObject() {
        return {
            apiPollingTimeMs: this.apiPollingTimeMs,
            processingTimeMs: this.processingTimeMs,
            aggregationTimeMs: this.aggregationTimeMs
        };
    }
}

/**
 * Manages event processing state during fetch operations
 */
class EventProcessingState {
    constructor() {
        this.processingResult = new EventProcessingResult();
        this.cumulativeResult = new EventProcessingResult();
        this.allEmailIds = new Set();
        this.allMemberIds = new Set();
        this.eventCount = 0;
        this.lastAggregation = Date.now();
        this.error = null;
    }

    recordEventTimestamp(timestamp, fetchData) {
        if (!fetchData.lastEventTimestamp || (timestamp && timestamp > fetchData.lastEventTimestamp)) {
            fetchData.lastEventTimestamp = timestamp;
        }
    }

    shouldAggregate() {
        return (Date.now() - this.lastAggregation > AGGREGATION_INTERVAL_MS || 
                this.processingResult.memberIds.length > AGGREGATION_MEMBER_THRESHOLD) && 
               this.eventCount > 0;
    }

    updateLastAggregation() {
        this.lastAggregation = Date.now();
    }

    addBatchDelta(batchDelta) {
        this.cumulativeResult.merge(batchDelta);
        batchDelta.emailIds.forEach(id => this.allEmailIds.add(id));
        batchDelta.memberIds.forEach(id => this.allMemberIds.add(id));
    }

    clearProcessingResult() {
        this.processingResult.emailIds.forEach(id => this.allEmailIds.delete(id));
        this.processingResult.memberIds.forEach(id => this.allMemberIds.delete(id));
        this.processingResult = new EventProcessingResult();
    }

    getFinalIds() {
        return {
            emailIds: Array.from(new Set([...this.processingResult.emailIds, ...this.allEmailIds])),
            memberIds: Array.from(new Set([...this.processingResult.memberIds, ...this.allMemberIds]))
        };
    }
}

module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    #fetchLatestNonOpenedData = FetchDataFactory.createLatestNonOpened();
    #fetchMissingData = FetchDataFactory.createMissing();
    #fetchLatestOpenedData = FetchDataFactory.createLatestOpened();
    #fetchScheduledData = FetchDataFactory.createScheduled();

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
            prometheusClient.registerCounter({
                name: 'email_analytics_aggregate_member_stats_count',
                help: 'Count of member stats aggregations'
            });
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
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end is before begin');
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestOpenedData, {
            begin,
            end,
            maxEvents,
            eventTypes: ['opened']
        });
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end is before begin');
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestNonOpenedData, {
            begin,
            end,
            maxEvents,
            eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']
        });
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
            logging.info('[EmailAnalytics] Skipping fetchMissing because end is before begin');
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
        this.#fetchScheduledData = FetchDataFactory.createScheduledWithDates(begin, end);
    }

    cancelScheduled() {
        if (!this.#fetchScheduledData) {
            return;
        }

        if (this.#fetchScheduledData.running) {
            this.#fetchScheduledData.canceled = true;
        } else {
            this.#fetchScheduledData = FetchDataFactory.createEmpty();
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

        if (end <= begin) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = FetchDataFactory.createEmpty();
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        
        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = FetchDataFactory.createEmpty();
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const timingMetrics = new TimingMetrics();
        const processingState = new EventProcessingState();
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        const processBatch = async (events) => {
            const processingStart = Date.now();
            const beforeCounts = this.#captureProcessingCounts(processingState.processingResult);
            const beforeEmailIds = new Set(processingState.processingResult.emailIds);
            const beforeMemberIds = new Set(processingState.processingResult.memberIds);

            await this.processEventBatch(events, processingState.processingResult, fetchData);
            timingMetrics.addProcessingTime(Date.now() - processingStart);
            processingState.eventCount += events.length;

            const batchDelta = this.#calculateBatchDelta(
                processingState.processingResult,
                beforeCounts,
                beforeEmailIds,
                beforeMemberIds
            );
            processingState.addBatchDelta(batchDelta);

            if (processingState.shouldAggregate()) {
                await this.#performIntermediateAggregation(
                    processingState,
                    timingMetrics,
                    includeOpenedEvents
                );
            }

            if (fetchData.canceled) {
                throw new errors.InternalServerError({message: 'Fetching canceled'});
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                timingMetrics.addApiTime(Date.now() - apiStart);
            }
        } catch (err) {
            if (err.message !== 'Fetching canceled') {
                logging.error('[EmailAnalytics] Error while fetching');
                logging.error(err);
                processingState.error = err;
            } else {
                logging.error('[EmailAnalytics] Canceled fetching');
            }
        }

        await this.#performFinalAggregation(processingState, timingMetrics, includeOpenedEvents);
        await this.#updateJobTimestamp(fetchData, processingState);

        fetchData.running = false;

        if (processingState.error) {
            throw processingState.error;