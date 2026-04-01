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
const AGGREGATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
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
 * Validates that the end date is after the begin date
 * @param {Date} begin
 * @param {Date} end
 * @param {string} operationName
 * @returns {boolean}
 */
function validateDateRange(begin, end, operationName) {
    if (end <= begin) {
        logging.info(`[EmailAnalytics] Skipping ${operationName} because end (${end}) is before begin (${begin})`);
        return false;
    }
    return true;
}

/**
 * Calculates the delta between current and previous processing results
 * @param {EventProcessingResult} current
 * @param {Object} previous
 * @returns {EventProcessingResult}
 */
function calculateResultDelta(current, previous) {
    return new EventProcessingResult({
        opened: current.opened - previous.opened,
        delivered: current.delivered - previous.delivered,
        temporaryFailed: current.temporaryFailed - previous.temporaryFailed,
        permanentFailed: current.permanentFailed - previous.permanentFailed,
        unsubscribed: current.unsubscribed - previous.unsubscribed,
        complained: current.complained - previous.complained,
        unhandled: current.unhandled - previous.unhandled,
        unprocessable: current.unprocessable - previous.unprocessable,
        emailIds: current.emailIds.filter(id => !previous.emailIds.has(id)),
        memberIds: current.memberIds.filter(id => !previous.memberIds.has(id))
    });
}

/**
 * Determines if intermediate aggregation should occur
 * @param {number} timeSinceLastAggregation
 * @param {number} memberCount
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldAggregateIntermediate(timeSinceLastAggregation, memberCount, eventCount) {
    return (timeSinceLastAggregation > AGGREGATION_INTERVAL_MS || memberCount > AGGREGATION_MEMBER_THRESHOLD) && eventCount > 0;
}

/**
 * Captures the current state of a processing result for delta calculation
 * @param {EventProcessingResult} result
 * @returns {Object}
 */
function captureResultState(result) {
    return {
        opened: result.opened,
        delivered: result.delivered,
        temporaryFailed: result.temporaryFailed,
        permanentFailed: result.permanentFailed,
        unsubscribed: result.unsubscribed,
        complained: result.complained,
        unhandled: result.unhandled,
        unprocessable: result.unprocessable,
        emailIds: new Set(result.emailIds),
        memberIds: new Set(result.memberIds)
    };
}

/**
 * Performs intermediate aggregation and clears the processing result
 * @param {EventProcessingResult} processingResult
 * @param {boolean} includeOpenedEvents
 * @param {Set} allEmailIds
 * @param {Set} allMemberIds
 * @param {Object} timingMetrics
 * @returns {Promise<void>}
 */
async function performIntermediateAggregation(processingResult, includeOpenedEvents, allEmailIds, allMemberIds, timingMetrics) {
    try {
        const aggregationStart = Date.now();
        await this.aggregateStats(processingResult, includeOpenedEvents);
        timingMetrics.aggregationTimeMs += (Date.now() - aggregationStart);
        timingMetrics.lastAggregation = Date.now();
        
        // Remove aggregated IDs from tracking sets
        processingResult.emailIds.forEach(id => allEmailIds.delete(id));
        processingResult.memberIds.forEach(id => allMemberIds.delete(id));
    } catch (err) {
        logging.error('[EmailAnalytics] Error while aggregating stats');
        logging.error(err);
    }
}

/**
 * Processes a single batch of events with timing and state tracking
 * @param {Array<Object>} events
 * @param {EventProcessingResult} processingResult
 * @param {FetchData} fetchData
 * @param {Object} timingMetrics
 * @param {Set} allEmailIds
 * @param {Set} allMemberIds
 * @param {boolean} includeOpenedEvents
 * @returns {Promise<void>}
 */
async function processBatchWithTracking(events, processingResult, fetchData, timingMetrics, allEmailIds, allMemberIds, includeOpenedEvents) {
    const processingStart = Date.now();
    const beforeState = captureResultState(processingResult);

    await this.processEventBatch(events, processingResult, fetchData);
    timingMetrics.processingTimeMs += (Date.now() - processingStart);
    timingMetrics.eventCount += events.length;

    // Calculate and accumulate delta
    const batchDelta = calculateResultDelta(processingResult, beforeState);
    timingMetrics.cumulativeResult.merge(batchDelta);
    batchDelta.emailIds.forEach(id => allEmailIds.add(id));
    batchDelta.memberIds.forEach(id => allMemberIds.add(id));

    // Check if intermediate aggregation is needed
    if (shouldAggregateIntermediate(Date.now() - timingMetrics.lastAggregation, processingResult.memberIds.length, timingMetrics.eventCount)) {
        await performIntermediateAggregation.call(this, processingResult, includeOpenedEvents, allEmailIds, allMemberIds, timingMetrics);
        processingResult = new EventProcessingResult();
    }

    if (fetchData.canceled) {
        throw new errors.InternalServerError({
            message: 'Fetching canceled'
        });
    }
}

/**
 * Performs final aggregation of all remaining events
 * @param {EventProcessingResult} processingResult
 * @param {Set} allEmailIds
 * @param {Set} allMemberIds
 * @param {boolean} includeOpenedEvents
 * @param {Object} timingMetrics
 * @returns {Promise<void>}
 */
async function performFinalAggregation(processingResult, allEmailIds, allMemberIds, includeOpenedEvents, timingMetrics) {
    const finalEmailIds = Array.from(new Set([...processingResult.emailIds, ...allEmailIds]));
    const finalMemberIds = Array.from(new Set([...processingResult.memberIds, ...allMemberIds]));

    if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
        try {
            const aggregationStart = Date.now();
            const finalAggregationResult = {
                emailIds: finalEmailIds,
                memberIds: finalMemberIds
            };
            await this.aggregateStats(finalAggregationResult, includeOpenedEvents);
            timingMetrics.aggregationTimeMs += (Date.now() - aggregationStart);
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
            throw err;
        }
    }
}

/**
 * Handles final timestamp update logic
 * @param {FetchData} fetchData
 * @param {number} eventCount
 * @param {boolean} hasError
 * @returns {Promise<void>}
 */
async function updateFinalTimestamp(fetchData, eventCount, hasError) {
    if (!hasError && eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
        await this.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
        fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
    } else {
        await this.queries.setJobStatus(fetchData.jobName, 'finished');
    }
}

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

    /**
     * Returns the timestamp of the last non-opened event we processed. Defaults to now minus 30 minutes if we have no data yet.
     */
    async getLastNonOpenedEventTimestamp() {
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName,['delivered','failed'])) ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last opened event we processed. Defaults to now minus 30 minutes if we have no data yet.
     */
    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName,['opened'])) ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last missing event we processed. Defaults to now minus 2h if we have no data yet.
     */
    async getLastMissingEventTimestamp() {
        return this.#fetchMissingData?.lastEventTimestamp ?? (await this.queries.getLastJobRunTimestamp(this.#fetchMissingData.jobName)) ?? new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    /**
     * Fetches the latest opened events.
     * @param {Object} options - The options for fetching events.
     * @param {number} [options.maxEvents=Infinity] - The maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (!validateDateRange(begin, end, 'fetchLatestOpenedEvents')) {
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    /**
     * Fetches the latest non-opened events.
     * @param {Object} options - The options for fetching events.
     * @param {number} [options.maxEvents=Infinity] - The maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (!validateDateRange(begin, end, 'fetchLatestNonOpenedEvents')) {
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestNonOpenedData, {begin, end, maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    /**
     * Fetches events that are older than 30 minutes, because then the '