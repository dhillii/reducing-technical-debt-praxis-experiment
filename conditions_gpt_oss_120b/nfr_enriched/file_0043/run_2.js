const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * This mongo transformer ignores the provided filter option and replaces the filter with a custom filter that was provided to the transformer. Allowing us to set a mongo filter instead of a string based NQL filter.
 */
function replaceCustomFilterTransformer(filter) {
    // Instead of adding an existing filter, we replace a filter, because mongo transformers are only applied if there is any filter (so not executed for empty filters)
    return function (existingFilter) {
        return replaceFilters(existingFilter, {
            custom: filter
        });
    };
}

/**
 * Helper to build the common options object for event queries.
 * @param {Object} baseOptions
 * @param {Object} filter
 * @param {Array} mapConfig
 * @param {Function[]} extraTransformers
 * @returns {Object}
 */
function buildEventOptions(baseOptions, filter, mapConfig, extraTransformers = []) {
    const transformers = [
        replaceCustomFilterTransformer(filter),
        ...mapKeys(mapConfig),
        ...extraTransformers
    ];
    return {
        ...baseOptions,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: chainTransformers(...transformers)
    };
}

/**
 * Helper to extract tier name from a subscription model.
 * @param {Object} model
 * @returns {string|null}
 */
function extractTierName(model) {
    const stripeSubscription = model.related('stripeSubscription');
    if (!stripeSubscription) {
        return null;
    }
    const stripePrice = stripeSubscription.related('stripePrice');
    if (!stripePrice) {
        return null;
    }
    const stripeProduct = stripePrice.related('stripeProduct');
    if (!stripeProduct) {
        return null;
    }
    const product = stripeProduct.related('product');
    return product ? product.get('name') : null;
}

/**
 * Helper to remove post_id filter from a Mongo filter object.
 * @param {Object} filter
 * @returns {Object}
 */
function removePostIdFilter(filter) {
    if (!filter) {
        return filter;
    }
    try {
        return rejectStatements(filter, key => key === 'data.post_id');
    } catch (e) {
        throw new errors.IncorrectUsageError({message: e.message});
    }
}

/**
 * Helper to get postId ObjectID from a Mongo filter.
 * @param {Object} filter
 * @returns {ObjectID|null}
 */
