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

    /**
     * Build options for event queries.
     * @private
     */
    _buildEventOptions(options, filter, withRelated, filterStr, transformerFns) {
        const baseOptions = {
            ...options,
            withRelated,
            filter: filterStr,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...transformerFns
            )
        };
        return baseOptions;
    }

    /**
     * Map keys for mongo transformer.
     * @private
     */
    _mapKeys(keys) {
        return mapKeys(keys);
    }

    /**
     * Create page actions for event timeline.
     * @private
     */
    _createPageActions() {
        const actions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        if (!this._EmailRecipient) {
            actions.push(
                {type: 'email_sent_event', action: 'getEmailSentEvents'},
                {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
                {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
                {type: 'email_failed_event', action: 'getEmailFailedEvents'}
            );
        }

        actions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            actions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }

        return actions;
    }

    /**
     * Filter page actions by type filter.
     * @private
     */
    _filterPages(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }
        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Execute page queries.
     * @private
     */
    async _fetchPages(pageActions, options, otherFilter) {
        const promises = pageActions.map(page => this[page.action](options, otherFilter));
        const results = await Promise.all(promises);
        return results;
    }

    /**
     * Sort and paginate events.
     * @private
     */
    _sortAndPaginate(events, limit) {
        return events.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) {
                return diff;
            }
            return b.data.id.localeCompare(a.data.id);
        }).slice(0, limit);
    }

    /**
     * Build pagination meta.
     * @private
     */
    _buildPaginationMeta(total, limit) {
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

    /**
     * Build post clicks query for aggregated click events.
     * @private
     */
    _buildPostClicksQuery(postId) {
        if (postId) {
            return `SELECT
                mce.id,
                mce.member_id,
                mce.redirect_id,
                mce.created_at
            FROM
                members_click_events mce
            INNER JOIN
                redirects r ON mce.redirect_id = r.id
            WHERE
                r.post_id = '${postId.toHexString()}'`;
        }
        return `SELECT
            mce.id,
            mce.member_id,
            mce.redirect_id,
            mce.created_at
        FROM
            members_click_events mce
        INNER JOIN
            redirects r ON mce.redirect_id = r.id`;
    }

    /**
     * Build first clicks query.
     * @private
     */
    _buildFirstClicksQuery() {
        return `
            SELECT
                id,
                member_id,
                redirect_id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM
                PostClicks`;
    }

    /**
     * Build main query for aggregated click events.
     * @private
     */
    _buildMainQuery() {
        return `SELECT COUNT(DISTINCT redirect_id)
                FROM PostClicks AS inner_mce
                WHERE inner_mce.member_id = FirstClicks.member_id
                AND inner_mce.redirect_id IN (
                    SELECT redirect_id
                    FROM PostClicks
                )`;
    }

    /**
     * Build options for aggregated click events.
     * @private
     */
    _buildAggregatedClickOptions(options, filter, postId) {
        const postClicksQuery = this._buildPostClicksQuery(postId);
        const firstClicksQuery = this._buildFirstClicksQuery();
        const mainQuery = this._buildMainQuery();

        return {
            ...options,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...this._mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ),
            useCTE: true,
            selectRaw: `id, member_id, created_at, (${mainQuery}) as count__clicks`,
            whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
            cte: [
                {name: 'PostClicks', query: postClicksQuery},
                {name: 'FirstClicks', query: firstClicksQuery}
            ],
            from: 'FirstClicks',
            order: ''
        };
    }

    async getEventTimeline(options = {}, filter) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this._createPageActions();

        const filteredPages = this._filterPages(pageActions, typeFilter);

        const pages = await this._fetchPages(filteredPages, options, otherFilter);

        const allEvents = pages.flatMap(page => page.data);
        const totalEvents = pages.reduce((acc, page) => acc + page.meta.pagination.total, 0);

        return {
            events: this._sortAndPaginate(allEvents, options.limit),
            meta: this._buildPaginationMeta(totalEvents, options.limit)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'newsletter'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getSubscriptionEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
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
                ...this._mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            ]
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);

        const data = models.map(model => {
            const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') ?? null;
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(opts),
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                    && model.related('subscriptionCreatedEvent')?.related('memberCreatedEvent')?.id,
                tierName
            };
            delete d.stripeSubscription;
            return {type: 'subscription_event', data: d};
        });

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getLoginEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getSignupEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'subscriptionCreatedEvent.id:null+custom:true',
            [
                ...this._mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.source': 'source'
                }),
                (f) => expandFilters(f, [{
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

    async getDonationEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'member_id:-null+custom:true',
            [
                ...this._mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => expandFilters(f, [{
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

    async getCommentEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'post', 'parent'],
            'member_id:-null+custom:true',
            [
                ...this._mapKeys({
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

    async getClickEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'link', 'link.post'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        filter = this.removePostIdFilter(otherFilter);

        const opts = this._buildAggregatedClickOptions(options, filter, postId);

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);

        const data = models.map(model => ({
            type: 'aggregated_click_event',
            data: model.toJSON(opts)
        }));

        return {data, meta};
    }

    async getFeedbackEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'post'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            filterStr,
            [
                ...this._mapKeys({
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

    async getEmailDeliveredEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'delivered_at:-null+custom:true',
            [
                ...this._mapKeys({
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

    async getEmailOpenedEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'opened_at:-null+custom:true',
            [
                ...this._mapKeys({
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

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getEmailFailedEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            'failed_at:-null+custom:true',
            [
                ...this._mapKeys({
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

    async getEmailChangeEvent(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            [
                ...this._mapKeys({
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

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const opts = this._buildEventOptions(
            options,
            filter,
            ['member', 'automatedEmail'],
            'custom:true',
            [
                ...this._mapKeys({
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
            throw new errors.BadRequestError({
                message: e.message
            });
        }

        const keys = getUsedKeys(parsed);

        for (const key of keys) {
            if (!allowList.includes(key)) {
                throw new errors.IncorrectUsageError({
                    message: 'Cannot filter by ' + key
                });
            }
        }

        try {
            return splitFilter(parsed, ['type']);
        } catch (e) {
            throw new errors.IncorrectUsageError({
                message: e.message
            });
        }
    }

    removePostIdFilter(filter) {
        if (!filter) {
            return filter;
        }

        try {
            return rejectStatements(filter, key => key === 'data.post_id');
        } catch (e) {
            throw new errors.IncorrectUsageError({
                message: e.message
            });
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