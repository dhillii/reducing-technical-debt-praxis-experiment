const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * This mongo transformer ignores the provided filter option and replaces the filter with a custom filter that was provided to the transformer.
 * Allowing us to set a mongo filter instead of a string based NQL filter.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

/**
 * Helper to build common event query options.
 * @param {Object} baseOptions - Base options passed by caller.
 * @param {Object} filter - Custom filter object.
 * @param {Object} keyMap - Mapping from NQL keys to Mongo keys.
 * @param {Array<Function>} extraTransformers - Additional transformer functions.
 * @returns {Object} - Fully built options object.
 */
function buildEventOptions(baseOptions, filter, keyMap, extraTransformers = []) {
    const mongoTransformer = chainTransformers(
        replaceCustomFilterTransformer(filter),
        ...mapKeys(keyMap),
        ...extraTransformers
    );

    return {
        ...baseOptions,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer
    };
}

/**
 * Helper to sort events by created_at then id.
 * @param {Array} events - List of event objects.
 * @returns {Array} - Sorted events.
 */
function sortEvents(events) {
    return events.sort((a, b) => {
        const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
        if (diff !== 0) {
            return diff;
        }
        return b.data.id.localeCompare(a.data.id);
    });
}

/**
 * Helper to build the static list of page actions.
 * @returns {Array} - Base page actions.
 */
