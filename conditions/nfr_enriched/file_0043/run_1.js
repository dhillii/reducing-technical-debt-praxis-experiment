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
 * Builds standard options for event queries with mongo transformers.
 */
function buildEventQueryOptions(baseOptions, filter, keyMappings, additionalTransformers = []) {
    return {
        ...baseOptions,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMappings),
            ...additionalTransformers
        )
    };
}

/**
 * Transforms a model to an event object with the specified type.
 */
function modelToEvent(type, model, options, additionalData = {}) {
    return {
        type,
        data: {
            ...model.toJSON(options),
            ...additionalData
        }
    };
}

/**
 * Processes models into event data with optional transformations.
 */
function processModelsToEvents(models, eventType, options, transformer = null) {
    return models.map((model) => {
        if (transformer) {
            return transformer(model, options);
        }
        return modelToEvent(eventType, model, options);
    });
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
 * Removes specified content fields from post attribution.
 */
function cleanPostAttributionContent(json) {
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
 * Builds the list of available event actions based on filter and feature flags.
 */
function buildPageActions(otherFilter, hasEmailRecipient, hasAutomatedEmailRecipient, labsService) {
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

        if (hasAutomatedEmailRecipient) {
            pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
        }
    }

    if (hasEmailRecipient) {
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
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = buildPageActions(
            otherFilter,
            !!this._EmailRecipient,
            !!this._AutomatedEmailRecipient,
            this._labsService
        );

        const filteredPages = filterPageActionsByType(pageActions, typeFilter);

        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        const sortedEvents = sortEventsByCreatedAt(allEvents).slice(0, options.limit);

        return {
            events: sortedEvents,
            meta: createPaginationMeta(options.limit, totalEvents)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(filter, options = {}) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'newsletter']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(queryOptions);
        const data = processModelsToEvents(models, 'newsletter_event', options);

        return {data, meta};
    }

    async getSubscriptionEvents(filter, options = {}) {
        const subscriptionTransformer = (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }]);
        };

        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: [
                    'member',
                    'subscriptionCreatedEvent.postAttribution',
                    'subscriptionCreatedEvent.userAttribution',
                    'subscriptionCreatedEvent.tagAttribution',
                    'subscriptionCreatedEvent.memberCreatedEvent',
                    'stripeSubscription.stripePrice.stripeProduct.product'
                ]
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            [subscriptionTransformer]
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(queryOptions);

        const data = models.map((model) => {
            delete model.relations.stripeSubscription;
            const json = model.toJSON(options);
            const tierName = extractTierName(model);
            const attribution = extractSubscriptionAttribution(model, this._memberAttributionService);
            const signup = isSignupEvent(model);

            return {
                type: 'subscription_event',
                data: {
                    ...json,
                    attribution,
                    signup,
                    tierName
                }
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(filter, options = {}) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(queryOptions);
        const data = processModelsToEvents(models, 'payment_event', options);

        return {data, meta};
    }

    async getLoginEvents(filter, options = {}) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberLoginEvent.findPage(queryOptions);
        const data = processModelsToEvents(models, 'login_event', options);

        return {data, meta};
    }

    async getSignupEvents(filter, options = {}) {
        const signupTransformer = (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]);
        };

        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: [
                    'member',
                    'postAttribution',
                    'userAttribution',
                    'tagAttribution'
                ],
                filter: 'subscriptionCreatedEvent.id:null+custom:true'
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            [signupTransformer]
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const json = cleanPostAttributionContent(model.toJSON(options));
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
        const donationTransformer = (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]);
        };

        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: [
                    'member',
                    'postAttribution',
                    'userAttribution',
                    'tagAttribution'
                ],
                filter: 'member_id:-null+custom:true'
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            [donationTransformer]
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage