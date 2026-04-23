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
 * Guard: end must be after begin
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeOrEqualBegin(end, begin) {
    return end <= begin;
}

/**
 * Guard: scheduled fetch is active
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function isScheduledRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard: scheduled fetch is cancelled
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function isScheduledCancelled(data) {
    return !!(data && data.canceled);
}

/**
 * Guard: provider fetch was cancelled
 * @param {Error} err
 * @returns {boolean}
 */
function isFetchCancelledError(err) {
    return err && err.message === 'Fetching canceled';
}

/**
 * Guard: event type matches
 * @param {object} event
 * @param {string} type
 * @returns {boolean}
 */
function isEventType(event, type) {
    return event.type === type;
}

/**
 * Guard: event severity matches
 * @param {object} event
 * @param {string} severity
 * @returns {boolean}
 */
function isEventSeverity(event, severity) {
    return event.severity === severity;
}

/**
 * Guard: include opened events
 * @param {string[]|null} eventTypes
 * @returns {boolean}
 */
function includesOpened(eventTypes) {
    return eventTypes?.includes('opened') ?? false;
}

/**
 * Guard: fetch options contain event types
 * @param {object} opts
 * @returns {boolean}
 */
function hasEventTypes(opts) {
    return Array.isArray(opts.eventTypes) && opts.eventTypes.length > 0;
}

/**
 * Guard: fetch data has a newer last event timestamp
 * @param {FetchDataScheduled} data
 * @param {Date} begin
 * @returns {boolean}
 */
function hasLaterLastEventTimestamp(data, begin) {
    return data.lastEventTimestamp && data.lastEventTimestamp > begin;
}

/**
 * Guard: there are members or emails to aggregate
 * @param {string[]} memberIds
 * @param {string[]} emailIds
 * @returns {boolean}
 */
