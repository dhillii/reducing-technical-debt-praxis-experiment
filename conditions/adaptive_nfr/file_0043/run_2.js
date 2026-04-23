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
     * Builds the list of available page actions for event querying
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
     * Adds conditional page actions based on filter and available services
     */
    _addConditionalPageActions(pageActions, otherFilter) {
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
    }

    /**
     * Filters page actions based on type filter
     */
    _filterPageActionsByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Executes all event queries in parallel
     */
    async _executeEventQueries(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return Promise.all(pages);
    }

    /**
     * Aggregates event pages into a single sorted list
     */
    _aggregateEventPages(allEventPages) {
        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            allEvents,
            totalEvents
        };
    }

    /**
     * Sorts events by created_at and id
     */
    _sortEvents(events) {
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
    _buildPaginationMeta(limit, totalEvents) {
        return {
            pagination: {
                limit,
                total: totalEvents,
                pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,
                page: null,
                next: null,
                prev: null
            }
        };
    }

    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions();
        this._addConditionalPageActions(pageActions, otherFilter);

        const filteredPages = this._filterPageActionsByType(pageActions, typeFilter);
        const allEventPages = await this._executeEventQueries(filteredPages, options, otherFilter);

        const {allEvents, totalEvents} = this._aggregateEventPages(allEventPages);
        const sortedEvents = this._sortEvents(allEvents);

        return {
            events: sortedEvents.slice(0, options.limit),
            meta: this._buildPaginationMeta(options.limit, totalEvents)
        };
    }

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    /**
     * Builds standard options for event queries with mongo transformers
     */
    _buildEventQueryOptions(options, filter, withRelated, additionalFilter = '', keyMappings = {}) {
        return {
            ...options,
            withRelated,
            filter: additionalFilter ? `${additionalFilter}+custom:true` : 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMappings)
            )
        };
    }

    /**
     * Maps model data to event format
     */
    _mapModelToEvent(model, eventType, options, additionalData = {}) {
        return {
            type: eventType,
            data: {
                ...model.toJSON(options),
                ...additionalData
            }
        };
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'newsletter'],
            '',
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'newsletter_event', eventOptions);
        });

        return {data, meta};
    }

    /**
     * Extracts tier name from nested subscription relations
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
     * Determines if subscription is a signup event
     */
    _isSignupEvent(model) {
        return model.get('type') === 'created' && 
               model.related('subscriptionCreatedEvent') && 
               model.related('subscriptionCreatedEvent').id;
    }

    /**
     * Determines if subscription includes member creation
     */
    _hasCreatedMember(model) {
        return this._isSignupEvent(model) && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id;
    }

    /**
     * Builds subscription event data with attribution
     */
    _buildSubscriptionEventData(model, options) {
        const tierName = this._extractTierName(model);
        delete model.relations.stripeSubscription;

        const d = {
            ...model.toJSON(options),
            attribution: this._isSignupEvent(model) 
                ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                : null,
            signup: this._hasCreatedMember(model),
            tierName
        };
        delete d.stripeSubscription;
        return d;
    }

    async getSubscriptionEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
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
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        eventOptions.mongoTransformer = chainTransformers(
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
        );

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return {
                type: 'subscription_event',
                data: this._buildSubscriptionEventData(model, eventOptions)
            };
        });

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'payment_event', eventOptions);
        });

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberLoginEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'login_event', eventOptions);
        });

        return {data, meta};
    }

    /**
     * Removes content fields from post attribution
     */
    _cleanPostAttribution(json) {
        delete json.postAttribution?.mobiledoc;
        delete json.postAttribution?.lexical;
        delete json.postAttribution?.plaintext;
        return json;
    }

    async getSignupEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'subscriptionCreatedEvent.id:null',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            }
        );

        eventOptions.mongoTransformer = chainTransformers(
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
        );

        const {data: models, meta} = await this._MemberCreatedEvent.findPage(eventOptions);

        const data = models.map((model) => {
            const json = this._cleanPostAttribution(model.toJSON(eventOptions));
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

    async getDonationEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'member_id:-null',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        eventOptions.mongoTransformer = chainTransformers(
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
        );

        const {data: models, meta} = await this._DonationPaymentEvent.findPage(eventOptions);

        const data = models.map((model) => {
            const json = this._cleanPostAttribution(model.toJSON(eventOptions));
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

    async getCommentEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'post', 'parent'],
            'member_id:-null',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await this._Comment.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'comment_event', eventOptions);
        });

        return {data, meta};
    }

    async getClickEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'link', 'link.post'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'click_event', eventOptions);
        });

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
     * Builds SQL query for post clicks
     */
    _buildPostClicksQuery(postId) {
        const baseQuery = `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id`;

        if (postId) {
            return `${baseQuery}
                WHERE
                    r.post_id = '${postId.toHexString()}'`;
        }

        return baseQuery;
    }

    /**
     * Builds aggregated click events options
     */
    _buildAggregatedClickOptions(options, filter, postId) {
        const postClicksQuery = this._buildPostClicksQuery(postId);

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

        return {
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
    }

    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line
        const cleanedFilter = this.removePostIdFilter(otherFilter);

        const aggregatedOptions = this._buildAggregatedClickOptions(options, cleanedFilter, postId);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(aggregatedOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'aggregated_click_event', aggregatedOptions);
        });

        return {data, meta};
    }

    async getFeedbackEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'post'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await this._MemberFeedback.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'feedback_event', eventOptions);
        });

        return {data, meta};
    }

    /**
     * Builds email event data from model
     */
    _buildEmailEventData(model, eventType, dateField) {
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get(dateField),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        };
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'email'],
            '',
            {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        eventOptions.filter = filterStr;
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);

        const data = models.map((model) => {
            return {
                type: 'email_sent_event',
                data: this._buildEmailEventData(model, 'email_sent_event', 'processed_at')
            };
        });

        return {data, meta};
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'email'],
            'delivered_at:-null',
            {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);

        const data = models.map((model) => {
            return {
                type: 'email_delivered_event',
                data: this._buildEmailEventData(model, 'email_delivered_event', 'delivered_at')
            };
        });

        return {data, meta};
    }

    async getEmailOpenedEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'email'],
            'opened_at:-null',
            {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);

        const data = models.map((model) => {
            return {
                type: 'email_opened_event',
                data: this._buildEmailEventData(model, 'email_opened_event', 'opened_at')
            };
        });

        return {data, meta};
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'email'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'email_complaint_event', eventOptions);
        });

        return {data, meta};
    }

    async getEmailFailedEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'email'],
            'failed_at:-null',
            {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );
        eventOptions.order = eventOptions.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(eventOptions);

        const data = models.map((model) => {
            return {
                type: 'email_failed_event',
                data: this._buildEmailEventData(model, 'email_failed_event', 'failed_at')
            };
        });

        return {data, meta};
    }

    async getEmailChangeEvent(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(eventOptions);

        const data = models.map((model) => {
            return this._mapModelToEvent(model, 'email_change_event', eventOptions);
        });

        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const eventOptions = this._buildEventQueryOptions(
            options,
            filter,
            ['member', 'automatedEmail'],
            '',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(eventOptions);

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
     * Validates filter keys against allowlist
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
     * Parses NQL filter string
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
     * Splits filter into type and other components
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
     * Accumulates MRR deltas by currency
     */
    _accumulateMRRDeltas(resultsJSON) {
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
        return this._accumulateMRRDeltas(resultsJSON);
    }

    /**
     * Accumulates status count deltas
     */
    _accumulateStatusDeltas(resultsJSON) {
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
        return this._accumulateStatusDeltas(resultsJSON);
    }
};