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

const TRUST_THRESHOLD_MS = 30 * 60 * 1000;
const FETCH_LATEST_END_MARGIN_MS = 1 * 60 * 1000;
const AGGREGATION_INTERVAL_MS = 5 * 60 * 1000;
const AGGREGATION_MEMBER_THRESHOLD = 5000;
const BATCH_SIZE = 100;

function createEmptyResult() {
    return {
        eventCount: 0,
        apiPollingTimeMs: 0,
        processingTimeMs: 0,
        aggregationTimeMs: 0,
        result: new EventProcessingResult()
    };
}

function createFetchData(jobName) {
    return {
        running: false,
        jobName
    };
}

class FetchDataManager {
    constructor() {
        this.latest = createFetchData('email-analytics-latest-others');
        this.missing = createFetchData('email-analytics-missing');
        this.latestOpened = createFetchData('email-analytics-latest-opened');
        this.scheduled = {
            running: false,
            jobName: 'email-analytics-scheduled'
        };
    }

    getStatus() {
        return {
            latest: this.latest,
            missing: this.missing,
            scheduled: this.scheduled,
            latestOpened: this.latestOpened
        };
    }
}

class EventProcessor {
    constructor(eventProcessor, config) {
        this.eventProcessor = eventProcessor;
        this.config = config;
    }

    async processEvent(event, recipientCache) {
        const handlers = {
            delivered: () => this.handleDelivered(event, recipientCache),
            opened: () => this.handleOpened(event, recipientCache),
            failed: () => this.handleFailed(event, recipientCache),
            unsubscribed: () => this.handleUnsubscribed(event, recipientCache),
            complained: () => this.handleComplained(event, recipientCache)
        };

        const handler = handlers[event.type];
        return handler ? await handler() : new EventProcessingResult({unhandled: 1});
    }

