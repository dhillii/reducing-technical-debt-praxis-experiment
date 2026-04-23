const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {
    replaceFilters,
    expandFilters,
    splitFilter,
    getUsedKeys,
    chainTransformers,
    mapKeys,
    rejectStatements
} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * Replaces the provided filter with a custom filter for mongo queries.
 * @param {Object} filter - Custom filter to apply.
 * @returns {Function} Transformer function.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

/**
 * Builds the base options object for event queries.
 * @param {Object} options - Original options.
 * @param {Object} filter - Custom filter.
 * @param {Array<string>} withRelated - Relations to include.
 * @param {string} filterStr - NQL filter string.
 * @param {Array<Function>} mongoTransformers - Mongo transformer functions.
 * @returns {Object} Options object for findPage.
 */
function buildEventOptions(options, filter, withRelated, filterStr, mongoTransformers) {
    const opts = {...options};
    opts.withRelated = withRelated;
    opts.filter = filterStr;
    opts.useBasicCount = true;
    opts.mongoTransformer = chainTransformers(...mongoTransformers);
    return opts;
}

/**
 * Extracts tier name from a subscription event model.
 * @param {Model} model - Subscription event model.
 * @returns {string|null} Tier name or null.
 */
function extractTierName(model) {
    const stripeSubscription = model.related('stripeSubscription');
    if (!stripeSubscription) return null;
    const stripePrice = stripeSubscription.related('stripePrice');
    if (!stripePrice) return null;
    const stripeProduct = stripePrice.related('stripeProduct');
    if (!stripeProduct) return null;
    const product = stripeProduct.related('product');
    if (!product) return null;
    return product.get('name');
}

/**
 * Builds the page actions array for the event timeline.
 * @param {Object} repo - Repository instance.
 * @param {Object} otherFilter - Filter excluding type.
 * @returns {Array<Object>} Array of page actions.
 */
