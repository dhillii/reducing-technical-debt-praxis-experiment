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
 * Captures the current state of event processing results
 * @param {EventProcessingResult} processingResult
 * @returns {object}
 */
function captureResultState(processingResult) {
    return {
        opened: processingResult.opened,
        delivered: processingResult.delivered,
        temporaryFailed: processingResult.temporaryFailed,
        permanentFailed: processingResult.permanentFailed,
        unsubscribed: processingResult.unsubscribed,
        complained: processingResult.complained,
        unhandled: processingResult.unhandled,
        unprocessable: processingResult.unprocessable,
        emailIds: new Set(processingResult.emailIds),
        memberIds: new Set(processingResult.memberIds)
    };
}

/**
 * Calculates the delta between current and previous result states
 * @param {EventProcessingResult} currentResult
 * @param {object} beforeState
 * @returns {EventProcessingResult}
 */
function calculateResultDelta(currentResult, beforeState) {
    return new EventProcessingResult({
        opened: currentResult.opened - beforeState.opened,
        delivered: currentResult.delivered - beforeState.delivered,
        temporaryFailed: currentResult.temporaryFailed - beforeState.temporaryFailed,
        permanentFailed: currentResult.permanentFailed - beforeState.permanentFailed,
        unsubscribed: currentResult.unsubscribed - beforeState.unsubscribed,
        complained: currentResult.complained - beforeState.complained,
        unhandled: currentResult.unhandled - beforeState.unhandled,
        unprocessable: currentResult.unprocessable - beforeState.unprocessable,
        emailIds: currentResult.emailIds.filter(id => !beforeState.emailIds.has(id)),
        memberIds: currentResult.memberIds.filter(id => !beforeState.memberIds.has(id))
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
    return (timeSinceLastAggregation > 5 * 60 * 1000 || memberCount > 5000) && eventCount > 0;
}

/**
 * Performs intermediate aggregation and clears processing result
 * @param {EventProcessingResult} processingResult
 * @param {boolean} includeOpenedEvents
 * @param {Set} allEmailIds
 * @param {Set} allMemberIds
 * @param {object} aggregateStats
 * @returns {Promise<number>}
 */
async function performIntermediateAggregation(processingResult, includeOpenedEvents, allEmailIds, allMemberIds, aggregateStats) {
    try {
        const aggregationStart = Date.now();
        await aggregateStats(processingResult, includeOpenedEvents);
        processingResult.emailIds.forEach(id => allEmailIds.delete(id));
        processingResult.memberIds.forEach(id => allMemberIds.delete(id));
        return Date.now() - aggregationStart;
    } catch (err) {
        logging.error('[EmailAnalytics] Error while aggregating stats');
        logging.error(err);
        return 0;
    }
}

/**
 * Handles the final aggregation of remaining events
 * @param {EventProcessingResult} processingResult
 * @param {Set} allEmailIds
 * @param {Set} allMemberIds
 * @param {boolean} includeOpenedEvents
 * @param {object} aggregateStats
 * @returns {Promise<{time: number, error: Error|null}>}
 */
async function performFinalAggregation(processingResult, allEmailIds, allMemberIds, includeOpenedEvents, aggregateStats) {
    const finalEmailIds = Array.from(new Set([...processingResult.emailIds, ...allEmailIds]));
    const finalMemberIds = Array.from(new Set([...processingResult.memberIds, ...allMemberIds]));

    if (finalMemberIds.length === 0 && finalEmailIds.length === 0) {
        return {time: 0, error: null};
    }

    try {
        const aggregationStart = Date.now();
        const finalAggregationResult = {
            emailIds: finalEmailIds,
            memberIds: finalMemberIds
        };
        await aggregateStats(finalAggregationResult, includeOpenedEvents);
        return {time: Date.now() - aggregationStart, error: null};
    } catch (err) {
        logging.error('[EmailAnalytics] Error while aggregating stats');
        logging.error(err);
        return {time: 0, error: err};
    }
}

/**
 * Updates the job timestamp based on fetch completion status
 * @param {FetchData} fetchData
 * @param {boolean} hasError
 * @param {number} eventCount
 * @param {object} queries
 * @returns {Promise<void>}
 */
async function updateJobTimestamp(fetchData, hasError, eventCount, queries) {
    if (!hasError && eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
        await queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
        fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
    } else {
        await queries.setJobStatus(fetchData.jobName, 'finished');
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
     * Fetches events that are older than 30 minutes, because then the 'storage' of the Mailgun API is stable. And we are sure we don't miss any events.
     * @param {object} options
     * @param {number} [options.maxEvents] Not a strict maximum. We stop fetching after we reached the maximum AND received at least one event after begin (not equal) to prevent deadlocks.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();

        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
            )
        );

        if (!validateDateRange(begin, end, 'fetchMissing')) {
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

        if (!validateDateRange(begin, end, 'fetchScheduled')) {
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

        let apiPollingTimeMs = 0;
        let processingTimeMs = 0;
        let aggregationTimeMs = 0;

        let lastAggregation = Date.now();
        let eventCount = 0;
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        let processingResult = new EventProcessingResult();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();
        let error = null;

        /**
         * Process a batch of events
         * @param {Array<Object>} events - Array of event objects to process
         * @returns {Promise<void>}
         */
        const processBatch = async (events) => {
            const processingStart = Date.now();
            const beforeState = captureResultState(processingResult);

            await this.processEventBatch(events, processingResult, fetchData);
            processingTimeMs += (Date.now() - processingStart);
            eventCount += events.length;

            const batchDelta = calculateResultDelta(processingResult, beforeState);
            cumulativeResult.merge(batchDelta);
            batchDelta.emailIds.forEach(id => allEmailIds.add(id));
            batchDelta.memberIds.forEach(id => allMemberIds.add(id));

            if (shouldAggregateIntermediate(Date.now() - lastAggregation, processingResult.memberIds.length, eventCount)) {
                const aggregationTime = await performIntermediateAggregation(
                    processingResult,
                    includeOpenedEvents,
                    allEmailIds,
                    allMemberIds,
                    this.aggregateStats.bind(this)
                );
                aggregationTimeMs += aggregationTime;
                lastAggregation = Date.now();
                processingResult = new EventProcessingResult();
            }

            if (fetchData.canceled) {
                throw new errors.InternalServerError({
                    message: 'Fetching canceled'
                });
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                apiPollingTimeMs += (Date.now() - apiStart);
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

        const finalAggregation = await performFinalAggregation(
            processingResult,
            allEmailIds,
            allMemberIds,
            includeOpenedEvents,
            this.aggregateStats.bind(this)
        );
        aggregationTimeMs += finalAggregation.time;

        if (finalAggregation.error && !error) {
            error = finalAggregation.error;
        }

        await updateJobTimestamp(fetchData, !!error, eventCount, this.queries);

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
     * Process a batch of email analytics events.
     * @param {any[]} events - An array of email analytics events to process.
     * @param {Object} result - The result object to merge batch processing results into.
     * @param {FetchData} fetchData - Data related to the current fetch operation.
     * @returns {Promise<void>}
     */
    async processEventBatch(events, result, fetchData) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            await this.#processEventBatchBatched(events, result, fetchData);
        } else {
            await this.#processEventBatchSequential(events, result, fetchData);
        }
    }

    /**
     * Process events using batched mode with recipient cache
     * @param {any[]} events
     * @param {Object} result
     * @param {FetchData} fetchData
     * @returns {Promise<void>}
     */
    async #processEventBatchBatched(events, result, fetchData) {
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
     * Process events using sequential mode
     * @param {any[]} events
     * @param {Object} result
     * @param {FetchData} fetchData
     * @returns {Promise<void>}
     */
    async #processEventBatchSequential(events, result, fetchData) {
        for (const event of events) {
            const batchResult = await this.processEvent(event);

            if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                fetchData.lastEventTimestamp = event.timestamp;
            }

            result.merge(batchResult);
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
                return await this.#handleDeliveredEvent(event, recipientCache);
            case 'opened':
                return await this.#handleOpenedEvent(event, recipientCache);
            case 'failed':
                return await this.#handleFailedEvent(event, recipientCache);
            case 'unsubscribed':
                return await this.#handleUnsubscribedEvent(event, recipientCache);
            case 'complained':
                return await this.#handleComplainedEvent(event, recipientCache);
            default:
                return new EventProcessingResult({unhandled: 1});
        }
    }

    /**
     * Handle delivered event
     * @param {object} event
     * @param {Map<string, any>} [recipientCache]
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
     * @param {object} event
     * @param {Map<string, any>} [recipientCache]
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
     * @param {object} event
     * @param {Map<string, any>} [recipientCache]
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
     * @param {object} event
     * @param {Map<string, any>} [recipientCache]
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
     * @param {object} event
     * @param {Map<string, any>} [recipientCache]
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
            await this.#aggregateMemberStatsBatched(memberIds, memberMetric);
        } else {
            await this.#aggregateMemberStatsSequential(memberIds, memberMetric);
        }
    }

    /**
     * Aggregate member stats in batches
     * @param {string[]} memberIds
     * @param {object} memberMetric
     * @returns {Promise<void>}
     */
    async #aggregateMemberStatsBatched(memberIds, memberMetric) {
        logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: 100)`);
        const BATCH_SIZE = 100;
        for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
            const batch = memberIds.slice(i, i + BATCH_SIZE);
            await this.aggregateMemberStatsBatch(batch);
            memberMetric?.inc(batch.length);
        }
    }

    /**
     * Aggregate member stats sequentially
     * @param {string[]} memberIds
     * @param {object} memberMetric
     * @returns {Promise<void>}
     */
    async #aggregateMemberStatsSequential(memberIds, memberMetric) {
        logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using SEQUENTIAL mode`);
        for (const memberId of memberIds) {
            await this.aggregateMemberStats(memberId);
            memberMetric?.inc();
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
};