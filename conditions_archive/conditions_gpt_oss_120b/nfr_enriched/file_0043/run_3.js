```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {
    replaceFilters,
    expandFilters,
    splitFilter,
    getUsedKeys,
    chainTransformers,
    mapKeys,
    rejectStatements
} = require('@tryghost/mongo-utils');
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
 * Build common query options for event pages.
 * @param {Object} baseOptions Base options passed by caller.
 * @param {Object} filter Custom filter object.
 * @param {Object} keyMap Mapping of NQL keys to Mongo keys.
 * @param {Function[]} [extraTransformers] Additional transformers to apply.
 * @returns {Object} Merged options ready for model queries.
 */
function buildEventOptions(baseOptions, filter, keyMap, extraTransformers = []) {
    const transformers = [
        replaceCustomFilterTransformer(filter),
        ...mapKeys(keyMap),
        ...extraTransformers
    ];
    return {
        ...baseOptions,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: chainTransformers(...transformers)
    };
}

/**
 * Convert model collection to event payload.
 * @param {Array} models Model instances.
 * @param {string} type Event type identifier.
 * @param {Function} [mapper] Optional mapper to transform each model's JSON.
 * @returns {Array} Array of event objects.
 */
function mapModelsToEvents(models, type, mapper) {
    return models.map(model => ({
        type,
        data: mapper ? mapper(model) : model.toJSON()
    }));
}

/**
 * Extract postId from a filter object.
 * @param {Object} filter Filter object.
 * @returns {ObjectID|null}
 */
function getPostIdFromFilter(filter) {
    let postIdString = '';
    if (filter && filter.$and) {
        postIdString = filter.$and.find(c => c['data.post_id'])?.['data.post_id'];
    } else {
        postIdString = filter ? filter['data.post_id'] : '';
    }
    return ObjectID.isValid(postIdString) ? ObjectID.createFromHexString(postIdString) : null;
}

/**
 * Remove post_id statements from a filter.
 * @param {Object} filter Filter object.
 * @returns {Object}
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
 * @param {string} filter NQL filter string.
 * @returns {[Object|undefined, Object|undefined]}
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
            throw new errors.IncorrectUsageError({message: `Cannot filter by ${key}`});
        }
    }
    try {
        return splitFilter(parsed, ['type']);
    } catch (e) {
        throw new errors.IncorrectUsageError({message: e.message});
    }
}

/**
 * Event repository handling various member and email events.
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

    async getEventTimeline(options, filter) {
        options = options || {};
        if (!options.limit) {
            options.limit = 10;
        }
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

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
            pageActions.push(
                {type: 'email_sent_event', action: 'getEmailSentEvents'},
                {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
                {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
                {type: 'email_failed_event', action: 'getEmailFailedEvents'}
            );
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }

        let filteredPages = pageActions;
        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            filteredPages = filteredPages.filter(page => query.test(page));
        }

        const pages = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pages);
        const allEvents = allEventPages.flatMap(p => p.data);
        const totalEvents = allEventPages.reduce((sum, p) => sum + p.meta.pagination.total, 0);

        return {
            events: allEvents.sort((a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                return diff !== 0 ? diff : b.data.id.localeCompare(a.data.id);
            }).slice(0, options.limit),
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

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({...data, source: 'stripe'});
    }

    async getNewsletterSubscriptionEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
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
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(opts);
        const data = mapModelsToEvents(models, 'newsletter_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getSubscriptionEvents(options, filter) {
        options = options || {};
        const extra = [
            f => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }])
        ];
        const opts = buildEventOptions(
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
            extra
        );
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);
        const data = models.map(model => {
            const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') || null;
            delete model.relations.stripeSubscription;
            const json = model.toJSON(opts);
            const attribution = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')
                ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                : null;
            const signup = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.related('memberCreatedEvent')
                ? true
                : false;
            return {
                type: 'subscription_event',
                data: {...json, attribution, signup, tierName}
            };
        });
        return {data, meta};
    }

    async getPaymentEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member']},
            filter,
            {'data.created_at': 'created_at', 'data.member_id': 'member_id'}
        );
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(opts);
        const data = mapModelsToEvents(models, 'payment_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getLoginEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member']},
            filter,
            {'data.created_at': 'created_at', 'data.member_id': 'member_id'}
        );
        const {data: models, meta} = await this._MemberLoginEvent.findPage(opts);
        const data = mapModelsToEvents(models, 'login_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getSignupEvents(options, filter) {
        options = options || {};
        const extra = [
            f => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])
        ];
        const opts = buildEventOptions(
            {
                ...options,
                withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            },
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            extra
        );
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(opts);
        const data = models.map(model => {
            const json = model.toJSON(opts);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                type: 'signup_event',
                data: {...json, attribution: this._memberAttributionService.getEventAttribution(model)}
            };
        });
        return {data, meta};
    }

    async getDonationEvents(options, filter) {
        options = options || {};
        const extra = [
            f => expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }])
        ];
        const opts = buildEventOptions(
            {
                ...options,
                withRelated: ['member', 'postAttribution', 'userAttribution', 'tagAttribution']
            },
            filter,
            {'data.created_at': 'created_at', 'data.member_id': 'member_id'},
            extra
        );
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(opts);
        const data = models.map(model => {
            const json = model.toJSON(opts);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                type: 'donation_event',
                data: {...json, attribution: this._memberAttributionService.getEventAttribution(model)}
            };
        });
        return {data, meta};
    }

    async getCommentEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'post', 'parent']},
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );
        const {data: models, meta} = await this._Comment.findPage(opts);
        const data = mapModelsToEvents(models, 'comment_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getClickEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'link', 'link.post']},
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(opts);
        const data = mapModelsToEvents(models, 'click_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getAggregatedClickEvents(options, filter) {
        options = options || {};
        const postId = getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const cleanedFilter = this.removePostIdFilter(otherFilter);
        const baseOpts = {
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
            selectRaw: `id, member_id, created_at, (${`SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`}) as count__clicks`,
            whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
            cte: [
                {
                    name: `PostClicks`,
                    query: postId ? `SELECT
                        mce.id,
                        mce.member_id,
                        mce.redirect_id,
                        mce.created_at
                    FROM
                        members_click_events mce
                    INNER JOIN
                        redirects r ON mce.redirect_id = r.id
                    WHERE
                        r.post_id = '${postId.toHexString()}'` :
                        `SELECT
                        mce.id,
                        mce.member_id,
                        mce.redirect_id,
                        mce.created_at
                    FROM
                        members_click_events mce
                    INNER JOIN
                        redirects r ON mce.redirect_id = r.id`
                },
                {
                    name: `FirstClicks`,
                    query: `SELECT
                        id,
                        member_id,
                        redirect_id,
                        created_at,
                        ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
                    FROM
                        PostClicks`
                }
            ],
            from: 'FirstClicks',
            order: ''
        };
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(baseOpts);
        const data = mapModelsToEvents(models, 'aggregated_click_event', m => m.toJSON(baseOpts));
        return {data, meta};
    }

    async getFeedbackEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'post']},
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );
        const {data: models, meta} = await this._MemberFeedback.findPage(opts);
        const data = mapModelsToEvents(models, 'feedback_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getEmailSentEvents(options, filter) {
        options = options || {};
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'email'], filter: filterStr},
            filter,
            {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
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

    async getEmailDeliveredEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'email']},
            filter,
            {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
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

    async getEmailOpenedEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'email']},
            filter,
            {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
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

    async getEmailSpamComplaintEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'email']},
            filter,
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(opts);
        const data = mapModelsToEvents(models, 'email_complaint_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getEmailFailedEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'email']},
            filter,
            {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
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

    async getEmailChangeEvent(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member']},
            filter,
            {'data.created_at': 'created_at', 'data.member_id': 'member_id'}
        );
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(opts);
        const data = mapModelsToEvents(models, 'email_change_event', m => m.toJSON(opts));
        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter) {
        options = options || {};
        const opts = buildEventOptions(
            {...options, withRelated: ['member', 'automatedEmail']},
            filter,
            {'data.created_at': 'created_at', 'data.member_id': 'member_id'}
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
                    automatedEmail: {id: automatedEmail.id, slug: automatedEmail.slug}
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
            const last = currencyData[currencyData.length - 1];
            const mrr = last ? last.mrr + result.mrr_delta : result.mrr_delta;
            currencyData.push({date: result.date, mrr, currency: result.currency});
            return {...acc, [result.currency]: currencyData};
        }, {});
    }

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({aggregateStatusCounts: true});
        const resultsJSON = results.toJSON();
        return resultsJSON.reduce((acc, result, idx) => {
            if (idx === 0) {
                return [{date: result.date, paid: result.paid_delta, comped: result.comped_delta, free: result.free_delta}];
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