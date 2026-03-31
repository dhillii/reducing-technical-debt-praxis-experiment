```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

const FILTER_ALLOW_LIST = ['data.created_at', 'data.member_id', 'data.post_id', 'type', 'id'];

const COMMON_KEY_MAP = {
    'data.created_at': 'created_at',
    'data.member_id': 'member_id'
};

const EMAIL_KEY_MAP = {
    'data.member_id': 'member_id',
    'data.post_id': 'email.post_id'
};

const POST_ID_EXPANSION = [{
    key: 'data.post_id',
    replacement: 'attribution_id',
    expansion: {attribution_type: 'post'}
}];

function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

function buildMongoTransformer(filter, keyMap, extraTransformer = null) {
    const transformers = [
        replaceCustomFilterTransformer(filter),
        ...mapKeys(keyMap)
    ];
    if (extraTransformer) {
        transformers.push(extraTransformer);
    }
    return chainTransformers(...transformers);
}

function buildBaseOptions(options, filter, withRelated, filterStr, keyMap, extraTransformer = null) {
    return {
        ...options,
        withRelated,
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, keyMap, extraTransformer)
    };
}

function mapSimpleEvent(type, model, options) {
    return {type, data: model.toJSON(options)};
}

function mapEmailRecipientEvent(type, timestampField, model) {
    return {
        type,
        data: {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get(timestampField),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        }
    };
}

function buildPaginationMeta(limit, total) {
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

function sortEvents(a, b) {
    const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
    return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
}

function stripPostAttributionContent(json) {
    delete json.postAttribution?.mobiledoc;
    delete json.postAttribution?.lexical;
    delete json.postAttribution?.plaintext;
    return json;
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

    _buildPageActions() {
        const baseActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        const nonPostIdActions = [
            {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
            {type: 'login_event', action: 'getLoginEvents'},
            {type: 'payment_event', action: 'getPaymentEvents'},
            {type: 'email_change_event', action: 'getEmailChangeEvent'}
        ];

        const emailRecipientActions = [
            {type: 'email_sent_event', action: 'getEmailSentEvents'},
            {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
            {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
            {type: 'email_failed_event', action: 'getEmailFailedEvents'}
        ];

        return {baseActions, nonPostIdActions, emailRecipientActions};
    }

    async getEventTimeline(options = {}) {
        options.limit = options.limit || 10;
        options.order = 'created_at desc, id desc';

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const {baseActions, nonPostIdActions, emailRecipientActions} = this._buildPageActions();

        let pageActions = [...baseActions];

        if (!getUsedKeys(otherFilter).includes('data.post_id')) {
            pageActions.push(...nonPostIdActions);
            if (this._AutomatedEmailRecipient) {
                pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
            }
        }

        if (this._EmailRecipient) {
            pageActions.push(...emailRecipientActions);
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }

        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            pageActions = pageActions.filter(page => query.test(page));
        }

        const allEventPages = await Promise.all(
            pageActions.map(page => this[page.action](options, otherFilter))
        );

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return {
            events: allEvents.sort(sortEvents).slice(0, options.limit),
            meta: buildPaginationMeta(options.limit, totalEvents)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({...data, source: 'stripe'});
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, ['member', 'newsletter'], 'custom:true', {
            ...COMMON_KEY_MAP,
            'data.source': 'source'
        });

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(queryOptions);
        return {
            data: models.map(model => mapSimpleEvent('newsletter_event', model, queryOptions)),
            meta
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        const withRelated = [
            'member',
            'subscriptionCreatedEvent.postAttribution',
            'subscriptionCreatedEvent.userAttribution',
            'subscriptionCreatedEvent.tagAttribution',
            'subscriptionCreatedEvent.memberCreatedEvent',
            'stripeSubscription.stripePrice.stripeProduct.product'
        ];

        const postIdExpansion = f => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'subscriptionCreatedEvent.attribution_id',
            expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
        }]);

        const queryOptions = buildBaseOptions(options, filter, withRelated, 'custom:true', COMMON_KEY_MAP, postIdExpansion);

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const tierName = model.related('stripeSubscription')
                ?.related('stripePrice')
                ?.related('stripeProduct')
                ?.related('product')
                ?.get('name') ?? null;

            delete model.relations.stripeSubscription;

            const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
            const hasSubscriptionCreatedEvent = subscriptionCreatedEvent?.id;
            const memberCreatedEvent = subscriptionCreatedEvent?.related('memberCreatedEvent');

            const d = {
                ...model.toJSON(queryOptions),
                attribution: model.get('type') === 'created' && hasSubscriptionCreatedEvent
                    ? this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent)
                    : null,
                signup: model.get('type') === 'created' && hasSubscriptionCreatedEvent && memberCreatedEvent?.id
                    ? true
                    : false,
                tierName
            };
            delete d.stripeSubscription;

            return {type: 'subscription_event', data: d};
        });

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, ['member'], 'custom:true', COMMON_KEY_MAP);
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(queryOptions);
        return {
            data: models.map(model => mapSimpleEvent('payment_event', model, queryOptions)),
            meta
        };
    }

    async getLoginEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, ['member'], 'custom:true', COMMON_KEY_MAP);
        const {data: models, meta} = await this._MemberLoginEvent.findPage(queryOptions);
        return {
            data: models.map(model => mapSimpleEvent('login_event', model, queryOptions)),
            meta
        };
    }

    async getSignupEvents(options = {}, filter) {
        const postIdExpansion = f => expandFilters(f, POST_ID_EXPANSION);
        const keyMap = {...COMMON_KEY_MAP, 'data.source': 'source'};
        const queryOptions = buildBaseOptions(
            options, filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            'subscriptionCreatedEvent.id:null+custom:true',
            keyMap,
            postIdExpansion
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const json = stripPostAttributionContent(model.toJSON(queryOptions));
            return {
                type: 'signup_event',
                data: {...json, attribution: this._memberAttributionService.getEventAttribution(model)}
            };
        });

        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        const postIdExpansion = f => expandFilters(f, POST_ID_EXPANSION);
        const queryOptions = buildBaseOptions(
            options, filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            'member_id:-null+custom:true',
            COMMON_KEY_MAP,
            postIdExpansion
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const json = stripPostAttributionContent(model.toJSON(queryOptions));
            return {
                type: 'donation_event',
                data: {...json, attribution: this._memberAttributionService.getEventAttribution(model)}
            };
        });

        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        const keyMap = {...COMMON_KEY_MAP, 'data.post_id': 'post_id'};
        const queryOptions = buildBaseOptions(options, filter, ['member', 'post', 'parent'], 'member_id:-null+custom:true', keyMap);
        const {data: models, meta} = await this._Comment.findPage(queryOptions);
        return {
            data: models.map(model => mapSimpleEvent('comment_event', model, queryOptions)),
            meta
        };
    }

    async getClickEvents(options = {}, filter) {
        const keyMap = {...COMMON_KEY_MAP, 'data.post_id': 'post_id'};
        const queryOptions = buildBaseOptions(options, filter, ['member', 'link', 'link.post'], 'custom:true', keyMap);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(queryOptions);
        return {
            data: models.map(model => mapSimpleEvent('click_event', model, queryOptions)),
            meta
        };
    }

    getPostIdFromFilter(filter) {
        const postIdString = filter?.$and
            ? filter.$and.find(c => c['data.post_id'])?.['data.post_id']
            : filter?.['data.post_id'] ?? '';

        if (!ObjectID.isValid(postIdString)) {
            return null;
        }
        return ObjectID.createFromHexString(postIdString);
    }

    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [, otherFilter] = this.getNQLSubset(options.filter);
        filter = this.removePostIdFilter(otherFilter);

        const postClicksQuery = postId
            ? `SELECT mce.id, mce.member_id, mce.redirect_id, mce.created_at
               FROM members_click_events mce
               INNER JOIN redirects r ON mce.redirect_id = r.id
               WHERE r.post_id = '${postId.toHexString()}'`
            : `SELECT mce.id, mce.member_id, mce.redirect_id, mce.created_at
               FROM members_click_events mce
               INNER JOIN redirects r ON mce.redirect_id = r.id`;

        const firstClicks