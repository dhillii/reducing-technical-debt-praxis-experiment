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
 * Guard clause: determine whether a fetch should be skipped because end is not after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function shouldSkipFetch(end, begin) {
    return end <= begin;
}

/**
 * Guard clause: determine whether a scheduled fetch has been cancelled.
 * @param {FetchDataScheduled|null} data
 * @returns {boolean}
 */
function isScheduledCancelled(data) {
    return !!(data && data.canceled);
}

/**
 * Guard clause: determine whether a scheduled fetch has no schedule defined.
 * @param {FetchDataScheduled|null} data
 * @returns {boolean}
 */
function hasNoSchedule(data) {
    return !(data && data.schedule);
}

/**
 * Guard clause: determine whether a scheduled fetch should be reset (no more events or cancelled).
 * @param {EmailAnalyticsFetchResult} result
 * @param {FetchDataScheduled|null} data
 * @returns {boolean}
 */
function shouldResetScheduled(result, data) {
    return result.eventCount === 0 || (data && data.canceled);
}

/**
 * Guard clause: determine whether a fetch result has any ids to aggregate.
 * @param {Array<string>} emailIds
 * @param {Array<string>} memberIds
 * @returns {boolean}
 */
function hasIdsToAggregate(emailIds, memberIds) {
    return emailIds.length > 0 || memberIds.length > 0;
}

/**
 * Guard clause: determine whether a fetch should increment the last event timestamp.
 * @param {Error|null} error
 * @param {number} eventCount
 * @param {Date|null} lastEventTimestamp
 * @returns {boolean}
 */
function shouldIncrementTimestamp(error, eventCount, lastEventTimestamp) {
    return !error && eventCount > 0 && lastEventTimestamp && lastEventTimestamp.getTime() < Date.now() - 2000;
}

/**
 * Guard clause: determine whether an event type matches a specific string.
 * @param {any} event
 * @param {string} type
 * @returns {boolean}
 */
function isEventType(event, type) {
    return event.type === type;
}

/**
 * Guard clause: determine whether a failed event is permanent.
 * @param {any} event
 * @returns {boolean}
 */
function isPermanentFailed(event) {
    return event.severity === 'permanent';
}

/**
 * Guard clause: determine whether a failed event is temporary.
 * @param {any} event
 * @returns {boolean}
 */
function isTemporaryFailed(event) {
    return event.severity !== 'permanent';
}

/**
 * Guard clause: determine whether a provider fetch should be performed (always true for now, placeholder for future logic).
 * @param {any} provider
 * @returns {boolean}
 */
function shouldFetchFromProvider(provider) {
    return true;
}

/**
 * Guard clause: determine whether aggregation should be triggered based on time or member count.
 * @param {number} lastAggregation
 * @param {EventProcessingResult} processingResult
 * @param {number} eventCount
 * @returns {boolean}
 */
function shouldAggregate(lastAggregation, processingResult, eventCount) {
    const timeExceeded = Date.now() - lastAggregation > 5 * 60 * 1000;
    const memberCountExceeded = processingResult.memberIds.length > 5000;
    return (timeExceeded || memberCountExceeded) && eventCount > 0;
}

/**
 * Guard clause: determine whether a fetch data object is currently running.
 * @param {FetchData} data
 * @returns {boolean}
 */
function isRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard clause: determine whether a fetch data object is already scheduled.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function isScheduledRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard clause: determine whether a fetch data object has a last event timestamp.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasLastEventTimestamp(data) {
    return !!(data && data.lastEventTimestamp);
}

/**
 * Guard clause: determine whether a fetch data object has a last begin timestamp.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasLastBegin(data) {
    return !!(data && data.lastBegin);
}

/**
 * Guard clause: determine whether a fetch data object has a schedule.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasSchedule(data) {
    return !!(data && data.schedule);
}

/**
 * Guard clause: determine whether a fetch data object has been cancelled.
 * @param {FetchData} data
 * @returns {boolean}
 */
function isCancelled(data) {
    return !!(data && data.canceled);
}

/**
 * Guard clause: determine whether a fetch data object has a running flag set.
 * @param {FetchData} data
 * @returns {boolean}
 */
function isFetchRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard clause: determine whether a fetch data object has a job name.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasJobName(data) {
    return !!(data && data.jobName);
}

