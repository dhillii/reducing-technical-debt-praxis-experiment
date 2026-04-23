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
 * Guard predicate: checks if the end date is before or equal to the begin date.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeOrEqualBegin(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: determines if a scheduled fetch is currently running.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function isScheduledRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard predicate: determines if a scheduled fetch has been cancelled.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function isScheduledCancelled(data) {
    return !!(data && data.canceled);
}

/**
 * Guard predicate: decides whether aggregation should run based on time or member count.
 * @param {number} lastAggregation
 * @param {EventProcessingResult} processingResult
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldAggregate(lastAggregation, processingResult, eventCount) {
    const timeExceeded = Date.now() - lastAggregation > 5 * 60 * 1000;
    const manyMembers = processingResult.memberIds.length > 5000;
    return (timeExceeded || manyMembers) && eventCount > 0;
}

/**
 * Guard predicate: decides whether the final job timestamp should be incremented.
 * @param {FetchData} fetchData
 * @returns {boolean}
 */
function shouldIncrementLastEventTimestamp(fetchData) {
    return fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000;
}

/**
 * Guard predicate: decides whether the scheduled fetch should be reset.
 * @param {EmailAnalyticsFetchResult} fetchResult
 * @param {FetchDataScheduled} scheduledData
 * @returns {boolean}
 */
function shouldResetScheduled(fetchResult, scheduledData) {
    return fetchResult.eventCount === 0 || isScheduledCancelled(scheduledData);
}

/**
 * Guard predicate: determines if a fetch should be skipped because it is already in progress.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function isFetchInProgress(data) {
    return !!(data && data.running);
}

/**
 * Guard predicate: determines if there is no scheduled fetch data.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNoScheduledData(data) {
    return !(data && data.schedule);
}

/**
 * Guard predicate: determines if a fetch result contains any IDs to aggregate.
 * @param {Array<string>} ids
 * @returns {boolean}
 */
function hasIds(ids) {
    return ids && ids.length > 0;
}

/**
 * Guard predicate: determines if an error is not a cancellation.
 * @param {Error} err
 * @returns {boolean}
 */
function isNotCancellationError(err) {
    return err.message !== 'Fetching canceled';
}

/**
 * Guard predicate: determines if a provider fetch should be attempted.
 * @param {object} provider
 * @returns {boolean}
 */
function isValidProvider(provider) {
    return !!provider && typeof provider.fetchLatest === 'function';
}

/**
 * Guard predicate: determines if batch processing is enabled.
 * @param {object} config
 * @returns {boolean}
 */
function isBatchProcessingEnabled(config) {
    return config.get('emailAnalytics:batchProcessing');
}

/**
 * Guard predicate: determines if an event type matches a specific type.
 * @param {object} event
 * @param {string} type
 * @returns {boolean}
 */
function isEventType(event, type) {
    return event.type === type;
}

/**
 * Guard predicate: determines if a failed event is permanent.
 * @param {object} event
 * @returns {boolean}
 */
function isPermanentFailure(event) {
    return event.severity === 'permanent';
}

/**
 * Guard predicate: determines if a failed event is temporary.
 * @param {object} event
 * @returns {boolean}
 */
function isTemporaryFailure(event) {
    return event.severity !== 'permanent';
}

/**
 * Guard predicate: determines if an event has a recipient.
 * @param {object} recipient
 * @returns {boolean}
 */
function hasRecipient(recipient) {
    return !!recipient;
}

/**
 * Guard predicate: determines if an event includes opened events.
 * @param {Array<string>|null} eventTypes
 * @returns {boolean}
 */
function includesOpened(eventTypes) {
    return eventTypes?.includes('opened') ?? false;
}

/**
 * Guard predicate: determines if a fetch should be skipped because end is before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldSkipFetch(end, begin) {
    return isEndBeforeOrEqualBegin(end, begin);
}

/**
 * Guard predicate: determines if a fetch should be skipped because there are no IDs.
 * @param {Array<string>} emailIds
 * @param {Array<string>} memberIds
 * @returns {boolean}
 */
function hasNothingToAggregate(emailIds, memberIds) {
    return !hasIds(emailIds) && !hasIds(memberIds);
}

/**
 * Guard predicate: determines if a fetch result contains an error.
 * @param {Error|null} error
 * @returns {boolean}
 */
function hasError(error) {
    return !!error;
}

/**
 * Guard predicate: determines if a fetch result contains no error.
 * @param {Error|null} error
 * @returns {boolean}
 */
function noError(error) {
    return !error;
}

/**
 * Guard predicate: determines if a fetch result should store the finished timestamp.
 * @param {FetchData} fetchData
 * @returns {boolean}
 */
function shouldStoreFinishedTimestamp(fetchData) {
    return !!fetchData.lastEventTimestamp;
}

/**
 * Guard predicate: determines if a fetch result should set job status to finished.
 * @param {FetchData} fetchData
 * @returns {boolean}
 */
function shouldSetJobFinished(fetchData) {
    return !fetchData.lastEventTimestamp;
}

/**
 * Guard predicate: determines if a fetch result should reset the scheduled data.
 * @param {FetchDataScheduled} scheduledData
 * @returns {boolean}
 */
function resetScheduledData(scheduledData) {
    return {
        running: false,
        jobName: 'email-analytics-scheduled'
    };
}

/**
 * Guard predicate: determines if a fetch result should clear scheduled data.
 * @param {FetchDataScheduled} scheduledData
 * @returns {boolean}
 */
function clearScheduledData(scheduledData) {
    return null;
}

/**
 * Guard predicate: determines if a fetch result should log a skip message.
 * @param {string} method
 * @param {Date} end
 * @param {Date} begin
 * @returns {void}
 */
function logSkipMessage(method, end, begin) {
    logging.info(`[EmailAnalytics] Skipping ${method} because end (${end}) is before begin (${begin})`);
}

/**
 * Guard predicate: determines if a fetch result should log a cancellation.
 * @param {string} method
 * @returns {void}
 */
function logCancellation(method) {
    logging.error(`[EmailAnalytics] ${method}`);
}

/**
 * Guard predicate: determines if a fetch result should log an aggregation error.
 * @param {Error} err
 * @returns {void}
 */
function logAggregationError(err) {
    logging.error('[EmailAnalytics] Error while aggregating stats');
    logging.error(err);
}

/**
 * Guard predicate: determines if a fetch result should log a fetching error.
 * @param {Error} err
 * @returns {void}
 */
function logFetchingError(err) {
    logging.error('[EmailAnalytics] Error while fetching');
    logging.error(err);
}

/**
 * Guard predicate: determines if a fetch result should log a cancellation error.
 * @returns {void}
 */
function logFetchingCancelled() {
    logging.error('[EmailAnalytics] Canceled fetching');
}

/**
 * Guard predicate: determines if a fetch result should log a skip for scheduled fetch.
 * @returns {void}
 */
function logScheduledSkip() {
    logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
}

/**
 * Guard predicate: determines if a fetch result should log a scheduling info.
 * @param {Date} begin
 * @param {Date} end
 * @returns {void}
 */
function logScheduling(begin, end) {
    logging.info('[EmailAnalytics] Scheduling fetch from ' + begin.toISOString() + ' until ' + end.toISOString());
}

/**
 * Guard predicate: determines if a fetch result should log a generic info message.
 * @param {string} message
 * @returns {void}
 */
function logInfo(message) {
    logging.info(message);
}

/**
 * Guard predicate: determines if a fetch result should log an error message.
 * @param {string} message
 * @param {Error} err
 * @returns {void}
 */
function logError(message, err) {
    logging.error(message);
    logging.error(err);
}

/**
 * Guard predicate: determines if a fetch result should increment a Prometheus metric.
 * @param {object} metric
 * @param {number} [increment=1]
 * @returns {void}
 */
function incMetric(metric, increment = 1) {
    metric?.inc(increment);
}

/**
 * Guard predicate: determines if a fetch result should aggregate email stats.
 * @param {string} emailId
 * @param {boolean} includeOpenedEvents
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function aggregateEmail(service, emailId, includeOpenedEvents) {
    await service.aggregateEmailStats(emailId, includeOpenedEvents);
}

/**
 * Guard predicate: determines if a fetch result should aggregate member stats.
 * @param {string} memberId
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function aggregateMember(service, memberId) {
    await service.aggregateMemberStats(memberId);
}

/**
 * Guard predicate: determines if a fetch result should aggregate member stats in batch.
 * @param {Array<string>} batch
 * @param {EmailAnalyticsService} service
 * @returns {Promise<void>}
 */
async function aggregateMemberBatch(service, batch) {
    await service.aggregateMemberStatsBatch(batch);
}

/**
 * Guard predicate: determines if a fetch result should process a batch of events.
 * @param {Array<object>} events
 * @param {EmailAnalyticsService} service
 * @param {EventProcessingResult} processingResult
 * @param {FetchData} fetchData
 * @param {boolean} includeOpenedEvents
 * @param {EventProcessingResult} cumulativeResult
 * @param {Set<string>} allEmailIds
 * @param {Set<string>} allMemberIds
 * @param {object} state
 * @returns {Promise<void>}
 */
async function processBatch(
    events,
    service,
    processingResult,
    fetchData,
    includeOpenedEvents,
    cumulativeResult,
    allEmailIds,
    allMemberIds,
    state
) {
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

    await service.processEventBatch(events, processingResult, fetchData);
    state.processingTimeMs += (Date.now() - processingStart);
    state.eventCount += events.length;

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

    if (shouldAggregate(state.lastAggregation, processingResult, state.eventCount)) {
        try {
            const aggregationStart = Date.now();
            await service.aggregateStats(processingResult, includeOpenedEvents);
            state.aggregationTimeMs += (Date.now() - aggregationStart);
            state.lastAggregation = Date.now();
            processingResult.emailIds.forEach(id => allEmailIds.delete(id));
            processingResult.memberIds.forEach(id => allMemberIds.delete(id));
            processingResult = new EventProcessingResult();
        } catch (err) {
            logAggregationError(err);
        }
    }

    if (fetchData.canceled) {
        throw new errors.InternalServerError({message: 'Fetching canceled'});
    }
}

/**
 * Guard predicate: determines if final aggregation should be performed.
 * @param {EmailAnalyticsService} service
 * @param {EventProcessingResult} processingResult
 * @param {Set<string>} allEmailIds
 * @param {Set<string>} allMemberIds
 * @param {boolean} includeOpenedEvents
 * @param {object} state
 * @returns {Promise<void>}
 */
async function finalAggregation(
    service,
    processingResult,
    allEmailIds,
    allMemberIds,
    includeOpenedEvents,
    state
) {
    const finalEmailIds = Array.from(new Set([...processingResult.emailIds, ...allEmailIds]));
    const finalMemberIds = Array.from(new Set([...processingResult.memberIds, ...allMemberIds]));

    if (hasIds(finalEmailIds) || hasIds(finalMemberIds)) {
        try {
            const aggregationStart = Date.now();
            const finalAggregationResult = {
                emailIds: finalEmailIds,
                memberIds: finalMemberIds
            };
            await service.aggregateStats(finalAggregationResult, includeOpenedEvents);
            state.aggregationTimeMs += (Date.now() - aggregationStart);
        } catch (err) {
            logAggregationError(err);
            if (!state.error) {
                state.error = err;
            }
        }
    }
}

/**
 * Guard predicate: determines if job timestamps should be updated after fetch.
 * @param {EmailAnalyticsService} service
 * @param {FetchData} fetchData
 * @param {object} state
 * @returns {Promise<void>}
 */
async function finalizeJob(service, fetchData, state) {
    if (noError(state.error) && state.eventCount > 0 && shouldIncrementLastEventTimestamp(fetchData)) {
        await service.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
        fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
    } else {
        await service.queries.setJobStatus(fetchData.jobName, 'finished');
    }
    fetchData.running = false;
    if (hasError(state.error)) {
        throw state.error;
    }
}

/**
 * Guard predicate: determines if a scheduled fetch should be reset.
 * @param {FetchDataScheduled} scheduledData
 * @returns {void}
 */
function resetScheduled(scheduledData) {
    scheduledData.running = false;
    scheduledData.jobName = 'email-analytics-scheduled';
    delete scheduledData.schedule;
    delete scheduledData.lastEventTimestamp;
    delete scheduledData.canceled;
}

/**
 * Guard predicate: determines if a scheduled fetch should be cleared.
 * @param {EmailAnalyticsService} service
 * @returns {void}
 */
function clearScheduled(service) {
    service.#fetchScheduledData = null;
}

/**
 * Guard predicate: determines if a scheduled fetch should be removed.
 * @param {EmailAnalyticsService} service
 * @returns {void}
 */
function removeScheduled(service) {
    service.#fetchScheduledData = {
        running: false,
        jobName: 'email-analytics-scheduled'
    };
}

