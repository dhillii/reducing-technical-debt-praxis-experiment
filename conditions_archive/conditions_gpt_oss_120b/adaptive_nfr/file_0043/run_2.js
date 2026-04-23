```javascript
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
 * EventRepository provides methods to query various member related events.
 */
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
     * Orchestrates fetching and merging event pages.
     */
    async getEventTimeline(options) {
        if (!options) {
            options = {};
        }
        if (!options.limit) {
            options.limit = 10;
        }
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';
        const pageActions = this._buildPageActions();
        const filteredPages = this._applyTypeFilter(pageActions, typeFilter);
        const allEventPages = await this._fetchEventPages(filteredPages, options, otherFilter);
        const {events, total} = this._mergeAndSortEvents(allEventPages, options.limit);
        return {
            events,
            meta: {
                pagination: {
                    limit: options.limit,
                    total,
                    pages: options.limit > 0 ? Math.ceil(total / options.limit) : null,
                    page: null,
                    next: null,
                    prev: null
                }
            }
        };
    }

    /** @private */
    _buildPageActions() {
        const actions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];
        if (!getUsedKeys(this._otherFilter || {}).includes('data.post_id')) {
            actions.push(
                {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
                {type: 'login_event', action: 'getLoginEvents'},
                {type: 'payment_event', action: 'getPaymentEvents'},
                {type: 'email_change_event', action: 'getEmailChangeEvent'}
            );
            if (this._AutomatedEmailRecipient) {
                actions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
            }
        }
        if (this._EmailRecipient) {
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

    /** @private */
    _applyTypeFilter(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }
        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /** @private */
    async _fetchEventPages(pages, options, otherFilter) {
        const promises = pages.map(page => this[page.action](options, otherFilter));
        return Promise.all(promises);
    }

    /** @private */
    _mergeAndSortEvents(pages, limit) {
        const allEvents = pages.flatMap(page => page.data);
        const total = pages.reduce((acc, page) => acc + page.meta.pagination.total, 0);
        const sorted = allEvents.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) {
                return diff;
            }
            return b.data.id.localeCompare(a.data.id);
        }).slice(0, limit);
        return {events: sorted, total};
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildNewsletterOptions(options, filter);
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(opts);
        return this._mapModelsToEvent(models, 'newsletter_event', opts);
    }

    /** @private */
    _buildNewsletterOptions(options, filter) {
        return {
            ...options,
            withRelated: ['member', 'newsletter'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.source': 'source',
                    'data.member_id': 'member_id'
                })
            )
        };
    }

    async getSubscriptionEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSubscriptionOptions(options, filter);
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);
        return this._mapSubscriptionModels(models, meta, opts);
    }

    /** @private */
    _buildSubscriptionOptions(options, filter) {
        return {
            ...options,
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            )
        };
    }

    /** @private */
    _mapSubscriptionModels(models, meta, options) {
        const data = models.map((model) => {
            const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(options),
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                    ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                    : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.related('memberCreatedEvent')?.id ? true : false,
                tierName
            };
            delete d.stripeSubscription;
            return {type: 'subscription_event', data: d};
        });
        return {data, meta};
    }

    async getPaymentEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'payment_event');
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(opts);
        return this._mapModelsToEvent(models, 'payment_event', opts);
    }

    async getLoginEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'login_event');
        const {data: models, meta} = await this._MemberLoginEvent.findPage(opts);
        return this._mapModelsToEvent(models, 'login_event', opts);
    }

    async getSignupEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSignupOptions(options, filter);
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(opts);
        const data = models.map((model) => {
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

    /** @private */
    _buildSignupOptions(options, filter) {
        return {
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.source': 'source'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };
    }

    async getDonationEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildDonationOptions(options, filter);
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(opts);
        const data = models.map((model) => {
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

    /** @private */
    _buildDonationOptions(options, filter) {
        return {
            ...options,
            withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };
    }

    async getCommentEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'comment_event');
        const {data: models, meta} = await this._Comment.findPage(opts);
        return this._mapModelsToEvent(models, 'comment_event', opts);
    }

    async getClickEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'click_event');
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);
        return this._mapModelsToEvent(models, 'click_event', opts);
    }

    /** @private */
    _buildSimpleEventOptions(options, filter, type) {
        const map = {
            comment_event: {'data.post_id': 'post_id'},
            click_event: {'data.post_id': 'post_id'},
            payment_event: {'data.member_id': 'member_id'},
            login_event: {'data.member_id': 'member_id'},
            email_sent_event: {'data.member_id': 'member_id', 'data.post_id': 'email.post_id'},
            email_delivered_event: {'data.member_id': 'member_id', 'data.post_id': 'email.post_id'},
            email_opened_event: {'data.member_id': 'member_id', 'data.post_id': 'email.post_id'},
            email_failed_event: {'data.member_id': 'member_id', 'data.post_id': 'email.post_id'},
            email_change_event: {'data.member_id': 'member_id'},
            email_spam_complaint_event: {'data.member_id': 'member_id', 'data.post_id': 'email.post_id'},
            feedback_event: {'data.member_id': 'member_id', 'data.post_id': 'post_id'}
        };
        const keyMap = map[type] || {};
        return {
            ...options,
            withRelated: type === 'comment_event' ? ['member', 'post', 'parent'] : ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(Object.assign({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }, keyMap))
            )
        };
    }

    /** @private */
    _mapModelsToEvent(models, eventType, options) {
        const data = models.map((model) => ({
            type: eventType,
            data: model.toJSON(options)
        }));
        return {data, meta: {pagination: {total: models.length}}};
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
        if (!options) {
            options = {};
        }
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const cleanedFilter = this.removePostIdFilter(otherFilter);
        const query = this._buildAggregatedClickQuery(postId);
        const opts = this._buildAggregatedClickOptions(options, cleanedFilter, query);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);
        const data = models.map((model) => ({
            type: 'aggregated_click_event',
            data: model.toJSON(opts)
        }));
        return {data, meta};
    }

    /** @private */
    _buildAggregatedClickQuery(postId) {
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

    /** @private */
    _buildAggregatedClickOptions(options, filter, postClicksQuery) {
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
                {name: `PostClicks`, query: postClicksQuery},
                {name: `FirstClicks`, query: firstClicksQuery}
            ],
            from: 'FirstClicks',
            order: ''
        };
    }

    async getFeedbackEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'feedback_event');
        const {data: models, meta} = await this._MemberFeedback.findPage(opts);
        return this._mapModelsToEvent(models, 'feedback_event', opts);
    }

    async getEmailSentEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const opts = this._buildEmailEventOptions(options, filter, filterStr, 'processed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(opts);
        const data = models.map((model) => ({
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
        if (!options) {
            options = {};
        }
        const opts = this._buildEmailEventOptions(options, filter, 'delivered_at:-null+custom:true', 'delivered_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(opts);
        const data = models.map((model) => ({
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
        if (!options) {
            options = {};
        }
        const opts = this._buildEmailEventOptions(options, filter, 'opened_at:-null+custom:true', 'opened_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(opts);
        const data = models.map((model) => ({
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

    /** @private */
    _buildEmailEventOptions(options, filter, baseFilter, dateField) {
        const opts = {
            ...options,
            withRelated: ['member', 'email'],
            filter: baseFilter,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': dateField,
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        opts.order = opts.order.replace(/created_at/g, dateField);
        return opts;
    }

    async getEmailSpamComplaintEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'email_spam_complaint_event');
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(opts);
        return this._mapModelsToEvent(models, 'email_complaint_event', opts);
    }

    async getEmailFailedEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = this._buildEmailEventOptions(options, filter, 'failed_at:-null+custom:true', 'failed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(opts);
        const data = models.map((model) => ({
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
        if (!options) {
            options = {};
        }
        const opts = this._buildSimpleEventOptions(options, filter, 'email_change_event');
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(opts);
        return this._mapModelsToEvent(models, 'email_change_event', opts);
    }

    async getAutomatedEmailSentEvents(options, filter) {
        if (!options) {
            options = {};
        }
        const opts = {
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
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(opts);
        const data = models.map((model) => {
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
                acc.push({
                    date: result.date,
                    paid: result.paid_delta,
                    comped: result.comped_delta,
                    free: result.free_delta
                });
            } else {
                const prev = acc[idx - 1];
                acc.push({
                    date: result.date,
                    paid: result.paid_delta + prev.paid,
                    comped: result.comped_delta + prev.comped,
                    free: result.free_delta + prev.free
                });
            }
            return acc;
        }, []);
    }
};
```