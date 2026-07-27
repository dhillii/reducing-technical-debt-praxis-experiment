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
     * Builds a Mongo query options object with common defaults and transformers.
     * @param {Object} options
     * @param {Object} filter
     * @param {Array<string>} withRelated
     * @param {Object} mapKeysObj
     * @param {Array<Function>} extraTransformers
     * @returns {Object}
     */
    _buildOptions(options, filter, withRelated, mapKeysObj, extraTransformers = []) {
        return {
            ...options,
            withRelated,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(mapKeysObj),
                ...extraTransformers
            )
        };
    }

    /**
     * Maps model instances to event objects.
     * @param {string} type
     * @param {Array} models
     * @param {Object} options
     * @param {Function} [transform] - Optional function to transform model data before returning.
     * @returns {Array}
     */
    _mapModelsToEvent(type, models, options, transform) {
        return models.map((model) => {
            let data = model.toJSON(options);
            if (transform) {
                data = transform(data, model);
            }
            return {type, data};
        });
    }

    /**
     * Builds the list of page actions based on filter capabilities.
     * @param {Object} options
     * @param {Object} otherFilter
     * @returns {Array}
     */
    _buildPageActions(options, otherFilter) {
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

    /**
     * Filters page actions based on type filter.
     * @param {Array} pageActions
     * @param {Object} typeFilter
     * @returns {Array}
     */
    _filterPages(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }
        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Sorts and paginates events.
     * @param {Array} events
     * @param {number} limit
     * @returns {Array}
     */
    _sortAndPaginate(events, limit) {
        return events.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) {
                return diff;
            }
            return b.data.id.localeCompare(a.data.id);
        }).slice(0, limit);
    }

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions(options, otherFilter);
        const filteredPages = this._filterPages(pageActions, typeFilter);

        const pages = filteredPages.map(page => this[page.action](options, otherFilter));
        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((acc, page) => acc + page.meta.pagination.total, 0);

        return {
            events: this._sortAndPaginate(allEvents, options.limit),
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
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'newsletter'], {
            'data.created_at': 'created_at',
            'data.source': 'source',
            'data.member_id': 'member_id'
        });

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);

        const data = this._mapModelsToEvent('newsletter_event', models, options);

        return {data, meta};
    }

    async getSubscriptionEvents(options, filter) {
        const extraTransformers = [
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }]);
            }
        ];

        options = this._buildOptions(options, filter, [
            'member',
            'subscriptionCreatedEvent.postAttribution',
            'subscriptionCreatedEvent.userAttribution',
            'subscriptionCreatedEvent.tagAttribution',
            'subscriptionCreatedEvent.memberCreatedEvent',
            'stripeSubscription.stripePrice.stripeProduct.product'
        ], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, extraTransformers);

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);

        const data = this._mapModelsToEvent('subscription_event', models, options, (data, model) => {
            const tierName = model.related('stripeSubscription')?.related('stripePrice')?.related('stripeProduct')?.related('product')?.get('name') ?? null;
            delete model.relations.stripeSubscription;
            const attribution = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                : null;
            const signup = model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.id
                && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')?.id;
            delete data.stripeSubscription;
            return {
                ...data,
                attribution,
                signup: !!signup,
                tierName
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);

        const data = this._mapModelsToEvent('payment_event', models, options);

        return {data, meta};
    }

    async getLoginEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);

        const data = this._mapModelsToEvent('login_event', models, options);

        return {data, meta};
    }

    async getSignupEvents(options, filter) {
        options = this._buildOptions(options, filter, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.source': 'source'
        }, [
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        ]);

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);

        const data = this._mapModelsToEvent('signup_event', models, options, (json, model) => {
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });

        return {data, meta};
    }

    async getDonationEvents(options, filter) {
        options = this._buildOptions(options, filter, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, [
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        ]);

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);

        const data = this._mapModelsToEvent('donation_event', models, options, (json, model) => {
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });

        return {data, meta};
    }

    async getCommentEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'post', 'parent'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });

        const {data: models, meta} = await this._Comment.findPage(options);

        const data = this._mapModelsToEvent('comment_event', models, options);

        return {data, meta};
    }

    async getClickEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'link', 'link.post'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);

        const data = this._mapModelsToEvent('click_event', models, options);

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

    async getAggregatedClickEvents(options, filter) {
        const postId = this.getPostIdFromFilter(filter);

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line
        filter = this.removePostIdFilter(otherFilter);

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
        ` : `SELECT
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

        options = this._buildOptions(options, filter, ['member'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        }, [
            (f) => f
        ]);

        options.useCTE = true;
        options.selectRaw = `id, member_id, created_at, (${mainQuery}) as count__clicks`;
        options.whereRaw = `rn = 1 ORDER BY created_at DESC, id DESC`;
        options.cte = [
            {name: `PostClicks`, query: postClicksQuery},
            {name: `FirstClicks`, query: firstClicksQuery}
        ];
        options.from = 'FirstClicks';
        options.order = '';

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);

        const data = this._mapModelsToEvent('aggregated_click_event', models, options);

        return {data, meta};
    }

    async getFeedbackEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'post'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        });

        const {data: models, meta} = await this._MemberFeedback.findPage(options);

        const data = this._mapModelsToEvent('feedback_event', models, options);

        return {data, meta};
    }

    async getEmailSentEvents(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = this._buildOptions(options, filter, ['member', 'email'], {
            'data.created_at': 'processed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
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

        return {data, meta};
    }

    async getEmailDeliveredEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'email'], {
            'data.created_at': 'delivered_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
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

        return {data, meta};
    }

    async getEmailOpenedEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'email'], {
            'data.created_at': 'opened_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
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

        return {data, meta};
    }

    async getEmailSpamComplaintEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'email'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        });

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);

        const data = this._mapModelsToEvent('email_complaint_event', models, options);

        return {data, meta};
    }

    async getEmailFailedEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'email'], {
            'data.created_at': 'failed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
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

        return {data, meta};
    }

    async getEmailChangeEvent(options, filter) {
        options = this._buildOptions(options, filter, ['member'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        });

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);

        const data = this._mapModelsToEvent('email_change_event', models, options);

        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options, filter) {
        options = this._buildOptions(options, filter, ['member', 'automatedEmail'], {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
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

        return {data, meta};
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