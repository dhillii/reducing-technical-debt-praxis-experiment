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
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS); // Always stop at x minutes ago to give Mailgun a bit more time to stabilize storage

        if (end <= begin) {
            // Skip for now
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
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
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS); // Always stop at x minutes ago to give Mailgun a bit more time to stabilize storage

        if (end <= begin) {
            // Skip for now
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestNonOpenedData, {begin, end, maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    /**
     * Fetches events that are older than 30 minutes, because then the 'storage' of the Mailgun API is stable. And we are sure we don't miss any events.
     * @param {object} options
     * @param {number} [options.maxEvents] Not a strict maximum. We stop fetching after we reached the maximum AND received at least one event after begin (not equal) to prevent deadlocks.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();

        // Always stop at the earlier of the time the fetchLatest started fetching on or 30 minutes ago
        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now() // Fallback to now if the previous job didn't run, for whatever reason, prevents catastrophic error
            )
        );

        if (end <= begin) {
            // Skip for now
            logging.info('[EmailAnalytics] Skipping fetchMissing because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    /**
     * Schedule a new fetch for email analytics events.
     * @param {Object} options - The options for scheduling the fetch.
     * @param {Date} options.begin - The start date for the scheduled fetch.
     * @param {Date} options.end - The end date for the scheduled fetch.
     * @throws {errors.ValidationError} Throws an error if a fetch is already in progress.
     */
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
            schedule: {
                begin,
                end
            }
        };
    }

    /**
     * Cancels the scheduled fetch of email analytics events.
     * If a fetch is currently running, it marks it for cancellation.
     * If no fetch is running, it clears the scheduled fetch data.
     * @method cancelScheduled
     */
    cancelScheduled() {
        if (this.#fetchScheduledData) {
            if (this.#fetchScheduledData.running) {
                // Cancel the running fetch
                this.#fetchScheduledData.canceled = true;
            } else {
                this.#fetchScheduledData = {
                    running: false,
                    jobName: 'email-analytics-scheduled'
                };
            }
        }
    }

    /**
     * Continues fetching the scheduled events (does not start one). Resets the scheduled event when received 0 events.
     * @method fetchScheduled
     * @param {Object} [options] - The options for fetching scheduled events.
     * @param {number} [options.maxEvents=Infinity] - The maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData || !this.#fetchScheduledData.schedule) {
            // Nothing scheduled
            return createEmptyResult();
        }

        if (this.#fetchScheduledData.canceled) {
            // Skip for now
            this.#fetchScheduledData = null;
            return createEmptyResult();
        }

        let begin = this.#fetchScheduledData.schedule.begin;
        const end = this.#fetchScheduledData.schedule.end;

        if (this.#fetchScheduledData.lastEventTimestamp && this.#fetchScheduledData.lastEventTimestamp > begin) {
            // Continue where we left of
            begin = this.#fetchScheduledData.lastEventTimestamp;
        }

        if (end <= begin) {
            // Skip for now
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            // Reset the scheduled fetch
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    /**
     * Determines if the fetch should be skipped based on time boundaries
     * @param {Date} begin - The start timestamp for fetching
     * @param {Date} end - The end timestamp for fetching
     * @returns {boolean} True if fetch should be skipped
     */
    #shouldSkipFetch(begin, end) {
        return end <= begin;
    }

    /**
     * Determines if the fetch data has a schedule
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if schedule exists
     */
    #hasSchedule(fetchData) {
        return fetchData && fetchData.schedule;
    }

    /**
     * Determines if the fetch data is canceled
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if fetch is canceled
     */
    #isCanceled(fetchData) {
        return fetchData && fetchData.canceled;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is greater than begin
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @param {Date} begin - The begin timestamp
     * @returns {boolean} True if last event timestamp is greater
     */
    #isLastEventAfterBegin(lastEventTimestamp, begin) {
        return lastEventTimestamp && lastEventTimestamp > begin;
    }

    /**
     * Determines if the fetch result has zero events
     * @param {EmailAnalyticsFetchResult} fetchResult - The fetch result
     * @returns {boolean} True if event count is zero
     */
    #hasZeroEvents(fetchResult) {
        return fetchResult.eventCount === 0;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if there is an error
     * @param {Error} error - The error object
     * @returns {boolean} True if error exists
     */
    #hasError(error) {
        return error !== null;
    }

    /**
     * Determines if the error message is not 'Fetching canceled'
     * @param {Error} error - The error object
     * @returns {boolean} True if error message is not 'Fetching canceled'
     */
    #isNotCanceledError(error) {
        return error && error.message !== 'Fetching canceled';
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {Date} lastEventTimestamp - The last event timestamp
     * @returns {boolean} True if timestamp is older than 2 seconds
     */
    #isLastEventOldEnough(lastEventTimestamp) {
        return lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
    }

    /**
     * Determines if the fetch data has a last event timestamp
     * @param {FetchData} fetchData - The fetch data object
     * @returns {boolean} True if last event timestamp exists
     */
    #hasLastEventTimestamp(fetchData) {
        return fetchData && fetchData.lastEventTimestamp;
    }

    /**
     * Determines if the last event timestamp is older than 2 seconds ago
     * @param {