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
     * Build the list of available page actions for event querying
     */
    _buildPageActions() {
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
     * Add non-post-filterable events to page actions
     */
    _addNonPostFilterableEvents(pageActions, otherFilter) {
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
    }

    /**
     * Add email recipient events to page actions
     */
    _addEmailRecipientEvents(pageActions) {
        if (this._EmailRecipient) {
            pageActions.push({type: 'email_sent_event', action: 'getEmailSentEvents'});
            pageActions.push({type: 'email_delivered_event', action: 'getEmailDeliveredEvents'});
            pageActions.push({type: 'email_opened_event', action: 'getEmailOpenedEvents'});
            pageActions.push({type: 'email_failed_event', action: 'getEmailFailedEvents'});
        }
    }

    /**
     * Add spam complaint and feedback events to page actions
     */
    _addComplaintAndFeedbackEvents(pageActions) {
        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }
    }

    /**
     * Filter page actions based on type filter
     */
    _filterPageActionsByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Execute all event queries in parallel
     */
    async _executeEventQueries(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return Promise.all(pages);
    }

    /**
     * Flatten and sort all events from multiple pages
     */
    _flattenAndSortEvents(allEventPages) {
        const allEvents = allEventPages.flatMap(page => page.data);
        return allEvents.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) {
                return diff;
            }
            return b.data.id.localeCompare(a.data.id);
        });
    }

    /**
     * Calculate pagination metadata
     */
    _calculatePaginationMeta(totalEvents, limit) {
        return {
            limit,
            total: totalEvents,
            pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,
            page: null,
            next: null,
            prev: null
        };
    }

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions();
        this._addNonPostFilterableEvents(pageActions, otherFilter);
        this._addEmailRecipientEvents(pageActions);
        this._addComplaintAndFeedbackEvents(pageActions);

        const filteredPages = this._filterPageActionsByType(pageActions, typeFilter);
        const allEventPages = await this._executeEventQueries(filteredPages, options, otherFilter);

        const sortedEvents = this._flattenAndSortEvents(allEventPages);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: sortedEvents.slice(0, options.limit),
            meta: {
                pagination: this._calculatePaginationMeta(totalEvents, options.limit)
            }
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    /**
     * Build standard mongo transformer options
     */
    _buildMongoTransformerOptions(filter, keyMappings) {
        return chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMappings)
        );
    }

    /**
     * Map model to event data structure
     */
    _mapModelToEvent(model, eventType, options) {
        return {
            type: eventType,
            data: model.toJSON(options)
        };
    }

    /**
     * Execute find page query and map results
     */
    async _executeFindPageAndMap(model, options, eventType) {
        const {data: models, meta} = await model.findPage(options);
        const data = models.map((m) => this._mapModelToEvent(m, eventType, options));
        return {data, meta};
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'newsletter'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            })
        };

        return this._executeFindPageAndMap(this._MemberSubscribeEvent, options, 'newsletter_event');
    }

    /**
     * Extract tier name from subscription model relations
     */
    _extractTierName(model) {
        return model.related('stripeSubscription') && 
               model.related('stripeSubscription').related('stripePrice') && 
               model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && 
               model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') 
            ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') 
            : null;
    }

    /**
     * Check if subscription is a signup event
     */
    _isSignupEvent(model) {
        return model.get('type') === 'created' && 
               model.related('subscriptionCreatedEvent') && 
               model.related('subscriptionCreatedEvent').id;
    }

    /**
     * Check if subscription has member created event
     */
    _hasMemberCreatedEvent(model) {
        return this._isSignupEvent(model) &&
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id;
    }

    /**
     * Build subscription event data
     */
    _buildSubscriptionEventData(model, options) {
        delete model.relations.stripeSubscription;
        const d = {
            ...model.toJSON(options),
            attribution: this._isSignupEvent(model) ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
            signup: this._hasMemberCreatedEvent(model),
            tierName: this._extractTierName(model)
        };
        delete d.stripeSubscription;
        return d;
    }

    async getSubscriptionEvents(options = {}, filter) {
        options = {
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
                (f) => {
                    return expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'subscriptionCreatedEvent.attribution_id',
                        expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                    }]);
                }
            )
        };

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);

        const data = models.map((model) => {
            return {
                type: 'subscription_event',
                data: this._buildSubscriptionEventData(model, options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getPaymentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        return this._executeFindPageAndMap(this._MemberPaymentEvent, options, 'payment_event');
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        return this._executeFindPageAndMap(this._MemberLoginEvent, options, 'login_event');
    }

    /**
     * Clean post attribution data
     */
    _cleanPostAttribution(json) {
        delete json.postAttribution?.mobiledoc;
        delete json.postAttribution?.lexical;
        delete json.postAttribution?.plaintext;
        return json;
    }

    async getSignupEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.source': 'source'
                }),
                (f) => {
                    return expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }]);
                }
            )
        };

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);

        const data = models.map((model) => {
            const json = this._cleanPostAttribution(model.toJSON(options));
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
        options = {
            ...options,
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => {
                    return expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }]);
                }
            )
        };

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);

        const data = models.map((model) => {
            const json = this._cleanPostAttribution(model.toJSON(options));
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
        options = {
            ...options,
            withRelated: ['member', 'post', 'parent'],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        };

        return this._executeFindPageAndMap(this._Comment, options, 'comment_event');
    }

    async getClickEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'link', 'link.post'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        };

        return this._executeFindPageAndMap(this._MemberLinkClickEvent, options, 'click_event');
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
     * Build CTE configuration for aggregated click events
     */
    _buildClickEventsCTE(postId) {
        const postClicksQuery = postId 
            ? `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id
                WHERE
                    r.post_id = '${postId.toHexString()}'`
            : `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id`;

        const firstClicksQuery = `
            SELECT
                id,
                member_id,
                redirect_id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM
                PostClicks`;

        return [
            {name: 'PostClicks', query: postClicksQuery},
            {name: 'FirstClicks', query: firstClicksQuery}
        ];
    }

    /**
     * Build select raw for aggregated click events
     */
    _buildClickEventsSelectRaw() {
        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
        return `id, member_id, created_at, (${mainQuery}) as count__clicks`;
    }

    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line
        filter = this.removePostIdFilter(otherFilter);

        options = {
            ...options,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }),
            useCTE: true,
            selectRaw: this._buildClickEventsSelectRaw(),
            whereRaw: 'rn = 1 ORDER BY created_at DESC, id DESC',
            cte: this._buildClickEventsCTE(postId),
            from: 'FirstClicks',
            order: ''
        };

        return this._executeFindPageAndMap(this._MemberLinkClickEvent, options, 'aggregated_click_event');
    }

    async getFeedbackEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'post'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        };

        return this._executeFindPageAndMap(this._MemberFeedback, options, 'feedback_event');
    }

    /**
     * Build email event data structure
     */
    _buildEmailEventData(model, eventType, createdAtField) {
        return {
            type: eventType,
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get(createdAtField),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        };
    }

    /**
     * Execute email event query with field mapping
     */
    async _executeEmailEventQuery(options, filter, filterStr, createdAtField, eventType) {
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: filterStr,
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': createdAtField,
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };
        options.order = options.order.replace(/created_at/g, createdAtField);

        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        const data = models.map((model) => this._buildEmailEventData(model, eventType, createdAtField));

        return {data, meta};
    }

    async getEmailSentEvents(options = {}, filter) {
        return this._executeEmailEventQuery(
            options,
            filter,
            'failed_at:null+processed_at:-null+delivered_at:null+custom:true',
            'processed_at',
            'email_sent_event'
        );
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        return this._executeEmailEventQuery(
            options,
            filter,
            'delivered_at:-null+custom:true',
            'delivered_at',
            'email_delivered_event'
        );
    }

    async getEmailOpenedEvents(options = {}, filter) {
        return this._executeEmailEventQuery(
            options,
            filter,
            'opened_at:-null+custom:true',
            'opened_at',
            'email_opened_event'
        );
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };

        return this._executeFindPageAndMap(this._EmailSpamComplaintEvent, options, 'email_complaint_event');
    }

    async getEmailFailedEvents(options = {}, filter) {
        return this._executeEmailEventQuery(
            options,
            filter,
            'failed_at:-null+custom:true',
            'failed_at',
            'email_failed_event'
        );
    }

    async getEmailChangeEvent(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        return this._executeFindPageAndMap(this._MemberEmailChangeEvent, options, 'email_change_event');
    }

    /**
     * Build automated email event data
     */
    _buildAutomatedEmailEventData(model) {
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
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformerOptions(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(options);
        const data = models.map((model) => this._buildAutomatedEmailEventData(model));

        return {data, meta};
    }

    /**
     * Validate filter keys against allowlist
     */
    _validateFilterKeys(keys) {
        const allowList = ['data.created_at', 'data.member_id', 'data.post_id', 'type', 'id'];
        for (const key of keys) {
            if (!allowList.includes(key)) {
                throw new errors.IncorrectUsageError({
                    message: 'Cannot filter by ' + key
                });
            }
        }
    }

    /**
     * Parse and validate NQL filter
     */
    _parseNQLFilter(filter) {
        try {
            return nql(filter).parse();
        } catch (e) {
            throw new errors.BadRequestError({
                message: e.message
            });
        }
    }

    /**
     * Split filter into type and other components
     */
    _splitFilterByType(parsed) {
        try {
            return splitFilter(parsed, ['type']);
        } catch (e) {
            throw new errors.IncorrectUsageError({
                message: e.message
            });
        }
    }

    getNQLSubset(filter) {
        if (!filter) {
            return [undefined, undefined];
        }

        const parsed = this._parseNQLFilter(filter);
        const keys = getUsedKeys(parsed);
        this._validateFilterKeys(keys);
        return this._splitFilterByType(parsed);
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

    /**
     * Accumulate MRR deltas by currency
     */
    _accumulateMRRByCurrency(resultsJSON) {
        return resultsJSON.reduce((accumulator, result) => {
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
    }

    async getMRR() {
        const results = await this._MemberPaidSubscriptionEvent.findAll({
            aggregateMRRDeltas: true
        });

        const resultsJSON = results.toJSON();
        return this._accumulateMRRByCurrency(resultsJSON);
    }

    /**
     * Accumulate status counts
     */
    _accumulateStatusCounts(resultsJSON) {
        return resultsJSON.reduce((accumulator, result, index) => {
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
    }

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({
            aggregateStatusCounts: true
        });

        const resultsJSON = results.toJSON();
        return this._accumulateStatusCounts(resultsJSON);
    }
};