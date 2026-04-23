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
        const defaultLimit = 10;
        const effectiveLimit = options.limit || defaultLimit;

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        const defaultOrder = 'created_at desc, id desc';
        options.order = defaultOrder;

        const pageActions = this.buildPageActions(typeFilter, otherFilter);

        const pages = await this.executePageActions(pageActions, options, otherFilter);

        const allEvents = this.mergeAndSortEvents(pages, effectiveLimit);
        const totalEvents = this.calculateTotalEvents(pages);

        return this.buildTimelineResponse(allEvents, totalEvents, effectiveLimit);
    }

    buildPageActions(typeFilter, otherFilter) {
        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');

        if (!hasPostIdFilter) {
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

        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            return pageActions.filter(page => query.test(page));
        }

        return pageActions;
    }

    async executePageActions(pageActions, options, otherFilter) {
        const pages = await Promise.all(pageActions.map((page) => {
            return this[page.action](options, otherFilter);
        }));

        return pages;
    }

    mergeAndSortEvents(pages, limit) {
        const allEvents = pages.flatMap(page => page.data);
        const sortedEvents = allEvents.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        );

        return sortedEvents.slice(0, limit);
    }

    calculateTotalEvents(pages) {
        return pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);
    }

    buildTimelineResponse(events, totalEvents, limit) {
        return {
            events,
            meta: {
                pagination: {
                    limit,
                    total: totalEvents,
                    pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,
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

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'newsletter_event');

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'subscription_event');

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            const tierName = this.extractTierName(model);
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(options),
                attribution: this.getEventAttribution(model),
                signup: this.isSignup(model),
                tierName
            };
            delete d.stripeSubscription;
            return {
                type: 'subscription_event',
                data: d
            };
        });

        return {
            data,
            meta
        };
    }

    extractTierName(model) {
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
        if (!product) {
            return null;
        }

        return product.get('name');
    }

    isSignup(model) {
        const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
        if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
            return false;
        }

        const memberCreatedEvent = subscriptionCreatedEvent.related('memberCreatedEvent');
        return memberCreatedEvent && memberCreatedEvent.id;
    }

    getEventAttribution(model) {
        const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
        if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
            return null;
        }

        return this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent);
    }

    async getPaymentEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'payment_event');

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getLoginEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'login_event');

        const {data: models, meta} = await this._MemberLoginEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getSignupEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'signup_event');

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(configuredOptions);

        const data = models.map((model) => {
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

        return {
            data,
            meta
        };
    }

    async getDonationEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'donation_event');

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(configuredOptions);

        const data = models.map((model) => {
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

        return {
            data,
            meta
        };
    }

    async getCommentEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'comment_event');

        const {data: models, meta} = await this._Comment.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getClickEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'click_event');

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
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
        const firstClicksQuery = this.getFirstClicksQuery();
        const mainQuery = this.getMainClickCountQuery();

        const configuredOptions = this.buildBaseOptions(options, filter, 'aggregated_click_event', {
            useCTE: true,
            selectRaw: `id, member_id, created_at, (${mainQuery}) as count__clicks`,
            whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
            cte: [
                {
                    name: `PostClicks`,
                    query: postClicksQuery
                },
                {
                    name: `FirstClicks`,
                    query: firstClicksQuery
                }
            ],
            from: 'FirstClicks',
            order: ''
        });

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
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

    getFirstClicksQuery() {
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

    getMainClickCountQuery() {
        return `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
    }

    async getFeedbackEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'feedback_event');

        const {data: models, meta} = await this._MemberFeedback.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const configuredOptions = this.buildBaseOptions(options, filter, 'email_sent_event', {
            order: options.order.replace(/created_at/g, 'processed_at')
        });

        const {data: models, meta} = await this._EmailRecipient.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_sent_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('processed_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'email_delivered_event', {
            order: options.order.replace(/created_at/g, 'delivered_at')
        });

        const {data: models, meta} = await this._EmailRecipient.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_delivered_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('delivered_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailOpenedEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'email_opened_event', {
            order: options.order.replace(/created_at/g, 'opened_at')
        });

        const {data: models, meta} = await this._EmailRecipient.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_opened_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('opened_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'email_complaint_event');

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailFailedEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'email_failed_event', {
            order: options.order.replace(/created_at/g, 'failed_at')
        });

        const {data: models, meta} = await this._EmailRecipient.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_failed_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('failed_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailChangeEvent(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'email_change_event');

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const configuredOptions = this.buildBaseOptions(options, filter, 'automated_email_sent_event');

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(configuredOptions);

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

        return {
            data,
            meta
        };
    }

    buildBaseOptions(options, filter, eventType, extraOptions = {}) {
        const filterStr = this.buildFilterString(filter, eventType);
        const configuredOptions = {
            ...options,
            withRelated: this.buildWithRelated(eventType),
            filter: filterStr,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(this.buildMapKeys(eventType))
            ),
            ...extraOptions
        };

        return configuredOptions;
    }

    buildFilterString(filter, eventType) {
        const baseFilter = 'custom:true';
        const specificFilter = this.getSpecificFilter(eventType);

        if (specificFilter) {
            return `${specificFilter}+${baseFilter}`;
        }

        return baseFilter;
    }

    getSpecificFilter(eventType) {
        switch (eventType) {
            case 'email_sent_event':
                return 'failed_at:null+processed_at:-null+delivered_at:null';
            case 'email_delivered_event':
                return 'delivered_at:-null';
            case 'email_opened_event':
                return 'opened_at:-null';
            case 'email_failed_event':
                return 'failed_at:-null';
            case 'signup_event':
                return 'subscriptionCreatedEvent.id:null';
            case 'donation_event':
                return 'member_id:-null';
            case 'comment_event':
                return 'member_id:-null';
            default:
                return '';
        }
    }

    buildWithRelated(eventType) {
        const baseRelations = ['member'];

        switch (eventType) {
            case 'newsletter_event':
                return [...baseRelations, 'newsletter'];
            case 'subscription_event':
                return [
                    ...baseRelations,
                    'subscriptionCreatedEvent.postAttribution',
                    'subscriptionCreatedEvent.userAttribution',
                    'subscriptionCreatedEvent.tagAttribution',
                    'subscriptionCreatedEvent.memberCreatedEvent',
                    'stripeSubscription.stripePrice.stripeProduct.product'
                ];
            case 'payment_event':
            case 'login_event':
            case 'email_change_event':
            case 'automated_email_sent_event':
                return baseRelations;
            case 'signup_event':
            case 'donation_event':
                return [...baseRelations, 'postAttribution', 'userAttribution', 'tagAttribution'];
            case 'comment_event':
                return [...baseRelations, 'post', 'parent'];
            case 'click_event':
            case 'aggregated_click_event':
                return [...baseRelations, 'link', 'link.post'];
            case 'feedback_event':
                return [...baseRelations, 'post'];
            case 'email_sent_event':
            case 'email_delivered_event':
            case 'email_opened_event':
            case 'email_failed_event':
            case 'email_complaint_event':
                return [...baseRelations, 'email'];
            default:
                return baseRelations;
        }
    }

    buildMapKeys(eventType) {
        const baseMap = {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        };

        switch (eventType) {
            case 'newsletter_event':
                return {
                    ...baseMap,
                    'data.source': 'source'
                };
            case 'subscription_event':
            case 'payment_event':
            case 'login_event':
            case 'email_change_event':
            case 'automated_email_sent_event':
                return baseMap;
            case 'signup_event':
            case 'donation_event':
                return {
                    ...baseMap,
                    'data.source': 'source'
                };
            case 'comment_event':
            case 'click_event':
            case 'aggregated_click_event':
            case 'feedback_event':
            case 'email_sent_event':
            case 'email_delivered_event':
            case 'email_opened_event':
            case 'email_failed_event':
            case 'email_complaint_event':
                return {
                    ...baseMap,
                    'data.post_id': 'post_id'
                };
            default:
                return baseMap;
        }
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