/**
 * Guard predicate: determines if a fetch should be started.
 * @param {FetchData} fetchData
 * @param {Date} begin
 * @returns {void}
 */
function startFetch(fetchData, begin) {
    fetchData.running = true;
    fetchData.lastStarted = new Date();
    fetchData.lastBegin = begin;
}

/**
 * Guard predicate: determines if a fetch should set its started timestamp.
 * @param {EmailAnalyticsService} service
 * @param {FetchData} fetchData
 * @param {Date} begin
 * @returns {void}
 */
function setJobStarted(service, fetchData, begin) {
    service.queries.setJobTimestamp(fetchData.jobName, 'started', begin);
}

/**
 * Guard predicate: determines if a fetch should set its finished timestamp.
 * @param {EmailAnalyticsService} service
 * @param {FetchData} fetchData
 * @returns {Promise<void>}
 */
async function setJobFinished(service, fetchData) {
    await service.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
}

/**
 * Guard predicate: determines if a fetch should set its status to finished.
 * @param {EmailAnalyticsService} service
 * @param {FetchData} fetchData
 * @returns {Promise<void>}
 */
async function setJobStatusFinished(service, fetchData) {
    await service.queries.setJobStatus(fetchData.jobName, 'finished');
}

/**
 * Guard predicate: determines if a fetch should update the last event timestamp.
 * @param {FetchData} fetchData
 * @param {Date} timestamp
 * @returns {void}
 */
