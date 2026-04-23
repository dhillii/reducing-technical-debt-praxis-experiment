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

    async getEventTimeline(options = {}) {
        const limit = this._getLimit(options);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        const order = 'created_at desc, id desc';
        const pageActions = this._buildPageActions(typeFilter, otherFilter);

        const pages = await this._fetchAllPages(pageActions, options, otherFilter);
        const allEvents = this._flattenEvents(pages);
        const totalEvents = this._calculateTotalEvents(pages);

        const sortedEvents = this._sortEvents(allEvents, order);
        const paginatedEvents = this._applyPagination(sortedEvents, limit);

        return {
            events: paginatedEvents,
            meta: this._buildPaginationMeta(limit, totalEvents)
        };
    }

    _getLimit(options) {
        if (!options.limit) {
            return 10;
        }
        return options.limit;
    }

    _buildPageActions(typeFilter, otherFilter) {
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

        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            return pageActions.filter(page => query.test(page));
        }

        return pageActions;
    }

    async _fetchAllPages(pageActions, options, otherFilter) {
        const pages = await Promise.all(pageActions.map((page) => {
            return this[page.action](options, otherFilter);
        }));
        return pages;
    }

    _flattenEvents(pages) {
        return pages.flatMap(page => page.data);
    }

    _calculateTotalEvents(pages) {
        return pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);
    }

    _sortEvents(events, order) {
        return events.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        );
    }

    _applyPagination(events, limit) {
        return events.slice(0, limit);
    }

    _buildPaginationMeta(limit, total) {
        return {
            pagination: {
                limit: limit,
                total: total,
                pages: limit > 0 ? Math.ceil(total / limit) : null,
                page: null,
                next: null,
                prev: null
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
        const optionsWithDefaults = this._buildEventOptions(options, filter, 'newsletter_subscription');
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(optionsWithDefaults);
        const data = this._mapNewsletterEvents(models);
        return {data, meta};
    }

    _buildEventOptions(options, filter, eventPrefix) {
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
        return options;
    }

    _mapNewsletterEvents(models) {
        return models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON()
            };
        });
    }

    async getSubscriptionEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildSubscriptionOptions(options, filter);
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(optionsWithDefaults);
        const data = this._mapSubscriptionEvents(models);
        return {data, meta};
    }

    _buildSubscriptionOptions(options, filter) {
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
        return options;
    }

    _mapSubscriptionEvents(models) {
        return models.map((model) => {
            const tierName = this._getTierName(model);
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(),
                attribution: this._getEventAttribution(model),
                signup: this._isSignup(model),
                tierName
            };
            delete d.stripeSubscription;
            return {
                type: 'subscription_event',
                data: d
            };
        });
    }

    _getTierName(model) {
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

    _getEventAttribution(model) {
        const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
        if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
            return null;
        }
        return this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent);
    }

    _isSignup(model) {
        const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
        if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
            return false;
        }
        const memberCreatedEvent = subscriptionCreatedEvent.related('memberCreatedEvent');
        if (!memberCreatedEvent || !memberCreatedEvent.id) {
            return false;
        }
        return true;
    }

    async getPaymentEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildPaymentOptions(options, filter);
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(optionsWithDefaults);
        const data = this._mapPaymentEvents(models);
        return {data, meta};
    }

    _buildPaymentOptions(options, filter) {
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
        return options;
    }

    _mapPaymentEvents(models) {
        return models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON()
            };
        });
    }

    async getLoginEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildLoginOptions(options, filter);
        const {data: models, meta} = await this._MemberLoginEvent.findPage(optionsWithDefaults);
        const data = this._mapLoginEvents(models);
        return {data, meta};
    }

    _buildLoginOptions(options, filter) {
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
        return options;
    }

    _mapLoginEvents(models) {
        return models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON()
            };
        });
    }

    async getSignupEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildSignupOptions(options, filter);
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(optionsWithDefaults);
        const data = this._mapSignupEvents(models);
        return {data, meta};
    }

    _buildSignupOptions(options, filter) {
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
        return options;
    }

    _mapSignupEvents(models) {
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
        const optionsWithDefaults = this._buildDonationOptions(options, filter);
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(optionsWithDefaults);
        const data = this._mapDonationEvents(models);
        return {data, meta};
    }

    _buildDonationOptions(options, filter) {
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
        return options;
    }

    _mapDonationEvents(models) {
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
        const optionsWithDefaults = this._buildCommentOptions(options, filter);
        const {data: models, meta} = await this._Comment.findPage(optionsWithDefaults);
        const data = this._mapCommentEvents(models);
        return {data, meta};
    }

    _buildCommentOptions(options, filter) {
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
        return options;
    }

    _mapCommentEvents(models) {
        return models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON()
            };
        });
    }

    async getClickEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildClickOptions(options, filter);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(optionsWithDefaults);
        const data = this._mapClickEvents(models);
        return {data, meta};
    }

    _buildClickOptions(options, filter) {
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
        return options;
    }

    _mapClickEvents(models) {
        return models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON()
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

    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        filter = this.removePostIdFilter(otherFilter);
        const postClicksQuery = this._buildPostClicksQuery(postId);
        const firstClicksQuery = this._buildFirstClicksQuery();
        const mainQuery = this._buildMainQuery();
        const optionsWithDefaults = this._buildAggregatedClickOptions(options, filter, postClicksQuery, firstClicksQuery, mainQuery);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(optionsWithDefaults);
        const data = this._mapAggregatedClickEvents(models);
        return {data, meta};
    }

    _buildPostClicksQuery(postId) {
        if (postId) {
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

    _buildFirstClicksQuery() {
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

    _buildMainQuery() {
        return `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
    }

    _buildAggregatedClickOptions(options, filter, postClicksQuery, firstClicksQuery, mainQuery) {
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
        return options;
    }

    _mapAggregatedClickEvents(models) {
        return models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON()
            };
        });
    }

    async getFeedbackEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildFeedbackOptions(options, filter);
        const {data: models, meta} = await this._MemberFeedback.findPage(optionsWithDefaults);
        const data = this._mapFeedbackEvents(models);
        return {data, meta};
    }

    _buildFeedbackOptions(options, filter) {
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
        return options;
    }

    _mapFeedbackEvents(models) {
        return models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON()
            };
        });
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const optionsWithDefaults = this._buildEmailSentOptions(options, filter, filterStr);
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this._mapEmailSentEvents(models);
        return {data, meta};
    }

    _buildEmailSentOptions(options, filter, filterStr) {
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
        return options;
    }

    _mapEmailSentEvents(models) {
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
        const optionsWithDefaults = this._buildEmailDeliveredOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this._mapEmailDeliveredEvents(models);
        return {data, meta};
    }

    _buildEmailDeliveredOptions(options, filter) {
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
        return options;
    }

    _mapEmailDeliveredEvents(models) {
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
        const optionsWithDefaults = this._buildEmailOpenedOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this._mapEmailOpenedEvents(models);
        return {data, meta};
    }

    _buildEmailOpenedOptions(options, filter) {
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
        return options;
    }

    _mapEmailOpenedEvents(models) {
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
        const optionsWithDefaults = this._buildEmailSpamComplaintOptions(options, filter);
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(optionsWithDefaults);
        const data = this._mapEmailSpamComplaintEvents(models);
        return {data, meta};
    }

    _buildEmailSpamComplaintOptions(options, filter) {
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
        return options;
    }

    _mapEmailSpamComplaintEvents(models) {
        return models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON()
            };
        });
    }

    async getEmailFailedEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildEmailFailedOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this._mapEmailFailedEvents(models);
        return {data, meta};
    }

    _buildEmailFailedOptions(options, filter) {
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
        return options;
    }

    _mapEmailFailedEvents(models) {
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
        const optionsWithDefaults = this._buildEmailChangeOptions(options, filter);
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(optionsWithDefaults);
        const data = this._mapEmailChangeEvents(models);
        return {data, meta};
    }

    _buildEmailChangeOptions(options, filter) {
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
        return options;
    }

    _mapEmailChangeEvents(models) {
        return models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON()
            };
        });
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const optionsWithDefaults = this._buildAutomatedEmailOptions(options, filter);
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(optionsWithDefaults);
        const data = this._mapAutomatedEmailEvents(models);
        return {data, meta};
    }

    _buildAutomatedEmailOptions(options, filter) {
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
        return options;
    }

    _mapAutomatedEmailEvents(models) {
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