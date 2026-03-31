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
 * Event type to result field mapping
 */
const EVENT_TYPE_RESULTS = {
    delivered: 'delivered',
    opened: 'opened',
    permanentFailed: 'permanentFailed',
    temporaryFailed: 'temporaryFailed',
    unsubscribed: 'unsubscribed',
    complained: 'complained'
};

class FetchDataManager {
    constructor() {
        this.latest = {running: false, jobName: 'email-analytics-latest-others'};
        this.missing = {running: false, jobName: 'email-analytics-missing'};
        this.latestOpened = {running: false, jobName: 'email-analytics-latest-opened'};
        this.scheduled = {running: false, jobName: 'email-analytics-scheduled'};
    }

    getStatus() {
        return {
            latest: this.latest,
            missing: this.missing,
            scheduled: this.scheduled,
            latestOpened: this.latestOpened
        };
    }

    resetScheduled() {
        this.scheduled = {running: false, jobName: 'email-analytics-scheduled'};
    }
}

class EventProcessor {
    constructor(eventProcessor, config) {
        this.eventProcessor = eventProcessor;
        this.config = config;
    }

    async processEvent(event, recipientCache) {
        const handler = this.#getHandler(event.type);
        if (!handler) {
            return new EventProcessingResult({unhandled: 1});
        }

        const recipient = await handler.call(this, event, recipientCache);
        if (!recipient) {
            return new EventProcessingResult({unprocessable: 1});
        }

        return new EventProcessingResult({
            [handler.resultField]: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    async processBatch(events, result, fetchData) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            await this.#processBatchMode(events, result, fetchData);
        } else {
            await this.#processSequentialMode(events, result, fetchData);
        }
    }

    async #processBatchMode(events, result, fetchData) {
        const emailIdentifications = events.map(event => ({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }));

        const recipientCache = await this.eventProcessor.batchGetRecipients(emailIdentifications);

        for (const event of events) {
            const batchResult = await this.processEvent(event, recipientCache);
            this.#updateFetchData(event, fetchData);
            result.merge(batchResult);
        }

        await this.eventProcessor.flushBatchedUpdates();
    }

    async #processSequentialMode(events, result, fetchData) {
        for (const event of events) {
            const batchResult = await this.processEvent(event);
            this.#updateFetchData(event, fetchData);
            result.merge(batchResult);
        }
    }

    #updateFetchData(event, fetchData) {
        if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
            fetchData.lastEventTimestamp = event.timestamp;
        }
    }

    #getHandler(eventType) {
        switch (eventType) {
            case 'delivered':
                return this.#handleDelivered;
            case 'opened':
                return this.#handleOpened;
            case 'failed':
                return this.#handleFailed;
            case 'unsubscribed':
                return this.#handleUnsubscribed;
            case 'complained':
                return this.#handleComplained;
            default:
                return null;
        }
    }

    async #handleDelivered(event, recipientCache) {
        return this.eventProcessor.handleDelivered(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
    }

    async #handleOpened(event, recipientCache) {
        return this.eventProcessor.handleOpened(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
    }

    async #handleFailed(event, recipientCache) {
        const handler = event.severity === 'permanent'
            ? this.eventProcessor.handlePermanentFailed
            : this.eventProcessor.handleTemporaryFailed;

        return handler.call(this.eventProcessor,
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            {id: event.id, timestamp: event.timestamp, error: event.error},
            recipientCache
        );
    }

    async #handleUnsubscribed(event, recipientCache) {
        return this.eventProcessor.handleUnsubscribed(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
    }

    async #handleComplained(event, recipientCache) {
        return this.eventProcessor.handleComplained(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
    }
}

class AggregationManager {
    constructor(queries, config, prometheusClient) {
        this.queries = queries;
        this.config = config;
        this.prometheusClient = prometheusClient;
    }

    async aggregate(emailIds = [], memberIds = [], includeOpenedEvents = true) {
        for (const emailId of emailIds) {
            await this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
        }

        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            await this.#aggregateBatch(memberIds, memberMetric);
        } else {
            await this.#aggregateSequential(memberIds, memberMetric);
        }
    }

    async #aggregateBatch(memberIds, memberMetric) {
        logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: ${BATCH_SIZE})`);
        for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
            const batch = memberIds.slice(i, i + BATCH_SIZE);
            await this.queries.aggregateMemberStatsBatch(batch);
            memberMetric?.inc(batch.length);
        }
    }

    async #aggregateSequential(memberIds, memberMetric) {
        logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using SEQUENTIAL mode`);
        for (const memberId of memberIds) {
            await this.queries.aggregateMemberStats(memberId);
            memberMetric?.inc();
        }
    }
}