function updateLastEventTimestamp(fetchData, timestamp) {
    fetchData.lastEventTimestamp = timestamp;
}

/**
 * Guard predicate: determines if a fetch should log a skip due to end before begin.
 * @param {string} methodName
 * @param {Date} end
 * @param {Date} begin
 * @returns {void}
 */
function logSkip(methodName, end, begin) {
    logging.info(`[EmailAnalytics] Skipping ${methodName} because end (${end}) is before begin (${begin})`);
}

/**
 * Guard predicate: determines if a fetch should log a scheduling message.
 * @param {Date} begin
 * @param {Date} end
 * @returns {void}
 */
function logSchedule(begin, end) {
    logging.info('[EmailAnalytics] Scheduling fetch from ' + begin.toISOString() + ' until ' + end.toISOString());
}

/**
 * Guard predicate: determines if a fetch should log a cancellation message.
 * @param {string} message
 * @returns {void}
 */
function logCancel(message) {
    logging.error(`[EmailAnalytics] ${message}`);
}

/**
 * Guard predicate: determines if a fetch should log a generic info message.
 * @param {string} message
 * @returns {void}
 */
function logInfoMessage(message) {
    logging.info(message);
}

/**
 * Guard predicate: determines if a fetch should log an error message.
 * @param {string} message
 * @param {Error} err
 * @returns {void}
 */
