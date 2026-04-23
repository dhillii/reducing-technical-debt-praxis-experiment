const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * Builds the list of page actions to query based on available event types and filters.
 * @param {Object} options - Query options
 * @param {Object} otherFilter - Filter without type
 * @returns {Array} Array of page action objects
 */
function buildPageActions(options, otherFilter) {
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

    // Filter events to query
    let filteredPages = pageActions;
    if (options.typeFilter) {
        const query = new mingo.Query(options.typeFilter);
        filteredPages = filteredPages.filter(page => query.test(page));
    }

    return filteredPages;
}

/**
 * Sorts events by created_at descending, then by id descending.
 * @param {Array} events - Array of event objects
 * @param {Object} options - Query options
 * @returns {Array} Sorted events
 */
function sortEvents(events, options) {
    return events.sort(
        (a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) {
                return diff;
            }
            return b.data.id.localeCompare(a.data.id);
        }
    ).slice(0, options.limit);
}

/**
 * Calculates pagination metadata for events.
 * @param {Array} pages - Array of page metadata
 * @param {Object} options - Query options
 * @returns {Object} Pagination metadata
 */
function calculatePagination(pages, options) {
    const totalEvents = pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

    return {
        limit: options.limit,
        total: totalEvents,
        pages: options.limit > 0 ? Math.ceil(totalEvents / options.limit) : null,
        page: null,
        next: null,
        prev: null
    };
}

/**
 * Aggregates click events per member for the same post, returning only the first actual event
 * with total clicks per event.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @returns {Promise<Object>} Aggregated click events with metadata
 */
async function getAggregatedClickEvents(options, filter) {
    const postId = this.getPostIdFromFilter(filter);

    // Remove type filter as we don't need it in the query
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

/**
 * Builds common options for event queries with custom filter transformer.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} keyMappings - Key mappings for the filter
 * @returns {Object} Options object with transformers applied
 */
function buildEventOptions(options, filter, keyMappings) {
    return {
        ...options,
        withRelated: keyMappings.withRelated,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMappings.keyMappings)
        )
    };
}

/**
 * Maps event models to the expected output format.
 * @param {Array} models - Array of model objects
 * @param {Object} options - Query options
 * @param {Function} transformFn - Optional transformation function
 * @returns {Array} Transformed event data
 */
function mapEventModels(models, options, transformFn) {
    const data = models.map((model) => {
        const json = transformFn ? transformFn(model, options) : model.toJSON(options);
        return {
            type: json.type,
            data: json
        };
    });
    return data;
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
     * Retrieves a timeline of events across all event types.
     * @param {Object} options - Query options including limit and filter
     * @returns {Promise<Object>} Events with pagination metadata
     */
    async getEventTimeline(options) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = buildPageActions.call(this, {typeFilter}, otherFilter);

        const pages = await Promise.all(
            pageActions.map((page) => {
                return this[page.action](options, otherFilter);
            })
        );

        const allEvents = pages.flatMap(page => page.data);
        const totalEvents = pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: sortEvents(allEvents, options),
            meta: {
                pagination: calculatePagination(pages, options)
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
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'newsletter'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getSubscriptionEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);

        const data = models.map((model) => {
            const tierName = model.related('stripeSubscription') && model.related('stripeSubscription').related('stripePrice') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(options),
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id ? true : false,
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

    async getPaymentEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getLoginEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getSignupEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            }
        });

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);

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

    async getDonationEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);

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

    async getCommentEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'post', 'parent'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        });

        const {data: models, meta} = await this._Comment.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getClickEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'link', 'link.post'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        });

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);

        const data = mapEventModels(models, options);

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

    async getFeedbackEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'post'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        });

        const {data: models, meta} = await this._MemberFeedback.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getEmailSentEvents(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'email'],
            keyMappings: {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });
        options.order = options.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

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

    async getEmailDeliveredEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'email'],
            keyMappings: {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });
        options.order = options.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

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

    async getEmailOpenedEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'email'],
            keyMappings: {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });
        options.order = options.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

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

    async getEmailSpamComplaintEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'email'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getEmailFailedEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'email'],
            keyMappings: {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        });
        options.order = options.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);

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

    async getEmailChangeEvent(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);

        const data = mapEventModels(models, options);

        return {
            data,
            meta
        };
    }

    async getAutomatedEmailSentEvents(options, filter) {
        options = buildEventOptions(options, filter, {
            withRelated: ['member', 'automatedEmail'],
            keyMappings: {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        });

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(options);

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