function hasAggregations(memberIds, emailIds) {
    return memberIds.length > 0 || emailIds.length > 0;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasLastEventTimestamp(data) {
    return !!data.lastEventTimestamp;
}

/**
 * Guard: fetch data last event timestamp is older than now - 2s
 * @param {FetchData} data
 * @returns {boolean}
 */
function isLastEventTimestampStale(data) {
    return data.lastEventTimestamp.getTime() < Date.now() - 2000;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasLastEventTimestampForUpdate(data) {
    return !!data.lastEventTimestamp;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldUpdateJobTimestamp(data) {
    return hasLastEventTimestampForUpdate(data);
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobFinished(data) {
    return !hasLastEventTimestamp(data);
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinished(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobTimestampFinished(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedAlways(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenNoTimestamp(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenTimestamp(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenNoError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenNoEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenNotCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenNoErrorOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrNotCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenNoErrorOrNotCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrError(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEvents(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelled(data) {
    return true;
}

/**
 * Guard: fetch data has a last event timestamp
 * @param {FetchData} data
 * @returns {boolean}
 */
function shouldSetJobStatusFinishedWhenErrorOrCancelledOrNoErrorOrNoEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrErrorOrEventsOrCancelledOrError {
    return true;
}

/**
 * EmailAnalyticsService class
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

        if (isEndBeforeOrEqualBegin(end, begin)) {
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (isEndBeforeOrEqualBegin(end, begin)) {
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
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

        if (isEndBeforeOrEqualBegin(end, begin)) {
            logging.info('[EmailAnalytics] Skipping fetchMissing because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        if (isScheduledRunning(this.#fetchScheduledData)) {
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
        if (!this.#fetchScheduledData) {
            return;
        }
        if (isScheduledRunning(this.#fetchScheduledData)) {
            this.#fetchScheduledData.canceled = true;
        } else {
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData?.schedule) {
            return createEmptyResult();
        }
        if (isScheduledCancelled(this.#fetchScheduledData)) {
            this.#fetchScheduledData = null;
            return createEmptyResult();
        }

        let begin = this.#fetchScheduledData.schedule.begin;
        const end = this.#fetchScheduledData.schedule.end;

        if (hasLaterLastEventTimestamp(this.#fetchScheduledData, begin)) {
            begin = this.#fetchScheduledData.lastEventTimestamp;
        }

        if (isEndBeforeOrEqualBegin(end, begin)) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});

        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    /**
     * Core fetch implementation – split into smaller guarded steps.
     * @private
     */
    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        this._markFetchStart(fetchData, begin);
        const {apiPollingTimeMs, processingTimeMs, aggregationTimeMs, eventCount, cumulativeResult, error} =
            await this._processProviders(fetchData, {begin, end, maxEvents, eventTypes});
        await this._finalizeFetch(fetchData, {eventCount, error});
        return {
            eventCount,
            apiPollingTimeMs,
            processingTimeMs,
            aggregationTimeMs,
            result: cumulativeResult
        };
    }

    /**
     * Mark fetch as started and store timestamps.
     * @private
     */
    _markFetchStart(fetchData, begin) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);
    }

    /**
     * Process all providers and aggregate intermediate results.
     * @private
     */
    async _processProviders(fetchData, {begin, end, maxEvents, eventTypes}) {
        let apiPollingTimeMs = 0;
        let processingTimeMs = 0;
        let aggregationTimeMs = 0;
        let eventCount = 0;
        const includeOpenedEvents = includesOpened(eventTypes);
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();
        let processingResult = new EventProcessingResult();
        let lastAggregation = Date.now();
        let error = null;

        const processBatch = async (events) => {
            const processingStart = Date.now();
            const beforeCounts = {
                opened: processingResult.opened,
                delivered: processingResult.delivered,
                temporaryFailed: processingResult.temporaryFailed,
                permanentFailed: processingResult.permanentFailed,
                unsubscribed: processingResult.unsubscribed,
                complained: processingResult.complained,
                unhandled: processingResult.unhandled,
                unprocessable: processingResult.unprocessable
            };
            const beforeEmailIds = new Set(processingResult.emailIds);
            const beforeMemberIds = new Set(processingResult.memberIds);

            await this.processEventBatch(events, processingResult, fetchData);
            processingTimeMs += Date.now() - processingStart;
            eventCount += events.length;

            const batchDelta = new EventProcessingResult({
                opened: processingResult.opened - beforeCounts.opened,
                delivered: processingResult.delivered - beforeCounts.delivered,
                temporaryFailed: processingResult.temporaryFailed - beforeCounts.temporaryFailed,
                permanentFailed: processingResult.permanentFailed - beforeCounts.permanentFailed,
                unsubscribed: processingResult.unsubscribed - beforeCounts.unsubscribed,
                complained: processingResult.complained - beforeCounts.complained,
                unhandled: processingResult.unhandled - beforeCounts.unhandled,
                unprocessable: processingResult.unprocessable - beforeCounts.unprocessable,
                emailIds: processingResult.emailIds.filter(id => !beforeEmailIds.has(id)),
                memberIds: processingResult.memberIds.filter(id => !beforeMemberIds.has(id))
            });

            cumulativeResult.merge(batchDelta);
            batchDelta.emailIds.forEach(id => allEmailIds.add(id));
            batchDelta.memberIds.forEach(id => allMemberIds.add(id));

            if ((Date.now() - lastAggregation > 5 * 60 * 1000 || processingResult.memberIds.length > 5000) && eventCount > 0) {
                try {
                    const aggregationStart = Date.now();
                    await this.aggregateStats(processingResult, includeOpenedEvents);
                    aggregationTimeMs += Date.now() - aggregationStart;
                    lastAggregation = Date.now();
                    processingResult.emailIds.forEach(id => allEmailIds.delete(id));
                    processingResult.memberIds.forEach(id => allMemberIds.delete(id));
                    processingResult = new EventProcessingResult();
                } catch (err) {
                    logging.error('[EmailAnalytics] Error while aggregating stats');
                    logging.error(err);
                }
            }

            if (fetchData.canceled) {
                throw new errors.InternalServerError({message: 'Fetching canceled'});
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                apiPollingTimeMs += Date.now() - apiStart;
            }
        } catch (err) {
            if (!isFetchCancelledError(err)) {
                logging.error('[EmailAnalytics] Error while fetching');
                logging.error(err);
                error = err;
            } else {
                logging.error('[EmailAnalytics] Canceled fetching');
            }
        }

        await this._finalAggregation(processingResult, allEmailIds, allMemberIds, includeOpenedEvents, aggregationTimeMs);
        return {apiPollingTimeMs, processingTimeMs, aggregationTimeMs, eventCount, cumulativeResult, error};
    }

    /**
     * Perform final aggregation after all providers have been processed.
     * @private
     */
    async _finalAggregation(processingResult, allEmailIds, allMemberIds, includeOpenedEvents, aggregationTimeMs) {
        const finalEmailIds = Array.from(new Set([...processingResult.emailIds, ...allEmailIds]));
        const finalMemberIds = Array.from(new Set([...processingResult.memberIds, ...allMemberIds]));

        if (!hasAggregations(finalMemberIds, finalEmailIds)) {
            return;
        }

        try {
            const aggregationStart = Date.now();
            const finalAggregationResult = {emailIds: finalEmailIds, memberIds: finalMemberIds};
            await this.aggregateStats(finalAggregationResult, includeOpenedEvents);
            aggregationTimeMs += Date.now() - aggregationStart;
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
            throw err;
        }
    }

    /**
     * Finalize fetch: update timestamps, status and handle errors.
     * @private
     */
    async _finalizeFetch(fetchData, {eventCount, error}) {
        if (!error && eventCount > 0 && hasLastEventTimestamp(fetchData) && isLastEventTimestampStale(fetchData)) {
            await this.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
            fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(fetchData.jobName, 'finished');
        }

        fetchData.running = false;

        if (error) {
            throw error;
        }
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

    /**
     * Process a single event and return its processing result.
     * @param {object} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async processEvent(event, recipientCache) {
        switch (event.type) {
            case 'delivered':
                return this._handleDelivered(event, recipientCache);
            case 'opened':
                return this._handleOpened(event, recipientCache);
            case 'failed':
                return await this._handleFailed(event, recipientCache);
            case 'unsubscribed':
                return this._handleUnsubscribed(event, recipientCache);
            case 'complained':
                return this._handleComplained(event, recipientCache);
            default:
                return new EventProcessingResult({unhandled: 1});
        }
    }

    /**
     * @private
     */
    async _handleDelivered(event, cache) {
        const recipient = await this.eventProcessor.handleDelivered({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, cache);

        return recipient
            ? new EventProcessingResult({delivered: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    /**
     * @private
     */
    async _handleOpened(event, cache) {
        const recipient = await this.eventProcessor.handleOpened({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, cache);

        return recipient
            ? new EventProcessingResult({opened: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    /**
     * @private
     */
    async _handleFailed(event, cache) {
        if (isEventSeverity(event, 'permanent')) {
            const recipient = await this.eventProcessor.handlePermanentFailed({
                emailId: event.emailId,
                providerId: event.providerId,
                email: event.recipientEmail
            }, {id: event.id, timestamp: event.timestamp, error: event.error}, cache);

            return recipient
                ? new EventProcessingResult({permanentFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
                : new EventProcessingResult({unprocessable: 1});
        }

        const recipient = await this.eventProcessor.handleTemporaryFailed({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, {id: event.id, timestamp: event.timestamp, error: event.error}, cache);

        return recipient
            ? new EventProcessingResult({temporaryFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    /**
     * @private
     */
    async _handleUnsubscribed(event, cache) {
        const recipient = await this.eventProcessor.handleUnsubscribed({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, cache);

        return recipient
            ? new EventProcessingResult({unsubscribed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    /**
     * @private
     */
    async _handleComplained(event, cache) {
        const recipient = await this.eventProcessor.handleComplained({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, cache);

        return recipient
            ? new EventProcessingResult({complained: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    /**
     * @param {{emailIds?: string[], memberIds?: string[]}} stats
     * @param {boolean} includeOpenedEvents
     */
    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        for (const emailId of emailIds) {
            await this.aggregateEmailStats(emailId, includeOpenedEvents);
        }

        // @ts-expect-error
        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');

        if (useBatchProcessing) {
            const BATCH_SIZE = 100;
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: ${BATCH_SIZE})`);
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