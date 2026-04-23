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

    async getEventTimeline(options) {
        const defaultOptions = {
            limit: 10,
            order: 'created_at desc, id desc'
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        // Create a list of all events that can be queried
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

        //Filter events to query
        let filteredPages = pageActions;
        if (typeFilter) {
            // Ideally we should be able to create a NQL filter without having a string
            const query = new mingo.Query(typeFilter);
            filteredPages = filteredPages.filter(page => query.test(page));
        }

        //Start the promises
        const pages = filteredPages.map((page) => {
            return this[page.action](mergedOptions, otherFilter);
        });

        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: allEvents.sort(
                (a, b) => {
                    const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                    if (diff !== 0) {
                        return diff;
                    }
                    return b.data.id.localeCompare(a.data.id);
                }
            ).slice(0, mergedOptions.limit),
            meta: {
                pagination: {
                    limit: mergedOptions.limit,
                    total: totalEvents,
                    pages: mergedOptions.limit > 0 ? Math.ceil(totalEvents / mergedOptions.limit) : null,

                    // Other values are unavailable (not possible to calculate easily)
                    page: null,
                    next: null,
                    prev: null
                }
            }
        };
    }

    registerPayment(data) {
        return this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    getNewsletterSubscriptionEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'newsletter'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            })
        );

        const {data: models, meta} = this._MemberSubscribeEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getSubscriptionEvents(options, filter) {
        const defaultOptions = {
            withRelated: [
                'member',
                'subscriptionCreatedEvent.postAttribution',
                'subscriptionCreatedEvent.userAttribution',
                'subscriptionCreatedEvent.tagAttribution',
                'subscriptionCreatedEvent.memberCreatedEvent',

                // This is rediculous, but we need the tier name (we'll be able to shorten this later when we switch to the subscriptions table)
                'stripeSubscription.stripePrice.stripeProduct.product'
            ],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }),

            (f) => {
                // Special one: when data.post_id is used, replace it with two filters: subscriptionCreatedEvent.attribution_id:x+subscriptionCreatedEvent.attribution_type:post
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }]);
            }
        );

        const {data: models, meta} = this._MemberPaidSubscriptionEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            const tierName = model.related('stripeSubscription') && model.related('stripeSubscription').related('stripePrice') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

            // Prevent toJSON on stripeSubscription (we don't have everything loaded)
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(mergedOptions),
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

    getPaymentEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        );

        const {data: models, meta} = this._MemberPaymentEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getLoginEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        );

        const {data: models, meta} = this._MemberLoginEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getSignupEvents(options, filter) {
        const defaultOptions = {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            }),

            (f) => {
                // Special one: when data.post_id is used, replace it with two filters: attribution_id:x+attribution_type:post
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = this._MemberCreatedEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            const json = model.toJSON(mergedOptions);
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

    getDonationEvents(options, filter) {
        const defaultOptions = {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }),

            (f) => {
                // Special one: when data.post_id is used, replace it with two filters: attribution_id:x+attribution_type:post
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = this._DonationPaymentEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            const json = model.toJSON(mergedOptions);
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

    getCommentEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'post', 'parent'],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        );

        const {data: models, meta} = this._Comment.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getClickEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'link', 'link.post'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        );

        const {data: models, meta} = this._MemberLinkClickEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getPostIdFromFilter(filter) {
        let postIdString = '';

        if (filter && filter.$and) {
            // Case when there is an $and condition
            postIdString = filter.$and.find(condition => condition['data.post_id'])?.['data.post_id'];
        } else {
            // Case when there's no $and condition, directly look for data.post_id
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
    getAggregatedClickEvents(options, filter) {
        const postId = this.getPostIdFromFilter(filter);

        //Remove type filter as we don't need it in the query
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line

        filter = this.removePostIdFilter(otherFilter); //Remove post_id filter as we don't need it in the query

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
        const defaultOptions = {
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            useCTE: true,
            // We need to use MIN to make pagination work correctly
            // Note: we cannot do `count(distinct redirect_id) as count__clicks`, because we don't want the created_at filter to affect that count
            // For pagination to work correctly, we also need to return the id of the first event (or the minimum id if multiple events happend at the same time, but should be the first). Just MIN(id) won't work because that value changes if filter created_at < x is applied.
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

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        );

        const {data: models, meta} = this._MemberLinkClickEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getFeedbackEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'post'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        );

        const {data: models, meta} = this._MemberFeedback.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getEmailSentEvents(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: filterStr,
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        );
        mergedOptions.order = mergedOptions.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = this._EmailRecipient.findPage(
            mergedOptions
        );

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

    getEmailDeliveredEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'delivered_at:-null+custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        );
        mergedOptions.order = mergedOptions.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = this._EmailRecipient.findPage(
            mergedOptions
        );

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

    getEmailOpenedEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'opened_at:-null+custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        );
        mergedOptions.order = mergedOptions.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = this._EmailRecipient.findPage(
            mergedOptions
        );

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

    getEmailSpamComplaintEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        );

        const {data: models, meta} = this._EmailSpamComplaintEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getEmailFailedEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'failed_at:-null+custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        );
        mergedOptions.order = mergedOptions.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = this._EmailRecipient.findPage(
            mergedOptions
        );

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

    getEmailChangeEvent(options, filter) {
        const defaultOptions = {
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            // First set the filter manually
            replaceCustomFilterTransformer(filter),

            // Map the used keys in that filter
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        );

        const {data: models, meta} = this._MemberEmailChangeEvent.findPage(mergedOptions);

        const data = models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON(mergedOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getAutomatedEmailSentEvents(options, filter) {
        const defaultOptions = {
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            useBasicCount: true
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options
        };

        mergedOptions.mongoTransformer = chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys({
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        );

        const {data: models, meta} = this._AutomatedEmailRecipient.findPage(mergedOptions);

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