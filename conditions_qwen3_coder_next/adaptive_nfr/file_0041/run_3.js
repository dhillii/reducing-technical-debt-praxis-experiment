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
 * @property {Date} [lastStarted] Date the fetch started
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
 * Checks whether the event is a 'delivered' event
 * @param {object} event - The event object
 * @returns {boolean}
 */
function isDeliveredEvent(event) {
    return event.type === 'delivered';
}

/**
 * Checks whether the event is an 'opened' event
 * @param {object} event - The event object
 * @returns {boolean}
 */
function isOpenedEvent(event) {
    return event.type === 'opened';
}

/**
 * Checks whether the event is a 'failed' event
 * @param {object} event - The event object
 * @returns {boolean}
 */
function isFailedEvent(event) {
    return event.type === 'failed';
}

/**
 * Checks whether the event is an 'unsubscribed' event
 * @param {object} event - The event object
 * @returns {boolean}
 */
function isUnsubscribedEvent(event) {
    return event.type === 'unsubscribed';
}

/**
 * Checks whether the event is a 'complained' event
 * @param {object} event - The event object
 * @returns {boolean}
 */
function isComplainedEvent(event) {
    return event.type === 'complained';
}

/**
 * Checks whether the failed event has permanent severity
 * @param {object} event - The failed event object
 * @returns {boolean}
 */
function isPermanentFailure(event) {
    return event.severity === 'permanent';
}

/**
 * Processes a delivered event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processDeliveredEvent(eventProcessor, event, recipientCache) {
    const recipient = await eventProcessor.handleDelivered({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }, event.timestamp, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            delivered: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}

/**
 * Processes an opened event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processOpenedEvent(eventProcessor, event, recipientCache) {
    const recipient = await eventProcessor.handleOpened({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }, event.timestamp, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            opened: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}

/**
 * Processes a permanent failed event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processPermanentFailedEvent(eventProcessor, event, recipientCache) {
    const recipient = await eventProcessor.handlePermanentFailed({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }, {
        id: event.id,
        timestamp: event.timestamp,
        error: event.error
    }, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            permanentFailed: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}

/**
 * Processes a temporary failed event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processTemporaryFailedEvent(eventProcessor, event, recipientCache) {
    const recipient = await eventProcessor.handleTemporaryFailed({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }, {
        id: event.id,
        timestamp: event.timestamp,
        error: event.error
    }, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            temporaryFailed: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}

/**
 * Processes a failed event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processFailedEvent(eventProcessor, event, recipientCache) {
    if (isPermanentFailure(event)) {
        return await processPermanentFailedEvent(eventProcessor, event, recipientCache);
    } else {
        return await processTemporaryFailedEvent(eventProcessor, event, recipientCache);
    }
}

/**
 * Processes an unsubscribed event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processUnsubscribedEvent(eventProcessor, event, recipientCache) {
    const recipient = await eventProcessor.handleUnsubscribed({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }, event.timestamp, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            unsubscribed: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}

/**
 * Processes a complained event and returns the processing result
 * @param {EmailEventProcessor} eventProcessor - The event processor instance
 * @param {object} event - The event object
 * @param {Map<string, any>} [recipientCache] - Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function processComplainedEvent(eventProcessor, event, recipientCache) {
    const recipient = await eventProcessor.handleComplained({
        emailId: event.emailId,
        providerId: event.providerId,
        email: event.recipientEmail
    }, event.timestamp, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            complained: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}

/**
 * @typedef {object} ProcessEventOptions
 * @property {EmailEventProcessor} eventProcessor
 * @property {object} event
 * @property {Map<string, any>} [recipientCache]
 */

/**
 * Processes a single event and returns the processing result
 * @param {ProcessEventOptions} options - The processing options
 * @returns {Promise<EventProcessingResult>}
 */
