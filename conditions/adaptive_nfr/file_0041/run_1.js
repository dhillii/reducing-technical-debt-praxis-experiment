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
        if (!handler) {
            return new EventProcessingResult({unhandled: 1});
        }

        return handler();
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

class FetchEventHandler {
    constructor(queries, providers, eventProcessor, aggregationManager, config) {
        this.queries = queries;
        this.providers = providers;
        this.eventProcessor = eventProcessor;
        this.aggregationManager = aggregationManager;
        this.config = config;
    }

    async fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const metrics = {apiPollingTimeMs: 0, processingTimeMs: 0, aggregationTimeMs: 0};
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
            const beforeCounts = this.captureResultState(processingResult);
            const beforeEmailIds = new Set(processingResult.emailIds);
            const beforeMemberIds = new Set(processingResult.memberIds);

            await this.processBatchEvents(events, processingResult, fetchData);
            metrics.processingTimeMs += (Date.now() - processingStart);
            eventCount += events.length;

            const batchDelta = this.calculateBatchDelta(processingResult, beforeCounts, beforeEmailIds, beforeMemberIds);
            cumulativeResult.merge(batchDelta);
            batchDelta.emailIds.forEach(id => allEmailIds.add(id));
            batchDelta.memberIds.forEach(id => allMemberIds.add(id));

            if (this.shouldAggregate(lastAggregation, processingResult, eventCount)) {
                await this.performAggregation(processingResult, includeOpenedEvents, metrics, allEmailIds, allMemberIds);
                lastAggregation = Date.now();
            }

            if (fetchData.canceled) {
                throw new errors.InternalServerError({message: 'Fetching canceled'});
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                metrics.apiPollingTimeMs += (Date.now() - apiStart);
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

        await this.performFinalAggregation(processingResult, allEmailIds, allMemberIds, includeOpenedEvents, metrics);

        await this.updateJobStatus(fetchData, error, eventCount);
        fetchData.running = false;

        if (error) {
            throw error;
        }

        return {
            eventCount,
            apiPollingTimeMs: metrics.apiPollingTimeMs,
            processingTimeMs: metrics.processingTimeMs,
            aggregationTimeMs: metrics.aggregationTimeMs,
            result: cumulativeResult
        };
    }

    captureResultState(result) {
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

    calculateBatchDelta(result, beforeCounts, beforeEmailIds, beforeMemberIds) {
        return new EventProcessingResult({
            opened: result.opened - beforeCounts.opened,
            delivered: result.delivered - beforeCounts.delivered,
            temporaryFailed: result.temporaryFailed - beforeCounts.temporaryFailed,
            permanentFailed: result.permanentFailed - beforeCounts.permanentFailed,
            unsubscribed: result.unsubscribed - beforeCounts.unsubscribed,
            complained: result.complained - beforeCounts.complained,
            unhandled: result.unhandled - beforeCounts.unhandled,
            unprocessable: result.unprocessable - beforeCounts.unprocessable,
            emailIds: result.emailIds.filter(id => !beforeEmailIds.has(id)),
            memberIds: result.memberIds.filter(id => !beforeMemberIds.has(id))
        });
    }

    shouldAggregate(lastAggregation, result, eventCount) {
        return (Date.now() - lastAggregation > AGGREGATION_INTERVAL_MS || result.memberIds.length > AGGREGATION_MEMBER_THRESHOLD) && eventCount > 0;
    }

    async performAggregation(result, includeOpenedEvents, metrics, allEmailIds, allMemberIds) {
        try {
            const aggregationStart = Date.now();
            await this.aggregationManager.aggregateStats(result, includeOpenedEvents);
            metrics.aggregationTimeMs += (Date.now() - aggregationStart);
            result.emailIds.forEach(id => allEmailIds.delete(id));
            result.memberIds.forEach(id => allMemberIds.delete(id));
        } catch (err) {
            logging.error('[EmailAnalytics] Error while aggregating stats');
            logging.error(err);
        }
    }

    async performFinalAggregation(result, allEmailIds, allMemberIds, includeOpenedEvents, metrics) {
        const finalEmailIds = Array.from(new Set([...result.emailIds, ...allEmailIds]));
        const finalMemberIds = Array.from(new Set([...result.memberIds, ...allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggregationStart = Date.now();
                await this.aggregationManager.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, includeOpenedEvents);
                metrics.aggregationTimeMs += (Date.now() - aggregationStart);
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
            }
        }
    }

    async processBatchEvents(events, result, fetchData) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            const emailIdentifications = events.map(event => ({
                emailId: event.emailId,
                providerId: event.providerId,
                email: event.recipientEmail
            }));
            const recipientCache = await this.eventProcessor.eventProcessor.batchGetRecipients(emailIdentifications);

            for (const event of events) {
                const batchResult = await this.eventProcessor.processEvent(event, recipientCache);
                this.updateLastEventTimestamp(fetchData, event);
                result.merge(batchResult);
            }

            await this.eventProcessor.eventProcessor.flushBatchedUpdates();
        } else {
            for (const event of events) {
                const batchResult = await this.eventProcessor.processEvent(event);
                this.updateLastEventTimestamp(fetchData, event);
                result.merge(batchResult);
            }
        }
    }

    updateLastEventTimestamp(fetchData, event) {
        if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
            fetchData.lastEventTimestamp = event.timestamp;
        }
    }

    async updateJobStatus(fetchData, error,