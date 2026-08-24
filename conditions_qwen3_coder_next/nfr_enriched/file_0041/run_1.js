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
 * @property {Date} [lastBegin] The begin time used for the last fetch
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
 * @property {number} eventCount
 * @property {number} apiPollingTimeMs
 * @property {number} processingTimeMs
 * @property {number} aggregationTimeMs
 * @property {EventProcessingResult} result
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

    /**
     * Returns the timestamp of the last non-opened event we processed. Defaults to now minus 30 minutes if we have no data yet.
     */
    async getLastNonOpenedEventTimestamp() {
        return this.#fetchLatestNonOpenedData?.lastEventTimestamp ??
            (await this.queries.getLastEventTimestamp(this.#fetchLatestNonOpenedData.jobName, ['delivered', 'failed'])) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last opened event we processed. Defaults to now minus 30 minutes if we have no data yet.
     */
    async getLastOpenedEventTimestamp() {
        return this.#fetchLatestOpenedData?.lastEventTimestamp ??
            (await this.queries.getLastEventTimestamp(this.#fetchLatestOpenedData.jobName, ['opened'])) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS);
    }

    /**
     * Returns the timestamp of the last missing event we processed. Defaults to now minus 2h if we have no data yet.
     */
    async getLastMissingEventTimestamp() {
        return this.#fetchMissingData?.lastEventTimestamp ??
            (await this.queries.getLastJobRunTimestamp(this.#fetchMissingData.jobName)) ??
            new Date(Date.now() - TRUST_THRESHOLD_MS * 4);
    }

    /**
     * Fetches the latest opened events.
     * @param {Object} options - The options for fetching events.
     * @param {number} [options.maxEvents=Infinity] - The maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchLatestOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestOpenedEvents because end is before begin');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    /**
     * Fetches the latest non-opened events.
     * @param {Object} options - The options for fetching events.
     * @param {number} [options.maxEvents=Infinity] - The maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info('[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end is before begin');
            return createEmptyResult();
        }

        return await this.#fetchEvents(this.#fetchLatestNonOpenedData, {begin, end, maxEvents, eventTypes: ['delivered', 'failed', 'unsubscribed', 'complained']});
    }

    /**
     * Fetches events that are older than 30 minutes.
     * @param {object} options
     * @param {number} [options.maxEvents] - Maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
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

    /**
     * Schedule a new fetch for email analytics events.
     * @param {Object} options - The options for scheduling the fetch.
     * @param {Date} options.begin - The start date for the scheduled fetch.
     * @param {Date} options.end - The end date for the scheduled fetch.
     * @throws {errors.ValidationError} Throws an error if a fetch is already in progress.
     */
    schedule({begin, end}) {
        if (this.#fetchScheduledData?.running) {
            throw new errors.ValidationError({
                message: 'Already fetching scheduled events. Wait for it to finish before scheduling a new one.'
            });
        }

        logging.info('[EmailAnalytics] Scheduling fetch from ' + begin.toISOString() + ' until ' + end.toISOString());

        this.#fetchScheduledData = {
            running: false,
            jobName: 'email-analytics-scheduled',
            schedule: {begin, end}
        };
    }

    /**
     * Cancels the scheduled fetch of email analytics events.
     * If a fetch is running, marks it for cancellation. Otherwise clears scheduled fetch data.
     */
    cancelScheduled() {
        if (this.#fetchScheduledData?.running) {
            this.#fetchScheduledData.canceled = true;
        } else {
            this.#fetchScheduledData = {
                running: false,
                jobName: 'email-analytics-scheduled'
            };
        }
    }

    /**
     * Continues fetching the scheduled events. Resets the scheduled event when 0 events received.
     * @param {Object} [options] - The options for fetching scheduled events.
     * @param {number} [options.maxEvents=Infinity] - The maximum number of events to fetch.
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
    async fetchScheduled({maxEvents = Infinity} = {}) {
        if (!this.#fetchScheduledData?.schedule) {
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

    /**
     * Start fetching analytics and store progress in fetchData
     * @param {FetchData} fetchData - Object to store the progress
     * @param {object} options - Options for fetching events
     * @param {Date} options.begin - Start date
     * @param {Date} options.end - End date
     * @param {number} [options.maxEvents=Infinity] - Max events to fetch
     * @param {EmailAnalyticsEvent[]} [options.eventTypes] - Event types to fetch
     * @returns {Promise<EmailAnalyticsFetchResult>} Fetch results with timing metrics
     */
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
            processingTimeMs += Date.now() - processingStart;
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
                    aggregationTimeMs += Date.now() - aggregationStart;
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
                apiPollingTimeMs += Date.now() - apiStart;
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
                aggregationTimeMs += Date.now() - aggregationStart;
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

    /**
     * Process a batch of email analytics events.
     * @param {any[]} events - An array of email analytics events to process.
     * @param {Object} result - The result object to merge batch processing results into.
     * @param {FetchData} fetchData - Data related to the current fetch operation.
     * @returns {Promise<void>}
     */
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
                const batchResult = await this.processEventWithCache(event, recipientCache);
                this.#updateLastEventTimestamp(fetchData, event);
                result.merge(batchResult);
            }

            await this.eventProcessor.flushBatchedUpdates();
        } else {
            for (const event of events) {
                const batchResult = await this.processEvent(event);
                this.#updateLastEventTimestamp(fetchData, event);
                result.merge(batchResult);
            }
        }
    }

    /**
     * Updates fetchData.lastEventTimestamp if the current event timestamp is more recent.
     * @param {FetchData} fetchData - The fetch data object.
     * @param {any} event - The event to compare timestamps with.
     * @private
     */
    #updateLastEventTimestamp(fetchData, event) {
        const eventTimestamp = event.timestamp;
        if (!fetchData.lastEventTimestamp || (eventTimestamp && eventTimestamp > fetchData.lastEventTimestamp)) {
            fetchData.lastEventTimestamp = eventTimestamp;
        }
    }

    /**
     * Process a single email analytics event using cached recipient data.
     * @param {map} event - The event to process
     * @param {Map<string, any>} recipientCache - Cached recipients
     * @returns {Promise<EventProcessingResult>}
     */
    async processEventWithCache(event, recipientCache) {
        return await this.processEvent(event, recipientCache);
    }

    /**
     * Process a single email analytics event.
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async processEvent(event, recipientCache) {
        const handlers = {
            delivered: () => this.#handleDelivered(event, recipientCache),
            opened: () => this.#handleOpened(event, recipientCache),
            failed: () => this.#handleFailed(event, recipientCache),
            unsubscribed: () => this.#handleUnsubscribed(event, recipientCache),
            complained: () => this.#handleComplained(event, recipientCache)
        };

        const handler = handlers[event.type];
        return handler ? await handler() : new EventProcessingResult({unhandled: 1});
    }

    /**
     * Handle a 'delivered' event.
     * @param {any} event - The event object
     * @param {Map<string, any>} recipientCache - Cached recipients
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleDelivered(event, recipientCache) {
        const recipient = await this.eventProcessor.handleDelivered(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
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
     * Handle an 'opened' event.
     * @param {any} event - The event object
     * @param {Map<string, any>} recipientCache - Cached recipients
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleOpened(event, recipientCache) {
        const recipient = await this.eventProcessor.handleOpened(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
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
     * Handle a 'failed' event.
     * @param {any} event - The event object
     * @param {Map<string, any>} recipientCache - Cached recipients
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleFailed(event, recipientCache) {
        if (event.severity === 'permanent') {
            const recipient = await this.eventProcessor.handlePermanentFailed(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                {id: event.id, timestamp: event.timestamp, error: event.error},
                recipientCache
            );
            if (recipient) {
                return new EventProcessingResult({
                    permanentFailed: 1,
                    emailIds: [recipient.emailId],
                    memberIds: [recipient.memberId]
                });
            }
        } else {
            const recipient = await this.eventProcessor.handleTemporaryFailed(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                {id: event.id, timestamp: event.timestamp, error: event.error},
                recipientCache
            );
            if (recipient) {
                return new EventProcessingResult({
                    temporaryFailed: 1,
                    emailIds: [recipient.emailId],
                    memberIds: [recipient.memberId]
                });
            }
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handle an 'unsubscribed' event.
     * @param {any} event - The event object
     * @param {Map<string, any>} recipientCache - Cached recipients
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleUnsubscribed(event, recipientCache) {
        const recipient = await this.eventProcessor.handleUnsubscribed(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
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
     * Handle a 'complained' event.
     * @param {any} event - The event object
     * @param {Map<string, any>} recipientCache - Cached recipients
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleComplained(event, recipientCache) {
        const recipient = await this.eventProcessor.handleComplained(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );
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
     * Aggregate stats for a set of email and member IDs.
     * @param {{emailIds?: string[], memberIds?: string[]}} stats - The IDs to aggregate stats for.
     * @param {boolean} includeOpenedEvents - Whether to include opened events.
     * @returns {Promise<void>}
     */
    async aggregateStats({emailIds = [], memberIds = []}, includeOpenedEvents = true) {
        for (const emailId of emailIds) {
            await this.aggregateEmailStats(emailId, includeOpenedEvents);
        }

        const memberMetric = this.prometheusClient?.getMetric('email_analytics_aggregate_member_stats_count');
        const useBatchProcessing = this.config.get('emailAnalytics:batchProcessing');

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

    /**
     * Aggregate email stats for a given email ID.
     * @param {string} emailId - The ID of the email to aggregate stats for.
     * @param {boolean} includeOpenedEvents - Whether to include opened events.
     * @returns {Promise<void>}
     */
    async aggregateEmailStats(emailId, includeOpenedEvents) {
        return this.queries.aggregateEmailStats(emailId, includeOpenedEvents);
    }

    /**
     * Aggregate member stats for a given member ID.
     * @param {string} memberId - The ID of the member to aggregate stats for.
     * @returns {Promise<void>}
     */
    async aggregateMemberStats(memberId) {
        return this.queries.aggregateMemberStats(memberId);
    }

    /**
     * Aggregate member stats for multiple members in a batch.
     * @param {string[]} memberIds - Array of member IDs to aggregate stats for.
     * @returns {Promise<void>}
     */
    async aggregateMemberStatsBatch(memberIds) {
        return this.queries.aggregateMemberStatsBatch(memberIds);
    }
};