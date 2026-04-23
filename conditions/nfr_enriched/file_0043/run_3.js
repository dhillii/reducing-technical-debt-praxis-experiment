const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * This mongo transformer ignores the provided filter option and replaces the filter with a custom filter that was provided to the transformer. Allowing us to set a mongo filter instead of a string based NQL filter.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {
            custom: filter
        });
    };
}

/**
 * Builds mongo transformer chain for event queries with filter mapping
 */
function buildMongoTransformer(filter, keyMappings, expanderFn) {
    const transformers = [
        replaceCustomFilterTransformer(filter),
        ...mapKeys(keyMappings)
    ];

    if (expanderFn) {
        transformers.push(expanderFn);
    }

    return chainTransformers(...transformers);
}

/**
 * Builds base options for event queries
 */
function buildEventQueryOptions(baseOptions, filter, keyMappings, expanderFn, additionalConfig = {}) {
    return {
        ...baseOptions,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, keyMappings, expanderFn),
        ...additionalConfig
    };
}

/**
 * Maps event models to event data with specified type
 */
function mapModelsToEvents(models, eventType, options, transformFn) {
    return models.map((model) => {
        const data = transformFn ? transformFn(model, options) : model.toJSON(options);
        return {
            type: eventType,
            data
        };
    });
}

/**
 * Extracts tier name from nested stripe subscription relations
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
 * Transforms subscription event model to event data
 */
function transformSubscriptionEventData(model, options, memberAttributionService) {
    const tierName = extractTierName(model);
    delete model.relations.stripeSubscription;

    const json = model.toJSON(options);
    const eventData = {
        ...json,
        attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id ? memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
        signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id ? true : false,
        tierName
    };
    delete eventData.stripeSubscription;
    return eventData;
}

/**
 * Transforms signup/donation event model to event data
 */
function transformAttributionEventData(model, options, memberAttributionService) {
    const json = model.toJSON(options);
    delete json.postAttribution?.mobiledoc;
    delete json.postAttribution?.lexical;
    delete json.postAttribution?.plaintext;
    return {
        ...json,
        attribution: memberAttributionService.getEventAttribution(model)
    };
}

/**
 * Transforms email event model to event data
 */
function transformEmailEventData(model, createdAtField) {
    return {
        id: model.id,
        member_id: model.get('member_id'),
        created_at: model.get(createdAtField),
        member: model.related('member').toJSON(),
        email: model.related('email').toJSON()
    };
}

/**
 * Sorts events by created_at descending, then by id
 */
function sortEventsByCreatedAt(events) {
    return events.sort((a, b) => {
        const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
        if (diff !== 0) {
            return diff;
        }
        return b.data.id.localeCompare(a.data.id);
    });
}

/**
 * Builds pagination metadata
 */
