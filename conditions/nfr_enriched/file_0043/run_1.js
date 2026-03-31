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

    _buildEventConfig() {
        const config = [
            {type: EVENT_TYPES.COMMENT, action: 'getCommentEvents', model: 'Comment'},
            {type: EVENT_TYPES.CLICK, action: 'getClickEvents', model: 'MemberLinkClickEvent'},
            {type: EVENT_TYPES.AGGREGATED_CLICK, action: 'getAggregatedClickEvents', model: 'MemberLinkClickEvent'},
            {type: EVENT_TYPES.SIGNUP, action: 'getSignupEvents', model: 'MemberCreatedEvent'},
            {type: EVENT_TYPES.SUBSCRIPTION, action: 'getSubscriptionEvents', model: 'MemberPaidSubscriptionEvent'},
            {type: EVENT_TYPES.DONATION, action: 'getDonationEvents', model: 'DonationPaymentEvent'}
        ];
        return config;
    }

    _buildAdditionalEventConfig(hasPostIdFilter) {
        const config = [];
        
        if (!hasPostIdFilter) {
            config.push(
                {type: EVENT_TYPES.NEWSLETTER, action: 'getNewsletterSubscriptionEvents', model: 'MemberSubscribeEvent'},
                {type: EVENT_TYPES.LOGIN, action: 'getLoginEvents', model: 'MemberLoginEvent'},
                {type: EVENT_TYPES.PAYMENT, action: 'getPaymentEvents', model: 'MemberPaymentEvent'},
                {type: EVENT_TYPES.EMAIL_CHANGE, action: 'getEmailChangeEvent', model: 'MemberEmailChangeEvent'}
            );

            if (this._getModel('AutomatedEmailRecipient')) {
                config.push({type: EVENT_TYPES.AUTOMATED_EMAIL_SENT, action: 'getAutomatedEmailSentEvents', model: 'AutomatedEmailRecipient'});
            }
        }

        if (this._getModel('EmailRecipient')) {
            config.push(
                {type: EVENT_TYPES.EMAIL_SENT, action: 'getEmailSentEvents', model: 'EmailRecipient'},
                {type: EVENT_TYPES.EMAIL_DELIVERED, action: 'getEmailDeliveredEvents', model: 'EmailRecipient'},
                {type: EVENT_TYPES.EMAIL_OPENED, action: 'getEmailOpenedEvents', model: 'EmailRecipient'},
                {type: EVENT_TYPES.EMAIL_FAILED, action: 'getEmailFailedEvents', model: 'EmailRecipient'}
            );
        }

        config.push({type: EVENT_TYPES.EMAIL_COMPLAINT, action: 'getEmailSpamComplaintEvents', model: 'EmailSpamComplaintEvent'});

        if (this._labsService.isSet('audienceFeedback')) {
            config.push({type: EVENT_TYPES.FEEDBACK, action: 'getFeedbackEvents', model: 'MemberFeedback'});
        }

        return config;
    }

    _filterEventsByType(events, typeFilter) {
        if (!typeFilter) {
            return events;
        }
        const query = new mingo.Query(typeFilter);
        return events.filter(event => query.test(event));
    }

    _sortAndPaginateEvents(allEvents, limit) {
        return allEvents
            .sort((a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
            })
            .slice(0, limit);
    }

    async getEventTimeline(options = {}) {
        const limit = options.limit || 10;
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');
        const baseEvents = this._buildEventConfig();
        const additionalEvents = this._buildAdditionalEventConfig(hasPostIdFilter);
        const allEventConfigs = [...baseEvents, ...additionalEvents];

        const filteredEvents = this._filterEventsByType(allEventConfigs, typeFilter);
        const eventPromises = filteredEvents.map(event => this[event.action](options, otherFilter));
        const allEventPages = await Promise.all(eventPromises);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return {
            events: this._sortAndPaginateEvents(allEvents, limit),
            meta: {
                pagination: {
                    limit,
                    total: totalEvents,
                    pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,
                    page: null,
                    next: null,
                    prev: null
                }
            }
        };
    }

    async registerPayment(data) {
        await this._getModel('MemberPaymentEvent').add({
            ...data,
            source: 'stripe'
        });
    }

    _buildEventOptions(options, filter, modelName, baseFilter, keyMapping, additionalTransformers = []) {
        return {
            ...options,
            filter: baseFilter || 'custom:true',
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

    async _fetchAndMapEvents(modelName, eventType, options, filter, baseFilter, keyMapping, additionalTransformers = [], transformer = null) {
        const eventOptions = this._buildEventOptions(options, filter, modelName, baseFilter, keyMapping, additionalTransformers);
        const model = this._getModel(modelName);
        const {data: models, meta} = await model.findPage(eventOptions);
        const data = this._mapEventData(models, eventType, eventOptions, transformer);
        return {data, meta};
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        return this._fetchAndMapEvents(
            'MemberSubscribeEvent',
            EVENT_TYPES.NEWSLETTER,
            {...options, withRelated: ['member', 'newsletter']},
            filter,
            'custom:true',
            FILTER_KEY_MAPPING.basic
        );
    }

    async getSubscriptionEvents(options = {}, filter) {
        const transformer = (model) => {
            const tierName = this._extractTierName(model);
            delete model.relations.stripeSubscription;
            const json = model.toJSON();
            return {
                ...json,
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id 
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id,
                tierName
            };
        };

        return this._fetchAndMapEvents(
            'MemberPaidSubscriptionEvent',
            EVENT_TYPES.SUBSCRIPTION,
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
            'custom:true',
            FILTER_KEY_MAPPING.basic,
            [(f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }])],
            transformer
        );
    }

    _extractTierName(model) {
        return model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
    }

    async getPaymentEvents(options = {}, filter) {
        return this._fetchAndMapEvents(
            'MemberPaymentEvent',
            EVENT_TYPES.PAYMENT,
            {...options, withRelated: ['member']},
            filter,
            'custom:true',
            FILTER_KEY_MAPPING.basic
        );
    }

    async getLoginEvents(options = {}, filter) {
        return this._fetchAndMapEvents(
            'MemberLoginEvent',
            EVENT_TYPES.LOGIN,
            {...options, withRelated: ['member']},
            filter,
            'custom:true',
            FILTER_KEY_MAPPING.basic
        );
    }

    async getSignupEvents(options = {}, filter) {
        const transformer = (model) => {
            const json = model.toJSON();
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        };

        return this._fetchAndMapEvents(
            'MemberCreatedEvent',
            EVENT_TYPES.SIGNUP,
            {
                ...options,
                withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            },
            filter,
            'subscriptionCreatedEvent.id:null+custom:true',
            FILTER_KEY_MAPPING.basic,
            [(f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])],
            transformer
        );
    }

    async getDonationEvents(options = {}, filter) {
        const transformer = (model) => {
            const json = model.toJSON();
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        };

        return this._fetchAndMapEvents(
            'DonationPaymentEvent',
            EVENT_TYPES.DONATION,
            {
                ...options,
                withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            },
            filter,
            'member_id:-null+custom:true',
            FILTER_KEY_MAPPING.basic,
            [(f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])],
            transformer
        );
    }

    async getCommentEvents(options = {}, filter) {
        return this._fetchAndMapEvents(
            'Comment',
            EVENT_TYPES.COMMENT,
            {...options, withRelated: ['member', 'post', 'parent']},
            filter,
            'member_id:-null+custom:true',
            FILTER_KEY_MAPPING.withPost
        );
    }

    async getClickEvents(options = {}, filter) {
        return this._fetchAndMapEvents(
            'MemberLinkClickEvent',
            EVENT_TYPES.CLICK,
            {...options, withRelated: ['member', 'link', 'link.post']},
            filter,
            'custom:true',
            FILTER_KEY_MAPPING.withPost
        );
    }

    getPostIdFromFilter(filter) {
        let postIdString = '';

        if (filter?.$and) {
            postIdString = filter.$and.find(condition => condition['data.post_id'])?.['data.post_id'];
        } else {
            postIdString = filter?.['data.post_id'] || '';
        }

        return ObjectID.isValid(postIdString) ? ObjectID.createFromHexString(postIdString) : null;
    }

    async getAggregatedClickEvents(options