function logErrorMessage(message, err) {
    logging.error(message);
    logging.error(err);
}

/**
 * Guard predicate: determines if a fetch should increment a metric.
 * @param {object} metric
 * @param {number} [count=1]
 * @returns {void}
 */
function incrementMetric(metric, count = 1) {
    metric?.inc(count);
}

/**
 * Guard predicate: determines if a fetch should aggregate stats for a list of email IDs.
 * @param {EmailAnalyticsService} service
 * @param {Array<string>} emailIds
 * @param {boolean} includeOpenedEvents
 * @returns {Promise<void>}
 */
async function aggregateEmailStatsList(service, emailIds, includeOpenedEvents) {
    for (const emailId of emailIds) {
        await service.aggregateEmailStats(emailId, includeOpenedEvents);
    }
}

/**
 * Guard predicate: determines if a fetch should aggregate member stats in batch or sequentially.
 * @param {EmailAnalyticsService} service
 * @param {Array<string>} memberIds
 * @param {boolean} useBatch
 * @returns {Promise<void>}
 */
async function aggregateMemberStatsList(service, memberIds, useBatch) {
    const memberMetric = service.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');
    if (useBatch) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
            const batch = memberIds.slice(i, i + BATCH_SIZE);
            await service.aggregateMemberStatsBatch(batch);
            incrementMetric(memberMetric, batch.length);
        }
    } else {
        for (const memberId of memberIds) {
            await service.aggregateMemberStats(memberId);
            incrementMetric(memberMetric);
        }
    }
}

