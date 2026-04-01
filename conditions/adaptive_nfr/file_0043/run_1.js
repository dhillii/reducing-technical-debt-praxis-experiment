```javascript
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
     * Build the list of available page actions for event querying
     * @param {string} otherFilter - The filter to check for post_id usage
     * @returns {Array} Array of page action objects with type and action properties
     */
    _buildPageActions(otherFilter) {
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

        return pageActions;
    }

    /**
     * Filter page actions based on type filter
     * @param {Array} pageActions - Array of page actions to filter
     * @param {Object} typeFilter - The type filter to apply
     * @returns {Array} Filtered page actions
     */
    _filterPageActions(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Execute all event queries in parallel
     * @param {Array} filteredPages - Array of page actions to execute
     * @param {Object} options - Query options
     * @param {Object} otherFilter - The filter to apply to queries
     * @returns {Promise<Array>} Array of event page results
     */
    async _executeEventQueries(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return Promise.all(pages);
    }

    /**
     * Flatten and aggregate event pages into a single sorted list
     * @param {Array} allEventPages - Array of event page results
     * @returns {Object} Object with events array and total count
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
     * Sort events by created_at and id
     * @param {Array} events - Events to sort
     * @returns {Array} Sorted events
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
     * Build pagination metadata
     * @param {number} limit - Page limit
     * @param {number} total - Total event count
     * @returns {Object} Pagination metadata
     */
    _buildPaginationMeta(limit, total) {
        return {
            limit,
            total,
            pages: limit > 0 ? Math.ceil(total / limit) : null,
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

        // Changing this order might need a change in the query functions
        // because of the different underlying models.
        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions(otherFilter);
        const filteredPages = this._filterPageActions(pageActions, typeFilter);
        const allEventPages = await this._executeEventQueries(filteredPages, options, otherFilter);
        const {allEvents, totalEvents} = this._aggregateEventPages(allEventPages);
        const sortedEvents = this._sortEvents(allEvents);

        return {
            events: sortedEvents.slice(0, options.limit),
            meta: {
                pagination: this._buildPaginationMeta(options.limit, totalEvents)
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
     * Build standard mongo transformer options for event queries
     * @param {Object} options - Base options
     * @param {Object} filter - Filter to apply
     * @param {Object} keyMappings - Key mappings for filter transformation
     * @returns {Object} Configured options object
     */
    _buildEventQueryOptions(options, filter, keyMappings) {
        return {
            ...options,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMappings)
            )
        };
    }

    /**
     * Map model to event data structure
     * @param {Object} model - Model instance
     * @param {string} eventType - Type of event
     * @param {Object} options - Query options
     * @returns {Object} Event data object
     */
    _mapModelToEvent(model, eventType, options) {
        return {
            type: eventType,
            data: model.toJSON(options)
        };
    }

    /**
     * Execute event query and map results
     * @param {Object} model - Model to query
     * @param {Object} options - Query options
     * @param {string} eventType - Type of event
     * @returns {Promise<Object>} Event data and metadata
     */
    async _executeEventQuery(model, options, eventType) {
        const {data: models, meta} = await model.findPage(options);
        const data = models.map((m) => this._mapModelToEvent(m, eventType, options));
        return {data, meta};
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const opts = this._buildEventQueryOptions(
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

        return this._executeEventQuery(this._MemberSubscribeEvent, opts, 'newsletter_event');
    }

    /**
     * Extract tier name from subscription model
     * @param {Object} model - Subscription model
     * @returns {string|null} Tier name or null
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
     * @param {Object} model - Subscription model
     * @returns {boolean} True if signup event
     */
    _isSignupEvent(model) {
        return model.get('type') === 'created' && 
               model.related('subscriptionCreatedEvent') && 
               model.related('subscriptionCreatedEvent').id;
    }

    /**
     * Get subscription attribution
     * @param {Object} model - Subscription model
     * @returns {Object|null} Attribution object or null
     */
    _getSubscriptionAttribution(model) {
        if (!this._isSignupEvent(model)) {
            return null;
        }
        return this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'));
    }

    /**
     * Check if subscription has member created event
     * @param {Object} model - Subscription model
     * @returns {boolean} True if has member created event
     */
    _hasSignupMemberCreatedEvent(model) {
        return model.get('type') === 'created' && 
               model.related('subscriptionCreatedEvent') && 
               model.related('subscriptionCreatedEvent').id && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id;
    }

    /**
     * Map subscription model to event data
     * @param {Object} model - Subscription model
     * @param {Object} options - Query options
     * @returns {Object} Event data object
     */
    _mapSubscriptionToEvent(model, options) {
        const tierName = this._extractTierName(model);
        delete model.relations.stripeSubscription;
        
        const d = {
            ...model.toJSON(options),
            attribution: this._getSubscriptionAttribution(model),
            signup: this._hasSignupMemberCreatedEvent(model),
            tierName
        };
        delete d.stripeSubscription;
        
        return {
            type: 'subscription_event',
            data: d
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        const opts = this._buildEventQueryOptions(
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
            }
        );

        opts.mongoTransformer = chainTransformers(
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

        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(opts);
        const data = models.map((model) => this._mapSubscriptionToEvent(model, opts));

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const opts = this._buildEventQueryOptions(
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

        return this._executeEventQuery(this._MemberPaymentEvent, opts, 'payment_event');
    }

    async getLoginEvents(options = {}, filter) {
        const opts = this._buildEventQueryOptions(
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

        return this._executeEventQuery(this._MemberLoginEvent, opts, 'login_event');
    }

    /**