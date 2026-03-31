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

const FILTER_KEY_MAP = {
    'data.created_at': 'created_at',
    'data.source': 'source',
    'data.member_id': 'member_id',
    'data.post_id': 'post_id'
};

const FILTER_ALLOWLIST = ['data.created_at', 'data.member_id', 'data.post_id', 'type', 'id'];

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

    _buildPageActions(hasPostIdFilter) {
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

    _filterPageActions(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    _sortAndSliceEvents(allEvents, limit) {
        return allEvents
            .sort((a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
            })
            .slice(0, limit);
    }

    async getEventTimeline(options = {}) {
        options.limit = options.limit || 10;
        options.order = 'created_at desc, id desc';

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');

        const pageActions = this._buildPageActions(hasPostIdFilter);
        const filteredPages = this._filterPageActions(pageActions, typeFilter);

        const pages = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return {
            events: this._sortAndSliceEvents(allEvents, options.limit),
            meta: {
                pagination: {
                    limit: options.limit,
                    total: totalEvents,
                    pages: options.limit > 0 ? Math.ceil(totalEvents / options.limit) : null,
                    page: null,
                    next: null,
                    prev: null
                }
            }
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    _buildEventOptions(options, filter, baseFilter, keyMap, additionalTransformers = []) {
        return {
            ...options,
            filter: baseFilter || 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMap),
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
            ...this._buildEventOptions(
                options,
                filter,
                'custom:true',
                {
                    'data.created_at': 'created_at',
                    'data.source': 'source',
                    'data.member_id': 'member_id'
                }
            ),
            withRelated: ['member', 'newsletter']
        };

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.NEWSLETTER, options);

        return {data, meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        };

        const expandTransformer = (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'subscriptionCreatedEvent.attribution_id',
            expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
        }]);

        options = {
            ...this._buildEventOptions(
                options,
                filter,
                'custom:true',
                keyMap,
                [expandTransformer]
            ),
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ]
        };

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);

        const data = models.map((model) => {
            const tierName = this._getTierName(model);
            delete model.relations.stripeSubscription;

            const json = model.toJSON(options);
            const isCreated = model.get('type') === 'created';
            const subscriptionEvent = model.related('subscriptionCreatedEvent');

            return {
                type: EVENT_TYPES.SUBSCRIPTION,
                data: {
                    ...json,
                    attribution: isCreated && subscriptionEvent?.id ? this._memberAttributionService.getEventAttribution(subscriptionEvent) : null,
                    signup: isCreated && subscriptionEvent?.id && subscriptionEvent.related('memberCreatedEvent')?.id ? true : false,
                    tierName
                }
            };
        });

        return {data, meta};
    }

    _getTierName(model) {
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
        options = {
            ...this._buildEventOptions(
                options,
                filter,
                'custom:true',
                {
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }
            ),
            withRelated: ['member']
        };

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.PAYMENT, options);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...this._buildEventOptions(
                options,
                filter,
                'custom:true',
                {
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }
            ),
            withRelated: ['member']
        };

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        const data = this._mapEventData(models, EVENT_TYPES.LOGIN, options);

        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        const expandTransformer = (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'attribution_id',
            expansion: {attribution_type: 'post'}
        }]);

        options = {
            ...this._buildEventOptions(
                options,
                filter,
                'subscriptionCreatedEvent.id:null+custom:true',
                {
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.source': 'source'
                },
                [expandTransformer]
            ),
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
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
        const expandTransformer = (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'attribution_id',
            expansion: {attribution_type: 'post'}
        }]);

        options = {
            ...this._buildEventOptions(
                options,
                filter,
                'member_id:-null+custom:true',
                {
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                },
                [expandTransformer]
            ),
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
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
            ...this._buildEventOptions(
                options,
                filter,
                'member_id:-null+custom:true',
                {
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                }
            ),
            withRelated: ['member', 'post', 'parent']
        };

        const {data: models, meta} = await this._Comment.findPage(options);
        const data = this._mapEventData(models, EVENT_