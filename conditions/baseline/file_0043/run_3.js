```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {
            custom: filter
        });
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
    subscription: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id'
    },
    comment: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.post_id': 'post_id'
    },
    click: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.post_id': 'post_id'
    },
    email: {
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

    _buildEventActions(hasPostIdFilter) {
        const baseActions = [
            {type: EVENT_TYPES.COMMENT, action: 'getCommentEvents'},
            {type: EVENT_TYPES.CLICK, action: 'getClickEvents'},
            {type: EVENT_TYPES.AGGREGATED_CLICK, action: 'getAggregatedClickEvents'},
            {type: EVENT_TYPES.SIGNUP, action: 'getSignupEvents'},
            {type: EVENT_TYPES.SUBSCRIPTION, action: 'getSubscriptionEvents'},
            {type: EVENT_TYPES.DONATION, action: 'getDonationEvents'}
        ];

        if (!hasPostIdFilter) {
            baseActions.push(
                {type: EVENT_TYPES.NEWSLETTER, action: 'getNewsletterSubscriptionEvents'},
                {type: EVENT_TYPES.LOGIN, action: 'getLoginEvents'},
                {type: EVENT_TYPES.PAYMENT, action: 'getPaymentEvents'},
                {type: EVENT_TYPES.EMAIL_CHANGE, action: 'getEmailChangeEvent'}
            );

            if (this._AutomatedEmailRecipient) {
                baseActions.push({type: EVENT_TYPES.AUTOMATED_EMAIL_SENT, action: 'getAutomatedEmailSentEvents'});
            }
        }

        if (this._EmailRecipient) {
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
        options.limit = options.limit || 10;
        options.order = 'created_at desc, id desc';

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');

        const pageActions = this._buildEventActions(hasPostIdFilter);

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
            meta: this._buildPaginationMeta(options.limit, totalEvents)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    _buildEventOptions(model, filter, keyMapping, additionalFilter = '') {
        const baseFilter = additionalFilter ? `${additionalFilter}+custom:true` : 'custom:true';
        return {
            filter: baseFilter,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMapping)
            )
        };
    }

    _buildEmailEventOptions(filter, keyMapping, emailFilter) {
        return {
            filter: emailFilter,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMapping)
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
            ...this._buildEventOptions(null, filter, FILTER_KEY_MAPPING.basic)
        };

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.NEWSLETTER, options);

        return {data, meta};
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
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(FILTER_KEY_MAPPING.subscription),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            )
        };

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);

        const data = models.map((model) => {
            const tierName = this._extractTierName(model);
            delete model.relations.stripeSubscription;

            const json = model.toJSON(options);
            const d = {
                ...json,
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id 
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id 
                    && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id,
                tierName
            };
            delete d.stripeSubscription;

            return {
                type: EVENT_TYPES.SUBSCRIPTION,
                data: d
            };
        });

        return {data, meta};
    }

    _extractTierName(model) {
        return model.related('stripeSubscription')
            ?.related('stripePrice')
            ?.related('stripeProduct')
            ?.related('product')
            ?.get('name') || null;
    }

    async getPaymentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            ...this._buildEventOptions(null, filter, FILTER_KEY_MAPPING.basic)
        };

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.PAYMENT, options);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            ...this._buildEventOptions(null, filter, FILTER_KEY_MAPPING.basic)
        };

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.LOGIN, options);

        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({...FILTER_KEY_MAPPING.basic, 'data.source': 'source'}),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);

        const data = models.map((model) => {
            const json = model.toJSON(options);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;

            return {
                type: EVENT_TYPES.SIGNUP,
                data: {
                    ...json,
                    attribution: this._memberAttributionService.getEventAttribution(model)
                }
            };
        });

        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(FILTER_KEY_MAPPING.basic),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);

        const data = models.map((model) => {
            const json = model.toJSON(options);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;

            return {
                type: EVENT_TYPES.DONATION,
                data: {
                    ...json,
                    attribution: this._memberAttributionService.getEventAttribution(model)
                }
            };
        });

        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'post', 'parent'],
            ...this._buildEventOptions(null, filter, FILTER_KEY_MAPPING.comment, 'member_id:-null')
        };

        const {data: models, meta} = await this._Comment