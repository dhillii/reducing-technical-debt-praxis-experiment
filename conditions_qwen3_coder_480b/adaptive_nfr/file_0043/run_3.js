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
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        // Changing this order might need a change in the query functions
        // because of the different underlying models.
        options.order = 'created_at desc, id desc';

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
            return this[page.action](options, otherFilter);
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
            ).slice(0, options.limit),
            meta: {
                pagination: {
                    limit: options.limit,
                    total: totalEvents,
                    pages: options.limit > 0 ? Math.ceil(totalEvents / options.limit) : null,

                    // Other values are unavailable (not possible to calculate easily)
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
        const preparedOptions = this.prepareNewsletterSubscriptionOptions(options, filter);
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(preparedOptions);
        const data = this.transformNewsletterSubscriptionData(models, options);
        return {data, meta};
    }

    prepareNewsletterSubscriptionOptions(options, filter) {
        return {
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
    }

    transformNewsletterSubscriptionData(models, options) {
        return models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON(options)
            };
        });
    }

    async getSubscriptionEvents(options, filter) {
        const preparedOptions = this.prepareSubscriptionOptions(options, filter);
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(preparedOptions);
        const data = this.transformSubscriptionData(models);
        return {data, meta};
    }

    prepareSubscriptionOptions(options, filter) {
        return {
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
    }

    transformSubscriptionData(models) {
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

    async getPaymentEvents(options, filter) {
        const preparedOptions = this.preparePaymentOptions(options, filter);
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(preparedOptions);
        const data = this.transformPaymentData(models, options);
        return {data, meta};
    }

    preparePaymentOptions(options, filter) {
        return {
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
    }

    transformPaymentData(models, options) {
        return models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON(options)
            };
        });
    }

    async getLoginEvents(options, filter) {
        const preparedOptions = this.prepareLoginOptions(options, filter);
        const {data: models, meta} = await this._MemberLoginEvent.findPage(preparedOptions);
        const data = this.transformLoginData(models, options);
        return {data, meta};
    }

    prepareLoginOptions(options, filter) {
        return {
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
    }

    transformLoginData(models, options) {
        return models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON(options)
            };
        });
    }

    async getSignupEvents(options, filter) {
        const preparedOptions = this.prepareSignupOptions(options, filter);
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(preparedOptions);
        const data = this.transformSignupData(models);
        return {data, meta};
    }

    prepareSignupOptions(options, filter) {
        return {
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
    }

    transformSignupData(models) {
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

    async getDonationEvents(options, filter) {
        const preparedOptions = this.prepareDonationOptions(options, filter);
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(preparedOptions);
        const data = this.transformDonationData(models);
        return {data, meta};
    }

    prepareDonationOptions(options, filter) {
        return {
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
    }

    transformDonationData(models) {
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

    async getCommentEvents(options, filter) {
        const preparedOptions = this.prepareCommentOptions(options, filter);
        const {data: models, meta} = await this._Comment.findPage(preparedOptions);
        const data = this.transformCommentData(models, options);
        return {data, meta};
    }

    prepareCommentOptions(options, filter) {
        return {
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
    }

    transformCommentData(models, options) {
        return models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON(options)
            };
        });
    }

    async getClickEvents(options, filter) {
        const preparedOptions = this.prepareClickOptions(options, filter);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(preparedOptions);
        const data = this.transformClickData(models, options);
        return {data, meta};
    }

    prepareClickOptions(options, filter) {
        return {
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
    }

    transformClickData(models, options) {
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
    async getAggregatedClickEvents(options, filter) {
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        filter = this.removePostIdFilter(otherFilter);
        const preparedOptions = this.prepareAggregatedClickOptions(options, filter, postId);
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(preparedOptions);
        const data = this.transformAggregatedClickData(models, options);
        return {data, meta};
    }

    prepareAggregatedClickOptions(options, filter, postId) {
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
                r.post_id = '${postId.toHexString()}'` :
            `SELECT
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

    transformAggregatedClickData(models, options) {
        return models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(options)
            };
        });
    }

    async getFeedbackEvents(options, filter) {
        const preparedOptions = this.prepareFeedbackOptions(options, filter);
        const {data: models, meta} = await this._MemberFeedback.findPage(preparedOptions);
        const data = this.transformFeedbackData(models, options);
        return {data, meta};
    }

    prepareFeedbackOptions(options, filter) {
        return {
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
    }

    transformFeedbackData(models, options) {
        return models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON(options)
            };
        });
    }

    async getEmailSentEvents(options, filter) {
        const preparedOptions = this.prepareEmailSentOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(preparedOptions);
        const data = this.transformEmailSentData(models);
        return {data, meta};
    }

    prepareEmailSentOptions(options, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const preparedOptions = {
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
        preparedOptions.order = preparedOptions.order.replace(/created_at/g, 'processed_at');
        return preparedOptions;
    }

    transformEmailSentData(models) {
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

    async getEmailDeliveredEvents(options, filter) {
        const preparedOptions = this.prepareEmailDeliveredOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(preparedOptions);
        const data = this.transformEmailDeliveredData(models);
        return {data, meta};
    }

    prepareEmailDeliveredOptions(options, filter) {
        const preparedOptions = {
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
        preparedOptions.order = preparedOptions.order.replace(/created_at/g, 'delivered_at');
        return preparedOptions;
    }

    transformEmailDeliveredData(models) {
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

    async getEmailOpenedEvents(options, filter) {
        const preparedOptions = this.prepareEmailOpenedOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(preparedOptions);
        const data = this.transformEmailOpenedData(models);
        return {data, meta};
    }

    prepareEmailOpenedOptions(options, filter) {
        const preparedOptions = {
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
        preparedOptions.order = preparedOptions.order.replace(/created_at/g, 'opened_at');
        return preparedOptions;
    }

    transformEmailOpenedData(models) {
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

    async getEmailSpamComplaintEvents(options, filter) {
        const preparedOptions = this.prepareEmailSpamComplaintOptions(options, filter);
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(preparedOptions);
        const data = this.transformEmailSpamComplaintData(models, options);
        return {data, meta};
    }

    prepareEmailSpamComplaintOptions(options, filter) {
        return {
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
    }

    transformEmailSpamComplaintData(models, options) {
        return models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON(options)
            };
        });
    }

    async getEmailFailedEvents(options, filter) {
        const preparedOptions = this.prepareEmailFailedOptions(options, filter);
        const {data: models, meta} = await this._EmailRecipient.findPage(preparedOptions);
        const data = this.transformEmailFailedData(models);
        return {data, meta};
    }

    prepareEmailFailedOptions(options, filter) {
        const preparedOptions = {
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
        preparedOptions.order = preparedOptions.order.replace(/created_at/g, 'failed_at');
        return preparedOptions;
    }

    transformEmailFailedData(models) {
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

    async getEmailChangeEvent(options, filter) {
        const preparedOptions = this.prepareEmailChangeOptions(options, filter);
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(preparedOptions);
        const data = this.transformEmailChangeData(models, options);
        return {data, meta};
    }

    prepareEmailChangeOptions(options, filter) {
        return {
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
    }

    transformEmailChangeData(models, options) {
        return models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON(options)
            };
        });
    }

    async getAutomatedEmailSentEvents(options, filter) {
        const preparedOptions = this.prepareAutomatedEmailSentOptions(options, filter);
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(preparedOptions);
        const data = this.transformAutomatedEmailSentData(models);
        return {data, meta};
    }

    prepareAutomatedEmailSentOptions(options, filter) {
        return {
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
    }

    transformAutomatedEmailSentData(models) {
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