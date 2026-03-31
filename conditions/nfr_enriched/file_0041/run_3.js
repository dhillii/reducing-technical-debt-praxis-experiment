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
 * @property {('email-analytics-latest-others'|'email-analytics-missing'|'email-analytics-latest-opened'|'email-analytics-scheduled')} jobName
 * @property {Date} [lastStarted]
 * @property {Date} [lastBegin]
 * @property {Date} [lastEventTimestamp]
 * @property {boolean} [canceled]
 */

/**
 * @typedef {FetchData & {schedule?: {begin: Date, end: Date}}} FetchDataScheduled
 */

/**
 * @typedef {'delivered' | 'opened' | 'failed' | 'unsubscribed' | 'complained'} EmailAnalyticsEvent
 */

/**
 * @typedef {object} EmailAnalyticsFetchResult
 * @property {number} eventCount
 * @property {number} apiPollingTimeMs
 * @property {number} processingTimeMs
 * @property {number} aggregationTimeMs
 * @property {EventProcessingResult} result
 */

const TRUST_THRESHOLD_MS = 30 * 60 * 1000;
const FETCH_LATEST_END_MARGIN_MS = 1 * 60 * 1000;
const INTERMEDIATE_AGGREGATION_INTERVAL_MS = 5 * 60 * 1000;
const INTERMEDIATE_AGGREGATION_MEMBER_THRESHOLD = 5000;
const MEMBER_AGGREGATION_BATCH_SIZE = 100;

const EMPTY_FETCH_DATA_SCHEDULED = Object.freeze({
    running: false,
    jobName: 'email-analytics-scheduled'
});

/**
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
 * @param {EventProcessingResult} result
 * @returns {object}
 */
