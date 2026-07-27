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
     * Builds the list of available page actions for event timeline
     */
    _buildPageActions() {
        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];
        return pageActions;
    }

    /**
     * Adds conditional page actions based on filter and available models
     */
    _addConditionalPageActions(pageActions, otherFilter) {
        if (!getUsedKeys(otherFilter).includes('data.post_id')) {
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
            pageActions.push({type: 'email_sent_event', action: 'getEmailSentEvents'});
            pageActions.push({type: 'email_delivered_event', action: 'getEmailDeliveredEvents'});
            pageActions.push({type: 'email_opened_event', action: 'getEmailOpenedEvents'});
            pageActions.push({type: 'email_failed_event', action: 'getEmailFailedEvents'});
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }
    }

    /**
     * Filters page actions based on type filter
     */
    _filterPageActionsByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Fetches all event pages in parallel
     */
    async _fetchAllEventPages(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return Promise.all(pages);
    }

    /**
     * Sorts and slices events according to options
     */
    _sortAndSliceEvents(allEvents, limit) {
        return allEvents.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        ).slice(0, limit);
    }

    /**
     * Builds pagination metadata
     */
    _buildPaginationMeta(totalEvents, limit) {
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

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions();
        this._addConditionalPageActions(pageActions, otherFilter);
        const filteredPages = this._filterPageActionsByType(pageActions, typeFilter);

        const allEventPages = await this._fetchAllEventPages(filteredPages, options, otherFilter);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        const sortedEvents = this._sortAndSliceEvents(allEvents, options.limit);

        return {
            events: sortedEvents,
            meta: this._buildPaginationMeta(totalEvents, options.limit)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    /**
     * Builds base options for event queries with mongo transformer
     */
    _buildBaseEventOptions(options, filter, withRelated, baseFilter, keyMappings) {
        return {
            ...options,
            withRelated,
            filter: baseFilter,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMappings)
            )
        };
    }

    /**
     * Maps model to event data structure
     */
    _mapModelToEvent(model, eventType, options) {
        return {
            type: eventType,
            data: model.toJSON(options)
        };
    }

    /**
     * Executes find page and maps results to events
     */
    async _findAndMapEvents(model, options, eventType) {
        const {data: models, meta} = await model.findPage(options);
        const data = models.map((m) => this._mapModelToEvent(m, eventType, options));
        return {data, meta};
    }

    async getNewsletterSubscriptionEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'newsletter'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        return this._findAndMapEvents(this._MemberSubscribeEvent, opts, 'newsletter_event');
    }

    /**
     * Extracts tier name from subscription model relations
     */
    _extractTierName(model) {
        return model.related('stripeSubscription') && 
               model.related('stripeSubscription').related('stripePrice') && 
               model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && 
               model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') 
            ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') 
            : null;
    }

    /**
     * Determines if subscription is a signup event
     */
    _isSignupEvent(model) {
        return model.get('type') === 'created' && 
               model.related('subscriptionCreatedEvent') && 
               model.related('subscriptionCreatedEvent').id;
    }

    /**
     * Determines if subscription includes member creation
     */
    _hasCreatedMember(model) {
        return this._isSignupEvent(model) && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id;
    }

    /**
     * Builds subscription event data with attribution
     */
    _buildSubscriptionEventData(model, options, tierName) {
        delete model.relations.stripeSubscription;
        const d = {
            ...model.toJSON(options),
            attribution: this._isSignupEvent(model) ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
            signup: this._hasCreatedMember(model),
            tierName
        };
        delete d.stripeSubscription;
        return d;
    }

    async getSubscriptionEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
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
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        opts.mongoTransformer = chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }),
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }]);
            }
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);

        const data = models.map((model) => {
            const tierName = this._extractTierName(model);
            const eventData = this._buildSubscriptionEventData(model, options, tierName);
            return {
                type: 'subscription_event',
                data: eventData
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        return this._findAndMapEvents(this._MemberPaymentEvent, opts, 'payment_event');
    }

    async getLoginEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        return this._findAndMapEvents(this._MemberLoginEvent, opts, 'login_event');
    }

    /**
     * Removes mobiledoc, lexical, and plaintext from post attribution
     */
    _cleanPostAttribution(json) {
        delete json.postAttribution?.mobiledoc;
        delete json.postAttribution?.lexical;
        delete json.postAttribution?.plaintext;
        return json;
    }

    async getSignupEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'subscriptionCreatedEvent.id:null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            }
        );

        opts.mongoTransformer = chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            }),
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(opts);

        const data = models.map((model) => {
            const json = this._cleanPostAttribution(model.toJSON(options));
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

    async getDonationEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'member_id:-null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        opts.mongoTransformer = chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }),
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(opts);

        const data = models.map((model) => {
            const json = this._cleanPostAttribution(model.toJSON(options));
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

    async getCommentEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'post', 'parent'],
            'member_id:-null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        return this._findAndMapEvents(this._Comment, opts, 'comment_event');
    }

    async getClickEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'link', 'link.post'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        return this._findAndMapEvents(this._MemberLinkClickEvent, opts, 'click_event');
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

    /**
     * Builds CTE query for post clicks
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
                    r.post_id = '${postId.toHexString()}'
            `;
        }
        return `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id
        `;
    }

    /**
     * Builds first clicks CTE query
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
                PostClicks
        `;
    }

    /**
     * Builds main count query for aggregated clicks
     */
    _buildMainCountQuery() {
        return `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
    }

    /**
     * Builds aggregated click event options
     */
    _buildAggregatedClickOptions(options, filter, postId, mainQuery) {
        return {
            ...options,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
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
                {
                    name: `PostClicks`,
                    query: this._buildPostClicksQuery(postId)
                },
                {
                    name: `FirstClicks`,
                    query: this._buildFirstClicksQuery()
                }
            ],
            from: 'FirstClicks',
            order: ''
        };
    }

    async getAggregatedClickEvents(filter, options = {}) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line
        const cleanFilter = this.removePostIdFilter(otherFilter);

        const mainQuery = this._buildMainCountQuery();
        const opts = this._buildAggregatedClickOptions(options, cleanFilter, postId, mainQuery);

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);

        const data = models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(options)
            };
        });

        return {data, meta};
    }

    async getFeedbackEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'post'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        return this._findAndMapEvents(this._MemberFeedback, opts, 'feedback_event');
    }

    /**
     * Builds email event data from model
     */
    _buildEmailEventData(model, eventType, dateField) {
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get(dateField),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        };
    }

    async getEmailSentEvents(filter, options = {}) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'email'],
            filterStr,
            {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        opts.order = opts.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

        const data = models.map((model) => {
            return {
                type: 'email_sent_event',
                data: this._buildEmailEventData(model, 'email_sent_event', 'processed_at')
            };
        });

        return {data, meta};
    }

    async getEmailDeliveredEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'email'],
            'delivered_at:-null+custom:true',
            {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        opts.order = opts.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

        const data = models.map((model) => {
            return {
                type: 'email_delivered_event',
                data: this._buildEmailEventData(model, 'email_delivered_event', 'delivered_at')
            };
        });

        return {data, meta};
    }

    async getEmailOpenedEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'email'],
            'opened_at:-null+custom:true',
            {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        opts.order = opts.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

        const data = models.map((model) => {
            return {
                type: 'email_opened_event',
                data: this._buildEmailEventData(model, 'email_opened_event', 'opened_at')
            };
        });

        return {data, meta};
    }

    async getEmailSpamComplaintEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'email'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );

        return this._findAndMapEvents(this._EmailSpamComplaintEvent, opts, 'email_complaint_event');
    }

    async getEmailFailedEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'email'],
            'failed_at:-null+custom:true',
            {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        opts.order = opts.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(opts);

        const data = models.map((model) => {
            return {
                type: 'email_failed_event',
                data: this._buildEmailEventData(model, 'email_failed_event', 'failed_at')
            };
        });

        return {data, meta};
    }

    async getEmailChangeEvent(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        return this._findAndMapEvents(this._MemberEmailChangeEvent, opts, 'email_change_event');
    }

    /**
     * Builds automated email event data from model
     */
    _buildAutomatedEmailEventData(model) {
        const automatedEmail = model.related('automatedEmail').toJSON();
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get('created_at'),
            member: model.related('member').toJSON(),
            automatedEmail: {
                id: automatedEmail.id,
                slug: automatedEmail.slug
            }
        };
    }

    async getAutomatedEmailSentEvents(filter, options = {}) {
        const opts = this._buildBaseEventOptions(
            options,
            filter,
            ['member', 'automatedEmail'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(opts);

        const data = models.map((model) => {
            return {
                type: 'automated_email_sent_event',
                data: this._buildAutomatedEmailEventData(model)
            };
        });

        return {data, meta};
    }

    /**
     * Split the filter in two parts:
     * - One with 'type' that will be applied to all the pages
     * - Other filter that will be applied to each individual page
     *
     * Throws if splitting is not possible (e.g. OR'ing type with other filters)
     */
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