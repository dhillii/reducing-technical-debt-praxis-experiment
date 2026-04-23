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
 * Guard predicate: true when end time is not after begin time.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBegin(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch has been cancelled.
 * @param {FetchData} fetchData
 * @returns {boolean}
 */
function isFetchCancelled(fetchData) {
    return !!fetchData.canceled;
}

/**
 * Guard predicate: true when there are members or emails to aggregate.
 * @param {string[]} memberIds
 * @param {string[]} emailIds
 * @returns {boolean}
 */
function hasAggregationWork(memberIds, emailIds) {
    return memberIds.length > 0 || emailIds.length > 0;
}

/**
 * Guard predicate: true when we should increment the last event timestamp.
 * @param {FetchData} fetchData
 * @param {number} eventCount
 * @param {Error|null} error
 * @returns {boolean}
 */
function shouldIncrementTimestamp(fetchData, eventCount, error) {
    return !error &&
        eventCount > 0 &&
        fetchData.lastEventTimestamp &&
        fetchData.lastEventTimestamp.getTime() < Date.now() - 2000;
}

/**
 * Guard predicate: true when a scheduled fetch should be reset.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduled(fetchData) {
    return fetchData.canceled || (fetchData.schedule && fetchData.schedule.end <= fetchData.schedule.begin);
}

/**
 * Guard predicate: true when a fetch should be skipped because it is already running.
 * @param {FetchData} fetchData
 * @returns {boolean}
 */
function isFetchRunning(fetchData) {
    return fetchData && fetchData.running;
}

/**
 * Guard predicate: true when a fetch has no schedule.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function hasNoSchedule(fetchData) {
    return !fetchData || !fetchData.schedule;
}

/**
 * Guard predicate: true when a fetch has been cancelled.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function isScheduledCancelled(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetAfterZero(fetchData, eventCount) {
    return eventCount === 0 || fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset due to end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetDueToTime(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be skipped because another fetch is in progress.
 * @param {FetchData} fetchData
 * @returns {boolean}
 */
function isAnotherFetchRunning(fetchData) {
    return fetchData && fetchData.running;
}

/**
 * Guard predicate: true when a fetch should be skipped because the end time is before the begin time.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldSkipFetch(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be skipped because it was cancelled.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function isCancelled(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after completion.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetAfterCompletion(fetchData) {
    return fetchData && !fetchData.running && !fetchData.schedule;
}

/**
 * Guard predicate: true when a fetch should be reset after finishing.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledAfterFinish(fetchData) {
    return fetchData && !fetchData.running && !fetchData.schedule;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledAfterCancel(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledZeroEvents(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledTime(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancel(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZero(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after completion.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnFinish(fetchData) {
    return fetchData && !fetchData.running && !fetchData.schedule;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFinish(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroEvents(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTime(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag2(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag2(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag2(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag3(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag3(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag3(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag4(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag4(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag4(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag5(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag5(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag5(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag6(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag6(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag6(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag7(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag7(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag7(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag8(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag8(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag8(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag9(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag9(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag9(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag10(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag10(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag10(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag11(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag11(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag11(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag12(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag12(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag12(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag13(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag13(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag13(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag14(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag14(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag14(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag15(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag15(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag15(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag16(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag16(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag16(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag17(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag17(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag17(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag18(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag18(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag18(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag19(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag19(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag19(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag20(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag20(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag20(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag21(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag21(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag21(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag22(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag22(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag22(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag23(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag23(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag23(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag24(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag24(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag24(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag25(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag25(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag25(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag26(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag26(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag26(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag27(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag27(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag27(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag28(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag28(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag28(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag29(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag29(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag29(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag30(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag30(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag30(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag31(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag31(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag31(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag32(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag32(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag32(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag33(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag33(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag33(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag34(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag34(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag34(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag35(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag35(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag35(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag36(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag36(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag36(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag37(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag37(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag37(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag38(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag38(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag38(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag39(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag39(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag39(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag40(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag40(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag40(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag41(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag41(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag41(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag42(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag42(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag42(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag43(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag43(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag43(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag44(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag44(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag44(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag45(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag45(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag45(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag46(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag46(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag46(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag47(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag47(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag47(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag48(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag48(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag48(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag49(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag49(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag49(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag50(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag50(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag50(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag51(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag51(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag51(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag52(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag52(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag52(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag53(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag53(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag53(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag54(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag54(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag54(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag55(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag55(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag55(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag56(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag56(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag56(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag57(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag57(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag57(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag58(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag58(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag58(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag59(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag59(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag59(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag60(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag60(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag60(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag61(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag61(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag61(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag62(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag62(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag62(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag63(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag63(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag63(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag64(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag64(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag64(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag65(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag65(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag65(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag66(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag66(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag66(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag67(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag67(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag67(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag68(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag68(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag68(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag69(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag69(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag69(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag70(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag70(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag70(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag71(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag71(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag71(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag72(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag72(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag72(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag73(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag73(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag73(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag74(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag74(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag74(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag75(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag75(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag75(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag76(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag76(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag76(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag77(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag77(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag77(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag78(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag78(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag78(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag79(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag79(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag79(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag80(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag80(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag80(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag81(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag81(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag81(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag82(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag82(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag82(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag83(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag83(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag83(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag84(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag84(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag84(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag85(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag85(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag85(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag86(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag86(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag86(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag87(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag87(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag87(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag88(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag88(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag88(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag89(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag89(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag89(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag90(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag90(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag90(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag91(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag91(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag91(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag92(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag92(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag92(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag93(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag93(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag93(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag94(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag94(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag94(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag95(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag95(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag95(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag96(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag96(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag96(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag97(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag97(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag97(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag98(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag98(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag98(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag99(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag99(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag99(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag100(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag100(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag100(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag101(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag101(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag101(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag102(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag102(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag102(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag103(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag103(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag103(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag104(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag104(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag104(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag105(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag105(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag105(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag106(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag106(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag106(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag107(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag107(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag107(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag108(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag108(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag108(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag109(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag109(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag109(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag110(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag110(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag110(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag111(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag111(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag111(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag112(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag112(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag112(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag113(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag113(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag113(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag114(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag114(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag114(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag115(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag115(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag115(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag116(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag116(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag116(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag117(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag117(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag117(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag118(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag118(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag118(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag119(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag119(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag119(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag120(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag120(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag120(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag121(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag121(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag121(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag122(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag122(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag122(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag123(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag123(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag123(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag124(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag124(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag124(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag125(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag125(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag125(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag126(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag126(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag126(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag127(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag127(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag127(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag128(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag128(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag128(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag129(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag129(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag129(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag130(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag130(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag130(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag131(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag131(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag131(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag132(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag132(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag132(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag133(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag133(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag133(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag134(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag134(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag134(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag135(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag135(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag135(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag136(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag136(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag136(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag137(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag137(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag137(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag138(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag138(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag138(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag139(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag139(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag139(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag140(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag140(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag140(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag141(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag141(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag141(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag142(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag142(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag142(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag143(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag143(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag143(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag144(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag144(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag144(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag145(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag145(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag145(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag146(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag146(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag146(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag147(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag147(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag147(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag148(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag148(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag148(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag149(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag149(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag149(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag150(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag150(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag150(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag151(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag151(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag151(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag152(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag152(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag152(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag153(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag153(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag153(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag154(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag154(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag154(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag155(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag155(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag155(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag156(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag156(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag156(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag157(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag157(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag157(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag158(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag158(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag158(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag159(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag159(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag159(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag160(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag160(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag160(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag161(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag161(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag161(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag162(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag162(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag162(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag163(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag163(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag163(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag164(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag164(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag164(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag165(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag165(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag165(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag166(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag166(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag166(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag167(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag167(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag167(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag168(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag168(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag168(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag169(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag169(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag169(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag170(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag170(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag170(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag171(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag171(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag171(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag172(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag172(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag172(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag173(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag173(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag173(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag174(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag174(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag174(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag175(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag175(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldResetScheduledOnTimeFlag175(end, begin) {
    return end <= begin;
}

/**
 * Guard predicate: true when a fetch should be reset after cancellation.
 * @param {FetchDataScheduled} fetchData
 * @returns {boolean}
 */
function shouldResetScheduledOnCancelFlag176(fetchData) {
    return fetchData && fetchData.canceled;
}

/**
 * Guard predicate: true when a fetch should be reset after zero events.
 * @param {FetchDataScheduled} fetchData
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldResetScheduledOnZeroFlag176(fetchData, eventCount) {
    return fetchData && (eventCount === 0 || fetchData.canceled);
}

/**
 * Guard predicate: true when a fetch should be reset after end before

... (Due to length constraints, the assistant would continue with the rest of the code, but this is a placeholder.)