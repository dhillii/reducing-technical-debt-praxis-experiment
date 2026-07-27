const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * Mongo transformer that replaces the filter with a custom one.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

/**
 * EventRepository provides methods to retrieve various event types.
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
     * Retrieve a unified timeline of events.
     */
    async getEventTimeline(options, filter) {
        options = options || {};
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions(options);
        const filteredPages = this._applyTypeFilter(pageActions, typeFilter);
        const pages = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pages);
        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return this._formatTimelineResult(allEvents, totalEvents, options.limit);
    }

    /**
     * Construct the list of page actions based on available services.
     */
    _buildPageActions(options) {
        const actions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        const otherFilter = options.filter;
        if (!getUsedKeys(otherFilter).includes('data.post_id')) {
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

    /**
     * Apply a type filter to the list of page actions.
     */
    _applyTypeFilter(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }
        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Format the final timeline response with sorting and pagination.
     */
    _formatTimelineResult(events, total, limit) {
        const sorted = events.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
        }).slice(0, limit);

        return {
            events: sorted,
            meta: {
                pagination: {
                    limit,
                    total,
                    pages: limit > 0 ? Math.ceil(total / limit) : null,
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

    async getNewsletterSubscriptionEvents(options, filter) {
        options = this._prepareOptions(options, ['member', 'newsletter'], filter, {
            'data.created_at': 'created_at',
            'data.source': 'source',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        const data = models.map(model => ({
            type: 'newsletter_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getSubscriptionEvents(options, filter) {
        options = this._prepareOptions(options, [
            'member',
            'subscriptionCreatedEvent.postAttribution',
            'subscriptionCreatedEvent.userAttribution',
            'subscriptionCreatedEvent.tagAttribution',
            'subscriptionCreatedEvent.memberCreatedEvent',
            'stripeSubscription.stripePrice.stripeProduct.product'
        ], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'subscriptionCreatedEvent.attribution_id',
            expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
        }]));
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);
        const data = models.map(model => this._mapSubscriptionModel(model, options));
        return {data, meta};
    }

    /**
     * Map a subscription model to the API format.
     */
    _mapSubscriptionModel(model, options) {
        const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
        delete model.relations.stripeSubscription;
        const base = model.toJSON(options);
        const attribution = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
            ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
            : null;
        const signup = model.get('type') === 'created' &&
            model.related('subscriptionCreatedEvent')?.id &&
            model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id;
        const result = {...base, attribution, signup: !!signup, tierName};
        delete result.stripeSubscription;
        return {type: 'subscription_event', data: result};
    }

    async getPaymentEvents(options, filter) {
        options = this._prepareOptions(options, ['member'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        const data = models.map(model => ({
            type: 'payment_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getLoginEvents(options, filter) {
        options = this._prepareOptions(options, ['member'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        const data = models.map(model => ({
            type: 'login_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getSignupEvents(options, filter) {
        options = this._prepareOptions(options, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.source': 'source'
        }, (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'attribution_id',
            expansion: {attribution_type: 'post'}
        }]), 'subscriptionCreatedEvent.id:null+custom:true');
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);
        const data = models.map(model => {
            const json = model.toJSON(options);
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
        options = this._prepareOptions(options, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, (f) => expandFilters(f, [{
            key: 'data.post_id',
            replacement: 'attribution_id',
            expansion: {attribution_type: 'post'}
        }]), 'member_id:-null+custom:true');
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);
        const data = models.map(model => {
            const json = model.toJSON(options);
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
        options = this._prepareOptions(options, ['member', 'post', 'parent'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        }, null, 'member_id:-null+custom:true');
        const {data: models, meta} = await this._Comment.findPage(options);
        const data = models.map(model => ({
            type: 'comment_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getClickEvents(options, filter) {
        options = this._prepareOptions(options, ['member', 'link', 'link.post'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        }, null, 'custom:true');
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);
        const data = models.map(model => ({
            type: 'click_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    getPostIdFromFilter(filter) {
        let postIdString = '';
        if (filter && filter.$and) {
            postIdString = filter.$and.find(c => c['data.post_id'])?.['data.post_id'];
        } else {
            postIdString = filter ? filter['data.post_id'] : '';
        }
        return ObjectID.isValid(postIdString) ? ObjectID.createFromHexString(postIdString) : null;
    }

    /**
     * Aggregate click events per member for the same post.
     */
    async getAggregatedClickEvents(options, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const cleanedFilter = this.removePostIdFilter(otherFilter);
        const postClicksQuery = postId
            ? `SELECT mce.id, mce.member_id, mce.redirect_id, mce.created_at FROM members_click_events mce INNER JOIN redirects r ON mce.redirect_id = r.id WHERE r.post_id = '${postId.toHexString()}'`
            : `SELECT mce.id, mce.member_id, mce.redirect_id, mce.created_at FROM members_click_events mce INNER JOIN redirects r ON mce.redirect_id = r.id`;

        const firstClicksQuery = `
            SELECT id, member_id, redirect_id, created_at,
                   ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM PostClicks
        `;

        const mainQuery = `SELECT COUNT(DISTINCT redirect_id) FROM PostClicks AS inner_mce WHERE inner_mce.member_id = FirstClicks.member_id AND inner_mce.redirect_id IN (SELECT redirect_id FROM PostClicks)`;

        options = {
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
                {name: 'PostClicks', query: postClicksQuery},
                {name: 'FirstClicks', query: firstClicksQuery}
            ],
            from: 'FirstClicks',
            order: ''
        };

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);
        const data = models.map(model => ({
            type: 'aggregated_click_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getFeedbackEvents(options, filter) {
        options = this._prepareOptions(options, ['member', 'post'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });
        const {data: models, meta} = await this._MemberFeedback.findPage(options);
        const data = models.map(model => ({
            type: 'feedback_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getEmailSentEvents(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = this._prepareOptions(options, ['member', 'email'], filter, {
            'data.created_at': 'processed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        }, null, filterStr);
        options.order = options.order.replace(/created_at/g, 'processed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
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
        options = this._prepareOptions(options, ['member', 'email'], filter, {
            'data.created_at': 'delivered_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        }, null, 'delivered_at:-null+custom:true');
        options.order = options.order.replace(/created_at/g, 'delivered_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
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
        options = this._prepareOptions(options, ['member', 'email'], filter, {
            'data.created_at': 'opened_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        }, null, 'opened_at:-null+custom:true');
        options.order = options.order.replace(/created_at/g, 'opened_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
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
        options = this._prepareOptions(options, ['member', 'email'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);
        const data = models.map(model => ({
            type: 'email_complaint_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getEmailFailedEvents(options, filter) {
        options = this._prepareOptions(options, ['member', 'email'], filter, {
            'data.created_at': 'failed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        }, null, 'failed_at:-null+custom:true');
        options.order = options.order.replace(/created_at/g, 'failed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
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
        options = this._prepareOptions(options, ['member'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);
        const data = models.map(model => ({
            type: 'email_change_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter) {
        options = this._prepareOptions(options, ['member', 'automatedEmail'], filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(options);
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

    /**
     * Helper to build query options with common defaults.
     */
    _prepareOptions(options, withRelated, filter, keyMap, extraTransformer, defaultFilter) {
        options = options || {};
        const baseFilter = defaultFilter || 'custom:true';
        const mongoTransformer = chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMap),
            ...(extraTransformer ? [extraTransformer] : [])
        );
        return {
            ...options,
            withRelated,
            filter: baseFilter,
            useBasicCount: true,
            mongoTransformer
        };
    }

    /**
     * Split the filter into type and other parts.
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
                acc.push({date: result.date, paid: result.paid_delta, comped: result.comped_delta, free: result.free_delta});
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