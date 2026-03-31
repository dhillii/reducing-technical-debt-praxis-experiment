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
 * Event type handlers mapping
 */
const EVENT_HANDLERS = {
    delivered: 'handleDelivered',
    opened: 'handleOpened',
    failed: 'handleFailed',
    unsubscribed: 'handleUnsubscribed',
    complained: 'handleComplained'
};

/**
 * Fetch data factory
 */
class FetchDataFactory {
    static createLatestNonOpened() {
        return {running: false, jobName: 'email-analytics-latest-others'};
    }

    static createMissing() {
        return {running: false, jobName: 'email-analytics-missing'};
    }

    static createLatestOpened() {
        return {running: false, jobName: 'email-analytics-latest-opened'};
    }

    static createScheduled() {
        return {running: false, jobName: 'email-analytics-scheduled'};
    }

    static createScheduledWithDates(begin, end) {
        return {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    static createEmpty() {
        return {running: false, jobName: 'email-analytics-scheduled'};
    }
}

/**
 * Timing metrics tracker
 */
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

    toObject() {
        return {
            apiPollingTimeMs: this.apiPollingTimeMs,
            processingTimeMs: this.processingTimeMs,
            aggregationTimeMs: this.aggregationTimeMs
        };
    }
}

/**
 * Event batch processor
 */
class EventBatchProcessor {
    constructor(eventProcessor, config) {
        this.eventProcessor = eventProcessor;
        this.config = config;
    }

    async processBatch(events, result, fetchData, recipientCache = null) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing && !recipientCache) {
            recipientCache = await this.eventProcessor.batchGetRecipients(
                events.map(event => ({
                    emailId: event.emailId,
                    providerId: event.providerId,
                    email: event.recipientEmail
                }))
            );
        }

        for (const event of events) {
            const batchResult = await this.processEvent(event, recipientCache);
            this.updateFetchDataTimestamp(fetchData, event);
            result.merge(batchResult);
        }

        if (useBatchProcessing) {
            await this.eventProcessor.flushBatchedUpdates();
        }
    }

    updateFetchDataTimestamp(fetchData, event) {
        if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
            fetchData.lastEventTimestamp = event.timestamp;
        }
    }

    async processEvent(event, recipientCache = null) {
        const handler = this.getEventHandler(event.type);
        if (!handler) {
            return new EventProcessingResult({unhandled: 1});
        }

        const recipient = await handler.call(this.eventProcessor, event, recipientCache);
        return this.buildResult(recipient);
    }

    getEventHandler(eventType) {
        if (eventType === 'delivered') {
            return async (recipientCache) => this.eventProcessor.handleDelivered(
                {emailId: this.emailId, providerId: this.providerId, email: this.recipientEmail},
                this.timestamp,
                recipientCache
            );
        }
        if (eventType === 'opened') {
            return async (recipientCache) => this.eventProcessor.handleOpened(
                {emailId: this.emailId, providerId: this.providerId, email: this.recipientEmail},
                this.timestamp,
                recipientCache
            );
        }
        if (eventType === 'failed') {
            return async (recipientCache) => this.handleFailedEvent(recipientCache);
        }
        if (eventType === 'unsubscribed') {
            return async (recipientCache) => this.eventProcessor.handleUnsubscribed(
                {emailId: this.emailId, providerId: this.providerId, email: this.recipientEmail},
                this.timestamp,
                recipientCache
            );
        }
        if (eventType === 'complained') {
            return async (recipientCache) => this.eventProcessor.handleComplained(
                {emailId: this.emailId, providerId: this.providerId, email: this.recipientEmail},
                this.timestamp,
                recipientCache
            );
        }
        return null;
    }

    buildResult(recipient, eventType = null) {
        if (!recipient) {
            return new EventProcessingResult({unprocessable: 1});
        }

        const result = {
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        };

        if (eventType === 'delivered') result.delivered = 1;
        else if (eventType === 'opened') result.opened = 1;
        else if (eventType === 'permanentFailed') result.permanentFailed = 1;
        else if (eventType === 'temporaryFailed') result.temporaryFailed = 1;
        else if (eventType === 'unsubscribed') result.unsubscribed = 1;
        else if (eventType === 'complained') result.complained = 1;

        return new EventProcessingResult(result);
    }
}

/**
 * Aggregation coordinator
 */
class AggregationCoordinator {
    constructor(queries, prometheusClient, config) {
        this.queries = queries;
        this.prometheusClient = prometheusClient;
        this.config = config;
    }

    async aggregateStats(emailIds = [], memberIds = [], includeOpenedEvents = true) {
        await this.aggregateEmails(emailIds, includeOpenedEvents);
        await this.aggregateMembers(memberIds);
    }

    async aggregateEmails(emailIds, includeOpenedEvents) {
        for (const emailId of emailIds) {
            await this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
        }
    }

    async aggregateMembers(memberIds) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');
        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');

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

/**
 * Fetch state validator
 */
class FetchStateValidator {
    static validateTimeRange(begin, end, jobName) {
        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping ${jobName} because end (${end}) is before begin (${begin})`);
            return false;
        }
        return true;
    }

    static validateScheduledFetch(fetchData) {
        if (!fetchData || !fetchData.schedule) {
            return false;
        }
        if (fetchData.canceled) {
            return false;
        }
        return true;
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

    #fetchLatestNonOpenedData;
    #fetchMissingData;
    #fetchLatestOpenedData;
    #fetchScheduledData;
    #batchProcessor;
    #aggregationCoordinator;

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

        this.#fetchLatestNonOpenedData = FetchDataFactory.createLatestNonOpened();
        this.#fetchMissingData = FetchDataFactory.createMissing();
        this.#fetchLatestOpenedData = FetchDataFactory.createLatestOpened();
        this.#fetchScheduledData = FetchDataFactory.createScheduled();

        this.#batchProcessor = new EventBatchProcessor(eventProcessor, config);
        this.#aggregationCoordinator = new AggregationCoordinator(queries, prometheusClient, config);

        if (prometheusClient) {
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
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (!FetchStateValidator.validateTimeRange(begin, end, 'fetchLatestOpenedEvents')) {
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestOpenedData, {
            begin,
            end,
            maxEvents,
            eventTypes: ['opened']
        });
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (!FetchStateValidator.validateTimeRange(begin, end, 'fetchLatestNonOpenedEvents')) {
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestNonOpenedData, {
            begin,
            end,
            maxEvents,
            eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']
        });
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
            )
        );

        if (!FetchStateValidator.validateTimeRange(begin, end, 'fetchMissing')) {
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        if (this.#fetchScheduledData?.running) {
            throw new errors