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
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName, ['delivered', 'failed'])) ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last opened event we processed. Defaults to now minus 30 minutes if we have no data yet.
     */
    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName, ['opened'])) ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
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

        if (!this.#shouldFetchEvents(begin, end)) {
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
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (!this.#shouldFetchEvents(begin, end)) {
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
        const end = this.#calculateFetchEnd();

        if (!this.#shouldFetchEvents(begin, end)) {
            logging.info('[EmailAnalytics] Skipping fetchMissing because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    /**
     * Calculate the end time for fetchMissing operation
     * @returns {Date}
     */
    #calculateFetchEnd() {
        return new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
            )
        );
    }

    /**
     * Check if events should be fetched based on begin and end timestamps
     * @param {Date} begin - Start timestamp
     * @param {Date} end - End timestamp
     * @returns {boolean}
     */
    #shouldFetchEvents(begin, end) {
        return end > begin;
    }

    /**
     * Schedule a new fetch for email analytics events.
     * @param {Object} options - The options for scheduling the fetch.
     * @param {Date} options.begin - The start date for the scheduled fetch.
     * @param {Date} options.end - The end date for the scheduled fetch.
     * @throws {errors.ValidationError} Throws an error if a fetch is already in progress.
     */
    schedule({begin, end}) {
        if (this.#isScheduledFetchRunning()) {
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
     * Check if a scheduled fetch is currently running
     * @returns {boolean}
     */
    #isScheduledFetchRunning() {
        return this.#fetchScheduledData && this.#fetchScheduledData.running;
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
        if (!this.#hasScheduledFetch()) {
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

        if (!this.#shouldFetchEvents(begin, end)) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    /**
     * Check if a scheduled fetch exists
     * @returns {boolean}
     */
    #hasScheduledFetch() {
        return this.#fetchScheduledData && this.#fetchScheduledData.schedule;
    }

    /**
     * Start fetching analytics and store the data of the progress inside fetchData
     * @param {FetchData} fetchData - Object to store the progress of the fetch operation
     * @param {object} options - Options for fetching events
     * @param {Date} options.begin - Start date for fetching events
     * @param {Date} options.end - End date for fetching events
     * @param {number} [options.maxEvents=Infinity] - Maximum number of events to fetch. Not a strict maximum. We stop fetching after we reached the maximum AND received at least one event after begin (not equal) to prevent deadlocks.
     * @param {EmailAnalyticsEvent[]} [options.eventTypes] - Array of event types to fetch. If not provided, Mailgun will return all event types.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const apiPollingTimeMs = this.#measureTime(() => this.#pollAllProviders(fetchData, begin, end, maxEvents, eventTypes));
        const processingTimeMs = this.#measureTime(() => this.#processAllEvents(fetchData));
        const aggregationTimeMs = this.#measureTime(() => this.#aggregateAllStats(fetchData));

        return {
            eventCount: processingTimeMs.eventCount,
            apiPollingTimeMs,
            processingTimeMs,
            aggregationTimeMs,
            result: processingTimeMs.result
        };
    }

    /**
     * Measure time for an async operation
     * @param {Function} operation - Async operation to measure
     * @returns {Promise<number>} Time in milliseconds
     */
    #measureTime(operation) {
        const start = Date.now();
        return operation().then(() => Date.now() - start);
    }

    /**
     * Poll all providers for events
     * @param {FetchData} fetchData - Fetch data object
     * @param {Date} begin - Start timestamp
     * @param {Date} end - End timestamp
     * @param {number} maxEvents - Maximum events to fetch
     * @param {EmailAnalyticsEvent[]} eventTypes - Event types to fetch
     * @returns {Promise<void>}
     */
    async #pollAllProviders(fetchData, begin, end, maxEvents, eventTypes) {
        let error = null;

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(this.#processBatch, {begin, end, maxEvents, events: eventTypes});
                // Timing already captured in parent
            }
        } catch (err) {
            if (err.message !== 'Fetching canceled') {
                logging.error('[EmailAnalytics] Error while fetching');
                logging.error(err);
                error = err;
            } else {
                logging.error('[EmailAnalytics] Canceled fetching');
            }
        }

        throw error;
    }

    /**
     * Process a batch of events
     * @param {Array<Object>} events - Array of event objects to process
     * @returns {Promise<void>}
     */
    #processBatch = async (events) => {
        const processingStart = Date.now();
        const beforeCounts = this.#getBeforeCounts();
        const beforeEmailIds = new Set(this.#fetchProcessingResult().emailIds);
        const beforeMemberIds = new Set(this.#fetchProcessingResult().memberIds);

        await this.processEventBatch(events, this.#fetchProcessingResult(), this.#fetchData());
        const processingTimeMs = Date.now() - processingStart;

        const batchDelta = this.#calculateBatchDelta(beforeCounts);
        this.#accumulateResult(batchDelta);
        this.#trackIds(batchDelta);

        if (this.#shouldAggregate()) {
            try {
                const aggregationStart = Date.now();
                await this.aggregateStats(this.#fetchProcessingResult(), this.#shouldIncludeOpenedEvents());
                const aggregationTimeMs = Date.now() - aggregationStart;
                this.#clearProcessingResult();
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
            }
        }

        if (this.#fetchData().canceled) {
            throw new errors.InternalServerError({
                message: 'Fetching canceled'
            });
        }
    };

    /**
     * Get before counts for batch delta calculation
     * @returns {object}
     */
    #getBeforeCounts() {
        return {
            opened: this.#fetchProcessingResult().opened,
            delivered: this.#fetchProcessingResult().delivered,
            temporaryFailed: this.#fetchProcessingResult().temporaryFailed,
            permanentFailed: this.#fetchProcessingResult().permanentFailed,
            unsubscribed: this.#fetchProcessingResult().unsubscribed,
            complained: this.#fetchProcessingResult().complained,
            unhandled: this.#fetchProcessingResult().unhandled,
            unprocessable: this.#fetchProcessingResult().unprocessable
        };
    }

    /**
     * Get the current processing result
     * @returns {EventProcessingResult}
     */
    #fetchProcessingResult() {
        return this.#processBatchProcessingResult;
    }

    /**
     * Get the current fetch data
     * @returns {FetchData}
     */
    #fetchData() {
        return this.#fetchEventsFetchData;
    }

    /**
     * Check if aggregation should be performed
     * @returns {boolean}
     */
    #shouldAggregate() {
        return (Date.now() - this.#lastAggregationTime() > 5 * 60 * 1000 || this.#fetchProcessingResult().memberIds.length > 5000) && this.#getEventCount() > 0;
    }

    /**
     * Get the last aggregation time
     * @returns {number}
     */
    #lastAggregationTime() {
        return this.#lastAggregation;
    }

    /**
     * Get the current event count
     * @returns {number}
     */
    #getEventCount() {
        return this.#processBatchEventCount;
    }

    /**
     * Check if opened events should be included
     * @returns {boolean}
     */
    #shouldIncludeOpenedEvents() {
        return this.#fetchEventsEventTypes?.includes('opened') ?? false;
    }

    /**
     * Clear the processing result
     * @returns {void}
     */
    #clearProcessingResult() {
        this.#processBatchProcessingResult = new EventProcessingResult();
    }

    /**
     * Accumulate the result
     * @param {EventProcessingResult} batchDelta - Batch delta to accumulate
     * @returns {void}
     */
    #accumulateResult(batchDelta) {
        this.#cumulativeResult.merge(batchDelta);
        batchDelta.emailIds.forEach(id => this.#allEmailIds.add(id));
        batchDelta.memberIds.forEach(id => this.#allMemberIds.add(id));
    }

    /**
     * Track IDs from batch delta
     * @param {EventProcessingResult} batchDelta - Batch delta to track
     * @returns {void}
     */
    #trackIds(batchDelta) {
        batchDelta.emailIds.forEach(id => this.#allEmailIds.add(id));
        batchDelta.memberIds.forEach(id => this.#allMemberIds.add(id));
    }

    /**
     * Process all events
     * @param {FetchData} fetchData - Fetch data object
     * @returns {Promise<void>}
     */
    async #processAllEvents(fetchData) {
        this.#processBatchEventCount = 0;
        this.#processBatchProcessingResult = new EventProcessingResult();
        this.#allEmailIds = new Set();
        this.#allMemberIds = new Set();
        this.#lastAggregation = Date.now();

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(this.#processBatch, {begin: fetchData.lastBegin, end: fetchData.lastBegin, maxEvents: Infinity, events: null});
                // Timing already captured in parent
            }
        } catch (err) {
            if (err.message !== 'Fetching canceled') {
                logging.error('[EmailAnalytics] Error while fetching');
                logging.error(err);
            } else {
                logging.error('[EmailAnalytics] Canceled fetching');
            }
        }

        const finalEmailIds = Array.from(new Set([...this.#fetchProcessingResult().emailIds, ...this.#allEmailIds]));
        const finalMemberIds = Array.from(new Set([...this.#fetchProcessingResult().memberIds, ...this.#allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggregationStart = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, this.#shouldIncludeOpenedEvents());
                const aggregationTimeMs = Date.now() - aggregationStart;
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
            }
        }

        if (!this.#hasError() && this.#getEventCount() > 0 && this.#fetchData().lastEventTimestamp && this.#fetchData().lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(this.#fetchData().jobName, 'finished', new Date(this.#fetchData().lastEventTimestamp.getTime()));
            this.#fetchData().lastEventTimestamp = new Date(this.#fetchData().lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(this.#fetchData().jobName, 'finished');
        }

        this.#fetchData().running = false;
    }

    /**
     * Check if there is an error
     * @returns {boolean}
     */
    #hasError() {
        return this.#processBatchError !== null;
    }

    /**
     * Aggregate all stats
     * @param {FetchData} fetchData - Fetch data object
     * @returns {Promise<void>}
     */
    async #aggregateAllStats(fetchData) {
        const finalEmailIds = Array.from(new Set([...this.#fetchProcessingResult().emailIds, ...this.#allEmailIds]));
        const finalMemberIds = Array.from(new Set([...this.#fetchProcessingResult().memberIds, ...this.#allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggregationStart = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, this.#shouldIncludeOpenedEvents());
                const aggregationTimeMs = Date.now() - aggregationStart;
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
            }
        }
    }

    /**
     * Process a batch of email analytics events.
     * @param {any[]} events - An array of email analytics events to process.
     * @param {Object} result - The result object to merge batch processing results into.
     * @param {FetchData} fetchData - Data related to the current fetch operation.
     * @returns {Promise<void>}
     */
    async processEventBatch(events, result, fetchData) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            await this.#processBatchedEvents(events, result, fetchData);
        } else {
            await this.#processSequentialEvents(events, result, fetchData);
        }
    }

    /**
     * Process events in batched mode
     * @param {any[]} events - Array of events
     * @param {Object} result - Result object
     * @param {FetchData} fetchData - Fetch data
     * @returns {Promise<void>}
     */
    async #processBatchedEvents(events, result, fetchData) {
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
    }

    /**
     * Process events in sequential mode
     * @param {any[]} events - Array of events
     * @param {Object} result - Result object
     * @param {FetchData} fetchData - Fetch data
     * @returns {Promise<void>}
     */
    async #processSequentialEvents(events, result, fetchData) {
        for (const event of events) {
            const batchResult = await this.processEvent(event);

            if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                fetchData.lastEventTimestamp = event.timestamp;
            }

            result.merge(batchResult);
        }
    }

    /**
     *
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async processEvent(event, recipientCache) {
        switch (event.type) {
            case 'delivered':
                return this.#handleDeliveredEvent(event, recipientCache);
            case 'opened':
                return this.#handleOpenedEvent(event, recipientCache);
            case 'failed':
                return this.#handleFailedEvent(event, recipientCache);
            case 'unsubscribed':
                return this.#handleUnsubscribedEvent(event, recipientCache);
            case 'complained':
                return this.#handleComplainedEvent(event, recipientCache);
            default:
                return new EventProcessingResult({unhandled: 1});
        }
    }

    /**
     * Handle delivered event
     * @param {object} event - Event object
     * @param {Map<string, any>} [recipientCache] - Optional recipient cache
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleDeliveredEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                delivered: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handle opened event
     * @param {object} event - Event object
     * @param {Map<string, any>} [recipientCache] - Optional recipient cache
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleOpenedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                opened: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handle failed event
     * @param {object} event - Event object
     * @param {Map<string, any>} [recipientCache] - Optional recipient cache
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleFailedEvent(event, recipientCache) {
        if (event.severity === 'permanent') {
            const recipient = await this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

            if (recipient) {
                return new EventProcessingResult({
                    permanentFailed: 1,
                    emailIds: [recipient.emailId],
                    memberIds: [recipient.memberId]
                });
            }

            return new EventProcessingResult({unprocessable: 1});
        } else {
            const recipient = await this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

            if (recipient) {
                return new EventProcessingResult({
                    temporaryFailed: 1,
                    emailIds: [recipient.emailId],
                    memberIds: [recipient.memberId]
                });
            }

            return new EventProcessingResult({unprocessable: 1});
        }
    }

    /**
     * Handle unsubscribed event
     * @param {object} event - Event object
     * @param {Map<string, any>} [recipientCache] - Optional recipient cache
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleUnsubscribedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                unsubscribed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handle complained event
     * @param {object} event - Event object
     * @param {Map<string, any>} [recipientCache] - Optional recipient cache
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleComplainedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                complained: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Calculate batch delta from before counts
     * @param {object} beforeCounts - Before counts object
     * @returns {EventProcessingResult}
     */
    #calculateBatchDelta(beforeCounts) {
        return new EventProcessingResult({
            opened: this.#fetchProcessingResult().opened - beforeCounts.opened,
            delivered: this.#fetchProcessingResult().delivered - beforeCounts.delivered,
            temporaryFailed: this.#fetchProcessingResult().temporaryFailed - beforeCounts.temporaryFailed,
            permanentFailed: this.#fetchProcessingResult().permanentFailed - beforeCounts.permanentFailed,
            unsubscribed: this.#fetchProcessingResult().unsubscribed - beforeCounts.unsubscribed,
            complained: this.#fetchProcessingResult().complained - beforeCounts.complained,
            unhandled: this.#fetchProcessingResult().unhandled - beforeCounts.unhandled,
            unprocessable: this.#fetchProcessingResult().unprocessable - beforeCounts.unprocessable,
            emailIds: this.#fetchProcessingResult().emailIds.filter(id => !this.#getBeforeEmailIds().has(id)),
            memberIds: this.#fetchProcessingResult().memberIds.filter(id => !this.#getBeforeMemberIds().has(id))
        });
    }

    /**
     * Get before email IDs
     * @returns {Set<string>}
     */
    #getBeforeEmailIds() {
        return this.#beforeEmailIds;
    }

    /**
     * Get before member IDs
     * @returns {Set<string>}
     */
    #getBeforeMemberIds() {
        return this.#beforeMemberIds;
    }

    /**
     * Aggregate email stats for a given email ID.
     * @param {string} emailId - The ID of the email to aggregate stats for.
     * @param {boolean} includeOpenedEvents - Whether to include opened events in the stats.
     * @returns {Promise<void>}
     */
    async aggregateEmailStats(emailId, includeOpenedEvents) {
        return this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
    }

    /**
     * Aggregate member stats for a given member ID.
     * @param {string} memberId - The ID of the member to aggregate stats for.
     * @returns {Promise<void>}
     */
    async aggregateMemberStats(memberId) {
        return this.queries.aggregateMemberStats(memberId);
    }

    /**
     * Aggregate member stats for multiple members in a batch.
     * @param {string[]} memberIds - Array of member IDs to aggregate stats for.
     * @returns {Promise<void>}
     */
    async aggregateMemberStatsBatch(memberIds) {
        return this.queries.aggregateMemberStatsBatch(memberIds);
    }

    /**
     * Aggregate stats for email and member IDs
     * @param {{emailIds?: string[], memberIds?: string[]}} stats - Stats object
     * @param {boolean} includeOpenedEvents - Whether to include opened events
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
};