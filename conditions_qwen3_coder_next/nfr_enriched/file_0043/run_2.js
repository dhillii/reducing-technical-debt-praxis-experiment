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

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this.buildPageActions(otherFilter);

        const filteredPages = this.filterPagesByType(pageActions, typeFilter);

        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: this.sortAndLimitEvents(allEvents, options.limit),
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

    buildPageActions(otherFilter) {
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

        return pageActions;
    }

    filterPagesByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    sortAndLimitEvents(allEvents, limit) {
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

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'newsletter'],
            keyMap: {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'newsletter_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            expanders: [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }]
        });

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            const tierName = this.getTierName(model);
            delete model.relations.stripeSubscription;
            return {
                type: 'subscription_event',
                data: {
                    ...model.toJSON(transformedOptions),
                    attribution: this.getSubscriptionAttribution(model),
                    signup: this.getSubscriptionSignupFlag(model),
                    tierName
                }
            };
        });

        return {
            data,
            meta
        };
    }

    getTierName(model) {
        return model.related('stripeSubscription') &&
            model.related('stripeSubscription').related('stripePrice') &&
            model.related('stripeSubscription').related('stripePrice').related('stripeProduct') &&
            model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product')
            ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name')
            : null;
    }

    getSubscriptionAttribution(model) {
        if (model.get('type') !== 'created' ||
            !model.related('subscriptionCreatedEvent') ||
            !model.related('subscriptionCreatedEvent').id) {
            return null;
        }
        return this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'));
    }

    getSubscriptionSignupFlag(model) {
        if (model.get('type') !== 'created' ||
            !model.related('subscriptionCreatedEvent') ||
            !model.related('subscriptionCreatedEvent').id ||
            !model.related('subscriptionCreatedEvent').related('memberCreatedEvent') ||
            !model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id) {
            return false;
        }
        return true;
    }

    async getPaymentEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member'],
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'payment_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getLoginEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member'],
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberLoginEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'login_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getSignupEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            expanders: [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]
        });

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            const json = model.toJSON(transformedOptions);
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

        return {
            data,
            meta
        };
    }

    async getDonationEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'member_id:-null+custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            expanders: [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]
        });

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            const json = model.toJSON(transformedOptions);
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

        return {
            data,
            meta
        };
    }

    async getCommentEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'post', 'parent'],
            filter: 'member_id:-null+custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        });

        const {data: models, meta} = await this._Comment.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'comment_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getClickEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'link', 'link.post'],
            filter: 'custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        });

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'click_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
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

        const postClicksQuery = postId ? this.buildPostClicksQueryWithPostId(postId) : this.buildPostClicksQueryWithoutPostId();

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

        const transformedOptions = {
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
            cte: [{
                name: `PostClicks`,
                query: postClicksQuery
            },
            {
                name: `FirstClicks`,
                query: firstClicksQuery
            }],
            from: 'FirstClicks',
            order: ''
        };

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'aggregated_click_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    buildPostClicksQueryWithPostId(postId) {
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

    buildPostClicksQueryWithoutPostId() {
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

    async getFeedbackEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'post'],
            filter: 'custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        });

        const {data: models, meta} = await this._MemberFeedback.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'feedback_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'email'],
            filter: filterStr,
            keyMap: {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });

        transformedOptions.order = transformedOptions.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'email_sent_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('processed_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'email'],
            filter: 'delivered_at:-null+custom:true',
            keyMap: {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });

        transformedOptions.order = transformedOptions.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'email_delivered_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('delivered_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    async getEmailOpenedEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'email'],
            filter: 'opened_at:-null+custom:true',
            keyMap: {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });

        transformedOptions.order = transformedOptions.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'email_opened_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('opened_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'email'],
            filter: 'custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'email_complaint_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getEmailFailedEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'email'],
            filter: 'failed_at:-null+custom:true',
            keyMap: {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });

        transformedOptions.order = transformedOptions.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'email_failed_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('failed_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    async getEmailChangeEvent(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member'],
            filter: 'custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(transformedOptions);

        return {
            data: models.map((model) => ({
                type: 'email_change_event',
                data: model.toJSON(transformedOptions)
            })),
            meta
        };
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const transformedOptions = this.buildMongoOptions(options, filter, {
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            keyMap: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(transformedOptions);

        return {
            data: models.map((model) => {
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
            }),
            meta
        };
    }

    buildMongoOptions(options, filter, config) {
        const baseOptions = {
            ...options,
            withRelated: config.withRelated,
            filter: config.filter || 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(config.keyMap)
            )
        };

        if (config.expanders) {
            baseOptions.mongoTransformer = chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(config.keyMap),
                (f) => expandFilters(f, config.expanders)
            );
        }

        return baseOptions;
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