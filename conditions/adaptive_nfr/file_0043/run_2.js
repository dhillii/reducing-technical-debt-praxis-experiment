```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

const EVENT_TYPES = {
    COMMENT: 'comment_event',
    CLICK: 'click_event',
    AGGREGATED_CLICK: 'aggregated_click_event',
    SIGNUP: 'signup_event',
    SUBSCRIPTION: 'subscription_event',
    DONATION: 'donation_event',
    NEWSLETTER: 'newsletter_event',
    LOGIN: 'login_event',
    PAYMENT: 'payment_event',
    EMAIL_CHANGE: 'email_change_event',
    AUTOMATED_EMAIL: 'automated_email_sent_event',
    EMAIL_SENT: 'email_sent_event',
    EMAIL_DELIVERED: 'email_delivered_event',
    EMAIL_OPENED: 'email_opened_event',
    EMAIL_FAILED: 'email_failed_event',
    EMAIL_COMPLAINT: 'email_complaint_event',
    FEEDBACK: 'feedback_event'
};

const FILTER_KEY_MAPPING = {
    basic: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id'
    },
    withSource: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.source': 'source'
    },
    withPostId: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.post_id': 'post_id'
    },
    emailEvents: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.post_id': 'email.post_id'
    }
};

class EventRepository {
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
        this._models = {
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
            MemberEmailChangeEvent,
            AutomatedEmailRecipient
        };
        this._labsService = labsService;
        this._memberAttributionService = memberAttributionService;
    }

    _getModel(name) {
        return this._models[name];
    }

    _buildEventPageActions() {
        const actions = [
            {type: EVENT_TYPES.COMMENT, action: 'getCommentEvents', model: 'Comment'},
            {type: EVENT_TYPES.CLICK, action: 'getClickEvents', model: 'MemberLinkClickEvent'},
            {type: EVENT_TYPES.AGGREGATED_CLICK, action: 'getAggregatedClickEvents', model: 'MemberLinkClickEvent'},
            {type: EVENT_TYPES.SIGNUP, action: 'getSignupEvents', model: 'MemberCreatedEvent'},
            {type: EVENT_TYPES.SUBSCRIPTION, action: 'getSubscriptionEvents', model: 'MemberPaidSubscriptionEvent'},
            {type: EVENT_TYPES.DONATION, action: 'getDonationEvents', model: 'DonationPaymentEvent'}
        ];
        return actions;
    }

    _buildAdditionalEventPageActions(hasPostIdFilter) {
        const actions = [];
        
        if (!hasPostIdFilter) {
            actions.push(
                {type: EVENT_TYPES.NEWSLETTER, action: 'getNewsletterSubscriptionEvents', model: 'MemberSubscribeEvent'},
                {type: EVENT_TYPES.LOGIN, action: 'getLoginEvents', model: 'MemberLoginEvent'},
                {type: EVENT_TYPES.PAYMENT, action: 'getPaymentEvents', model: 'MemberPaymentEvent'},
                {type: EVENT_TYPES.EMAIL_CHANGE, action: 'getEmailChangeEvent', model: 'MemberEmailChangeEvent'}
            );

            if (this._getModel('AutomatedEmailRecipient')) {
                actions.push({type: EVENT_TYPES.AUTOMATED_EMAIL, action: 'getAutomatedEmailSentEvents', model: 'AutomatedEmailRecipient'});
            }
        }

        if (this._getModel('EmailRecipient')) {
            actions.push(
                {type: EVENT_TYPES.EMAIL_SENT, action: 'getEmailSentEvents', model: 'EmailRecipient'},
                {type: EVENT_TYPES.EMAIL_DELIVERED, action: 'getEmailDeliveredEvents', model: 'EmailRecipient'},
                {type: EVENT_TYPES.EMAIL_OPENED, action: 'getEmailOpenedEvents', model: 'EmailRecipient'},
                {type: EVENT_TYPES.EMAIL_FAILED, action: 'getEmailFailedEvents', model: 'EmailRecipient'}
            );
        }

        actions.push({type: EVENT_TYPES.EMAIL_COMPLAINT, action: 'getEmailSpamComplaintEvents', model: 'EmailSpamComplaintEvent'});

        if (this._labsService.isSet('audienceFeedback')) {
            actions.push({type: EVENT_TYPES.FEEDBACK, action: 'getFeedbackEvents', model: 'MemberFeedback'});
        }

        return actions;
    }

    _sortEvents(events, limit) {
        return events
            .sort((a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
            })
            .slice(0, limit);
    }

    _buildPaginationMeta(limit, total) {
        return {
            limit,
            total,
            pages: limit > 0 ? Math.ceil(total / limit) : null,
            page: null,
            next: null,
            prev: null
        };
    }

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');
        const pageActions = [
            ...this._buildEventPageActions(),
            ...this._buildAdditionalEventPageActions(hasPostIdFilter)
        ];

        let filteredPages = pageActions;
        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            filteredPages = filteredPages.filter(page => query.test(page));
        }

        const pages = filteredPages.map((page) => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return {
            events: this._sortEvents(allEvents, options.limit),
            meta: {
                pagination: this._buildPaginationMeta(options.limit, totalEvents)
            }
        };
    }

    async registerPayment(data) {
        await this._getModel('MemberPaymentEvent').add({
            ...data,
            source: 'stripe'
        });
    }

    _buildEventOptions(filter, keyMapping, additionalFilter = '', additionalTransformers = []) {
        return {
            filter: additionalFilter ? `${additionalFilter}+custom:true` : 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMapping),
                ...additionalTransformers
            )
        };
    }

    _mapEventData(models, eventType, options, transformer = null) {
        return models.map((model) => {
            const data = transformer ? transformer(model, options) : model.toJSON(options);
            return {
                type: eventType,
                data
            };
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'newsletter'],
            ...this._buildEventOptions(filter, FILTER_KEY_MAPPING.basic)
        };

        const {data: models, meta} = await this._getModel('MemberSubscribeEvent').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.NEWSLETTER, options);

        return {data, meta};
    }

    _getTierName(model) {
        return model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') ?? null;
    }

    _getSubscriptionEventData(model, options) {
        delete model.relations.stripeSubscription;
        const json = model.toJSON(options);
        const tierName = this._getTierName(model);
        const hasSubscriptionEvent = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id;
        
        return {
            ...json,
            attribution: hasSubscriptionEvent ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
            signup: hasSubscriptionEvent && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id ? true : false,
            tierName
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.basic,
                '',
                [(f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])]
            )
        };

        const {data: models, meta} = await this._getModel('MemberPaidSubscriptionEvent').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.SUBSCRIPTION, options, (model) => this._getSubscriptionEventData(model, options));

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            ...this._buildEventOptions(filter, FILTER_KEY_MAPPING.basic)
        };

        const {data: models, meta} = await this._getModel('MemberPaymentEvent').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.PAYMENT, options);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            ...this._buildEventOptions(filter, FILTER_KEY_MAPPING.basic)
        };

        const {data: models, meta} = await this._getModel('MemberLoginEvent').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.LOGIN, options);

        return {data, meta};
    }

    _cleanPostAttribution(json) {
        delete json.postAttribution?.mobiledoc;
        delete json.postAttribution?.lexical;
        delete json.postAttribution?.plaintext;
        return json;
    }

    async getSignupEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.withSource,
                'subscriptionCreatedEvent.id:null',
                [(f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])]
            )
        };

        const {data: models, meta} = await this._getModel('MemberCreatedEvent').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.SIGNUP, options, (model) => ({
            ...this._cleanPostAttribution(model.toJSON(options)),
            attribution: this._memberAttributionService.getEventAttribution(model)
        }));

        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.basic,
                'member_id:-null',
                [(f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])]
            )
        };

        const {data: models, meta} = await this._getModel('DonationPaymentEvent').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.DONATION, options, (model) => ({
            ...this._cleanPostAttribution(model.toJSON(options)),
            attribution: this._memberAttributionService.getEventAttribution(model)
        }));

        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'post', 'parent'],
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.withPostId,
                'member_id:-null'
            )
        };

        const {data: models, meta} = await this._getModel('Comment').findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.COMMENT, options);

        return {data, meta};
    }

    async getClickEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'link', 'link.post'],
            ...this._buildEventOptions(filter, FILTER_KEY_MAPPING.withPostId)
        };

        const {data: models, meta} = await this._getModel('MemberLinkClickEvent').findPage(options);