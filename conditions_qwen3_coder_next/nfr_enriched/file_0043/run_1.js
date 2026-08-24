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

    async getEventTimeline(options = {}, filter) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        // Changing this order might need a change in the query functions
        // because of the different underlying models.
        options.order = 'created_at desc, id desc';

        // Create a list of all events that can be queried
        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        // Some events are not filterable by post_id
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

        //Filter events to query
        let filteredPages = pageActions;
        if (typeFilter) {
            // Ideally we should be able to create a NQL filter without having a string
            const query = new mingo.Query(typeFilter);
            filteredPages = filteredPages.filter(page => query.test(page));
        }

        //Start the promises
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: allEvents.sort(
                (a, b) => {
                    const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                    if (diff !== 0) {
                        return diff;
                    }
                    return b.data.id.localeCompare(a.data.id);
                }
            ).slice(0, options.limit),
            meta: {
                pagination: {
                    limit: options.limit,
                    total: totalEvents,
                    pages: options.limit > 0 ? Math.ceil(totalEvents / options.limit) : null,

                    // Other values are unavailable (not possible to calculate easily)
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

    async getNewsletterSubscriptionEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member,newsletter', ['data.created_at', 'data.source', 'data.member_id']);
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);

        return this.mapModelsToEvent(models, 'newsletter_event');
    }

    async getSubscriptionEvents(options, filter) {
        options = this.createFilterOptions(options, filter, [
            'member',
            'subscriptionCreatedEvent.postAttribution',
            'subscriptionCreatedEvent.userAttribution',
            'subscriptionCreatedEvent.tagAttribution',
            'subscriptionCreatedEvent.memberCreatedEvent',
            'stripeSubscription.stripePrice.stripeProduct.product'
        ], ['data.created_at', 'data.member_id']);

        options.mongoTransformer = chainTransformers(
            options.mongoTransformer,
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }]);
            }
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);

        return models.map((model) => this.extractSubscriptionEventData(model, options))
            .then(events => ({data: events, meta}));
    }

    async getPaymentEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member', ['data.created_at', 'data.member_id']);
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);

        return this.mapModelsToEvent(models, 'payment_event');
    }

    async getLoginEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member', ['data.created_at', 'data.member_id']);
        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);

        return this.mapModelsToEvent(models, 'login_event');
    }

    async getSignupEvents(options, filter) {
        options = this.createFilterOptions(options, filter, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], ['data.created_at', 'data.member_id', 'data.source']);

        options.filter = 'subscriptionCreatedEvent.id:null+custom:true';

        options.mongoTransformer = chainTransformers(
            options.mongoTransformer,
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);

        return models.map((model) => ({
            type: 'signup_event',
            data: {
                ...this.truncatePostAttribution(model.toJSON(options)),
                attribution: this._memberAttributionService.getEventAttribution(model)
            }
        })).then(events => ({data: events, meta}));
    }

    async getDonationEvents(options, filter) {
        options = this.createFilterOptions(options, filter, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], ['data.created_at', 'data.member_id']);

        options.filter = 'member_id:-null+custom:true';

        options.mongoTransformer = chainTransformers(
            options.mongoTransformer,
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);

        return models.map((model) => ({
            type: 'donation_event',
            data: {
                ...this.truncatePostAttribution(model.toJSON(options)),
                attribution: this._memberAttributionService.getEventAttribution(model)
            }
        })).then(events => ({data: events, meta}));
    }

    async getCommentEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member,post,parent', ['data.created_at', 'data.member_id', 'data.post_id']);
        options.filter = 'member_id:-null+custom:true';

        const {data: models, meta} = await this._Comment.findPage(options);

        return this.mapModelsToEvent(models, 'comment_event');
    }

    async getClickEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member,link,link.post', ['data.created_at', 'data.member_id', 'data.post_id']);

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);

        return this.mapModelsToEvent(models, 'click_event');
    }

    getPostIdFromFilter(filter) {
        let postIdString = '';

        if (filter && filter.$and) {
            const match = filter.$and.find(condition => condition['data.post_id']);
            postIdString = match?.['data.post_id'];
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

        let postClicksQuery = postId ? `SELECT
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

        options = {
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

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);

        return models.map(model => ({
            type: 'aggregated_click_event',
            data: model.toJSON(options)
        })).then(events => ({data: events, meta}));
    }

    async getFeedbackEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member,post', ['data.created_at', 'data.member_id', 'data.post_id']);

        const {data: models, meta} = await this._MemberFeedback.findPage(options);

        return this.mapModelsToEvent(models, 'feedback_event');
    }

    async getEmailSentEvents(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = this.createFilterOptions(options, filter, 'member,email', ['data.created_at', 'data.member_id', 'data.post_id']);
        options.filter = filterStr;
        options.order = options.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

        return models.map(model => ({
            type: 'email_sent_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('processed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        })).then(events => ({data: events, meta}));
    }

    async getEmailDeliveredEvents(options, filter) {
        const filterStr = 'delivered_at:-null+custom:true';
        options = this.createFilterOptions(options, filter, 'member,email', ['data.created_at', 'data.member_id', 'data.post_id']);
        options.filter = filterStr;
        options.order = options.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

        return models.map(model => ({
            type: 'email_delivered_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('delivered_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        })).then(events => ({data: events, meta}));
    }

    async getEmailOpenedEvents(options, filter) {
        const filterStr = 'opened_at:-null+custom:true';
        options = this.createFilterOptions(options, filter, 'member,email', ['data.created_at', 'data.member_id', 'data.post_id']);
        options.filter = filterStr;
        options.order = options.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

        return models.map(model => ({
            type: 'email_opened_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('opened_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        })).then(events => ({data: events, meta}));
    }

    async getEmailSpamComplaintEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member,email', ['data.created_at', 'data.member_id', 'data.post_id']);

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);

        return this.mapModelsToEvent(models, 'email_complaint_event');
    }

    async getEmailFailedEvents(options, filter) {
        const filterStr = 'failed_at:-null+custom:true';
        options = this.createFilterOptions(options, filter, 'member,email', ['data.created_at', 'data.member_id', 'data.post_id']);
        options.filter = filterStr;
        options.order = options.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

        return models.map(model => ({
            type: 'email_failed_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('failed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        })).then(events => ({data: events, meta}));
    }

    async getEmailChangeEvent(options, filter) {
        options = this.createFilterOptions(options, filter, 'member', ['data.created_at', 'data.member_id']);

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);

        return this.mapModelsToEvent(models, 'email_change_event');
    }

    async getAutomatedEmailSentEvents(options, filter) {
        options = this.createFilterOptions(options, filter, 'member,automatedEmail', ['data.created_at', 'data.member_id']);

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(options);

        return models.map(model => ({
            type: 'automated_email_sent_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('created_at'),
                member: model.related('member').toJSON(),
                automatedEmail: {
                    id: model.related('automatedEmail').id,
                    slug: model.related('automatedEmail').slug
                }
            }
        })).then(events => ({data: events, meta}));
    }

    /**
     * Creates standardized options object with required filter transformers and key mappings
     * @param {Object} options - original options
     * @param {Object} filter - custom mongo filter
     * @param {String|Array<String>} withRelated - relations to include
     * @param {Array<String>} keyMap - fields to remap
     * @returns {Object} configured options object
     */
    createFilterOptions(options, filter, withRelated, keyMap) {
        const formattedWithRelated = Array.isArray(withRelated) ? withRelated.join(',') : withRelated;

        return {
            ...options,
            withRelated: formattedWithRelated,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(
                    keyMap.reduce((acc, key) => {
                        acc[key] = key.replace('data.', '');
                        return acc;
                    }, {})
                )
            )
        };
    }

    /**
     * Maps models to events using specified type without additional data transformation
     * @param {Array<Object>} models - models to transform
     * @param {String} type - event type name
     * @returns {Array<Object>} transformed events
     */
    mapModelsToEvent(models, type) {
        return models.map(model => ({
            type,
            data: model.toJSON()
        }));
    }

    /**
     * Truncates post attribution fields to avoid overly large responses
     * @param {Object} json - model JSON to truncate
     * @returns {Object} cleaned JSON object
     */
    truncatePostAttribution(json) {
        if (json.postAttribution) {
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
        }
        return json;
    }

    /**
     * Extracts subscription event data from model with special handling for attribution and tier info
     * @param {Object} model - model to extract data from
     * @param {Object} options - findPage options
     * @returns {Object} subscription event data
     */
    extractSubscriptionEventData(model, options) {
        const tierName = model.related('stripeSubscription')
            && model.related('stripeSubscription').related('stripePrice')
            && model.related('stripeSubscription').related('stripePrice').related('stripeProduct')
            && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product')
            ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

        delete model.relations.stripeSubscription;

        const d = {
            ...model.toJSON(options),
            attribution: model.get('type') === 'created'
                && model.related('subscriptionCreatedEvent')
                && model.related('subscriptionCreatedEvent').id
                ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
            signup: model.get('type') === 'created'
                && model.related('subscriptionCreatedEvent')
                && model.related('subscriptionCreatedEvent').id
                && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')
                && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id,
            tierName,
            stripeSubscription: undefined
        };

        return {
            type: 'subscription_event',
            data: d
        };
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