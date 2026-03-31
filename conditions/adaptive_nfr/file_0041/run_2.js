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
    #data = new Map();

    constructor() {
        this.#data.set('latest-others', createFetchData('email-analytics-latest-others'));
        this.#data.set('missing', createFetchData('email-analytics-missing'));
        this.#data.set('latest-opened', createFetchData('email-analytics-latest-opened'));
        this.#data.set('scheduled', createFetchData('email-analytics-scheduled'));
    }

    get(key) {
        return this.#data.get(key);
    }

    set(key, value) {
        this.#data.set(key, value);
    }

    getStatus() {
        return {
            latest: this.#data.get('latest-others'),
            missing: this.#data.get('missing'),
            scheduled: this.#data.get('scheduled'),
            latestOpened: this.#data.get('latest-opened')
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
            'delivered': () => this.handleDelivered(event, recipientCache),
            'opened': () => this.handleOpened(event, recipientCache),
            'failed': () => this.handleFailed(event, recipientCache),
            'unsubscribed': () => this.handleUnsubscribed(event, recipientCache),
            'complained': () => this.handleComplained(event, recipientCache)
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

    async aggregate({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
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

    toObject() {
        return {
            apiPollingTimeMs: this.apiPollingTimeMs,
            processingTimeMs: this.processingTimeMs,
            aggregationTimeMs: this.aggregationTimeMs
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
        const fetchData = this.#fetchDataManager.get('latest-others');
        return fetchData?.lastEventTimestamp
            ?? (await this.queries.getLastEventTimestamp(fetchData.jobName, ['delivered', 'failed']))
            ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastOpenedEventTimestamp() {
        const fetchData = this.#fetchDataManager.get('latest-opened');
        return fetchData?.lastEventTimestamp
            ?? (await this.queries.getLastEventTimestamp(fetchData.jobName, ['opened']))
            ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastMissingEventTimestamp() {
        const fetchData = this.#fetchDataManager.get('missing');
        return fetchData?.lastEventTimestamp
            ?? (await this.queries.getLastJobRunTimestamp(fetchData.jobName))
            ?? new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchDataManager.get('latest-opened'), {
            begin,
            end,
            maxEvents,
            eventTypes: ['opened']
        });
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchDataManager.get('latest-others'), {
            begin,
            end,
            maxEvents,
            eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']
        });
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const latestOthersData = this.#fetchDataManager.get('latest-others');
        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                latestOthersData?.lastBegin?.getTime() || Date.now()
            )
        );

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchMissing because end (' + end + ') is before begin (' + begin + ')');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchDataManager.get('missing'), {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        const scheduledData = this.#fetchDataManager.get('scheduled');
        if (scheduledData?.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }
        logging.info('[EmailAnalytics] Scheduling fetch from ' + begin.toISOString() + ' until ' + end.toISOString());
        this.#fetchDataManager.set('scheduled', {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        });
    }

    cancelScheduled() {
        const scheduledData = this.#fetchDataManager.get('scheduled');
        if (scheduledData) {
            if (scheduledData.running) {
                scheduledData.canceled = true;
            } else {
                this.#fetchDataManager.set('scheduled', createFetchData('email-analytics-scheduled'));
            }
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        const scheduledData = this.#fetchDataManager.get('scheduled');

        if (!scheduledData?.schedule) {
            return createEmptyResult();
        }

        if (scheduledData.canceled) {
            this.#fetchDataManager.set('scheduled', createFetchData('email-analytics-scheduled'));
            return createEmptyResult();
        }

        let begin = scheduledData.schedule.begin;
        const end = scheduledData.schedule.end;

        if (scheduledData.lastEventTimestamp && scheduledData.lastEventTimestamp > begin) {
            begin = scheduledData.lastEventTimestamp;
        }

        if (end <= begin) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchDataManager.set('scheduled', createFetchData('email-analytics-scheduled'));
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(scheduledData, {begin, end, maxEvents});

        if (fetchResult.eventCount === 0 || scheduledData.canceled) {
            this.#fetchDataManager.set('scheduled', createFetchData('email-analytics-scheduled'));
        }

        this.queries.setJobTimestamp(scheduledData.jobName, 'finished', scheduledData.lastEventTimestamp);
        return fetchResult;
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetch