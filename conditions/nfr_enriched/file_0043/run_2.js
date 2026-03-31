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
    AUTOMATED_EMAIL_SENT: 'automated_email_sent_event',
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
        'data.member_id': 'member_id',
        'data.source': 'source'
    },
    withPost: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.post_id': 'post_id'
    },
    email: {
        'data.created_at': 'processed_at',
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

    _buildMongoTransformer(filter, keyMapping) {
        return chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMapping)
        );
    }

    _buildEventOptions(baseOptions, filter, keyMapping, additionalConfig = {}) {
        return {
            ...baseOptions,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformer(filter, keyMapping),
            ...additionalConfig
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

    async getEventTimeline(options = {}) {
        const limit = options.limit || 10;
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions(otherFilter);
        const filteredPages = this._filterPageActions(pageActions, typeFilter);

        const allEventPages = await Promise.all(
            filteredPages.map(page => this[page.action](options, otherFilter))
        );

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return {
            events: this._sortEvents(allEvents, limit),
            meta: this._buildPaginationMeta(limit, totalEvents)
        };
    }

    _buildPageActions(otherFilter) {
        const baseActions = [
            {type: EVENT_TYPES.COMMENT, action: 'getCommentEvents'},
            {type: EVENT_TYPES.CLICK, action: 'getClickEvents'},
            {type: EVENT_TYPES.AGGREGATED_CLICK, action: 'getAggregatedClickEvents'},
            {type: EVENT_TYPES.SIGNUP, action: 'getSignupEvents'},
            {type: EVENT_TYPES.SUBSCRIPTION, action: 'getSubscriptionEvents'},
            {type: EVENT_TYPES.DONATION, action: 'getDonationEvents'}
        ];

        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');

        if (!hasPostIdFilter) {
            baseActions.push(
                {type: EVENT_TYPES.NEWSLETTER, action: 'getNewsletterSubscriptionEvents'},
                {type: EVENT_TYPES.LOGIN, action: 'getLoginEvents'},
                {type: EVENT_TYPES.PAYMENT, action: 'getPaymentEvents'},
                {type: EVENT_TYPES.EMAIL_CHANGE, action: 'getEmailChangeEvent'}
            );

            if (this._getModel('AutomatedEmailRecipient')) {
                baseActions.push({type: EVENT_TYPES.AUTOMATED_EMAIL_SENT, action: 'getAutomatedEmailSentEvents'});
            }
        }

        if (this._getModel('EmailRecipient')) {
            baseActions.push(
                {type: EVENT_TYPES.EMAIL_SENT, action: 'getEmailSentEvents'},
                {type: EVENT_TYPES.EMAIL_DELIVERED, action: 'getEmailDeliveredEvents'},
                {type: EVENT_TYPES.EMAIL_OPENED, action: 'getEmailOpenedEvents'},
                {type: EVENT_TYPES.EMAIL_FAILED, action: 'getEmailFailedEvents'}
            );
        }

        baseActions.push({type: EVENT_TYPES.EMAIL_COMPLAINT, action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            baseActions.push({type: EVENT_TYPES.FEEDBACK, action: 'getFeedbackEvents'});
        }

        return baseActions;
    }

    _filterPageActions(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    async registerPayment(data) {
        await this._getModel('MemberPaymentEvent').add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            {...options, withRelated: ['member', 'newsletter']},
            filter,
            FILTER_KEY_MAPPING.basic
        );

        const {data: models, meta} = await this._getModel('MemberSubscribeEvent').findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.NEWSLETTER, options);

        return {data, meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
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
            {
                mongoTransformer: chainTransformers(
                    replaceCustomFilterTransformer(filter),
                    ...mapKeys({'data.created_at': 'created_at', 'data.member_id': 'member_id'}),
                    (f) => expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'subscriptionCreatedEvent.attribution_id',
                        expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                    }])
                )
            }
        );

        const {data: models, meta} = await this._getModel('MemberPaidSubscriptionEvent').findPage(opts);

        const data = this._mapEventData(models, EVENT_TYPES.SUBSCRIPTION, options, (model) => {
            const tierName = this._extractTierName(model);
            delete model.relations.stripeSubscription;

            const json = model.toJSON(options);
            return {
                ...json,
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                    && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id,
                tierName
            };
        });

        return {data, meta};
    }

    _extractTierName(model) {
        try {
            return model.related('stripeSubscription')
                ?.related('stripePrice')
                ?.related('stripeProduct')
                ?.related('product')
                ?.get('name') || null;
        } catch {
            return null;
        }
    }

    async getPaymentEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            {...options, withRelated: ['member']},
            filter,
            FILTER_KEY_MAPPING.basic
        );

        const {data: models, meta} = await this._getModel('MemberPaymentEvent').findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.PAYMENT, options);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            {...options, withRelated: ['member']},
            filter,
            FILTER_KEY_MAPPING.basic
        );

        const {data: models, meta} = await this._getModel('MemberLoginEvent').findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.LOGIN, options);

        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            {
                ...options,
                withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            {
                filter: 'subscriptionCreatedEvent.id:null+custom:true',
                mongoTransformer: chainTransformers(
                    replaceCustomFilterTransformer(filter),
                    ...mapKeys({'data.created_at': 'created_at', 'data.member_id': 'member_id', 'data.source': 'source'}),
                    (f) => expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }])
                )
            }
        );

        const {data: models, meta} = await this._getModel('MemberCreatedEvent').findPage(opts);

        const data = this._mapEventData(models, EVENT_TYPES.SIGNUP, options, (model) => {
            const json = model.toJSON(options);
            this._deletePostContent(json.postAttribution);
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });

        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            {
                ...options,
                withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            },
            filter,
            FILTER_KEY_MAPPING.basic,
            {
                filter: 'member_id:-null+custom:true',
                mongoTransformer: chainTransformers(
                    replaceCustomFilterTransformer(filter),
                    ...mapKeys({'data.created_at': 'created_at', 'data.member_id': 'member_id'}),
                    (f) => expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }])
                )
            }
        );

        const {data: models, meta} = await this._getModel('DonationPaymentEvent').findPage(opts);

        const data = this._mapEventData(models, EVENT_TYPES.DONATION, options, (model) => {
            const json = model.toJSON(options);
            this._deletePostContent(json.postAttribution);
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });

        return {data, meta};
    }

    _deletePostContent(postAttribution) {
        if (postAttribution) {
            delete postAttribution.mobiledoc;
            delete postAttribution.lexical;
            delete postAttribution.plaintext;
        }
    }

    async getCommentEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            {...options, withRelated: ['member', 'post', 'parent']},
            filter,
            FILTER_KEY_MAPPING.withPost,
            {filter: 'member_id:-null+custom:true'}
        );

        const {data: models, meta} = await this._getModel('Comment').findPage(opts);
        const