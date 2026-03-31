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
    ...COMMON_KEY_MAP,
    'data.post_id': 'email.post_id'
};

const POST_ID_EXPANSION = {
    key: 'data.post_id',
    replacement: 'attribution_id',
    expansion: {attribution_type: 'post'}
};

function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

function buildMongoTransformer(filter, keyMap, expansions = []) {
    const transformers = [
        replaceCustomFilterTransformer(filter),
        ...mapKeys(keyMap)
    ];

    if (expansions.length > 0) {
        transformers.push(f => expandFilters(f, expansions));
    }

    return chainTransformers(...transformers);
}

function buildBaseOptions(options, filter, keyMap, {
    withRelated,
    filter: filterStr = 'custom:true',
    expansions = []
} = {}) {
    return {
        ...options,
        withRelated,
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, keyMap, expansions)
    };
}

function mapModelsToEvents(models, type, options) {
    return models.map(model => ({
        type,
        data: model.toJSON(options)
    }));
}

function buildEmailRecipientEventData(model, timestampField, eventType) {
    return {
        type: eventType,
        data: {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get(timestampField),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        }
    };
}

function stripPostAttributionContent(json) {
    delete json.postAttribution?.mobiledoc;
    delete json.postAttribution?.lexical;
    delete json.postAttribution?.plaintext;
    return json;
}

function sortEvents(a, b) {
    const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
    return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
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

    _buildPageActions(otherFilter) {
        const usesPostId = getUsedKeys(otherFilter).includes('data.post_id');

        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        if (!usesPostId) {
            pageActions.push(
                {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
                {type: 'login_event', action: 'getLoginEvents'},
                {type: 'payment_event', action: 'getPaymentEvents'},
                {type: 'email_change_event', action: 'getEmailChangeEvent'}
            );

            if (this._AutomatedEmailRecipient) {
                pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
            }
        }

        if (this._EmailRecipient) {
            pageActions.push(
                {type: 'email_sent_event', action: 'getEmailSentEvents'},
                {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
                {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
                {type: 'email_failed_event', action: 'getEmailFailedEvents'}
            );
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }

        return pageActions;
    }

    async getEventTimeline(options = {}) {
        options.limit = options.limit || 10;
        options.order = 'created_at desc, id desc';

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        let pageActions = this._buildPageActions(otherFilter);

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
        await this._MemberPaymentEvent.add({...data, source: 'stripe'});
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, {
            ...COMMON_KEY_MAP,
            'data.source': 'source'
        }, {withRelated: ['member', 'newsletter']});

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(queryOptions);
        return {data: mapModelsToEvents(models, 'newsletter_event', queryOptions), meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, COMMON_KEY_MAP, {
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            expansions: [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }]
        });

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const tierName = model.related('stripeSubscription')
                ?.related('stripePrice')
                ?.related('stripeProduct')
                ?.related('product')
                ?.get('name') ?? null;

            delete model.relations.stripeSubscription;

            const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
            const isCreatedType = model.get('type') === 'created';
            const hasSubscriptionCreatedEvent = isCreatedType && subscriptionCreatedEvent?.id;

            const d = {
                ...model.toJSON(queryOptions),
                attribution: hasSubscriptionCreatedEvent
                    ? this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent)
                    : null,
                signup: hasSubscriptionCreatedEvent && subscriptionCreatedEvent.related('memberCreatedEvent')?.id
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
        const queryOptions = buildBaseOptions(options, filter, COMMON_KEY_MAP, {
            withRelated: ['member']
        });

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(queryOptions);
        return {data: mapModelsToEvents(models, 'payment_event', queryOptions), meta};
    }

    async getLoginEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, COMMON_KEY_MAP, {
            withRelated: ['member']
        });

        const {data: models, meta} = await this._MemberLoginEvent.findPage(queryOptions);
        return {data: mapModelsToEvents(models, 'login_event', queryOptions), meta};
    }

    async getSignupEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, {
            ...COMMON_KEY_MAP,
            'data.source': 'source'
        }, {
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            expansions: [POST_ID_EXPANSION]
        });

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const json = stripPostAttributionContent(model.toJSON(queryOptions));
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

    async getDonationEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, COMMON_KEY_MAP, {
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'member_id:-null+custom:true',
            expansions: [POST_ID_EXPANSION]
        });

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(queryOptions);

        const data = models.map((model) => {
            const json = stripPostAttributionContent(model.toJSON(queryOptions));
            return {
                type: 'donation_event',
                data: {
                    ...json,
                    attribution: this._memberAttributionService.getEventAttribution(model)
                }
            };
        });

        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, {
            ...COMMON_KEY_MAP,
            'data.post_id': 'post_id'
        }, {
            withRelated: ['member', 'post', 'parent'],
            filter: 'member_id:-null+custom:true'
        });

        const {data: models, meta} = await this._Comment.findPage(queryOptions);
        return {data: mapModelsToEvents(models, 'comment_event', queryOptions), meta};
    }

    async getClickEvents(options = {}, filter) {
        const queryOptions = buildBaseOptions(options, filter, {
            ...COMMON_KEY_MAP,
            'data.post_id': 'post_id'
        }, {withRelated: ['member', 'link', 'link.post']});

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(queryOptions);
        return {data: mapModelsToEvents(models, 'click_event', queryOptions), meta};
    }

    getPostIdFromFilter(filter) {
        const postIdString = filter?.$and
            ? filter.$and.find(c => c['data.post_id'])?.['data.post_id']
            : filter?.['data.post_id'] ?? '';

        return ObjectID.isValid(postIdString) ? ObjectID.createFromHexString(postIdString) : null;
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

        const firstClicksQuery = `
            SELECT id, member_id, redirect_id, created_at,
                ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM PostClicks`;

        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
            FROM PostClicks AS inner_mce
            WHERE inner_mce.member_id = FirstClicks.member_id
            AND inner_mce.redirect_