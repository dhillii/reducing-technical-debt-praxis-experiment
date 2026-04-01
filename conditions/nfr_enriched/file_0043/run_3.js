```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * This mongo transformer ignores the provided filter option and replaces the filter with a custom filter that was provided to the transformer. Allowing us to set a mongo filter instead of a string based NQL filter.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {
            custom: filter
        });
    };
}

/**
 * Builds base options for event queries with common configuration.
 */
function buildBaseEventOptions(options, filter, withRelated, baseFilter, keyMappings, additionalTransformers = []) {
    return {
        ...options,
        withRelated,
        filter: baseFilter,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMappings),
            ...additionalTransformers
        )
    };
}

/**
 * Transforms a model to event data with the specified type.
 */
function transformModelToEvent(type, model, options, additionalData = {}) {
    return {
        type,
        data: {
            ...model.toJSON(options),
            ...additionalData
        }
    };
}

/**
 * Extracts tier name from nested stripe subscription relations.
 */
function extractTierName(model) {
    const stripeSubscription = model.related('stripeSubscription');
    if (!stripeSubscription) {
        return null;
    }
    const stripePrice = stripeSubscription.related('stripePrice');
    if (!stripePrice) {
        return null;
    }
    const stripeProduct = stripePrice.related('stripeProduct');
    if (!stripeProduct) {
        return null;
    }
    const product = stripeProduct.related('product');
    return product ? product.get('name') : null;
}

/**
 * Checks if a subscription event is a signup event.
 */
function isSignupEvent(model) {
    if (model.get('type') !== 'created') {
        return false;
    }
    const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
    if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
        return false;
    }
    const memberCreatedEvent = subscriptionCreatedEvent.related('memberCreatedEvent');
    return memberCreatedEvent && memberCreatedEvent.id ? true : false;
}

/**
 * Extracts attribution from subscription created event.
 */
function extractSubscriptionAttribution(model, memberAttributionService) {
    if (model.get('type') !== 'created') {
        return null;
    }
    const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
    if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
        return null;
    }
    return memberAttributionService.getEventAttribution(subscriptionCreatedEvent);
}

/**
 * Removes sensitive content from post attribution data.
 */
function cleanPostAttribution(json) {
    if (json.postAttribution) {
        delete json.postAttribution.mobiledoc;
        delete json.postAttribution.lexical;
        delete json.postAttribution.plaintext;
    }
    return json;
}

/**
 * Sorts events by created_at descending, then by id descending.
 */
function sortEventsByCreatedAt(events) {
    return events.sort((a, b) => {
        const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
        if (diff !== 0) {
            return diff;
        }
        return b.data.id.localeCompare(a.data.id);
    });
}

/**
 * Creates pagination metadata.
 */
function createPaginationMeta(limit, total) {
    return {
        pagination: {
            limit,
            total,
            pages: limit > 0 ? Math.ceil(total / limit) : null,
            page: null,
            next: null,
            prev: null
        }
    };
}

/**
 * Builds the list of available page actions for event timeline.
 */
function buildPageActions(emailRecipient, automatedEmailRecipient, labsService, otherFilter) {
    const pageActions = [
        {type: 'comment_event', action: 'getCommentEvents'},
        {type: 'click_event', action: 'getClickEvents'},
        {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
        {type: 'signup_event', action: 'getSignupEvents'},
        {type: 'subscription_event', action: 'getSubscriptionEvents'},
        {type: 'donation_event', action: 'getDonationEvents'}
    ];

    if (!getUsedKeys(otherFilter).includes('data.post_id')) {
        pageActions.push(
            {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
            {type: 'login_event', action: 'getLoginEvents'},
            {type: 'payment_event', action: 'getPaymentEvents'},
            {type: 'email_change_event', action: 'getEmailChangeEvent'}
        );

        if (automatedEmailRecipient) {
            pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
        }
    }

    if (emailRecipient) {
        pageActions.push(
            {type: 'email_sent_event', action: 'getEmailSentEvents'},
            {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
            {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
            {type: 'email_failed_event', action: 'getEmailFailedEvents'}
        );
    }

    pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

    if (labsService.isSet('audienceFeedback')) {
        pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
    }

    return pageActions;
}

/**
 * Filters page actions based on type filter.
 */
function filterPageActionsByType(pageActions, typeFilter) {
    if (!typeFilter) {
        return pageActions;
    }
    const query = new mingo.Query(typeFilter);
    return pageActions.filter(page => query.test(page));
}

/**
 * Aggregates event pages into a single sorted list.
 */
function aggregateEventPages(allEventPages, limit) {
    const allEvents = allEventPages.flatMap(page => page.data);
    const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);
    const sortedEvents = sortEventsByCreatedAt(allEvents);
    const paginatedEvents = sortedEvents.slice(0, limit);

    return {
        events: paginatedEvents,
        totalEvents
    };
}

module.exports = class EventRepository {
    constructor({
        DonationPaymentEvent,
        EmailRecipient,
        MemberSubscribeEvent,
        MemberPaymentEvent,
        MemberStatusEvent,
        MemberLoginEvent,
        MemberCreatedEvent,
        SubscriptionCreatedEvent,
        MemberPaidSubscriptionEvent,
        MemberLinkClickEvent,
        MemberFeedback,
        EmailSpamComplaintEvent,
        Comment,
        labsService,
        memberAttributionService,
        MemberEmailChangeEvent,
        AutomatedEmailRecipient
    }) {
        this._DonationPaymentEvent = DonationPaymentEvent;
        this._MemberSubscribeEvent = MemberSubscribeEvent;
        this._MemberPaidSubscriptionEvent = MemberPaidSubscriptionEvent;
        this._MemberPaymentEvent = MemberPaymentEvent;
        this._MemberStatusEvent = MemberStatusEvent;
        this._MemberLoginEvent = MemberLoginEvent;
        this._EmailRecipient = EmailRecipient;
        this._Comment = Comment;
        this._labsService = labsService;
        this._MemberCreatedEvent = MemberCreatedEvent;
        this._SubscriptionCreatedEvent = SubscriptionCreatedEvent;
        this._MemberLinkClickEvent = MemberLinkClickEvent;
        this._MemberFeedback = MemberFeedback;
        this._EmailSpamComplaintEvent = EmailSpamComplaintEvent;
        this._memberAttributionService = memberAttributionService;
        this._MemberEmailChangeEvent = MemberEmailChangeEvent;
        this._AutomatedEmailRecipient = AutomatedEmailRecipient;
    }

    async getEventTimeline(options = {}) {
        const limit = options.limit || 10;
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = buildPageActions(
            this._EmailRecipient,
            this._AutomatedEmailRecipient,
            this._labsService,
            otherFilter
        );

        const filteredPages = filterPageActionsByType(pageActions, typeFilter);

        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        const allEventPages = await Promise.all(pages);
        const {events, totalEvents} = aggregateEventPages(allEventPages, limit);

        return {
            events,
            meta: createPaginationMeta(limit, totalEvents)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(filter, options = {}) {
        const opts = buildBaseEventOptions(
            options,
            filter,
            ['member', 'newsletter'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(opts);

        const data = models.map((model) => {
            return transformModelToEvent('newsletter_event', model, options);
        });

        return {data, meta};
    }

    async getSubscriptionEvents(filter, options = {}) {
        const opts = buildBaseEventOptions(
            options,
            filter,
            [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            [
                (f) => {
                    return expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'subscriptionCreatedEvent.attribution_id',
                        expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                    }]);
                }
            ]
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);

        const data = models.map((model) => {
            delete model.relations.stripeSubscription;
            const tierName = extractTierName(model);
            const attribution = extractSubscriptionAttribution(model, this._memberAttributionService);
            const signup = isSignupEvent(model);

            const d = {
                ...model.toJSON(options),
                attribution,
                signup,
                tierName
            };
            delete d.stripeSubscription;

            return {
                type: 'subscription_event',
                data: d
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(filter, options = {}) {
        const opts = buildBaseEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(opts);

        const data = models.map((model) => {
            return transformModelToEvent('payment_event', model, options);
        });

        return {data, meta};
    }

    async getLoginEvents(filter, options = {}) {
        const opts = buildBaseEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberLoginEvent.findPage(opts);

        const data = models.map((model) => {
            return transformModelToEvent('login_event', model, options);
        });

        return {data, meta};
    }

    async getSignupEvents(filter, options = {}) {
        const opts = buildBaseEventOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'subscriptionCreatedEvent.id:null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            [
                (f) => {
                    return expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }]);
                }
            ]
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(opts);

        const data = models.map((model) => {
            const json = cleanPostAttribution(model.toJSON(options));
            return {
                type: 'signup_event',
                data: {
                    ...json,
                    attribution: this._memberAttributionService.getEventAttribution(model)
                }
            };
        });

        return {data, meta};
    }

    async getDonationEvents(filter, options = {}) {
        const opts = buildBaseEventOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'member_id:-null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            [
                (f) => {
                    return expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }]);
                }
            ]
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(opts);

        const data = models.map((model) => {
            const json = cleanPostAttribution(model.toJSON(options));
            return {
                type: 'donation_event',
                data: {
                    ...json,
                    attribution: this._memberAttributionService.get