/**
 * Guard predicate: determines if a fetch should process events using batch processing.
 * @param {EmailAnalyticsService} service
 * @param {Array<any>} events
 * @param {EventProcessingResult} result
 * @param {FetchData} fetchData
 * @returns {Promise<void>}
 */
async function processEventsWithBatch(service, events, result, fetchData) {
    const emailIdentifications = events.map(event => ({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }));
    const recipientCache = await service.eventProcessor.batchGetRecipients(emailIdentifications);
    for (const event of events) {
        const batchResult = await service.processEvent(event, recipientCache);
        if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
            updateLastEventTimestamp(fetchData, event.timestamp);
        }
        result.merge(batchResult);
    }
    await service.eventProcessor.flushBatchedUpdates();
}

/**
 * Guard predicate: determines if a fetch should process events sequentially.
 * @param {EmailAnalyticsService} service
 * @param {Array<any>} events
 * @param {EventProcessingResult} result
 * @param {FetchData} fetchData
 * @returns {Promise<void>}
 */
async function processEventsSequentially(service, events, result, fetchData) {
    for (const event of events) {
        const batchResult = await service.processEvent(event);
        if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
            updateLastEventTimestamp(fetchData, event.timestamp);
        }
        result.merge(batchResult);
    }
}

/**
 * Guard predicate: determines if a fetch should process a batch of events based on configuration.
 * @param {EmailAnalyticsService} service
 * @param {Array<any>} events
 * @param {EventProcessingResult} result
 * @param {FetchData} fetchData
 * @returns {Promise<void>}
 */
async function processEventBatchBasedOnConfig(service, events, result, fetchData) {
    if (isBatchProcessingEnabled(service.config)) {
        await processEventsWithBatch(service, events, result, fetchData);
    } else {
        await processEventsSequentially(service, events, result, fetchData);
    }
}

/**
 * Guard predicate: determines if a fetch should handle provider fetching.
 * @param {EmailAnalyticsService} service
 * @param {FetchData} fetchData
 * @param {object} options
 * @param {EventProcessingResult} processingResult
 * @param {Set<string>} allEmailIds
 * @param {Set<string>} allMemberIds
 * @param {object} state
 * @returns {Promise<void>}
 */
