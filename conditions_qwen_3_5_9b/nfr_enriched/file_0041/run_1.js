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
        // Initialize fetch state
        this.#initializeFetchState(fetchData, begin);

        // Timing metrics
        const timingMetrics = this.#initializeTimingMetrics();
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        // Processing state
        const processingState = this.#initializeProcessingState();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();

        // Process events from all providers
        const fetchResult = await this.#fetchFromProviders(fetchData, begin, end, maxEvents, eventTypes, processingState, cumulativeResult, allEmailIds, allMemberIds, includeOpenedEvents, timingMetrics);

        // Perform final aggregation
        await this.#performFinalAggregation(fetchData, processingState, cumulativeResult, allEmailIds, allMemberIds, includeOpenedEvents, timingMetrics);

        // Update job status
        await this.#updateJobStatus(fetchData);

        return fetchResult;
    }

    /**
     * Initialize fetch state for a fetch operation
     * @param {FetchData} fetchData - Object to store the progress of the fetch operation
     * @param {Date} begin - Start date for fetching events
     */
    #initializeFetchState(fetchData, begin) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);
    }

    /**
     * Initialize timing metrics for a fetch operation
     * @returns {object} Timing metrics object
     */
    #initializeTimingMetrics() {
        return {
            apiPollingTimeMs: 0,
            processingTimeMs: 0,
            aggregationTimeMs: 0,
            lastAggregation: Date.now()
        };
    }

    /**
     * Initialize processing state for a fetch operation
     * @returns {object} Processing state object
     */
    #initializeProcessingState() {
        return {
            eventCount: 0,
            processingResult: new EventProcessingResult(),
            error: null
        };
    }

    /**
     * Fetch events from all providers
     * @param {FetchData} fetchData - Object to store the progress of the fetch operation
     * @param {Date} begin - Start date for fetching events
     * @param {Date} end - End date for fetching events
     * @param {number} maxEvents - Maximum number of events to fetch
     * @param {EmailAnalyticsEvent[]} eventTypes - Array of event types to fetch
     * @param {object} processingState - Processing state object
     * @param {EventProcessingResult} cumulativeResult - Cumulative result object
     * @param {Set} allEmailIds - Set of all email IDs
     * @param {Set} allMemberIds - Set of all member IDs
     * @param {boolean} includeOpenedEvents - Whether to include opened events
     * @param {object} timingMetrics - Timing metrics object
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async #fetchFromProviders(fetchData, begin, end, maxEvents, eventTypes, processingState, cumulativeResult, allEmailIds, allMemberIds, includeOpenedEvents, timingMetrics) {
        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(this.#processBatch.bind(this), {begin, end, maxEvents, events: eventTypes});
                timingMetrics.apiPollingTimeMs += (Date.now() - apiStart);
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

        return {
            eventCount: processingState.eventCount,
            apiPollingTimeMs: timingMetrics.apiPollingTimeMs,
            processingTimeMs: timingMetrics.processingTimeMs,
            aggregationTimeMs: timingMetrics.aggregationTimeMs,
            result: cumulativeResult
        };
    }

    /**
     * Process a batch of events
     * @param {Array<Object>} events - Array of event objects to process
     * @param {FetchData} fetchData - Object to store the progress of the fetch operation
     * @param {object} processingState - Processing state object
     * @param {EventProcessingResult} cumulativeResult - Cumulative result object
     * @param {Set} allEmailIds - Set of all email IDs
     * @param {Set} allMemberIds - Set of all member IDs
     * @param {boolean} includeOpenedEvents - Whether to include opened events
     * @param {object} timingMetrics - Timing metrics object
     * @returns {Promise<void>}
     */
    async #processBatch(events, fetchData, processingState, cumulativeResult, allEmailIds, allMemberIds, includeOpenedEvents, timingMetrics) {
        const processingStart = Date.now();
        const beforeCounts = this.#getBeforeCounts(processingState.processingResult);
        const beforeEmailIds = new Set(processingState.processingResult.emailIds);
        const beforeMemberIds = new Set(processingState.processingResult.memberIds);

        await this.processEventBatch(events, processingState.processingResult, fetchData);
        timingMetrics.processingTimeMs += (Date.now() - processingStart);
        processingState.eventCount += events.length;

        // Calculate delta and accumulate for final reporting
        const batchDelta = this.#calculateBatchDelta(processingState.processingResult, beforeCounts);
        cumulativeResult.merge(batchDelta);
        batchDelta.emailIds.forEach(id => allEmailIds.add(id));
        batchDelta.memberIds.forEach(id => allMemberIds.add(id));

        // Perform aggregation if needed
        if ((Date.now() - timingMetrics.lastAggregation > 5 * 60 * 1000 || processingState.processingResult.memberIds.length > 5000) && processingState.eventCount > 0) {
            await this.#performAggregation(processingState.processingResult, includeOpenedEvents, timingMetrics);
            processingState.processingResult.emailIds.forEach(id => allEmailIds.delete(id));
            processingState.processingResult.memberIds.forEach(id => allMemberIds.delete(id));
            processingState.processingResult = new EventProcessingResult();
        }

        if (fetchData.canceled) {
            throw new errors.InternalServerError({
                message: 'Fetching canceled'
            });
        }
    }

    /**
     * Get counts before processing
     * @param {EventProcessingResult} result - Event processing result
     * @returns {object} Counts object
     */
    #getBeforeCounts(result) {
        return {
            opened: result.opened,
            delivered: result.delivered,
            temporaryFailed: result.temporaryFailed,
            permanentFailed: result.permanentFailed,
            unsubscribed: result.unsubscribed,
            complained: result.complained,
            unhandled: result.unhandled,
            unprocessable: result.unprocessable
        };
    }

    /**
     * Calculate batch delta
     * @param {EventProcessingResult} result - Event processing result
     * @param {object} beforeCounts - Counts before processing
     * @returns {EventProcessingResult} Batch delta
     */
    #calculateBatchDelta(result, beforeCounts) {
        return new EventProcessingResult({
            opened: result.opened - beforeCounts.opened,
            delivered: result.delivered - beforeCounts.delivered,
            temporaryFailed: result.temporaryFailed - beforeCounts.temporaryFailed,
            permanentFailed: result.permanentFailed - beforeCounts.permanentFailed,
            unsubscribed: result.unsubscribed - beforeCounts.unsubscribed,
            complained: result.complained - beforeCounts.complained,
            unhandled: result.unhandled - beforeCounts.unhandled,
            unprocessable: result.unprocessable - beforeCounts.unprocessable,
            emailIds: result.emailIds.filter(id => !new Set(beforeCounts.emailIds).has(id)),
            memberIds: result.memberIds.filter(id => !new Set(beforeCounts.memberIds).has(id))
        });
    }

    /**
     * Perform aggregation
     * @param {EventProcessingResult} processingResult - Processing result
     * @param {boolean} includeOpenedEvents - Whether to include opened events
     * @param {object} timingMetrics - Timing metrics object
     */
    async #performAggregation(processingResult, includeOpenedEvents, timingMetrics) {
        try {
            const aggregationStart = Date.now();
            await this.aggregateStats(processingResult, includeOpenedEvents);
            timingMetrics.aggregationTimeMs += (Date.now() - aggregationStart);
            timingMetrics.lastAggregation = Date.now();
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
        }
    }

    /**
     * Update job status
     * @param {FetchData} fetchData - Object to store the progress of the fetch operation
     */
    async #updateJobStatus(fetchData) {
        // Small trick: if reached the end of new events, we are going to keep
        // fetching the same events because 'begin' won't change
        // So if we didn't have errors while fetching, and total events < maxEvents, increase lastEventTimestamp with one second
        if (!fetchData.error && fetchData.eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            // set the data on the db so we can store it for fetching after reboot
            await this.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
            // increment and store in local memory
            fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            // set job status to finished
            await this.queries.setJobStatus(fetchData.jobName, 'finished');
        }

        fetchData.running = false;
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
            // Batched mode: pre-fetch all recipients, then process events using cache
            const emailIdentifications = events.map(event => ({
                emailId: event.emailId,
                providerId: event.providerId,
                email: event.recipientEmail
            }));

            const recipientCache = await this.eventProcessor.batchGetRecipients(emailIdentifications);

            for (const event of events) {
                const batchResult = await this.processEvent(event, recipientCache);

                // Save last event timestamp
                if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                    fetchData.lastEventTimestamp = event.timestamp;
                }

                result.merge(batchResult);
            }

            // Flush all batched updates to the database
            await this.eventProcessor.flushBatchedUpdates();
        } else {
            // Sequential mode: process events one by one (original behavior)
            for (const event of events) {
                const batchResult = await this.processEvent(event);

                // Save last event timestamp
                if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                    fetchData.lastEventTimestamp = event.timestamp;
                }

                result.merge(batchResult);
            }
        }
    }

    /**
     * Process a single email analytics event
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async processEvent(event, recipientCache) {
        switch (event.type) {
            case 'delivered':
                return this.#processDeliveredEvent(event, recipientCache);
            case 'opened':
                return this.#processOpenedEvent(event, recipientCache);
            case 'failed':
                return this.#processFailedEvent(event, recipientCache);
            case 'unsubscribed':
                return this.#processUnsubscribedEvent(event, recipientCache);
            case 'complained':
                return this.#processComplainedEvent(event, recipientCache);
            default:
                return new EventProcessingResult({unhandled: 1});
        }
    }

    /**
     * Process a delivered event
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async #processDeliveredEvent(event, recipientCache) {
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
     * Process an opened event
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async #processOpenedEvent(event, recipientCache) {
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
     * Process a failed event
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async #processFailedEvent(event, recipientCache) {
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
     * Process an unsubscribed event
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async #processUnsubscribedEvent(event, recipientCache) {
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
     * Process a complained event
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async #processComplainedEvent(event, recipientCache) {
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
     * Perform final aggregation
     * @param {FetchData} fetchData - Object to store the progress of the fetch operation
     * @param {object} processingState - Processing state object
     * @param {EventProcessingResult} cumulativeResult - Cumulative result object
     * @param {Set} allEmailIds - Set of all email IDs
     * @param {Set} allMemberIds - Set of all member IDs
     * @param {boolean} includeOpenedEvents - Whether to include opened events
     * @param {object} timingMetrics - Timing metrics object
     */
    async #performFinalAggregation(fetchData, processingState, cumulativeResult, allEmailIds, allMemberIds, includeOpenedEvents, timingMetrics) {
        const finalEmailIds = Array.from(new Set([...processingState.processingResult.emailIds, ...allEmailIds]));
        const finalMemberIds = Array.from(new Set([...processingState.processingResult.memberIds, ...allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggregationStart = Date.now();
                // Create a result object with all emailIds and memberIds for final aggregation
                const finalAggregationResult = {
                    emailIds: finalEmailIds,
                    memberIds: finalMemberIds
                };
                await this.aggregateStats(finalAggregationResult, includeOpenedEvents);
                timingMetrics.aggregationTimeMs += (Date.now() - aggregationStart);
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);

                if (!processingState.error) {
                    processingState.error = err;
                }
            }
        }
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
            // Batched mode: process 100 members at a time
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: 100)`);
            const BATCH_SIZE = 100;
            for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
                const batch = memberIds.slice(i, i + BATCH_SIZE);
                await this.aggregateMemberStatsBatch(batch);
                memberMetric?.inc(batch.length);
            }
        } else {
            // Sequential mode: process one member at a time
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using SEQUENTIAL mode`);
            for (const memberId of memberIds) {
                await this.aggregateMemberStats(memberId);
                memberMetric?.inc();
            }
        }
    }
};