function getBasePageActions() {
    return [
        {type: 'comment_event', action: 'getCommentEvents'},
        {type: 'click_event', action: 'getClickEvents'},
        {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
        {type: 'signup_event', action: 'getSignupEvents'},
        {type: 'subscription_event', action: 'getSubscriptionEvents'},
        {type: 'donation_event', action: 'getDonationEvents'}
    ];
}

/**
 * Helper to add conditional page actions based on model availability and filters.
 * @param {Array} actions - Existing actions array (mutated).
 * @param {Object} otherFilter - Filter without type.
 * @param {Object} ctx - Repository instance (this).
 */
function addConditionalPageActions(actions, otherFilter, ctx) {
    if (!getUsedKeys(otherFilter).includes('data.post_id')) {
        actions.push(
            {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
            {type: 'login_event', action: 'getLoginEvents'},
            {type: 'payment_event', action: 'getPaymentEvents'},
            {type: 'email_change_event', action: 'getEmailChangeEvent'}
        );

        if (ctx._AutomatedEmailRecipient) {
            actions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
        }
    }

    if (ctx._EmailRecipient) {
        actions.push(
            {type: 'email_sent_event', action: 'getEmailSentEvents'},
            {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
            {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
            {type: 'email_failed_event', action: 'getEmailFailedEvents'}
        );
    }

    actions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

    if (ctx._labsService.isSet('audienceFeedback')) {
        actions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
    }
}

/**
 * Helper to filter page actions by type filter.
 * @param {Array} actions - List of page actions.
 * @param {Object} typeFilter - Mingo query filter for type.
 * @returns {Array} - Filtered actions.
 */
function filterActionsByType(actions, typeFilter) {
    if (!typeFilter) {
        return actions;
    }
    const query = new mingo.Query(typeFilter);
    return actions.filter(page => query.test(page));
}

/**
 * Helper to compute pagination metadata.
 * @param {number} total - Total number of events.
 * @param {number} limit - Limit per page.
 * @returns {Object} - Pagination meta.
 */
function buildPaginationMeta(total, limit) {
    return {
        limit,
        total,
        pages: limit > 0 ? Math.ceil(total / limit) : null,
        page: null,
        next: null,
        prev: null
    };
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

    async getEventTimeline(options) {
        options = options || {};
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = getBasePageActions();
        addConditionalPageActions(pageActions, otherFilter, this);
        const filteredPages = filterActionsByType(pageActions, typeFilter);

        const pagePromises = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pagePromises);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        const sortedEvents = sortEvents(allEvents).slice(0, options.limit);

        return {
            events: sortedEvents,
            meta: {
                pagination: buildPaginationMeta(totalEvents, options.limit)
            }
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({...data, source: 'stripe'});
    }

    async getNewsletterSubscriptionEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.source': 'source',
            'data.member_id': 'member_id'
        };
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'newsletter']
        }, filter, keyMap);

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'newsletter_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getSubscriptionEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        };
        const extra = [
            (f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }])
        ];
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ]
        }, filter, keyMap, extra);

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(builtOptions);
        const data = models.map(model => {
            const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
            delete model.relations.stripeSubscription;
            const json = model.toJSON(builtOptions);
            const attribution = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                : null;
            const signup = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id ? true : false;
            return {
                type: 'subscription_event',
                data: {...json, attribution, signup, tierName}
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        };
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member']
        }, filter, keyMap);

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'payment_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getLoginEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        };
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member']
        }, filter, keyMap);

        const {data: models, meta} = await this._MemberLoginEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'login_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getSignupEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.source': 'source'
        };
        const extra = [
            (f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])
        ];
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'subscriptionCreatedEvent.id:null+custom:true'
        }, filter, keyMap, extra);

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(builtOptions);
        const data = models.map(model => {
            const json = model.toJSON(builtOptions);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                type: 'signup_event',
                data: {...json, attribution: this._memberAttributionService.getEventAttribution(model)}
            };
        });

        return {data, meta};
    }

    async getDonationEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        };
        const extra = [
            (f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])
        ];
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'member_id:-null+custom:true'
        }, filter, keyMap, extra);

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(builtOptions);
        const data = models.map(model => {
            const json = model.toJSON(builtOptions);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                type: 'donation_event',
                data: {...json, attribution: this._memberAttributionService.getEventAttribution(model)}
            };
        });

        return {data, meta};
    }

    async getCommentEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        };
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'post', 'parent']
        }, filter, keyMap);

        const {data: models, meta} = await this._Comment.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'comment_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getClickEvents(options, filter) {
        options = options || {};
        const keyMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        };
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'link', 'link.post']
        }, filter, keyMap);

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'click_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    getPostIdFromFilter(filter) {
        let postIdString = '';

        if (filter && filter.$and) {
            postIdString = filter.$and.find(condition => condition['data.post_id'])?.['data.post_id'];
        } else {
            postIdString = filter ? filter['data.post_id'] : '';
        }

        if (!ObjectID.isValid(postIdString)) {
            return null;
        }

        return ObjectID.createFromHexString(postIdString);
    }

    async getAggregatedClickEvents(options, filter) {
        options = options || {};
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const cleanedFilter = this.removePostIdFilter(otherFilter);

        const postClicksQuery = postId
            ? `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id
                WHERE
                    r.post_id = '${postId.toHexString()}'`
            : `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id`;

        const firstClicksQuery = `
            SELECT
                id,
                member_id,
                redirect_id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM
                PostClicks
        `;

        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;

        const builtOptions = {
            ...options,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(cleanedFilter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ),
            useCTE: true,
            selectRaw: `id, member_id, created_at, (${mainQuery}) as count__clicks`,
            whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
            cte: [
                {name: `PostClicks`, query: postClicksQuery},
                {name: `FirstClicks`, query: firstClicksQuery}
            ],
            from: 'FirstClicks',
            order: ''
        };

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'aggregated_click_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getFeedbackEvents(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'post']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });

        const {data: models, meta} = await this._MemberFeedback.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'feedback_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getEmailSentEvents(options, filter) {
        options = options || {};
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'email'],
            filter: filterStr
        }, filter, {
            'data.created_at': 'processed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });

        builtOptions.order = builtOptions.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'email_sent_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('processed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        }));

        return {data, meta};
    }

    async getEmailDeliveredEvents(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'email'],
            filter: 'delivered_at:-null+custom:true'
        }, filter, {
            'data.created_at': 'delivered_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });

        builtOptions.order = builtOptions.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'email_delivered_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('delivered_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        }));

        return {data, meta};
    }

    async getEmailOpenedEvents(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'email'],
            filter: 'opened_at:-null+custom:true'
        }, filter, {
            'data.created_at': 'opened_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });

        builtOptions.order = builtOptions.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'email_opened_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('opened_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        }));

        return {data, meta};
    }

    async getEmailSpamComplaintEvents(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'email']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'email_complaint_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getEmailFailedEvents(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'email'],
            filter: 'failed_at:-null+custom:true'
        }, filter, {
            'data.created_at': 'failed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });

        builtOptions.order = builtOptions.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'email_failed_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('failed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        }));

        return {data, meta};
    }

    async getEmailChangeEvent(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(builtOptions);
        const data = models.map(model => ({
            type: 'email_change_event',
            data: model.toJSON(builtOptions)
        }));

        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter) {
        options = options || {};
        const builtOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'automatedEmail']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(builtOptions);
        const data = models.map(model => {
            const automatedEmail = model.related('automatedEmail').toJSON();
            return {
                type: 'automated_email_sent_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('created_at'),
                    member: model.related('member').toJSON(),
                    automatedEmail: {
                        id: automatedEmail.id,
                        slug: automatedEmail.slug
                    }
                }
            };
        });

        return {data, meta};
    }

    getNQLSubset(filter) {
        if (!filter) {
            return [undefined, undefined];
        }

        const allowList = ['data.created_at', 'data.member_id', 'data.post_id', 'type', 'id'];
        let parsed;
        try {
            parsed = nql(filter).parse();
        } catch (e) {
            throw new errors.BadRequestError({message: e.message});
        }

        const keys = getUsedKeys(parsed);
        for (const key of keys) {
            if (!allowList.includes(key)) {
                throw new errors.IncorrectUsageError({message: 'Cannot filter by ' + key});
            }
        }

        try {
            return splitFilter(parsed, ['type']);
        } catch (e) {
            throw new errors.IncorrectUsageError({message: e.message});
        }
    }

    removePostIdFilter(filter) {
        if (!filter) {
            return filter;
        }
        try {
            return rejectStatements(filter, key => key === 'data.post_id');
        } catch (e) {
            throw new errors.IncorrectUsageError({message: e.message});
        }
    }

    async getMRR() {
        const results = await this._MemberPaidSubscriptionEvent.findAll({aggregateMRRDeltas: true});
        const resultsJSON = results.toJSON();

        return resultsJSON.reduce((acc, result) => {
            const currencyGroup = acc[result.currency] || [];
            const lastMrr = currencyGroup.length ? currencyGroup[currencyGroup.length - 1].mrr : 0;
            currencyGroup.push({
                date: result.date,
                mrr: lastMrr + result.mrr_delta,
                currency: result.currency
            });
            return {...acc, [result.currency]: currencyGroup};
        }, {});
    }

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({aggregateStatusCounts: true});
        const resultsJSON = results.toJSON();

        return resultsJSON.reduce((acc, result, index) => {
            if (index === 0) {
                return [{
                    date: result.date,
                    paid: result.paid_delta,
                    comped: result.comped_delta,
                    free: result.free_delta
                }];
            }
            const prev = acc[index - 1];
            acc.push({
                date: result.date,
                paid: prev.paid + result.paid_delta,
                comped: prev.comped + result.comped_delta,
                free: prev.free + result.free_delta
            });
            return acc;
        }, []);
    }
};