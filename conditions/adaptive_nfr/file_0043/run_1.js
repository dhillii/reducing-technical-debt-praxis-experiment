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

    _buildEventActions() {
        const actions = [
            {type: EVENT_TYPES.COMMENT, action: 'getCommentEvents'},
            {type: EVENT_TYPES.CLICK, action: 'getClickEvents'},
            {type: EVENT_TYPES.AGGREGATED_CLICK, action: 'getAggregatedClickEvents'},
            {type: EVENT_TYPES.SIGNUP, action: 'getSignupEvents'},
            {type: EVENT_TYPES.SUBSCRIPTION, action: 'getSubscriptionEvents'},
            {type: EVENT_TYPES.DONATION, action: 'getDonationEvents'}
        ];

        return actions;
    }

    _buildAdditionalEventActions(otherFilter) {
        const actions = [];

        if (!getUsedKeys(otherFilter).includes('data.post_id')) {
            actions.push(
                {type: EVENT_TYPES.NEWSLETTER, action: 'getNewsletterSubscriptionEvents'},
                {type: EVENT_TYPES.LOGIN, action: 'getLoginEvents'},
                {type: EVENT_TYPES.PAYMENT, action: 'getPaymentEvents'},
                {type: EVENT_TYPES.EMAIL_CHANGE, action: 'getEmailChangeEvent'}
            );

            if (this._models.AutomatedEmailRecipient) {
                actions.push({type: EVENT_TYPES.AUTOMATED_EMAIL, action: 'getAutomatedEmailSentEvents'});
            }
        }

        if (this._models.EmailRecipient) {
            actions.push(
                {type: EVENT_TYPES.EMAIL_SENT, action: 'getEmailSentEvents'},
                {type: EVENT_TYPES.EMAIL_DELIVERED, action: 'getEmailDeliveredEvents'},
                {type: EVENT_TYPES.EMAIL_OPENED, action: 'getEmailOpenedEvents'},
                {type: EVENT_TYPES.EMAIL_FAILED, action: 'getEmailFailedEvents'}
            );
        }

        actions.push({type: EVENT_TYPES.EMAIL_COMPLAINT, action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            actions.push({type: EVENT_TYPES.FEEDBACK, action: 'getFeedbackEvents'});
        }

        return actions;
    }

    _filterEventActions(actions, typeFilter) {
        if (!typeFilter) {
            return actions;
        }

        const query = new mingo.Query(typeFilter);
        return actions.filter(action => query.test(action));
    }

    _sortAndSliceEvents(events, limit) {
        return events
            .sort((a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
            })
            .slice(0, limit);
    }

    async getEventTimeline(options = {}) {
        options.limit = options.limit || 10;
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = [
            ...this._buildEventActions(),
            ...this._buildAdditionalEventActions(otherFilter)
        ];

        const filteredPages = this._filterEventActions(pageActions, typeFilter);
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
        await this._models.MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    _buildEventOptions(filter, filterKeyMapping, additionalFilter = '', withRelated = []) {
        return {
            withRelated,
            filter: additionalFilter || 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(filterKeyMapping)
            )
        };
    }

    _mapEventData(models, eventType, options, transformer = null) {
        return models.map(model => {
            const data = transformer ? transformer(model, options) : model.toJSON(options);
            return {type: eventType, data};
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.withSource,
                'custom:true',
                ['member', 'newsletter']
            )
        };

        const {data: models, meta} = await this._models.MemberSubscribeEvent.findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.NEWSLETTER, opts);

        return {data, meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.basic,
                'custom:true',
                [
                    'member',
                    'subscriptionCreatedEvent.postAttribution',
                    'subscriptionCreatedEvent.userAttribution',
                    'subscriptionCreatedEvent.tagAttribution',
                    'subscriptionCreatedEvent.memberCreatedEvent',
                    'stripeSubscription.stripePrice.stripeProduct.product'
                ]
            ),
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(FILTER_KEY_MAPPING.basic),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            )
        };

        const {data: models, meta} = await this._models.MemberPaidSubscriptionEvent.findPage(opts);

        const data = this._mapEventData(models, EVENT_TYPES.SUBSCRIPTION, opts, (model) => {
            const tierName = this._extractTierName(model);
            delete model.relations.stripeSubscription;

            const json = model.toJSON(opts);
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
        const opts = {
            ...options,
            ...this._buildEventOptions(filter, FILTER_KEY_MAPPING.basic, 'custom:true', ['member'])
        };

        const {data: models, meta} = await this._models.MemberPaymentEvent.findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.PAYMENT, opts);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(filter, FILTER_KEY_MAPPING.basic, 'custom:true', ['member'])
        };

        const {data: models, meta} = await this._models.MemberLoginEvent.findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.LOGIN, opts);

        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.withSource,
                'subscriptionCreatedEvent.id:null+custom:true',
                ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            ),
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(FILTER_KEY_MAPPING.withSource),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };

        const {data: models, meta} = await this._models.MemberCreatedEvent.findPage(opts);

        const data = this._mapEventData(models, EVENT_TYPES.SIGNUP, opts, (model) => {
            const json = model.toJSON(opts);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });

        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.basic,
                'member_id:-null+custom:true',
                ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            ),
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

        const {data: models, meta} = await this._models.DonationPaymentEvent.findPage(opts);

        const data = this._mapEventData(models, EVENT_TYPES.DONATION, opts, (model) => {
            const json = model.toJSON(opts);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });

        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.withPostId,
                'member_id:-null+custom:true',
                ['member', 'post', 'parent']
            )
        };

        const {data: models, meta} = await this._models.Comment.findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.COMMENT, opts);

        return {data, meta};
    }

    async getClickEvents(options = {}, filter) {
        const opts = {
            ...options,
            ...this._buildEventOptions(
                filter,
                FILTER_KEY_MAPPING.withPostId,
                'custom:true',
                ['member', 'link', 'link.post']
            )
        };

        const {data: models, meta} = await this._models.MemberLinkClickEvent.findPage(opts);
        const data = this._mapEventData(models, EVENT_TYPES.CLICK, opts);

        return {data, meta};