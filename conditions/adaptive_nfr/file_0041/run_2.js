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
const MEMBER_BATCH_SIZE = 100;

const EMPTY_SCHEDULED_FETCH_DATA = Object.freeze({
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
 * @param {string} jobName
 * @returns {FetchData}
 */
function createFetchData(jobName) {
    return {running: false, jobName};
}

/**
 * Extract recipient identification from an event
 * @param {{emailId?: string, providerId: string, recipientEmail: string}} event
 */
function getRecipientId(event) {
    return {
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    };
}

/**
 * Build an EventProcessingResult from a recipient and a result field name
 * @param {object|null} recipient
 * @param {string} field
 * @returns {EventProcessingResult}
 */
function buildEventResult(recipient, field) {
    if (!recipient) {
        return new EventProcessingResult({unprocessable: 1});
    }
    return new EventProcessingResult({
        [field]: 1,
        emailIds: [recipient.emailId],
        memberIds: [recipient.memberId]
    });
}

module.exports = class EmailAnalyticsService {
    config;
    settings;
    queries;
    eventProcessor;
    providers;

    /** @type {FetchData} */
    #fetchLatestNonOpenedData = createFetchData('email-analytics-latest-others');

    /** @type {FetchData} */
    #fetchMissingData = createFetchData('email-analytics-missing');

    /** @type {FetchData} */
    #fetchLatestOpenedData = createFetchData('email-analytics-latest-opened');

    /** @type {FetchDataScheduled} */
    #fetchScheduledData = createFetchData('email-analytics-scheduled');

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
     * @param {number} [options.maxEvents]
     * @returns {Promise<EmailAnalyticsFetchResult>}
     */
    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();
        const end = new Date(Math.min(
            Date.now() - TRUST_THRESHOLD_MS,
            this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
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
            ...EMPTY_SCHEDULED_FETCH_DATA,
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
            this.#fetchScheduledData = {...EMPTY_SCHEDULED_FETCH_DATA};
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
            this.#fetchScheduledData = {...EMPTY_SCHEDULED_FETCH_DATA};
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});

        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {...EMPTY_SCHEDULED_FETCH_DATA};
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
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

        const metrics = {apiPollingTimeMs: 0, processingTimeMs: 0, aggregationTimeMs: 0};
        const includeOpenedEvents = eventTypes?.includes('opened') ?? false;

        let eventCount = 0;
        let lastAggregation = Date.now();
        let processingResult = new EventProcessingResult();
        const cumulativeResult = new EventProcessingResult();
        const allEmailIds = new Set();
        const allMemberIds = new Set();
        let error = null;

        const processBatch = async (events) => {
            const processingStart = Date.now();
            const snapshot = this.#snapshotResult(processingResult);

            await this.processEventBatch(events, processingResult, fetchData);
            metrics.processingTimeMs += Date.now() - processingStart;
            eventCount += events.length;

            const delta = this.#computeDelta(processingResult, snapshot);
            cumulativeResult.merge(delta);
            delta.emailIds.forEach(id => allEmailIds.add(id));
            delta.memberIds.forEach(id => allMemberIds.add(id));

            const shouldAggregate = eventCount > 0 && (
                Date.now() - lastAggregation > INTERMEDIATE_AGGREGATION_INTERVAL_MS ||
                processingResult.memberIds.length > INTERMEDIATE_AGGREGATION_MEMBER_THRESHOLD
            );

            if (shouldAggregate) {
                try {
                    const aggStart = Date.now();
                    await this.aggregateStats(processingResult, includeOpenedEvents);
                    metrics.aggregationTimeMs += Date.now() - aggStart;
                    lastAggregation = Date.now();
                    processingResult.emailIds.forEach(id => allEmailIds.delete(id));
                    processingResult.memberIds.forEach(id => allMemberIds.delete(id));
                    processingResult = new EventProcessingResult();
                } catch (err) {
                    logging.error('[EmailAnalytics] Error while aggregating stats');
                    logging.error(err);
                }
            }

            if (fetchData.canceled) {
                throw new errors.InternalServerError({message: 'Fetching canceled'});
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                metrics.apiPollingTimeMs += Date.now() - apiStart;
            }
        } catch (err) {
            if (err.message === 'Fetching canceled') {
                logging.error('[EmailAnalytics] Canceled fetching');
            } else {
                logging.error('[EmailAnalytics] Error while fetching');
                logging.error(err);
                error = err;
            }
        }

        const finalEmailIds = [...new Set([...processingResult.emailIds, ...allEmailIds])];
        const finalMemberIds = [...new Set([...processingResult.memberIds, ...allMemberIds])];

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggStart = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, includeOpenedEvents);
                metrics.aggregationTimeMs += Date.now() - aggStart;
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
                error = error ?? err;
            }
        }

        await this.#finalizeJobTimestamp(fetchData, error, eventCount);

        fetchData.running = false;

        if (error) {
            throw error;
        }

        return {eventCount, ...metrics, result: cumulativeResult};
    }

    /**
     * @