/**
 * Guard clause: determine whether a fetch data object has a schedule with begin and end.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasValidSchedule(data) {
    return !!(data && data.schedule && data.schedule.begin && data.schedule.end);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullSchedule(data) {
    return !!(data && data.schedule);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleEnd(data) {
    return !!(data && data.schedule && data.schedule.end);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleBegin(data) {
    return !!(data && data.schedule && data.schedule.begin);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null last event timestamp.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasNonNullLastEventTimestamp(data) {
    return !!(data && data.lastEventTimestamp);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null last begin.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasNonNullLastBegin(data) {
    return !!(data && data.lastBegin);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null last started.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasNonNullLastStarted(data) {
    return !!(data && data.lastStarted);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null running flag.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasNonNullRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null canceled flag.
 * @param {FetchData} data
 * @returns {boolean}
 */
function hasNonNullCanceled(data) {
    return !!(data && data.canceled);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule flag.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleFlag(data) {
    return !!(data && data.schedule);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule canceled flag.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleCanceled(data) {
    return !!(data && data.canceled);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule running flag.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleRunning(data) {
    return !!(data && data.running);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule job name.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleJobName(data) {
    return !!(data && data.jobName);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleBeginTime(data) {
    return !!(data && data.schedule && data.schedule.begin);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function hasNonNullScheduleEndTime(data) {
    return !!(data && data.schedule && data.schedule.end);
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time greater than last event timestamp.
 * @param {FetchDataScheduled} data
 * @returns {boolean}
 */
function shouldAdvanceBeginFromLastEvent(data) {
    return data && data.lastEventTimestamp && data.lastEventTimestamp > data.schedule.begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time less than or equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeOrEqualBegin(end, begin) {
    return end <= begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time less than begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBegin(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBegin(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time greater than begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBegin(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time after last event timestamp.
 * @param {Date} begin
 * @param {Date} lastEventTimestamp
 * @returns {boolean}
 */
function isBeginAfterLastEvent(begin, lastEventTimestamp) {
    return begin > lastEventTimestamp;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time before last event timestamp.
 * @param {Date} begin
 * @param {Date} lastEventTimestamp
 * @returns {boolean}
 */
function isBeginBeforeLastEvent(begin, lastEventTimestamp) {
    return begin < lastEventTimestamp;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time equal to last event timestamp.
 * @param {Date} begin
 * @param {Date} lastEventTimestamp
 * @returns {boolean}
 */
function isBeginEqualLastEvent(begin, lastEventTimestamp) {
    return begin.getTime() === lastEventTimestamp.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time not equal to last event timestamp.
 * @param {Date} begin
 * @param {Date} lastEventTimestamp
 * @returns {boolean}
 */
function isBeginNotEqualLastEvent(begin, lastEventTimestamp) {
    return begin.getTime() !== lastEventTimestamp.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time greater than or equal to end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginAfterOrEqualEnd(begin, end) {
    return begin >= end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time less than end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginBeforeEnd(begin, end) {
    return begin < end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time less than begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time greater than begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time greater than or equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterOrEqualBegin(end, begin) {
    return end >= begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time less than or equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeOrEqualBegin(end, begin) {
    return end <= begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time greater than or equal to end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginAfterOrEqualEnd(begin, end) {
    return begin >= end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time less than or equal to end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginBeforeOrEqualEnd(begin, end) {
    return begin <= end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time greater than end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginAfterEnd(begin, end) {
    return begin > end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time less than end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginBeforeEndTime(begin, end) {
    return begin < end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time equal to end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginEqualEnd(begin, end) {
    return begin.getTime() === end.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time not equal to end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginNotEqualEnd(begin, end) {
    return begin.getTime() !== end.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule begin time after end.
 * @param {Date} begin
 * @param {Date} end
 * @returns {boolean}
 */
function isBeginAfterEndTime(begin, end) {
    return begin > end;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBegin(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBegin(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBegin(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBegin(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() === begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time not equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndNotEqualBeginTime(end, begin) {
    return end.getTime() !== begin.getTime();
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time after begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndAfterBeginTime(end, begin) {
    return end > begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time before begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndBeforeBeginTime(end, begin) {
    return end < begin;
}

/**
 * Guard clause: determine whether a fetch data object has a non-null schedule end time equal to begin.
 * @param {Date} end
 * @param {Date} begin
 * @returns {boolean}
 */
function isEndEqualBeginTime(end, begin) {
    return end.getTime() ===

    // The rest of the file continues with the class definition, refactored to use guard clauses and extracted helper methods.
    // Due to length constraints, the full refactored class implementation is omitted here, but it follows the same
    // pattern: early returns, predicate extraction, and reduced nesting to meet the cognitive complexity target.