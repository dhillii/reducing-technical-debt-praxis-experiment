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
        return await this._executeGetEventTimeline(options);
    }

    /**
     * @private
     * Orchestrates the retrieval of event timeline by delegating to specific event retrieval methods
     */
    async _executeGetEventTimeline(options) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';

        const pageActions = this._getPageActions(otherFilter);
        const filteredPages = this._filterPageActions(pageActions, typeFilter);
        const allEventPages = await this._fetchEventPages(filteredPages, options, otherFilter);
        const allEvents = this._processAllEvents(allEventPages, options.limit);

        return this._buildEventTimelineResponse(allEvents, allEventPages, options.limit);
    }

    /**
     * @private
     * Builds the list of available page actions based on filter conditions
     */
    _getPageActions(otherFilter) {
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
     * @private
     * Filters page actions based on type filter if present
     */
    _filterPageActions(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * @private
     * Fetches all event pages concurrently
     */
    async _fetchEventPages(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return await Promise.all(pages);
    }

    /**
     * @private
     * Processes and sorts all events from fetched pages
     */
    _processAllEvents(allEventPages, limit) {
        const allEvents = allEventPages.flatMap(page => page.data);
        
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

    /**
     * @private
     * Builds the final response object for event timeline
     */
    _buildEventTimelineResponse(allEvents, allEventPages, limit) {
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: allEvents,
            meta: {
                pagination: {
                    limit: limit,
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
        options = {
            ...options,
            withRelated: ['member', 'newsletter'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.source': 'source',
                    'data.member_id': 'member_id'
                })
            )
        };

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        const processedData = this._processNewsletterEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes newsletter subscription events for response formatting
     */
    _processNewsletterEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON(options)
            };
        });
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
        const processedData = this._processSubscriptionEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes subscription events for response formatting
     */
    _processSubscriptionEvents(models) {
        return models.map((model) => {
            const tierName = model.related('stripeSubscription') && 
                            model.related('stripeSubscription').related('stripePrice') && 
                            model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && 
                            model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') ? 
                                model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(),
                attribution: model.get('type') === 'created' && 
                            model.related('subscriptionCreatedEvent') && 
                            model.related('subscriptionCreatedEvent').id ? 
                                this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
                signup: model.get('type') === 'created' && 
                       model.related('subscriptionCreatedEvent') && 
                       model.related('subscriptionCreatedEvent').id && 
                       model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && 
                       model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id ? true : false,
                tierName
            };
            delete d.stripeSubscription;
            
            return {
                type: 'subscription_event',
                data: d
            };
        });
    }

    async getPaymentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        const processedData = this._processPaymentEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes payment events for response formatting
     */
    _processPaymentEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON(options)
            };
        });
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        const processedData = this._processLoginEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes login events for response formatting
     */
    _processLoginEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON(options)
            };
        });
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
        const processedData = this._processSignupEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes signup events for response formatting
     */
    _processSignupEvents(models) {
        return models.map((model) => {
            const json = model.toJSON();
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
        const processedData = this._processDonationEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes donation events for response formatting
     */
    _processDonationEvents(models) {
        return models.map((model) => {
            const json = model.toJSON();
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
    }

    async getCommentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'post', 'parent'],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            )
        };

        const {data: models, meta} = await this._Comment.findPage(options);
        const processedData = this._processCommentEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes comment events for response formatting
     */
    _processCommentEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON(options)
            };
        });
    }

    async getClickEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'link', 'link.post'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            )
        };

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);
        const processedData = this._processClickEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes click events for response formatting
     */
    _processClickEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON(options)
            };
        });
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
     * This groups click events per member for the same post, and only returns the first actual event, and includes the total clicks per event (for the same member and post)
     */
    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        filter = this.removePostIdFilter(otherFilter);

        const {query: postClicksQuery, mainQuery} = this._buildAggregatedClickQueries(postId);
        const firstClicksQuery = this._buildFirstClicksQuery();

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
        const processedData = this._processAggregatedClickEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Builds queries for aggregated click events
     */
    _buildAggregatedClickQueries(postId) {
        const postClicksQuery = postId ? 
            `SELECT
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
            ` :
            `SELECT
                mce.id,
                mce.member_id,
                mce.redirect_id,
                mce.created_at
            FROM
                members_click_events mce
            INNER JOIN
                redirects r ON mce.redirect_id = r.id
            `;

        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
            FROM PostClicks AS inner_mce
            WHERE inner_mce.member_id = FirstClicks.member_id
            AND inner_mce.redirect_id IN (
                SELECT redirect_id
                FROM PostClicks
            )`;

        return {query: postClicksQuery, mainQuery};
    }

    /**
     * @private
     * Builds first clicks query for aggregated events
     */
    _buildFirstClicksQuery() {
        return `SELECT
            id,
            member_id,
            redirect_id,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
        FROM
            PostClicks
        `;
    }

    /**
     * @private
     * Processes aggregated click events for response formatting
     */
    _processAggregatedClickEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(options)
            };
        });
    }

    async getFeedbackEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'post'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            )
        };

        const {data: models, meta} = await this._MemberFeedback.findPage(options);
        const processedData = this._processFeedbackEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes feedback events for response formatting
     */
    _processFeedbackEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON(options)
            };
        });
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: filterStr,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'processed_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        options.order = options.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        const processedData = this._processEmailSentEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes email sent events for response formatting
     */
    _processEmailSentEvents(models) {
        return models.map((model) => {
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
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'delivered_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'delivered_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        options.order = options.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        const processedData = this._processEmailDeliveredEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes email delivered events for response formatting
     */
    _processEmailDeliveredEvents(models) {
        return models.map((model) => {
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
    }

    async getEmailOpenedEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'opened_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'opened_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        options.order = options.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        const processedData = this._processEmailOpenedEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes email opened events for response formatting
     */
    _processEmailOpenedEvents(models) {
        return models.map((model) => {
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
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);
        const processedData = this._processEmailSpamComplaintEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes email spam complaint events for response formatting
     */
    _processEmailSpamComplaintEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON(options)
            };
        });
    }

    async getEmailFailedEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'failed_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'failed_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            )
        };
        options.order = options.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        const processedData = this._processEmailFailedEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes email failed events for response formatting
     */
    _processEmailFailedEvents(models) {
        return models.map((model) => {
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
    }

    async getEmailChangeEvent(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);
        const processedData = this._processEmailChangeEvents(models, options);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes email change events for response formatting
     */
    _processEmailChangeEvents(models, options) {
        return models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON(options)
            };
        });
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(options);
        const processedData = this._processAutomatedEmailSentEvents(models);

        return {
            data: processedData,
            meta
        };
    }

    /**
     * @private
     * Processes automated email sent events for response formatting
     */
    _processAutomatedEmailSentEvents(models) {
        return models.map((model) => {
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
        return this._calculateCumulativeMRR(resultsJSON);
    }

    /**
     * @private
     * Calculates cumulative MRR from raw results
     */
    _calculateCumulativeMRR(resultsJSON) {
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

    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({
            aggregateStatusCounts: true
        });

        const resultsJSON = results.toJSON();
        return this._calculateCumulativeStatuses(resultsJSON);
    }

    /**
     * @private
     * Calculates cumulative statuses from raw results
     */
    _calculateCumulativeStatuses(resultsJSON) {
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
};