function getPostIdFromFilter(filter) {
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

/**
 * Helper to split NQL filter into type and other parts.
 * @param {string} filter
 * @returns {[Object|undefined, Object|undefined]}
 */
function splitNQLFilter(filter) {
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

/**
 * Helper to build the list of page actions based on repository capabilities and filters.
 * @param {Object} repo
 * @param {Object} otherFilter
 * @returns {Array}
 */
function buildPageActions(repo, otherFilter) {
    const pageActions = [
        {type: 'comment_event', action: 'getCommentEvents'},
        {type: 'click_event', action: 'getClickEvents'},
        {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
        {type: 'signup_event', action: 'getSignupEvents'},
        {type: 'subscription_event', action: 'getSubscriptionEvents'},
        {type: 'donation_event', action: 'getDonationEvents'}
    ];
    if (!getUsedKeys(otherFilter).includes('data.post_id')) {
        pageActions.push(
            {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
            {type: 'login_event', action: 'getLoginEvents'},
            {type: 'payment_event', action: 'getPaymentEvents'},
            {type: 'email_change_event', action: 'getEmailChangeEvent'}
        );
        if (repo._AutomatedEmailRecipient) {
            pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
        }
    }
    if (repo._EmailRecipient) {
        pageActions.push(
            {type: 'email_sent_event', action: 'getEmailSentEvents'},
            {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
            {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
            {type: 'email_failed_event', action: 'getEmailFailedEvents'}
        );
    }
    pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});
    if (repo._labsService.isSet('audienceFeedback')) {
        pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
    }
    return pageActions;
}

/**
 * Helper to filter page actions by type filter.
 * @param {Array} actions
 * @param {Object} typeFilter
 * @returns {Array}
 */
function filterPageActionsByType(actions, typeFilter) {
    if (!typeFilter) {
        return actions;
    }
    const query = new mingo.Query(typeFilter);
    return actions.filter(page => query.test(page));
}

/**
 * Helper to sort events and apply pagination limit.
 * @param {Array} events
 * @param {number} limit
 * @returns {Array}
 */
function sortAndSliceEvents(events, limit) {
    return events.sort((a, b) => {
        const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
        if (diff !== 0) {
            return diff;
        }
        return b.data.id.localeCompare(a.data.id);
    }).slice(0, limit);
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
        if (!options) {
            options = {};
        }
        if (!options.limit) {
            options.limit = 10;
        }
        const [typeFilter, otherFilter] = splitNQLFilter(options.filter);
        options.order = 'created_at desc, id desc';
        const pageActions = buildPageActions(this, otherFilter);
        const filteredPages = filterPageActionsByType(pageActions, typeFilter);
        const pagePromises = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pagePromises);
        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((acc, page) => acc + page.meta.pagination.total, 0);
        return {
            events: sortAndSliceEvents(allEvents, options.limit),
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

    async getNewsletterSubscriptionEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'newsletter']
        }, filter, {
            'data.created_at': 'created_at',
            'data.source': 'source',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'newsletter_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getSubscriptionEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const extra = (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'subscriptionCreatedEvent.attribution_id',
            expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
        }]);
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ]
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, [extra]);
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(eventOptions);
        const data = models.map(model => {
            const tierName = extractTierName(model);
            delete model.relations.stripeSubscription;
            const json = model.toJSON(eventOptions);
            const enriched = {
                ...json,
                attribution: json.type === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: json.type === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id &&
                    model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id,
                tierName
            };
            delete enriched.stripeSubscription;
            return {type: 'subscription_event', data: enriched};
        });
        return {data, meta};
    }

    async getPaymentEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'payment_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getLoginEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberLoginEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'login_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getSignupEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const extra = (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'attribution_id',
            expansion: {attribution_type: 'post'}
        }]);
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.source': 'source'
        }, [extra]);
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(eventOptions);
        const data = models.map(model => {
            const json = model.toJSON(eventOptions);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
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

    async getDonationEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const extra = (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'attribution_id',
            expansion: {attribution_type: 'post'}
        }]);
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, [extra]);
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(eventOptions);
        const data = models.map(model => {
            const json = model.toJSON(eventOptions);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
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

    async getCommentEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'post', 'parent']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });
        const {data: models, meta} = await this._Comment.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'comment_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getClickEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'link', 'link.post']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'click_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getAggregatedClickEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const postId = getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = splitNQLFilter(options.filter);
        const cleanedFilter = removePostIdFilter(otherFilter);
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
                PostClicks`;
        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
        const eventOptions = {
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
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'aggregated_click_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getFeedbackEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = buildEventOptions({
            ...options,
            withRelated: ['member', 'post']
        }, filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });
        const {data: models, meta} = await this._MemberFeedback.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'feedback_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getEmailSentEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const eventOptions = {
            ...options,
            withRelated: ['member', 'email'],
            filter: filterStr,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'processed_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'processed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);
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

    async getEmailDeliveredEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'delivered_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'delivered_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'delivered_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);
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

    async getEmailOpenedEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'opened_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'opened_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'opened_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);
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

    async getEmailSpamComplaintEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'email_complaint_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getEmailFailedEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'failed_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'failed_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'failed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);
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

    async getEmailChangeEvent(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(eventOptions);
        const data = models.map(model => ({
            type: 'email_change_event',
            data: model.toJSON(eventOptions)
        }));
        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter = undefined) {
        if (!options) {
            options = {};
        }
        const eventOptions = {
            ...options,
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(eventOptions);
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

    async getMRR() {
        const results = await this._MemberPaidSubscriptionEvent.findAll({aggregateMRRDeltas: true});
        const resultsJSON = results.toJSON();
        return resultsJSON.reduce((acc, result) => {
            if (!acc[result.currency]) {
                acc[result.currency] = [{date: result.date, mrr: result.mrr_delta, currency: result.currency}];
            } else {
                const last = acc[result.currency][acc[result.currency].length - 1];
                acc[result.currency].push({date: result.date, mrr: result.mrr_delta + last.mrr, currency: result.currency});
            }
            return acc;
        }, {});
    }

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({aggregateStatusCounts: true});
        const resultsJSON = results.toJSON();
        return resultsJSON.reduce((acc, result, idx) => {
            if (idx === 0) {
                return [{date: result.date, paid: result.paid_delta, comped: result.comped_delta, free: result.free_delta}];
            }
            const prev = acc[idx - 1];
            acc.push({
                date: result.date,
                paid: result.paid_delta + prev.paid,
                comped: result.comped_delta + prev.comped,
                free: result.free_delta + prev.free
            });
            return acc;
        }, []);
    }
};