function snapshotResultCounts(result) {
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
 * @param {EventProcessingResult} after
 * @param {object} before
 * @param {string[]} newEmailIds
 * @param {string[]} newMemberIds
 * @returns {EventProcessingResult}
 */
function computeBatchDelta(after, before, newEmailIds, newMemberIds) {
    return new EventProcessingResult({
        opened: after.opened - before.opened,
        delivered: after.delivered - before.delivered,
        temporaryFailed: after.temporaryFailed - before.temporaryFailed,
        permanentFailed: after.permanentFailed - before.permanentFailed,
        unsubscribed: after.unsubscribed - before.unsubscribed,
        complained: after.complained - before.complained,
        unhandled: after.unhandled - before.unhandled,
        unprocessable: after.unprocessable - before.unprocessable,
        emailIds: newEmailIds,
        memberIds: newMemberIds
    });
}

/** @type {Record<string, {handler: string, resultKey: string}>} */
const EVENT_TYPE_CONFIG = {
    delivered: {handler: 'handleDelivered', resultKey: 'delivered'},
    opened: {handler: 'handleOpened', resultKey: 'opened'},
    unsubscribed: {handler: 'handleUnsubscribed', resultKey: 'unsubscribed'},
    complained: {handler: 'handleComplained', resultKey: 'complained'}
};

/** @type {Record<string, {handler: string, resultKey: string}>} */
const FAILED_SEVERITY_CONFIG = {
    permanent: {handler: 'handlePermanentFailed', resultKey: 'permanentFailed'},
    temporary: {handler: 'handleTemporaryFailed', resultKey: 'temporaryFailed'}
};

module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    /** @type {FetchData} */
    #fetchLatestNonOpenedData = {running: false, jobName: 'email-analytics-latest-others'};

    /** @type {FetchData} */
    #fetchMissingData = {running: false, jobName: 'email-analytics-missing'};

    /** @type {FetchData} */
    #fetchLatestOpenedData = {running: false, jobName: 'email-analytics-latest-opened'};

    /** @type {FetchDataScheduled} */
    #fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};

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
            prometheusClient.registerCounter({
                name: 'email_analytics_aggregate_member_stats_count',
                help: 'Count of member stats aggregations'
            });
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
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp
            ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName, ['delivered', 'failed']))
            ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp
            ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName, ['opened']))
            ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastMissingEventTimestamp() {
        return this.#fetchMissingData?.lastEventTimestamp
            ?? (await this.queries.getLastJobRunTimestamp(this.#fetchMissingData.jobName))
            ?? new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    /**
     * @param {Object} [options]
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    /**
     * @param {Object} [options]
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestNonOpenedData, {
            begin, end, maxEvents,
            eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']
        });
    }

    /**
     * @param {object} [options]
     * @param {number} [options.maxEvents=Infinity]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const end = new Date(Math.min(
            Date.now() - TRUST_THRESHOLD_MS,
            this.#fetchLatestNonOpenedData?.lastBegin?.getTime() ?? Date.now()
        ));

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchMissing because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    /**
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

        logging.info(`[EmailAnalytics] Scheduling fetch from ${begin.toISOString()} until ${end.toISOString()}`);
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

        if (this.#fetchScheduledData.running) {
            this.#fetchScheduledData.canceled = true;
        } else {
            this.#fetchScheduledData = {...EMPTY_FETCH_DATA_SCHEDULED};
        }
    }

    /**
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

        const {schedule, lastEventTimestamp} = this.#fetchScheduledData;
        const end = schedule.end;
        const begin = (lastEventTimestamp && lastEventTimestamp > schedule.begin)
            ? lastEventTimestamp
            : schedule.begin;

        if (end <= begin) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = {...EMPTY_FETCH_DATA_SCHEDULED};
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});

        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {...EMPTY_FETCH_DATA_SCHEDULED};
        }

        this.queries.setJobTimestamp(
            this.#fetchScheduledData.jobName,
            'finished',
            this.#fetchScheduledData.lastEventTimestamp
        );

        return fetchResult;
    }

    /**
     * @param {FetchData} fetchData
     * @param {object} options
     * @param {Date} options.begin
     * @param {Date} options.end
     * @param {number} [options.maxEvents=Infinity]
     * @param {EmailAnalyticsEvent[]} [options.eventTypes]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;
        const timings = {api: 0, processing: 0, aggregation: 0};
        let eventCount = 0;
        let lastAggregation = Date.now();

        let processingResult = new EventProcessingResult();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();
        let error = null;

        const shouldRunIntermediateAggregation = () =>
            eventCount > 0 && (
                Date.now() - lastAggregation > INTERMEDIATE_AGGREGATION_INTERVAL_MS ||
                processingResult.memberIds.length > INTERMEDIATE_AGGREGATION_MEMBER_THRESHOLD
            );

        const runAggregation = async (target) => {
            const start = Date.now();
            await this.aggregateStats(target, includeOpenedEvents);
            timings.aggregation += Date.now() - start;
        };

        const processBatch = async (events) => {
            const beforeCounts = snapshotResultCounts(processingResult);
            const beforeEmailIds = new Set(processingResult.emailIds);
            const beforeMemberIds = new Set(processingResult.memberIds);

            const processingStart = Date.now();
            await this.processEventBatch(events, processingResult, fetchData);
            timings.processing += Date.now() - processingStart;
            eventCount += events.length;

            const newEmailIds = processingResult.emailIds.filter(id => !beforeEmailIds.has(id));
            const newMemberIds = processingResult.memberIds.filter(id => !beforeMemberIds.has(id));
            const batchDelta = computeBatchDelta(processingResult, beforeCounts, newEmailIds, newMemberIds);

            cumulativeResult.merge(batchDelta);
            newEmailIds.forEach(id => allEmailIds.add(id));
            newMemberIds.forEach(id => allMemberIds.add(id));

            if (shouldRunIntermediateAggregation()) {
                try {
                    await runAggregation(processingResult);
                    lastAggregation = Date.now();
                    processingResult.emailIds.forEach(id => allEmailIds.delete(id));
                    processingResult.memberIds.forEach(id => allMemberIds.delete