async function fetchFromProviders(
    service,
    fetchData,
    options,
    processingResult,
    allEmailIds,
    allMemberIds,
    state
) {
    const {begin, end, maxEvents, eventTypes} = options;
    const includeOpenedEvents = includesOpened(eventTypes);
    for (const provider of service.providers) {
        if (!isValidProvider(provider)) continue;
        const apiStart = Date.now();
        await provider.fetchLatest(async (events) => {
            await processBatch(
                events,
                service,
                processingResult,
                fetchData,
                includeOpenedEvents,
                state.cumulativeResult,
                allEmailIds,
                allMemberIds,
                state
            );
        }, {begin, end, maxEvents, events: eventTypes});
        state.apiPollingTimeMs += (Date.now() - apiStart);
    }
}

/**
 * Guard predicate: determines if a fetch should be performed for latest opened events.
 * @param {EmailAnalyticsService} service
 * @param {Date} begin
 * @param {Date} end
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function performFetchLatestOpened(service, begin, end) {
    if (shouldSkipFetch(end, begin)) {
        logSkip('fetchLatestOpenedEvents', end, begin);
        return createEmptyResult();
    }
    return await service.#fetchEvents(service.#fetchLatestOpenedData, {begin, end, eventTypes: ['opened']});
}

/**
 * Guard predicate: determines if a fetch should be performed for latest non-opened events.
 * @param {EmailAnalyticsService} service
 * @param {Date} begin
 * @param {Date} end
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function performFetchLatestNonOpened(service, begin, end) {
    if (shouldSkipFetch(end, begin)) {
        logSkip('fetchLatestNonOpenedEvents', end, begin);
        return createEmptyResult();
    }
    return await service.#fetchEvents(service.#fetchLatestNonOpenedData, {begin, end, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
}

/**
 * Guard predicate: determines if a fetch should be performed for missing events.
 * @param {EmailAnalyticsService} service
 * @param {Date} begin
 * @param {Date} end
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function performFetchMissing(service, begin, end) {
    if (shouldSkipFetch(end, begin)) {
        logSkip('fetchMissing', end, begin);
        return createEmptyResult();
    }
    return await service.#fetchEvents(service.#fetchMissingData, {begin, end});
}

/**
 * Guard predicate: determines if a scheduled fetch should be performed.
 * @param {EmailAnalyticsService} service
 * @param {number} maxEvents
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function performFetchScheduled(service, maxEvents) {
    const data = service.#fetchScheduledData;
    if (hasNoScheduledData(data)) {
        return createEmptyResult();
    }
    if (isScheduledCancelled(data)) {
        clearScheduled(service);
        return createEmptyResult();
    }

    let begin = data.schedule.begin;
    const end = data.schedule.end;

    if (data.lastEventTimestamp && data.lastEventTimestamp > begin) {
        begin = data.lastEventTimestamp;
    }

    if (shouldSkipFetch(end, begin)) {
        logScheduledSkip();
        resetScheduled(data);
        return createEmptyResult();
    }

    const fetchResult = await service.#fetchEvents(data, {begin, end, maxEvents});
    if (shouldResetScheduled(fetchResult, data)) {
        resetScheduled(data);
    }

    await service.queries.setJobTimestamp(data.jobName, 'finished', data.lastEventTimestamp);
    return fetchResult;
}

/**
 * Guard predicate: determines if a fetch should be performed for scheduled events.
 * @param {EmailAnalyticsService} service
 * @param {object} options
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function fetchScheduledWrapper(service, {maxEvents = Infinity} = {}) {
    return await performFetchScheduled(service, maxEvents);
}

/**
 * Guard predicate: determines if a fetch should be performed for latest opened events.
 * @param {EmailAnalyticsService} service
 * @param {object} options
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function fetchLatestOpenedWrapper(service, {maxEvents = Infinity} = {}) {
    const begin = await service.getLastOpenedEventTimestamp();
    const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);
    return await performFetchLatestOpened(service, begin, end);
}

/**
 * Guard predicate: determines if a fetch should be performed for latest non-opened events.
 * @param {EmailAnalyticsService} service
 * @param {object} options
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function fetchLatestNonOpenedWrapper(service, {maxEvents = Infinity} = {}) {
    const begin = await service.getLastNonOpenedEventTimestamp();
    const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);
    return await performFetchLatestNonOpened(service, begin, end);
}

/**
 * Guard predicate: determines if a fetch should be performed for missing events.
 * @param {EmailAnalyticsService} service
 * @param {object} options
 * @returns {Promise<EmailAnalyticsFetchResult>}
 */