class FetchStateManager {
    constructor(fetchData, queries) {
        this.fetchData = fetchData;
        this.queries = queries;
        this.timings = {api: 0, processing: 0, aggregation: 0};
        this.eventCount = 0;
        this.lastAggregation = Date.now();
        this.processingResult = new EventProcessingResult();
        this.cumulativeResult = new EventProcessingResult();
        this.allEmailIds = new Set();
        this.allMemberIds = new Set();
        this.error = null;
    }

    shouldAggregate() {
        return (Date.now() - this.lastAggregation > AGGREGATION_INTERVAL_MS ||
                this.processingResult.memberIds.length > AGGREGATION_MEMBER_THRESHOLD) &&
               this.eventCount > 0;
    }

    resetAggregation() {
        this.lastAggregation = Date.now();
        this.processingResult.emailIds.forEach(id => this.allEmailIds.delete(id));
        this.processingResult.memberIds.forEach(id => this.allMemberIds.delete(id));
        this.processingResult = new EventProcessingResult();
    }

    recordBatchDelta(beforeCounts) {
        const batchDelta = new EventProcessingResult({
            opened: this.processingResult.opened - beforeCounts.opened,
            delivered: this.processingResult.delivered - beforeCounts.delivered,
            temporaryFailed: this.processingResult.temporaryFailed - beforeCounts.temporaryFailed,
            permanentFailed: this.processingResult.permanentFailed - beforeCounts.permanentFailed,
            unsubscribed: this.processingResult.unsubscribed - beforeCounts.unsubscribed,
            complained: this.processingResult.complained - beforeCounts.complained,
            unhandled: this.processingResult.unhandled - beforeCounts.unhandled,
            unprocessable: this.processingResult.unprocessable - beforeCounts.unprocessable,
            emailIds: this.processingResult.emailIds.filter(id => !beforeCounts.emailIds.has(id)),
            memberIds: this.processingResult.memberIds.filter(id => !beforeCounts.memberIds.has(id))
        });

        this.cumulativeResult.merge(batchDelta);
        batchDelta.emailIds.forEach(id => this.allEmailIds.add(id));
        batchDelta.memberIds.forEach(id => this.allMemberIds.add(id));
    }

    getBeforeCounts() {
        return {
            opened: this.processingResult.opened,
            delivered: this.processingResult.delivered,
            temporaryFailed: this.processingResult.temporaryFailed,
            permanentFailed: this.processingResult.permanentFailed,
            unsubscribed: this.processingResult.unsubscribed,
            complained: this.processingResult.complained,
            unhandled: this.processingResult.unhandled,
            unprocessable: this.processingResult.unprocessable,
            emailIds: new Set(this.processingResult.emailIds),
            memberIds: new Set(this.processingResult.memberIds)
        };
    }

    getFinalAggregationIds() {
        return {
            emailIds: Array.from(new Set([...this.processingResult.emailIds, ...this.allEmailIds])),
            memberIds: Array.from(new Set([...this.processingResult.memberIds, ...this.allMemberIds]))
        };
    }

    async finalize() {
        if (!this.error && this.eventCount > 0 && this.fetchData.lastEventTimestamp &&
            this.fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(this.fetchData.jobName, 'finished', new Date(this.fetchData.lastEventTimestamp.getTime()));
            this.fetchData.lastEventTimestamp = new Date(this.fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(this.fetchData.jobName, 'finished');
        }

        this.fetchData.running = false;
    }

    getResult() {
        return {
            eventCount: this.eventCount,
            apiPollingTimeMs: this.timings.api,
            processingTimeMs: this.timings.processing,
            aggregationTimeMs: this.timings.aggregation,
            result: this.cumulativeResult
        };
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
        this.#aggregationManager = new AggregationManager(queries, config, prometheusClient);

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
        return this.#fetchDataManager.latest?.lastEventTimestamp ??
               (await this.queries.getLastEventTimestamp(this.#fetchDataManager.latest.jobName, ['delivered', 'failed'])) ??
               new Date(Date.now() -