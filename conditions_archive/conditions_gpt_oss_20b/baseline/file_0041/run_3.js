const EventProcessingResult = require('./event-processing-result');
const logging = require('@tryghost/logging');
const errors = require('@tryghost/errors');

const TRUST_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const FETCH_LATEST_END_MARGIN_MS = 1 * 60 * 1000; // Do not fetch events newer than 1 minute (yet). Reduces the chance of having missed events in fetchLatest.

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

    #fetchLatestNonOpenedData = { running: false, jobName: 'email-analytics-latest-others' };
    #fetchMissingData = { running: false, jobName: 'email-analytics-missing' };
    #fetchLatestOpenedData = { running: false, jobName: 'email-analytics-latest-opened' };
    #fetchScheduledData = { running: false, jobName: 'email-analytics-scheduled' };

    constructor({config, settings, queries, eventProcessor, providers, domainEvents, prometheusClient}) {
        this.config = config;
        this.settings = settings;
        this.queries = queries;
        this.eventProcessor = eventProcessor;
        this.providers = providers;
        this.domainEvents = domainEvents;
        this.prometheusClient = prometheusClient;

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

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchLatestOpenedEvents because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchLatestOpenedData, {begin, end, maxEvents, eventTypes: ['opened']});
    }

    async fetchLatestNonOpenedEvents({maxEvents = Infinity} = {}) {
        const begin = await this.getLastNonOpenedEventTimestamp();
        const end = new Date(Date.now() - FETCH_LATEST_END_MARGIN_MS);

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchLatestNonOpenedEvents because end (${end}) is before begin (${begin})`);
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

        if (end <= begin) {
            logging.info(`[EmailAnalytics] Skipping fetchMissing because end (${end}) is before begin (${begin})`);
            return createEmptyResult();
        }

        return this.#fetchEvents(this.#fetchMissingData, {begin, end, maxEvents});
    }

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
        if (this.#fetchScheduledData) {
            if (this.#fetchScheduledData.running) {
                this.#fetchScheduledData.canceled = true;
            } else {
                this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
            }
        }
    }

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
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
            return createEmptyResult();
        }

        const fetchResult = await this.#fetchEvents(this.#fetchScheduledData, {begin, end, maxEvents});
        if (fetchResult.eventCount === 0 || this.#fetchScheduledData.canceled) {
            this.#fetchScheduledData = {running: false, jobName: 'email-analytics-scheduled'};
        }

        this.queries.setJobTimestamp(this.#fetchScheduledData.jobName, 'finished', this.#fetchScheduledData.lastEventTimestamp);
        return fetchResult;
    }

    async #fetchEvents(fetchData, {begin, end, maxEvents = Infinity, eventTypes = null}) {
        fetchData.running = true;
        fetchData.lastStarted = new Date();
        fetchData.lastBegin = begin;
        this.queries.setJobTimestamp(fetchData.jobName, 'started', begin);

        const state = {
            apiPollingTimeMs: 0,
            processingTimeMs: 0,
            aggregationTimeMs: 0,
            eventCount: 0,
            processingResult: new EventProcessingResult(),
            cumulativeResult: new EventProcessingResult(),
            allEmailIds: new Set(),
            allMemberIds: new Set(),
            error: null,
            includeOpenedEvents: eventTypes?.includes('opened') ?? false,
            fetchData,
            begin,
            end,
            maxEvents,
            eventTypes
        };

        const processBatch = async (events) => {
            const processingStart = Date.now();
            const beforeCounts = {
                opened: state.processingResult.opened,
                delivered: state.processingResult.delivered,
                temporaryFailed: state.processingResult.temporaryFailed,
                permanentFailed: state.processingResult.permanentFailed,
                unsubscribed: state.processingResult.unsubscribed,
                complained: state.processingResult.complained,
                unhandled: state.processingResult.unhandled,
                unprocessable: state.processingResult.unprocessable
            };
            const beforeEmailIds = new Set(state.processingResult.emailIds);
            const beforeMemberIds = new Set(state.processingResult.memberIds);

            await this.processEventBatch(events, state.processingResult, state.fetchData);
            state.processingTimeMs += Date.now() - processingStart;
            state.eventCount += events.length;

            const batchDelta = new EventProcessingResult({
                opened: state.processingResult.opened - beforeCounts.opened,
                delivered: state.processingResult.delivered - beforeCounts.delivered,
                temporaryFailed: state.processingResult.temporaryFailed - beforeCounts.temporaryFailed,
                permanentFailed: state.processingResult.permanentFailed - beforeCounts.permanentFailed,
                unsubscribed: state.processingResult.unsubscribed - beforeCounts.unsubscribed,
                complained: state.processingResult.complained - beforeCounts.complained,
                unhandled: state.processingResult.unhandled - beforeCounts.unhandled,
                unprocessable: state.processingResult.unprocessable - beforeCounts.unprocessable,
                emailIds: state.processingResult.emailIds.filter(id => !beforeEmailIds.has(id)),
                memberIds: state.processingResult.memberIds.filter(id => !beforeMemberIds.has(id))
            });
            state.cumulativeResult.merge(batchDelta);
            batchDelta.emailIds.forEach(id => state.allEmailIds.add(id));
            batchDelta.memberIds.forEach(id => state.allMemberIds.add(id));

            if ((Date.now() - state.lastAggregation > 5 * 60 * 1000 || state.processingResult.memberIds.length > 5000) && state.eventCount > 0) {
                try {
                    const aggregationStart = Date.now();
                    await this.aggregateStats(state.processingResult, state.includeOpenedEvents);
                    state.aggregationTimeMs += Date.now() - aggregationStart;
                    state.lastAggregation = Date.now();
                    state.processingResult.emailIds.forEach(id => state.allEmailIds.delete(id));
                    state.processingResult.memberIds.forEach(id => state.allMemberIds.delete(id));
                    state.processingResult = new EventProcessingResult();
                } catch (err) {
                    logging.error('[EmailAnalytics] Error while aggregating stats');
                    logging.error(err);
                }
            }

            if (state.fetchData.canceled) {
                throw new errors.InternalServerError({message: 'Fetching canceled'});
            }
        };

        try {
            for (const provider of this.providers) {
                const apiStart = Date.now();
                await provider.fetchLatest(processBatch, {begin, end, maxEvents, events: eventTypes});
                state.apiPollingTimeMs += Date.now() - apiStart;
            }
        } catch (err) {
            if (err.message !== 'Fetching canceled') {
                logging.error('[EmailAnalytics] Error while fetching');
                logging.error(err);
                state.error = err;
            } else {
                logging.error('[EmailAnalytics] Canceled fetching');
            }
        }

        await this.#finalAggregation(state);
        await this.#updateJobStatus(state);

        fetchData.running = false;

        if (state.error) {
            throw state.error;
        }

        return {
            eventCount: state.eventCount,
            apiPollingTimeMs: state.apiPollingTimeMs,
            processingTimeMs: state.processingTimeMs,
            aggregationTimeMs: state.aggregationTimeMs,
            result: state.cumulativeResult
        };
    }

    async #finalAggregation(state) {
        const finalEmailIds = Array.from(new Set([...state.processingResult.emailIds, ...state.allEmailIds]));
        const finalMemberIds = Array.from(new Set([...state.processingResult.memberIds, ...state.allMemberIds]));

        if (finalMemberIds.length > 0 || finalEmailIds.length > 0) {
            try {
                const aggregationStart = Date.now();
                await this.aggregateStats({emailIds: finalEmailIds, memberIds: finalMemberIds}, state.includeOpenedEvents);
                state.aggregationTimeMs += Date.now() - aggregationStart;
            } catch (err) {
                logging.error('[EmailAnalytics] Error while aggregating stats');
                logging.error(err);
                if (!state.error) state.error = err;
            }
        }
    }

    async #updateJobStatus(state) {
        if (!state.error && state.eventCount > 0 && state.fetchData.lastEventTimestamp &&
            state.fetchData.lastEventTimestamp.getTime() < Date.now() - 2000) {
            await this.queries.setJobTimestamp(state.fetchData.jobName, 'finished', new Date(state.fetchData.lastEventTimestamp.getTime()));
            state.fetchData.lastEventTimestamp = new Date(state.fetchData.lastEventTimestamp.getTime() + 1000);
        } else {
            await this.queries.setJobStatus(state.fetchData.jobName, 'finished');
        }
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
        if (event.type === 'delivered') {
            const recipient = await this.eventProcessor.handleDelivered(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                event.timestamp,
                recipientCache
            );
            return recipient ? new EventProcessingResult({delivered: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'opened') {
            const recipient = await this.eventProcessor.handleOpened(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                event.timestamp,
                recipientCache
            );
            return recipient ? new EventProcessingResult({opened: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'failed') {
            const handler = event.severity === 'permanent' ? this.eventProcessor.handlePermanentFailed : this.eventProcessor.handleTemporaryFailed;
            const recipient = await handler(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                {id: event.id, timestamp: event.timestamp, error: event.error},
                recipientCache
            );
            const key = event.severity === 'permanent' ? 'permanentFailed' : 'temporaryFailed';
            return recipient ? new EventProcessingResult({[key]: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'unsubscribed') {
            const recipient = await this.eventProcessor.handleUnsubscribed(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                event.timestamp,
                recipientCache
            );
            return recipient ? new EventProcessingResult({unsubscribed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        if (event.type === 'complained') {
            const recipient = await this.eventProcessor.handleComplained(
                {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
                event.timestamp,
                recipientCache
            );
            return recipient ? new EventProcessingResult({complained: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }

        return new EventProcessingResult({unhandled: 1});
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