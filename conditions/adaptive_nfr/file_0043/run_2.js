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
     * Build the list of available page actions for event querying.
     * @private
     * @returns {Array} Array of page action objects with type and action properties
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
     * Add conditional page actions based on filter and available models.
     * @private
     * @param {Array} pageActions - The page actions array to extend
     * @param {Object} otherFilter - The filter object to check
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
     * Filter page actions based on type filter.
     * @private
     * @param {Array} pageActions - The page actions to filter
     * @param {Object} typeFilter - The type filter to apply
     * @returns {Array} Filtered page actions
     */
    _filterPageActionsByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Execute all event queries in parallel.
     * @private
     * @param {Array} filteredPages - The filtered page actions
     * @param {Object} options - Query options
     * @param {Object} otherFilter - The filter to apply
     * @returns {Promise<Array>} Array of event page results
     */
    async _executeEventQueries(filteredPages, options, otherFilter) {
        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        return Promise.all(pages);
    }

    /**
     * Flatten and sort all events from multiple pages.
     * @private
     * @param {Array} allEventPages - Array of event page results
     * @param {number} limit - Maximum number of events to return
     * @returns {Object} Sorted events and total count
     */
    _flattenAndSortEvents(allEventPages, limit) {
        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        const sortedEvents = allEvents.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        ).slice(0, limit);

        return {sortedEvents, totalEvents};
    }

    /**
     * Build pagination metadata.
     * @private
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

        const pageActions = this._buildPageActions();
        this._addConditionalPageActions(pageActions, otherFilter);

        const filteredPages = this._filterPageActionsByType(pageActions, typeFilter);

        const allEventPages = await this._executeEventQueries(filteredPages, options, otherFilter);

        const {sortedEvents, totalEvents} = this._flattenAndSortEvents(allEventPages, options.limit);

        return {
            events: sortedEvents,
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
     * Build standard mongo transformer options for event queries.
     * @private
     * @param {Object} filter - The filter to apply
     * @param {Object} keyMappings - Key mappings for the transformer
     * @returns {Object} Mongo transformer configuration
     */
    _buildMongoTransformer(filter, keyMappings) {
        return chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMappings)
        );
    }

    /**
     * Transform models to event data format.
     * @private
     * @param {Array} models - Models to transform
     * @param {string} eventType - The event type
     * @param {Object} options - Serialization options
     * @returns {Array} Transformed event data
     */
    _transformModelsToEvents(models, eventType, options) {
        return models.map((model) => {
            return {
                type: eventType,
                data: model.toJSON(options)
            };
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member', 'newsletter'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        const data = this._transformModelsToEvents(models, 'newsletter_event', options);

        return {data, meta};
    }

    /**
     * Extract tier name from subscription model relations.
     * @private
     * @param {Object} model - The subscription model
     * @returns {string|null} The tier name or null
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
     * Check if subscription is a signup event.
     * @private
     * @param {Object} model - The subscription model
     * @returns {boolean} True if this is a signup event
     */
    _isSignupEvent(model) {
        return model.get('type') === 'created' && 
               model.related('subscriptionCreatedEvent') && 
               model.related('subscriptionCreatedEvent').id && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && 
               model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id;
    }

    /**
     * Get attribution for subscription event.
     * @private
     * @param {Object} model - The subscription model
     * @returns {Object|null} Attribution data or null
     */
    _getSubscriptionAttribution(model) {
        if (model.get('type') === 'created' && 
            model.related('subscriptionCreatedEvent') && 
            model.related('subscriptionCreatedEvent').id) {
            return this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'));
        }
        return null;
    }

    /**
     * Transform subscription model to event data.
     * @private
     * @param {Object} model - The subscription model
     * @param {Object} options - Serialization options
     * @returns {Object} Transformed event data
     */
    _transformSubscriptionToEvent(model, options) {
        const tierName = this._extractTierName(model);
        delete model.relations.stripeSubscription;
        
        const d = {
            ...model.toJSON(options),
            attribution: this._getSubscriptionAttribution(model),
            signup: this._isSignupEvent(model),
            tierName
        };
        delete d.stripeSubscription;
        
        return {
            type: 'subscription_event',
            data: d
        };
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
        const data = models.map((model) => this._transformSubscriptionToEvent(model, options));

        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        const data = this._transformModelsToEvents(models, 'payment_event', options);

        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        options = {
            ...options,
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this._buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        const data = this._transformModelsToEvents(models, 'login_event', options);

        return {data, meta};
    }

    /**
     * Clean post attribution data by removing content fields.
     * @private
     * @param {Object} json - The JSON object to clean
     */
    _cleanPostAttributionData(json)