async function processSingleEvent(options) {
    const {eventProcessor, event, recipientCache} = options;

    if (isDeliveredEvent(event)) {
        return await processDeliveredEvent(eventProcessor, event, recipientCache);
    }

    if (isOpenedEvent(event)) {
        return await processOpenedEvent(eventProcessor, event, recipientCache);
    }

    if (isFailedEvent(event)) {
        return await processFailedEvent(eventProcessor, event, recipientCache);
    }

    if (isUnsubscribedEvent(event)) {
        return await processUnsubscribedEvent(eventProcessor, event, recipientCache);
    }

    if (isComplainedEvent(event)) {
        return await processComplainedEvent(eventProcessor, event, recipientCache);
    }

    return new EventProcessingResult({unhandled: 1});
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

    constructor({config, settings, queries, eventProcessor, providers, domainEvents, prometheusClient}) {
        this.config = config;
        this.settings = settings;
        this.queries = queries;
        this.eventProcessor = eventProcessor;
        this.providers = providers;
        this.domainEvents = domainEvents;
        this.prometheusClient = prometheusClient;

        if (prometheusClient) {
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
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName, ['delivered', 'failed'])) ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp ?? (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName, ['opened'])) ?? new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    async getLastMissingEventTimestamp() {
        return this.#fetchMissingData?.lastEventTimestamp ?? (await this.queries.getLastJobRunTimestamp(this.#fetchMissingData.jobName)) ?? new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end is before begin');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end is before begin');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestNonOpenedData, {begin, end, maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    async fetchMissing({maxEvents = Infinity} = {}) {
        const begin = await this.getLastMissingEventTimestamp();

        const end = new Date(
            Math.min(
                Date.now() - TRUST_THRESHOLD_MS,
                this.#fetchLatestNonOpenedData?.lastBegin?.getTime() || Date.now()
            )
        );

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchMissing because end is before begin');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

    schedule({begin, end}) {
        if (this.#fetchScheduledData && this.#fetchScheduledData.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }

        logging.info('[EmailAnalytics] Scheduling fetch from ' + begin.toISOString() + ' until ' + end.toISOString());
        this.#fetchScheduledData = {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {
                begin,
                end
            }
        };
    }

    cancelScheduled() {
        if (this.#fetchScheduledData) {
            if (this.#fetchScheduledData.running) {
                this.#fetchScheduledData.canceled = true;
            } else {
                this.#fetchScheduledData = {
                    running: false,
                    jobName: 'email-analytics-scheduled'
                };
            }
        }
    }

    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData || !this.#fetchScheduledData.schedule) {
            return createEmptyResult();
        }

        if (this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = null;
            return createEmptyResult();
        }

        let begin = this.#fetchScheduledData.schedule.begin;
        const end = this.#fetchScheduledData.schedule.end;

        if (this.#fetchScheduledData.lastEventTimestamp && this.#fetchScheduledData.lastEventTimestamp > begin) {
            begin = this.#fetchScheduledData.lastEventTimestamp;
        }

        if (end <= begin) {
            logging.info('[EmailAnalytics] Ending fetchScheduled because end is before begin');
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});

        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        let apiPollingTimeMs = 0;
        let processingTimeMs = 0;
        let aggregationTimeMs = 0;

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

            await this.processEventBatch(events, processingResult, fetchData);
            processingTimeMs += (Date.now() - processingStart);
            eventCount += events.length;

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

            if ((Date.now() - lastAggregation > 5 * 60 * 1000 || processingResult.memberIds.length > 5000) && eventCount > 0) {
                try {
                    const aggregationStart = Date.now();
                    await this.aggregateStats(processingResult, includeOpenedEvents);
                    aggregationTimeMs += (Date.now() - aggregationStart);
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
                throw new errors.InternalServerError({
                    message: 'Fetching canceled'
                });
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                apiPollingTimeMs += (Date.now() - apiStart);
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

        const finalEmailIds = Array.from(new Set([...processingResult.emailIds, ...allEmailIds]));
        const finalMemberIds = Array.from(new Set([...processingResult.memberIds, ...allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggregationStart = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, includeOpenedEvents);
                aggregationTimeMs += (Date.now() - aggregationStart);
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);

                if (!error) {
                    error = err;
                }
            }
        }

        if (!error && eventCount > 0 && fetchData.lastEventTimestamp && fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(fetchData.jobName, 'finished', new Date(fetchData.lastEventTimestamp.getTime()));
            fetchData.lastEventTimestamp = new Date(fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(fetchData.jobName, 'finished');
        }

        fetchData.running = false;

        if (error) {
            throw error;
        }

        return {
            eventCount,
            apiPollingTimeMs,
            processingTimeMs,
            aggregationTimeMs,
            result: cumulativeResult
        };
    }

    async processEventBatch(events, result, fetchData) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        if (useBatchProcessing) {
            const emailIdentifications = events.map(event => ({
                emailId: event.emailId,
                providerId: event.providerId,
                email: event.recipientEmail
            }));

            const recipientCache = await this.eventProcessor.batchGetRecipients(emailIdentifications);

            for (const event of events) {
                const batchResult = await this.processEvent(event, recipientCache);

                if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                    fetchData.lastEventTimestamp = event.timestamp;
                }

                result.merge(batchResult);
            }

            await this.eventProcessor.flushBatchedUpdates();
        } else {
            for (const event of events) {
                const batchResult = await this.processEvent(event);

                if (!fetchData.lastEventTimestamp || (event.timestamp && event.timestamp > fetchData.lastEventTimestamp)) {
                    fetchData.lastEventTimestamp = event.timestamp;
                }

                result.merge(batchResult);
            }
        }
    }

    async processEvent(event, recipientCache) {
        return await processSingleEvent({eventProcessor: this.eventProcessor, event, recipientCache});
    }

    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

        for (const emailId of emailIds) {
            await this.aggregateEmailStats(emailId, includeOpenedEvents);
        }

        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');

        if (useBatchProcessing) {
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using BATCHED mode (batch size: 100)`);
            const BATCH_SIZE = 100;
            for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
                const batch = memberIds.slice(i, i + BATCH_SIZE);
                await this.aggregateMemberStatsBatch(batch);
                memberMetric?.inc(batch.length);
            }
        } else {
            logging.info(`[EmailAnalytics] Aggregating stats for ${memberIds.length} members using SEQUENTIAL mode`);
            for (const memberId of memberIds) {
                await this.aggregateMemberStats(memberId);
                memberMetric?.inc();
            }
        }
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