```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * Mongo transformer that replaces any existing filter with a custom filter.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
    };
}

/**
 * Build common Mongo options for event queries.
 */
function buildEventOptions(baseOptions, filter, withRelated, keyMap, extraTransformers = []) {
    const mongoTransformer = chainTransformers(
        replaceCustomFilterTransformer(filter),
        ...mapKeys(keyMap),
        ...extraTransformers
    );

    return {
        ...baseOptions,
        withRelated,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer
    };
}

/**
 * Extract postId from a filter object.
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
 * Remove post_id statements from a filter.
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
 * Split NQL filter into type and other parts.
 */
function getNQLSubset(filter) {
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
 * Repository for various member and email events.
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
    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions(otherFilter);
        const filteredPages = this._applyTypeFilter(pageActions, typeFilter);
        const pages = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pages);
        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

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

    /**
     * Build the list of possible page actions based on filter capabilities.
     */
    _buildPageActions(otherFilter) {
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
     * Sort events by creation date and id, then limit the result set.
     */
    _sortAndSliceEvents(events, limit) {
        return events
            .sort((a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
            })
            .slice(0, limit);
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({...data, source: 'stripe'});
    }

    async getNewsletterSubscriptionEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'newsletter'],
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        const data = models.map(model => ({
            type: 'newsletter_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getSubscriptionEvents(options, filter = undefined) {
        const extra = [
            (f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }])
        ];

        options = buildEventOptions(
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
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            extra
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);
        const data = models.map(model => {
            const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
            delete model.relations.stripeSubscription;
            const json = model.toJSON(options);
            const attribution = json.type === 'created' && model.related('subscriptionCreatedEvent')
                ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                : null;
            const signup = json.type === 'created' && model.related('subscriptionCreatedEvent')?.related('memberCreatedEvent')
                ? true
                : false;
            delete json.stripeSubscription;
            return {
                type: 'subscription_event',
                data: {...json, attribution, signup, tierName}
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        const data = models.map(model => ({
            type: 'payment_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getLoginEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        const data = models.map(model => ({
            type: 'login_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getSignupEvents(options, filter = undefined) {
        const extra = [
            (f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])
        ];

        options = buildEventOptions(
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            extra
        );
        options.filter = 'subscriptionCreatedEvent.id:null+custom:true';

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

    async getDonationEvents(options, filter = undefined) {
        const extra = [
            (f) => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])
        ];

        options = buildEventOptions(
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            extra
        );
        options.filter = 'member_id:-null+custom:true';

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

    async getCommentEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'post', 'parent'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );
        options.filter = 'member_id:-null+custom:true';

        const {data: models, meta} = await this._Comment.findPage(options);
        const data = models.map(model => ({
            type: 'comment_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getClickEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'link', 'link.post'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );
        options.filter = 'custom:true';

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);
        const data = models.map(model => ({
            type: 'click_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getAggregatedClickEvents(options, filter = undefined) {
        const postId = getPostIdFromFilter(filter);
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

        const mainQuery = `
            SELECT COUNT(DISTINCT redirect_id)
            FROM PostClicks AS inner_mce
            WHERE inner_mce.member_id = FirstClicks.member_id
            AND inner_mce.redirect_id IN (SELECT redirect_id FROM PostClicks)
        `;

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

    async getFeedbackEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'post'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await this._MemberFeedback.findPage(options);
        const data = models.map(model => ({
            type: 'feedback_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getEmailSentEvents(options, filter = undefined) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        options.filter = filterStr;
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

    async getEmailDeliveredEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        options.filter = 'delivered_at:-null+custom:true';
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

    async getEmailOpenedEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        options.filter = 'opened_at:-null+custom:true';
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

    async getEmailSpamComplaintEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);
        const data = models.map(model => ({
            type: 'email_complaint_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getEmailFailedEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'email'],
            {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        options.filter = 'failed_at:-null+custom:true';
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

    async getEmailChangeEvent(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);
        const data = models.map(model => ({
            type: 'email_change_event',
            data: model.toJSON(options)
        }));

        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter = undefined) {
        options = buildEventOptions(
            options,
            filter,
            ['member', 'automatedEmail'],
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

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

    async getMRR() {
        const results = await this._MemberPaidSubscriptionEvent.findAll({aggregateMRRDeltas: true});
        const resultsJSON = results.toJSON();

        return resultsJSON.reduce((acc, result) => {
            const currencyData = acc[result.currency] || [];
            const lastMrr = currencyData.length ? currencyData[currencyData.length - 1].mrr : 0;
            currencyData.push({
                date: result.date,
                mrr: lastMrr + result.mrr_delta,
                currency: result.currency
            });
            return {...acc, [result.currency]: currencyData};
        }, {});
    }

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({aggregateStatusCounts: true});
        const resultsJSON = results.toJSON();

        return resultsJSON.reduce((acc, result, idx) => {
            if (idx === 0) {
                return [{
                    date: result.date,
                    paid: result.paid_delta,
                    comped: result.comped_delta,
                    free: result.free_delta
                }];
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
```