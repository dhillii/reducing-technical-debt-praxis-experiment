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
 * Email analytics service
 */
module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    /** @type {FetchData} */
    #fetchLatestNonOpenedData = {
        running: false,
        jobName: 'email-analytics-latest-others'
    };

    /** @type {FetchData} */
    #fetchMissingData = {
        running: false,
        jobName: 'email-analytics-missing'
    };

    /** @type {FetchData} */
    #fetchLatestOpenedData = {
        running: false,
        jobName: 'email-analytics-latest-opened'
    };

    /** @type {FetchDataScheduled} */
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
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp ??
            (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName, ['delivered', 'failed'])) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last opened event we processed. Defaults to now minus 30 minutes if we have no data yet.
     */
    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp ??
            (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName, ['opened'])) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last missing event we processed. Defaults to now minus 2h if we have no data yet.
     */
    async getLastMissingEventTimestamp() {
        return this.#fetchMissingData?.lastEventTimestamp ??
            (await this.queries.getLastJobRunTimestamp(this.#fetchMissingData.jobName)) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    /**
     * Fetches the latest opened events.
     * @param {Object} options
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (this.#isEndBeforeBegin(end, begin)) {
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    /**
     * Fetches the latest non-opened events.
     * @param {Object} options
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (this.#isEndBeforeBegin(end, begin)) {
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestNonOpenedData, {
            begin,
            end,
            maxEvents,
            eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']
        });
    }

    /**
     * Fetches events that are older than 30 minutes, because then the 'storage' of the Mailgun API is stable.
     * @param {Object} options
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();

        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
            )
        );

        if (this.#isEndBeforeBegin(end, begin)) {
            logging.info('[EmailAnalytics] Skipping fetchMissing because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    /**
     * Schedule a new fetch for email analytics events.
     * @param {Object} options
     * @param {Date} options.begin
     * @param {Date} options.end
     * @throws {errors.ValidationError}
     */
    schedule({begin, end}) {
        if (this.#fetchScheduledData?.running) {
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

    /**
     * Cancels the scheduled fetch of email analytics events.
     */
    cancelScheduled() {
        if (!this.#fetchScheduledData) {
            return;
        }
        if (this.#fetchScheduledData.running) {
            this.#fetchScheduledData.canceled = true;
            return;
        }
        this.#resetScheduledData();
    }

    /**
     * Continues fetching the scheduled events (does not start one). Resets the scheduled event when received 0 events.
     * @param {Object} [options]
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData?.schedule) {
            return createEmptyResult();
        }

        if (this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = null;
            return createEmptyResult();
        }

        let {begin, end} = this.#fetchScheduledData.schedule;

        if (this.#fetchScheduledData.lastEventTimestamp && this.#fetchScheduledData.lastEventTimestamp > begin) {
            begin = this.#fetchScheduledData.lastEventTimestamp;
        }

        if (this.#isEndBeforeBegin(end, begin)) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#resetScheduledData();
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#resetScheduledData();
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    /**
     * Core event fetching logic.
     * @private
     * @param {FetchData} fetchData
     * @param {object} options
     * @param {Date} options.begin
     * @param {Date} options.end
     * @param {number} [options.maxEvents=Infinity]
     * @param {EmailAnalyticsEvent[]} [options.eventTypes]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        this.#startFetch(fetchData, begin);
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        // State containers
        let apiPollingTimeMs = 0;
        let processingTimeMs = 0;
        let aggregationTimeMs = 0;
        let lastAggregation = Date.now();
        let eventCount = 0;
        const processingResult = new EventProcessingResult();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();
        let error = null;

        const processBatch = async (events) => {
            const batchMetrics = await this.#processBatch(
                events,
                fetchData,
                includeOpenedEvents,
                {
                    processingResult,
                    cumulativeResult,
                    allEmailIds,
                    allMemberIds,
                    processingTimeMs,
                    aggregationTimeMs,
                    lastAggregation,
                    eventCount
                }
            );
            // unpack updated metrics
            ({
                processingTimeMs,
                aggregationTimeMs,
                lastAggregation,
                eventCount
            } = batchMetrics);
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                apiPollingTimeMs += Date.now() - apiStart;
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

        await this.#finalAggregation(
            processingResult,
            cumulativeResult,
            allEmailIds,
            allMemberIds,
            includeOpenedEvents,
            aggregationTimeMs
        );

        await this.#finalizeFetchTimestamps(fetchData, error, eventCount);
        fetchData.running = false;

        if (error) {
            throw error;
        }

        return {
            eventCount,
            apiPollingTimeMs,
            processingTimeMs,
            aggregationTimeMs,
            result: cumulativeResult
        };
    }

    /**
     * Starts a fetch operation and records its state.
     * @private
     * @param {FetchData} fetchData
     * @param {Date} begin
     */
    #startFetch(fetchData, begin) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);
    }

    /**
     * Determines whether the end date is before or equal to the begin date.
     * @private
     * @param {Date} end
     * @param {Date} begin
     * @returns {boolean}
     */
    #isEndBeforeBegin(end, begin) {
        return end <= begin;
    }

    /**
     * Resets scheduled fetch data to its idle state.
     * @private
     */
    #resetScheduledData() {
        this.#fetchScheduledData = {
            running: false,
            jobName: 'email-analytics-scheduled'
        };
    }

    /**
     * Processes a batch of events and updates metrics.
     * @private
     * @param {Array<Object>} events
     * @param {FetchData} fetchData
     * @param {boolean} includeOpenedEvents
     * @param {object} state
     * @param {EventProcessingResult} state.processingResult
     * @param {EventProcessingResult} state.cumulativeResult
     * @param {Set<string>} state.allEmailIds
     * @param {Set<string>} state.allMemberIds
     * @param {number} state.processingTimeMs
     * @param {number} state.aggregationTimeMs
     * @param {number} state.lastAggregation
     * @param {number} state.eventCount
     * @returns {Promise<object>} Updated state values
     */
    async #processBatch(events, fetchData, includeOpenedEvents, state) {
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

        await this.processEventBatch(events, state.processingResult, fetchData);
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

        if (this.#shouldAggregateNow(state.processingResult, state.lastAggregation, state.eventCount)) {
            try {
                const aggStart = Date.now();
                await this.aggregateStats(state.processingResult, includeOpenedEvents);
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

        return {
            processingTimeMs: state.processingTimeMs,
            aggregationTimeMs: state.aggregationTimeMs,
            lastAggregation: state.lastAggregation,
            eventCount: state.eventCount
        };
    }

    /**
     * Determines whether an aggregation should be performed now.
     * @private
     * @param {EventProcessingResult} processingResult
     * @param {number} lastAggregation
     * @param {number} eventCount
     * @returns {boolean}
     */
    #shouldAggregateNow(processingResult, lastAggregation, eventCount) {
        const timeExceeded = Date.now() - lastAggregation > 5 * 60 * 1000;
        const memberCountExceeded = processingResult.memberIds.length > 5000;
        return (timeExceeded || memberCountExceeded) && eventCount > 0;
    }

    /**
     * Performs final aggregation after all providers have been processed.
     * @private
     * @param {EventProcessingResult} processingResult
     * @param {EventProcessingResult} cumulativeResult
     * @param {Set<string>} allEmailIds
     * @param {Set<string>} allMemberIds
     * @param {boolean} includeOpenedEvents
     * @param {number} aggregationTimeMs
     */
    async #finalAggregation(processingResult, cumulativeResult, allEmailIds, allMemberIds, includeOpenedEvents, aggregationTimeMs) {
        const finalEmailIds = Array.from(new Set([...processingResult.emailIds, ...allEmailIds]));
        const finalMemberIds = Array.from(new Set([...processingResult.memberIds, ...allMemberIds]));

        if (finalMemberIds.length === 0 && finalEmailIds.length === 0) {
            return;
        }

        try {
            const aggStart = Date.now();
            const finalAggregationResult = {
                emailIds: finalEmailIds,
                memberIds: finalMemberIds
            };
            await this.aggregateStats(finalAggregationResult, includeOpenedEvents);
            aggregationTimeMs += Date.now() - aggStart;
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
        }
    }

    /**
     * Finalizes timestamps and job status after fetching.
     * @private
     * @param {FetchData} fetchData
     * @param {Error|null} error
     * @param {number} eventCount
     */
    async #finalizeFetchTimestamps(fetchData, error, eventCount) {
        if (!error && eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
            fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(fetchData.jobName, 'finished');
        }
    }

    /**
     * Process a batch of email analytics events.
     * @param {any[]} events
     * @param {Object} result
     * @param {FetchData} fetchData
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
     * Process a single email analytics event.
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async processEvent(event, recipientCache) {
        if (event.type === 'delivered') {
            return await this.#handleDelivered(event, recipientCache);
        }
        if (event.type === 'opened') {
            return await this.#handleOpened(event, recipientCache);
        }
        if (event.type === 'failed') {
            return await this.#handleFailed(event, recipientCache);
        }
        if (event.type === 'unsubscribed') {
            return await this.#handleUnsubscribed(event, recipientCache);
        }
        if (event.type === 'complained') {
            return await this.#handleComplained(event, recipientCache);
        }
        return new EventProcessingResult({unhandled: 1});
    }

    /**
     * Handles a delivered event.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleDelivered(event, recipientCache) {
        const recipient = await this.eventProcessor.handleDelivered({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

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
     * Handles an opened event.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleOpened(event, recipientCache) {
        const recipient = await this.eventProcessor.handleOpened({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

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
     * Handles a failed event, delegating to permanent or temporary handlers.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleFailed(event, recipientCache) {
        if (event.severity === 'permanent') {
            return await this.#handlePermanentFailed(event, recipientCache);
        }
        return await this.#handleTemporaryFailed(event, recipientCache);
    }

    /**
     * Handles a permanent failed event.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handlePermanentFailed(event, recipientCache) {
        const recipient = await this.eventProcessor.handlePermanentFailed({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                permanentFailed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles a temporary failed event.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleTemporaryFailed(event, recipientCache) {
        const recipient = await this.eventProcessor.handleTemporaryFailed({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                temporaryFailed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles an unsubscribed event.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleUnsubscribed(event, recipientCache) {
        const recipient = await this.eventProcessor.handleUnsubscribed({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

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
     * Handles a complained event.
     * @private
     * @param {any} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleComplained(event, recipientCache) {
        const recipient = await this.eventProcessor.handleComplained({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

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
     * Aggregates stats for given email and member IDs.
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

    /**
     * Aggregate email stats for a given email ID.
     * @param {string} emailId
     * @param {boolean} includeOpenedEvents
     * @returns {Promise<void>}
     */
    async aggregateEmailStats(emailId, includeOpenedEvents) {
        return this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
    }

    /**
     * Aggregate member stats for a given member ID.
     * @param {string} memberId
     * @returns {Promise<void>}
     */
    async aggregateMemberStats(memberId) {
        return this.queries.aggregateMemberStats(memberId);
    }

    /**
     * Aggregate member stats for multiple members in a batch.
     * @param {string[]} memberIds
     * @returns {Promise<void>}
     */
    async aggregateMemberStatsBatch(memberIds) {
        return this.queries.aggregateMemberStatsBatch(memberIds);
    }
};
```