async function fetchMissingWrapper(service, {maxEvents = Infinity} = {}) {
    const begin = await service.getLastMissingEventTimestamp();
    const end = new Date(
        Math.min(
            Date.now() - TRUST_THRESHOLD_MS,
            service.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
        )
    );
    return await performFetchMissing(service, begin, end);
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
        return await fetchLatestOpenedWrapper(this, {maxEvents});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        return await fetchLatestNonOpenedWrapper(this, {maxEvents});
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        return await fetchMissingWrapper(this, {maxEvents});
    }

    schedule({begin, end}) {
        if (this.#fetchScheduledData && this.#fetchScheduledData.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }
        logSchedule(begin, end);
        this.#fetchScheduledData = {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    cancelScheduled() {
        const data = this.#fetchScheduledData;
        if (!data) {
            return;
        }
        if (data.running) {
            data.canceled = true;
        } else {
            removeScheduled(this);
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        return await fetchScheduledWrapper(this, {maxEvents});
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        startFetch(fetchData, begin);
        setJobStarted(this, fetchData, begin);

        const includeOpenedEvents = includesOpened(eventTypes);
        const processingResult = new EventProcessingResult();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();

        const state = {
            apiPollingTimeMs: 0,
            processingTimeMs: 0,
            aggregationTimeMs: 0,
            lastAggregation: Date.now(),
            eventCount: 0,
            error: null,
            cumulativeResult
        };

        await fetchFromProviders(this, fetchData, {begin, end, maxEvents, eventTypes}, processingResult, allEmailIds, allMemberIds, state);

        await finalAggregation(this, processingResult, allEmailIds, allMemberIds, includeOpenedEvents, state);
        await finalizeJob(this, fetchData, state);

        return {
            eventCount: state.eventCount,
            apiPollingTimeMs: state.apiPollingTimeMs,
            processingTimeMs: state.processingTimeMs,
            aggregationTimeMs: state.aggregationTimeMs,
            result: cumulativeResult
        };
    }

    async processEventBatch(events, result, fetchData) {
        await processEventBatchBasedOnConfig(this, events, result, fetchData);
    }

    async processEvent(event, recipientCache) {
        if (isEventType(event, 'delivered')) {
            const recipient = await this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return hasRecipient(recipient) ? new EventProcessingResult({delivered: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (isEventType(event, 'opened')) {
            const recipient = await this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return hasRecipient(recipient) ? new EventProcessingResult({opened: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (isEventType(event, 'failed')) {
            if (isPermanentFailure(event)) {
                const recipient = await this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
                return hasRecipient(recipient) ? new EventProcessingResult({permanentFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
            } else {
                const recipient = await this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
                return hasRecipient(recipient) ? new EventProcessingResult({temporaryFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
            }
        }

        if (isEventType(event, 'unsubscribed')) {
            const recipient = await this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return hasRecipient(recipient) ? new EventProcessingResult({unsubscribed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (isEventType(event, 'complained')) {
            const recipient = await this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return hasRecipient(recipient) ? new EventProcessingResult({complained: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        return new EventProcessingResult({unhandled: 1});
    }

    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        const useBatchProcessing = isBatchProcessingEnabled(this.config);
        await aggregateEmailStatsList(this, emailIds, includeOpenedEvents);
        await aggregateMemberStatsList(this, memberIds, useBatchProcessing);
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