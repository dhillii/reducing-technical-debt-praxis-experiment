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

function buildBaseOptions(options, filter, withRelated, keyMap, filterStr = 'custom:true', expansions = []) {
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

async function fetchEmailRecipientEvents(emailRecipient, options, filter, timestampField, eventType, filterStr) {
    const keyMap = {
        [`data.created_at`]: timestampField,
        ...EMAIL_KEY_MAP
    };

    const builtOptions = {
        ...buildBaseOptions(options, filter, ['member', 'email'], keyMap, filterStr),
        order: options.order.replace(/created_at/g, timestampField)
    };

    const {data: models, meta} = await emailRecipient.findPage(builtOptions);

    return {
        data: models.map(model => buildEmailRecipientEventData(model, timestampField, eventType)),
        meta
    };
}

function deletePostAttributionFields(json) {
    delete json.postAttribution?.mobiledoc;
    delete json.postAttribution?.lexical;
    delete json.postAttribution?.plaintext;
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
        const postIdFiltered = getUsedKeys(otherFilter).includes('data.post_id');

        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        if (!postIdFiltered) {
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

        let pageActions = this._buildPageActions(otherFilter);

        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            pageActions = pageActions.filter(page => query.test(page));
        }

        const allEventPages = await Promise.all(
            pageActions.map(page => this[page.action](options, otherFilter))
        );

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((acc, page) => acc + page.meta.pagination.total, 0);

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
        await this._MemberPaymentEvent.add({...data, source: 'stripe'});
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const builtOptions = buildBaseOptions(options, filter, ['member', 'newsletter'], {
            ...COMMON_KEY_MAP,
            'data.source': 'source'
        });

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(builtOptions);

        return {
            data: mapModelsToEvents(models, 'newsletter_event', builtOptions),
            meta
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        const keyMap = {...COMMON_KEY_MAP};
        const expansions = [{
            key: 'data.post_id',
            replacement: 'subscriptionCreatedEvent.attribution_id',
            expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
        }];

        const builtOptions = buildBaseOptions(
            options,
            filter,
            [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            keyMap,
            'custom:true',
            expansions
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(builtOptions);

        const data = models.map((model) => {
            const tierName = model
                .related('stripeSubscription')
                ?.related('stripePrice')
                ?.related('stripeProduct')
                ?.related('product')
                ?.get('name') ?? null;

            delete model.relations.stripeSubscription;

            const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
            const isCreatedType = model.get('type') === 'created';
            const hasSubscriptionCreatedEvent = subscriptionCreatedEvent?.id;
            const hasMemberCreatedEvent = subscriptionCreatedEvent?.related('memberCreatedEvent')?.id;

            const d = {
                ...model.toJSON(builtOptions),
                attribution: isCreatedType && hasSubscriptionCreatedEvent
                    ? this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent)
                    : null,
                signup: Boolean(isCreatedType && hasSubscriptionCreatedEvent && hasMemberCreatedEvent),
                tierName
            };
            delete d.stripeSubscription;

            return {type: 'subscription_event', data: d};
        });

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const builtOptions = buildBaseOptions(options, filter, ['member'], COMMON_KEY_MAP);
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(builtOptions);

        return {
            data: mapModelsToEvents(models, 'payment_event', builtOptions),
            meta
        };
    }

    async getLoginEvents(options = {}, filter) {
        const builtOptions = buildBaseOptions(options, filter, ['member'], COMMON_KEY_MAP);
        const {data: models, meta} = await this._MemberLoginEvent.findPage(builtOptions);

        return {
            data: mapModelsToEvents(models, 'login_event', builtOptions),
            meta
        };
    }

    async getSignupEvents(options = {}, filter) {
        const keyMap = {
            ...COMMON_KEY_MAP,
            'data.source': 'source'
        };

        const builtOptions = buildBaseOptions(
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            keyMap,
            'subscriptionCreatedEvent.id:null+custom:true',
            POST_ID_EXPANSION
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(builtOptions);

        const data = models.map((model) => {
            const json = model.toJSON(builtOptions);
            deletePostAttributionFields(json);
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
        const builtOptions = buildBaseOptions(
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            COMMON_KEY_MAP,
            'member_id:-null+custom:true',
            POST_ID_EXPANSION
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(builtOptions);

        const data = models.map((model) => {
            const json = model.toJSON(builtOptions);
            deletePostAttributionFields(json);
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
        const keyMap = {
            ...COMMON_KEY_MAP,
            'data.post_id': 'post_id'
        };

        const builtOptions = buildBaseOptions(
            options, filter, ['member', 'post', 'parent'], keyMap, 'member_id:-null+custom:true'
        );

        const {data: models, meta} = await this._Comment.findPage(builtOptions);

        return {
            data: mapModelsToEvents(models, 'comment_event', builtOptions),
            meta
        };
    }

    async getClickEvents(options = {}, filter) {
        const keyMap = {
            ...COMMON_KEY_MAP,
            'data.post_id': 'post_id'
        };

        const builtOptions = buildBaseOptions(options, filter, ['member', 'link', 'link.post'], keyMap);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(builtOptions);

        return {
            data: mapModelsToEvents(models, 'click_event', builtOptions),
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

    _buildPostClicksQuery(postId) {
        const baseSelect = `SELECT mce.id, mce.member_id, mce.redirect_id, mce.created_at
            FROM members_click_