function buildPageActions(repo, otherFilter) {
    const actions = [
        {type: 'comment_event', action: 'getCommentEvents'},
        {type: 'click_event', action: 'getClickEvents'},
        {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
        {type: 'signup_event', action: 'getSignupEvents'},
        {type: 'subscription_event', action: 'getSubscriptionEvents'},
        {type: 'donation_event', action: 'getDonationEvents'}
    ];

    if (!getUsedKeys(otherFilter).includes('data.post_id')) {
        actions.push(
            {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
            {type: 'login_event', action: 'getLoginEvents'},
            {type: 'payment_event', action: 'getPaymentEvents'},
            {type: 'email_change_event', action: 'getEmailChangeEvent'}
        );

        if (repo._AutomatedEmailRecipient) {
            actions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
        }
    }

    if (repo._EmailRecipient) {
        actions.push(
            {type: 'email_sent_event', action: 'getEmailSentEvents'},
            {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
            {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
            {type: 'email_failed_event', action: 'getEmailFailedEvents'}
        );
    }

    actions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

    if (repo._labsService.isSet('audienceFeedback')) {
        actions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
    }

    return actions;
}

/**
 * Filters page actions based on type filter.
 * @param {Array<Object>} actions - Page actions.
 * @param {Object} typeFilter - Type filter.
 * @returns {Array<Object>} Filtered actions.
 */
function filterPages(actions, typeFilter) {
    if (!typeFilter) return actions;
    const query = new mingo.Query(typeFilter);
    return actions.filter(page => query.test(page));
}

/**
 * Sorts events by created_at descending, then id descending.
 * @param {Array<Object>} events - Events array.
 * @param {number} limit - Limit to apply.
 * @returns {Array<Object>} Sorted and sliced events.
 */
function sortEvents(events, limit) {
    return events.sort((a, b) => {
        const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
        if (diff !== 0) return diff;
        return b.data.id.localeCompare(a.data.id);
    }).slice(0, limit);
}

/**
 * Builds meta object for event timeline.
 * @param {number} totalEvents - Total number of events.
 * @param {number} limit - Limit per page.
 * @returns {Object} Meta object.
 */
function buildTimelineMeta(totalEvents, limit) {
    return {
        pagination: {
            limit,
            total: totalEvents,
            pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,
            page: null,
            next: null,
            prev: null
        }
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

    async getEventTimeline(options, filter) {
        const opts = {...options};
        if (!opts.limit) opts.limit = 10;
        opts.order = 'created_at desc, id desc';

        const [typeFilter, otherFilter] = this.getNQLSubset(opts.filter);

        const pageActions = buildPageActions(this, otherFilter);
        const filteredPages = filterPages(pageActions, typeFilter);

        const pages = filteredPages.map(page => this[page.action](opts, otherFilter));
        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((acc, page) => acc + page.meta.pagination.total, 0);

        return {
            events: sortEvents(allEvents, opts.limit),
            meta: {
                pagination: buildTimelineMeta(totalEvents, opts.limit)
            }
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'newsletter'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.source': 'source',
                    'data.member_id': 'member_id'
                })
            ]
        );

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'newsletter_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getSubscriptionEvents(options, filter) {
        const opts = buildEventOptions(
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
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                f => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            ]
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);

        const data = models.map(model => {
            const tierName = extractTierName(model);
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(opts),
                attribution:
                    model.get('type') === 'created' &&
                    model.related('subscriptionCreatedEvent') &&
                    model.related('subscriptionCreatedEvent').id
                        ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                        : null,
                signup:
                    model.get('type') === 'created' &&
                    model.related('subscriptionCreatedEvent') &&
                    model.related('subscriptionCreatedEvent').id &&
                    model.related('subscriptionCreatedEvent').related('memberCreatedEvent') &&
                    model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id
                        ? true
                        : false,
                tierName
            };
            delete d.stripeSubscription;
            return {type: 'subscription_event', data: d};
        });

        return {data, meta};
    }

    async getPaymentEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ]
        );

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'payment_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getLoginEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ]
        );

        const {data: models, meta} = await this._MemberLoginEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'login_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getSignupEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            'subscriptionCreatedEvent.id:null+custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.source': 'source'
                }),
                f => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            ]
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(opts);

        const data = models.map(model => {
            const json = model.toJSON(opts);
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

    async getDonationEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            'member_id:-null+custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                f => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            ]
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(opts);

        const data = models.map(model => {
            const json = model.toJSON(opts);
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

    async getCommentEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'post', 'parent'],
            'member_id:-null+custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ]
        );

        const {data: models, meta} = await this._Comment.findPage(opts);

        const data = models.map(model => ({
            type: 'comment_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getClickEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'link', 'link.post'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ]
        );

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'click_event',
            data: model.toJSON(opts)
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
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        filter = this.removePostIdFilter(otherFilter);

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
                    r.post_id = '${postId.toHexString()}'
            `
            : `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id
            `;

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

        const opts = buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ]
        );

        opts.useCTE = true;
        opts.selectRaw = `id, member_id, created_at, (${mainQuery}) as count__clicks`;
        opts.whereRaw = `rn = 1 ORDER BY created_at DESC, id DESC`;
        opts.cte = [
            {name: 'PostClicks', query: postClicksQuery},
            {name: 'FirstClicks', query: firstClicksQuery}
        ];
        opts.from = 'FirstClicks';
        opts.order = '';

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'aggregated_click_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getFeedbackEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'post'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ]
        );

        const {data: models, meta} = await this._MemberFeedback.findPage(opts);

        const data = models.map(model => ({
            type: 'feedback_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getEmailSentEvents(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            filterStr,
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'processed_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            ]
        );
        opts.order = opts.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

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
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'delivered_at:-null+custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'delivered_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            ]
        );
        opts.order = opts.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

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
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'opened_at:-null+custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'opened_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            ]
        );
        opts.order = opts.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

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
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            ]
        );

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'email_complaint_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getEmailFailedEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'failed_at:-null+custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'failed_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            ]
        );
        opts.order = opts.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

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
        const opts = buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ]
        );

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'email_change_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter) {
        const opts = buildEventOptions(
            options,
            filter,
            ['member', 'automatedEmail'],
            'custom:true',
            [
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ]
        );

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(opts);

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
        const results = await this._MemberPaidSubscriptionEvent.findAll({
            aggregateMRRDeltas: true
        });

        const resultsJSON = results.toJSON();

        const cumulativeResults = resultsJSON.reduce((accumulator, result) => {
            if (!accumulator[result.currency]) {
                return {
                    ...accumulator,
                    [result.currency]: [{
                        date: result.date,
                        mrr: result.mrr_delta,
                        currency: result.currency
                    }]
                };
            }
            return {
                ...accumulator,
                [result.currency]: accumulator[result.currency].concat([{
                    date: result.date,
                    mrr: result.mrr_delta + accumulator[result.currency].slice(-1)[0].mrr,
                    currency: result.currency
                }])
            };
        }, {});

        return cumulativeResults;
    }

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({
            aggregateStatusCounts: true
        });

        const resultsJSON = results.toJSON();

        const cumulativeResults = resultsJSON.reduce((accumulator, result, index) => {
            if (index === 0) {
                return [{
                    date: result.date,
                    paid: result.paid_delta,
                    comped: result.comped_delta,
                    free: result.free_delta
                }];
            }
            return accumulator.concat([{
                date: result.date,
                paid: result.paid_delta + accumulator[index - 1].paid,
                comped: result.comped_delta + accumulator[index - 1].comped,
                free: result.free_delta + accumulator[index - 1].free
            }]);
        }, []);

        return cumulativeResults;
    }
};