function buildPaginationMeta(limit, total) {
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
    buildPageActions() {
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
     * Adds non-post-filterable events to page actions
     */
    addNonPostFilterableEvents(pageActions) {
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

    /**
     * Adds email-related events to page actions
     */
    addEmailEvents(pageActions) {
        if (this._EmailRecipient) {
            pageActions.push({type: 'email_sent_event', action: 'getEmailSentEvents'});
            pageActions.push({type: 'email_delivered_event', action: 'getEmailDeliveredEvents'});
            pageActions.push({type: 'email_opened_event', action: 'getEmailOpenedEvents'});
            pageActions.push({type: 'email_failed_event', action: 'getEmailFailedEvents'});
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});
    }

    /**
     * Adds feedback events if labs feature is enabled
     */
    addFeedbackEvents(pageActions) {
        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }
    }

    /**
     * Filters page actions based on type filter
     */
    filterPageActionsByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Executes all event queries in parallel
     */
    async executeEventQueries(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return Promise.all(pages);
    }

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = this.buildPageActions();
        const usesPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');

        if (!usesPostIdFilter) {
            this.addNonPostFilterableEvents(pageActions);
        }

        this.addEmailEvents(pageActions);
        this.addFeedbackEvents(pageActions);

        const filteredPages = this.filterPageActionsByType(pageActions, typeFilter);
        const allEventPages = await this.executeEventQueries(filteredPages, options, otherFilter);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        const sortedEvents = sortEventsByCreatedAt(allEvents).slice(0, options.limit);

        return {
            events: sortedEvents,
            meta: buildPaginationMeta(options.limit, totalEvents)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'newsletter']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'newsletter_event', queryOptions);

        return {data, meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        const expanderFn = (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }]);
        };

        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: [
                    'member',
                    'subscriptionCreatedEvent.postAttribution',
                    'subscriptionCreatedEvent.userAttribution',
                    'subscriptionCreatedEvent.tagAttribution',
                    'subscriptionCreatedEvent.memberCreatedEvent',
                    'stripeSubscription.stripePrice.stripeProduct.product'
                ]
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            expanderFn
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'subscription_event',
            queryOptions,
            (model) => transformSubscriptionEventData(model, queryOptions, this._memberAttributionService)
        );

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'payment_event', queryOptions);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberLoginEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'login_event', queryOptions);

        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        const expanderFn = (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]);
        };

        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: [
                    'member',
                    'postAttribution',
                    'userAttribution',
                    'tagAttribution'
                ]
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            expanderFn,
            {filter: 'subscriptionCreatedEvent.id:null+custom:true'}
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'signup_event',
            queryOptions,
            (model) => transformAttributionEventData(model, queryOptions, this._memberAttributionService)
        );

        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        const expanderFn = (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]);
        };

        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: [
                    'member',
                    'postAttribution',
                    'userAttribution',
                    'tagAttribution'
                ]
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            expanderFn,
            {filter: 'member_id:-null+custom:true'}
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'donation_event',
            queryOptions,
            (model) => transformAttributionEventData(model, queryOptions, this._memberAttributionService)
        );

        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'post', 'parent']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            },
            null,
            {filter: 'member_id:-null+custom:true'}
        );

        const {data: models, meta} = await this._Comment.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'comment_event', queryOptions);

        return {data, meta};
    }

    async getClickEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'link', 'link.post']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'click_event', queryOptions);

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

    /**
     * Builds CTE queries for aggregated click events
     */
    buildClickEventCTEQueries(postId) {
        const postClicksQuery = postId ? `SELECT
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

        return {postClicksQuery, firstClicksQuery};
    }

    /**
     * Builds aggregated click event query options
     */
    buildAggregatedClickEventOptions(baseOptions, filter, postId) {
        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;

        const {postClicksQuery, firstClicksQuery} = this.buildClickEventCTEQueries(postId);

        return {
            ...baseOptions,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: buildMongoTransformer(
                filter,
                {
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                }
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

    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [, otherFilter] = this.getNQLSubset(options.filter);
        const cleanedFilter = this.removePostIdFilter(otherFilter);

        const queryOptions = this.buildAggregatedClickEventOptions(options, cleanedFilter, postId);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'aggregated_click_event', queryOptions);

        return {data, meta};
    }

    async getFeedbackEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'post']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await this._MemberFeedback.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'feedback_event', queryOptions);

        return {data, meta};
    }

    async getEmailSentEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'email']
            },
            filter,
            {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            {filter: 'failed_at:null+processed_at:-null+delivered_at:null+custom:true'}
        );

        queryOptions.order = queryOptions.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'email_sent_event',
            queryOptions,
            (model) => transformEmailEventData(model, 'processed_at')
        );

        return {data, meta};
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'email']
            },
            filter,
            {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            {filter: 'delivered_at:-null+custom:true'}
        );

        queryOptions.order = queryOptions.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'email_delivered_event',
            queryOptions,
            (model) => transformEmailEventData(model, 'delivered_at')
        );

        return {data, meta};
    }

    async getEmailOpenedEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'email']
            },
            filter,
            {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            {filter: 'opened_at:-null+custom:true'}
        );

        queryOptions.order = queryOptions.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'email_opened_event',
            queryOptions,
            (model) => transformEmailEventData(model, 'opened_at')
        );

        return {data, meta};
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'email']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'email_complaint_event', queryOptions);

        return {data, meta};
    }

    async getEmailFailedEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'email']
            },
            filter,
            {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            {filter: 'failed_at:-null+custom:true'}
        );

        queryOptions.order = queryOptions.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(queryOptions);
        const data = mapModelsToEvents(
            models,
            'email_failed_event',
            queryOptions,
            (model) => transformEmailEventData(model, 'failed_at')
        );

        return {data, meta};
    }

    async getEmailChangeEvent(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(queryOptions);
        const data = mapModelsToEvents(models, 'email_change_event', queryOptions);

        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const queryOptions = buildEventQueryOptions(
            {
                ...options,
                withRelated: ['member', 'automatedEmail']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(queryOptions);

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