    async handleDelivered(event, recipientCache) {
        const recipient = await this.eventProcessor.handleDelivered(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
        return recipient
            ? new EventProcessingResult({delivered: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    async handleOpened(event, recipientCache) {
        const recipient = await this.eventProcessor.handleOpened(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
        return recipient
            ? new EventProcessingResult({opened: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    async handleFailed(event, recipientCache) {
        const isFailed = event.severity === 'permanent';
        const handler = isFailed ? 'handlePermanentFailed' : 'handleTemporaryFailed';
        const resultKey = isFailed ? 'permanentFailed' : 'temporaryFailed';

        const recipient = await this.eventProcessor[handler](
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            {id: event.id, timestamp: event.timestamp, error: event.error},
            recipientCache
        );
        return recipient
            ? new EventProcessingResult({[resultKey]: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    async handleUnsubscribed(event, recipientCache) {
        const recipient = await this.eventProcessor.handleUnsubscribed(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
        return recipient
            ? new EventProcessingResult({unsubscribed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }

    async handleComplained(event, recipientCache) {
        const recipient = await this.eventProcessor.handleComplained(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
        return recipient
            ? new EventProcessingResult({complained: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]})
            : new EventProcessingResult({unprocessable: 1});
    }
}

class AggregationManager {
    constructor(queries, prometheusClient, config) {
        this.queries = queries;
        this.prometheusClient = prometheusClient;
        this.config = config;
    }

    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        for (const emailId of emailIds) {
            await this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
        }

        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: ${BATCH_SIZE})`);
            for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
                const batch = memberIds.slice(i, i + BATCH_SIZE);
                await this.queries.aggregateMemberStatsBatch(batch);
                memberMetric?.inc(batch.length);
            }
        } else {
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using SEQUENTIAL mode`);
            for (const memberId of memberIds) {
                await this.queries.aggregateMemberStats(memberId);
                memberMetric?.inc();
            }
        }
    }
}

class TimingMetrics {
    constructor() {
        this.apiPollingTimeMs = 0;
        this.processingTimeMs = 0;
        this.aggregationTimeMs = 0;
    }

    addApiTime(ms) {
        this.apiPollingTimeMs += ms;
    }

    addProcessingTime(ms) {
        this.processingTimeMs += ms;
    }

    addAggregationTime(ms) {
        this.aggregationTimeMs += ms;
    }
}

module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;
    domainEvents;
    prometheusClient;
    #fetchDataManager;
    #eventProcessor;
    #aggregationManager;

    constructor({config, settings, queries, eventProcessor, providers, domainEvents, prometheusClient}) {
        this.config = config;
        this.settings = settings;
        this.queries = queries;
        this.eventProcessor = eventProcessor;
        this.providers = providers;
        this.domainEvents = domainEvents;
        this.prometheusClient = prometheusClient;
        this.#fetchDataManager = new FetchDataManager();
        this.#eventProcessor = new EventProcessor(eventProcessor, config);
        this.#aggregationManager = new AggregationManager(queries, prometheusClient, config);

        if (prometheusClient) {
            prometheusClient.registerCounter({
                name: 'email_analytics_aggregate_member_stats_count',
                help: 'Count of member stats aggregations'
            });
        }
    }

    getStatus() {
        return this.#fetchDataManager.getStatus();
    }

    async getLastNonOpenedEventTimestamp() {
        const cached = this.#fetchDataManager.latest?.lastEventTimestamp;
        if (cached) return cached;
        const stored = await this.queries.getLastEventTimestamp(this.#fetchDataManager.latest.jobName, ['delivered', 'failed']);
        return stored ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastOpenedEventTimestamp() {
        const cached = this.#fetchDataManager.latestOpened?.lastEventTimestamp;
        if (cached) return cached;
        const stored = await this.queries.getLastEventTimestamp(this.#fetchDataManager.latestOpened.jobName, ['opened']);
        return stored ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastMissingEventTimestamp() {
        const cached = this.#fetchDataManager.missing?.lastEventTimestamp;
        if (cached) return cached;
        const stored = await this.queries.getLastJobRunTimestamp(this.#fetchDataManager.missing.jobName);
        return stored ?? new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        return this.#fetchLatestEvents(this.#fetchDataManager.latestOpened, {maxEvents, eventTypes: ['opened']});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        return this.#fetchLatestEvents(this.#fetchDataManager.latest, {maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    async #fetchLatestEvents(fetchData, {maxEvents, eventTypes}) {
        const begin = eventTypes.includes('opened')
            ? await this.getLastOpenedEventTimestamp()
            : await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetch because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }

        return this.#fetchEvents(fetchData, {begin, end, maxEvents, eventTypes});
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchDataManager.latest?.lastBegin?.getTime() || Date.now()
            )
        );

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchMissing because end is before begin');
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchDataManager.missing, {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        if (this.#fetchDataManager.scheduled?.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }
        logging.info(`[EmailAnalytics] Scheduling fetch from ${begin.toISOString()} until ${end.toISOString()}`);
        this.#fetchDataManager.scheduled = {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    cancelScheduled() {
        if (!this.#fetchDataManager.scheduled) return;

        if (this.#fetchDataManager.scheduled.running) {
            this.#fetchDataManager.scheduled.canceled = true;
        } else {
            this.#fetchDataManager.scheduled = createFetchData('email-analytics-scheduled');
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        const scheduled = this.#fetchDataManager.scheduled;

        if (!scheduled?.schedule) {
            return createEmptyResult();
        }

        if (scheduled.canceled) {
            this.#fetchDataManager.scheduled = createFetchData('email-analytics-scheduled');
            return createEmptyResult();
        }

        let begin = scheduled.schedule.begin;
        const end = scheduled.schedule.end;

        if (scheduled.lastEventTimestamp && scheduled.lastEventTimestamp > begin) {
            begin = scheduled.lastEventTimestamp;
        }

        if (end <= begin) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchDataManager.scheduled = createFetchData('email-analytics-scheduled');
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(scheduled, {begin, end, maxEvents});

        if (fetchResult.eventCount === 0 || scheduled.canceled) {
            this.#fetchDataManager.scheduled = createFetchData('email-analytics-scheduled');
        }

        this.queries.setJobTimestamp(scheduled.jobName, 'finished', scheduled.lastEventTimestamp);
        return fetchResult;
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const metrics = new TimingMetrics();
        let lastAggregation = Date.now();
        let eventCount = 0;
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        let processingResult = new EventProcessingResult();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();
        let error = null;

        const processBatch = async (events) => {
            const processingStart = Date.now();
            const beforeCounts = this.#captureResultCounts(processingResult);
            const beforeEmailIds = new Set(processingResult.emailIds);
            const beforeMemberIds = new Set(processingResult.memberIds);

            await this.#processEventBatch(events, processingResult, fetchData);
            metrics.addProcessingTime(Date.now() - processingStart);
            event