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

const KEY_MAPPINGS = {
    basic: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id'
    },
    withSource: {
        'data.created_at': 'created_at',
        'data.source': 'source',
        'data.member_id': 'member_id'
    },
    withPostId: {
        'data.created_at': 'created_at',
        'data.member_id': 'member_id',
        'data.post_id': 'post_id'
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

    _buildConditionalEventPageActions(hasPostIdFilter) {
        const actions = [];

        if (!hasPostIdFilter) {
            actions.push(
                {type: EVENT_TYPES.NEWSLETTER, action: 'getNewsletterSubscriptionEvents', model: 'MemberSubscribeEvent'},
                {type: EVENT_TYPES.LOGIN, action: 'getLoginEvents', model: 'MemberLoginEvent'},
                {type: EVENT_TYPES.PAYMENT, action: 'getPaymentEvents', model: 'MemberPaymentEvent'},
                {type: EVENT_TYPES.EMAIL_CHANGE, action: 'getEmailChangeEvent', model: 'MemberEmailChangeEvent'}
            );

            if (this._getModel('AutomatedEmailRecipient')) {
                actions.push({type: EVENT_TYPES.AUTOMATED_EMAIL_SENT, action: 'getAutomatedEmailSentEvents', model: 'AutomatedEmailRecipient'});
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
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const baseActions = this._buildEventPageActions();
        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');
        const conditionalActions = this._buildConditionalEventPageActions(hasPostIdFilter);
        const pageActions = [...baseActions, ...conditionalActions];

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
        await this._getModel('MemberPaymentEvent').add({
            ...data,
            source: 'stripe'
        });
    }

    _buildBaseOptions(options, filter, keyMapping, additionalFilter = '') {
        const baseFilter = additionalFilter ? `${additionalFilter}+custom:true` : 'custom:true';
        return {
            ...options,
            filter: baseFilter,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMapping)
            )
        };
    }

    _mapModelsToEvents(models, eventType, options, transformer = null) {
        return models.map((model) => {
            let data = transformer ? transformer(model, options) : model.toJSON(options);
            return {
                type: eventType,
                data
            };
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        options = {
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.withSource),
            withRelated: ['member', 'newsletter']
        };

        const {data: models, meta} = await this._getModel('MemberSubscribeEvent').findPage(options);
        const data = this._mapModelsToEvents(models, EVENT_TYPES.NEWSLETTER, options);

        return {data, meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        options = {
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.basic),
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(KEY_MAPPINGS.basic),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            )
        };

        const {data: models, meta} = await this._getModel('MemberPaidSubscriptionEvent').findPage(options);

        const data = models.map((model) => {
            const tierName = this._extractTierName(model);
            delete model.relations.stripeSubscription;

            const json = model.toJSON(options);
            const d = {
                ...json,
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id 
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id,
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
        return model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
    }

    async getPaymentEvents(options = {}, filter) {
        options = {
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.basic),
            withRelated: ['member']
        };

        const {data: models, meta} = await this._getModel('MemberPaymentEvent').findPage(options);
        const data = this._mapModelsToEvents(models, EVENT_TYPES.PAYMENT, options);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.basic),
            withRelated: ['member']
        };

        const {data: models, meta} = await this._getModel('MemberLoginEvent').findPage(options);
        const data = this._mapModelsToEvents(models, EVENT_TYPES.LOGIN, options);

        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        options = {
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.withSource, 'subscriptionCreatedEvent.id:null'),
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({...KEY_MAPPINGS.withSource}),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };

        const {data: models, meta} = await this._getModel('MemberCreatedEvent').findPage(options);

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
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.basic, 'member_id:-null'),
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(KEY_MAPPINGS.basic),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };

        const {data: models, meta} = await this._getModel('DonationPaymentEvent').findPage(options);

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
            ...this._buildBaseOptions(options, filter, KEY_MAPPINGS.withPostId),
            withRelated: ['member', 'post', 'parent']
        };

        const {data: models, meta} = await this._getModel('Comment').findPage(options);
        const data = this._mapModelsToEvents(models, EVENT_TYPES.COMMENT, options);

        return {data, meta};
    }

    async getClickEvents(options = {}, filter) {
        options = {
            ...this._buildBaseOptions(options, filter, KEY_