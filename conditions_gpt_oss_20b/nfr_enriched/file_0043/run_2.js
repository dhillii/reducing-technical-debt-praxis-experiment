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
 * Replaces the provided filter with a custom filter for mongo queries.
 * @param {Object} filter - The custom filter to apply.
 * @returns {Function} A transformer function for mongo queries.
 */
function replaceCustomFilterTransformer(filter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {custom: filter});
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
     * Builds a standard options object for event queries.
     * @private
     * @param {Object} baseOptions - Base options to merge.
     * @param {Object} filter - Custom filter for mongo queries.
     * @param {Array<string>} related - Relations to include.
     * @param {Array<Function>} transformers - Mongo transformers.
     * @returns {Object} The constructed options object.
     */
    _buildOptions(baseOptions, filter, related, transformers) {
        return {
            ...baseOptions,
            withRelated: related,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...transformers
            )
        };
    }

    /**
     * Executes a findPage query on the provided model and maps the results.
     * @private
     * @param {Object} model - The model to query.
     * @param {Object} options - Base options for the query.
     * @param {Object} filter - Custom filter for mongo queries.
     * @param {Array<string>} related - Relations to include.
     * @param {Array<Function>} transformers - Mongo transformers.
     * @param {Function} mapFn - Function to map each model to event data.
     * @returns {Promise<Object>} The event page with data and meta.
     */
    async _fetchEventPage(model, options, filter, related, transformers, mapFn) {
        const opts = this._buildOptions(options, filter, related, transformers);
        const {data: models, meta} = await model.findPage(opts);
        const data = models.map(mapFn);
        return {data, meta};
    }

    /**
     * Constructs the list of page actions for the event timeline.
     * @private
     * @param {Object} options - Base options for the query.
     * @param {Object} otherFilter - Filter to apply to each page.
     * @returns {Array<Object>} Array of page action descriptors.
     */
    _buildPageActions(options, otherFilter) {
        const actions = [
            {
                type: 'comment_event',
                action: 'getCommentEvents',
                related: ['member', 'post', 'parent'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'comment_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'click_event',
                action: 'getClickEvents',
                related: ['member', 'link', 'link.post'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'click_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'aggregated_click_event',
                action: 'getAggregatedClickEvents',
                related: ['member'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'aggregated_click_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'signup_event',
                action: 'getSignupEvents',
                related: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.source': 'source'
                    }),
                    (f) => expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }])
                ],
                mapFn: (model) => {
                    const json = model.toJSON(options);
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
                }
            },
            {
                type: 'donation_event',
                action: 'getDonationEvents',
                related: ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    }),
                    (f) => expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'attribution_id',
                        expansion: {attribution_type: 'post'}
                    }])
                ],
                mapFn: (model) => {
                    const json = model.toJSON(options);
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
                }
            },
            {
                type: 'subscription_event',
                action: 'getSubscriptionEvents',
                related: [
                    'member',
                    'subscriptionCreatedEvent.postAttribution',
                    'subscriptionCreatedEvent.userAttribution',
                    'subscriptionCreatedEvent.tagAttribution',
                    'subscriptionCreatedEvent.memberCreatedEvent',
                    'stripeSubscription.stripePrice.stripeProduct.product'
                ],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    }),
                    (f) => expandFilters(f, [{
                        key: 'data.post_id',
                        replacement: 'subscriptionCreatedEvent.attribution_id',
                        expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                    }])
                ],
                mapFn: (model) => {
                    const tierName = model.related('stripeSubscription')
                        ?.related('stripePrice')
                        ?.related('stripeProduct')
                        ?.related('product')
                        ?.get('name') ?? null;
                    delete model.relations.stripeSubscription;
                    const d = {
                        ...model.toJSON(options),
                        attribution: model.get('type') === 'created' &&
                            model.related('subscriptionCreatedEvent') &&
                            model.related('subscriptionCreatedEvent').id
                            ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                            : null,
                        signup: model.get('type') === 'created' &&
                            model.related('subscriptionCreatedEvent') &&
                            model.related('subscriptionCreatedEvent').id &&
                            model.related('subscriptionCreatedEvent').related('memberCreatedEvent') &&
                            model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id
                            ? true
                            : false,
                        tierName
                    };
                    delete d.stripeSubscription;
                    return {
                        type: 'subscription_event',
                        data: d
                    };
                }
            },
            {
                type: 'payment_event',
                action: 'getPaymentEvents',
                related: ['member'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'payment_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'login_event',
                action: 'getLoginEvents',
                related: ['member'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'login_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'newsletter_event',
                action: 'getNewsletterSubscriptionEvents',
                related: ['member', 'newsletter'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.source': 'source',
                        'data.member_id': 'member_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'newsletter_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'email_sent_event',
                action: 'getEmailSentEvents',
                related: ['member', 'email'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'processed_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'email_sent_event',
                    data: {
                        id: model.id,
                        member_id: model.get('member_id'),
                        created_at: model.get('processed_at'),
                        member: model.related('member').toJSON(),
                        email: model.related('email').toJSON()
                    }
                })
            },
            {
                type: 'email_delivered_event',
                action: 'getEmailDeliveredEvents',
                related: ['member', 'email'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'delivered_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'email_delivered_event',
                    data: {
                        id: model.id,
                        member_id: model.get('member_id'),
                        created_at: model.get('delivered_at'),
                        member: model.related('member').toJSON(),
                        email: model.related('email').toJSON()
                    }
                })
            },
            {
                type: 'email_opened_event',
                action: 'getEmailOpenedEvents',
                related: ['member', 'email'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'opened_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'email_opened_event',
                    data: {
                        id: model.id,
                        member_id: model.get('member_id'),
                        created_at: model.get('opened_at'),
                        member: model.related('member').toJSON(),
                        email: model.related('email').toJSON()
                    }
                })
            },
            {
                type: 'email_complaint_event',
                action: 'getEmailSpamComplaintEvents',
                related: ['member', 'email'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'email_complaint_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'email_failed_event',
                action: 'getEmailFailedEvents',
                related: ['member', 'email'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'failed_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'email_failed_event',
                    data: {
                        id: model.id,
                        member_id: model.get('member_id'),
                        created_at: model.get('failed_at'),
                        member: model.related('member').toJSON(),
                        email: model.related('email').toJSON()
                    }
                })
            },
            {
                type: 'email_change_event',
                action: 'getEmailChangeEvent',
                related: ['member'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'email_change_event',
                    data: model.toJSON(options)
                })
            },
            {
                type: 'automated_email_sent_event',
                action: 'getAutomatedEmailSentEvents',
                related: ['member', 'automatedEmail'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    })
                ],
                mapFn: (model) => {
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
            },
            {
                type: 'feedback_event',
                action: 'getFeedbackEvents',
                related: ['member', 'post'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'feedback_event',
                    data: model.toJSON(options)
                })
            }
        ];

        // Conditional actions
        if (!getUsedKeys(otherFilter).includes('data.post_id')) {
            actions.push(
                {
                    type: 'newsletter_event',
                    action: 'getNewsletterSubscriptionEvents',
                    related: ['member', 'newsletter'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'created_at',
                            'data.source': 'source',
                            'data.member_id': 'member_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'newsletter_event',
                        data: model.toJSON(options)
                    })
                },
                {
                    type: 'login_event',
                    action: 'getLoginEvents',
                    related: ['member'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'created_at',
                            'data.member_id': 'member_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'login_event',
                        data: model.toJSON(options)
                    })
                },
                {
                    type: 'payment_event',
                    action: 'getPaymentEvents',
                    related: ['member'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'created_at',
                            'data.member_id': 'member_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'payment_event',
                        data: model.toJSON(options)
                    })
                },
                {
                    type: 'email_change_event',
                    action: 'getEmailChangeEvent',
                    related: ['member'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'created_at',
                            'data.member_id': 'member_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'email_change_event',
                        data: model.toJSON(options)
                    })
                }
            );

            if (this._AutomatedEmailRecipient) {
                actions.push({
                    type: 'automated_email_sent_event',
                    action: 'getAutomatedEmailSentEvents',
                    related: ['member', 'automatedEmail'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'created_at',
                            'data.member_id': 'member_id'
                        })
                    ],
                    mapFn: (model) => {
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
                });
            }
        }

        if (this._EmailRecipient) {
            actions.push(
                {
                    type: 'email_sent_event',
                    action: 'getEmailSentEvents',
                    related: ['member', 'email'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'processed_at',
                            'data.member_id': 'member_id',
                            'data.post_id': 'email.post_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'email_sent_event',
                        data: {
                            id: model.id,
                            member_id: model.get('member_id'),
                            created_at: model.get('processed_at'),
                            member: model.related('member').toJSON(),
                            email: model.related('email').toJSON()
                        }
                    })
                },
                {
                    type: 'email_delivered_event',
                    action: 'getEmailDeliveredEvents',
                    related: ['member', 'email'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'delivered_at',
                            'data.member_id': 'member_id',
                            'data.post_id': 'email.post_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'email_delivered_event',
                        data: {
                            id: model.id,
                            member_id: model.get('member_id'),
                            created_at: model.get('delivered_at'),
                            member: model.related('member').toJSON(),
                            email: model.related('email').toJSON()
                        }
                    })
                },
                {
                    type: 'email_opened_event',
                    action: 'getEmailOpenedEvents',
                    related: ['member', 'email'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'opened_at',
                            'data.member_id': 'member_id',
                            'data.post_id': 'email.post_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'email_opened_event',
                        data: {
                            id: model.id,
                            member_id: model.get('member_id'),
                            created_at: model.get('opened_at'),
                            member: model.related('member').toJSON(),
                            email: model.related('email').toJSON()
                        }
                    })
                },
                {
                    type: 'email_failed_event',
                    action: 'getEmailFailedEvents',
                    related: ['member', 'email'],
                    transformers: [
                        ...mapKeys({
                            'data.created_at': 'failed_at',
                            'data.member_id': 'member_id',
                            'data.post_id': 'email.post_id'
                        })
                    ],
                    mapFn: (model) => ({
                        type: 'email_failed_event',
                        data: {
                            id: model.id,
                            member_id: model.get('member_id'),
                            created_at: model.get('failed_at'),
                            member: model.related('member').toJSON(),
                            email: model.related('email').toJSON()
                        }
                    })
                }
            );
        }

        actions.push({
            type: 'email_complained_event',
            action: 'getEmailSpamComplaintEvents',
            related: ['member', 'email'],
            transformers: [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'email.post_id'
                })
            ],
            mapFn: (model) => ({
                type: 'email_complaint_event',
                data: model.toJSON(options)
            })
        });

        if (this._labsService.isSet('audienceFeedback')) {
            actions.push({
                type: 'feedback_event',
                action: 'getFeedbackEvents',
                related: ['member', 'post'],
                transformers: [
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                ],
                mapFn: (model) => ({
                    type: 'feedback_event',
                    data: model.toJSON(options)
                })
            });
        }

        return actions;
    }

    /**
     * Retrieves the event timeline with pagination.
     * @param {Object} options - Query options.
     * @returns {Promise<Object>} Timeline data and metadata.
     */
    async getEventTimeline(options) {
        if (!options) options = {};
        if (!options.limit) options.limit = 10;
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options.order = 'created_at desc, id desc';
        const pageActions = this._buildPageActions(options, otherFilter);
        let filteredPages = pageActions;
        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            filteredPages = filteredPages.filter(page => query.test(page));
        }
        const pages = filteredPages.map(page => this._fetchEventPage(
            this[page.action],
            options,
            otherFilter,
            page.related,
            page.transformers,
            page.mapFn
        ));
        const allEventPages = await Promise.all(pages);
        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((acc, page) => acc + page.meta.pagination.total, 0);
        const sortedEvents = allEvents.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) return diff;
            return b.data.id.localeCompare(a.data.id);
        }).slice(0, options.limit);
        return {
            events: sortedEvents,
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
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberSubscribeEvent,
            options,
            filter,
            ['member', 'newsletter'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.source': 'source',
                    'data.member_id': 'member_id'
                })
            ],
            (model) => ({
                type: 'newsletter_event',
                data: model.toJSON(options)
            })
        );
    }

    async getSubscriptionEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberPaidSubscriptionEvent,
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
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            ],
            (model) => {
                const tierName = model.related('stripeSubscription')
                    ?.related('stripePrice')
                    ?.related('stripeProduct')
                    ?.related('product')
                    ?.get('name') ?? null;
                delete model.relations.stripeSubscription;
                const d = {
                    ...model.toJSON(options),
                    attribution: model.get('type') === 'created' &&
                        model.related('subscriptionCreatedEvent') &&
                        model.related('subscriptionCreatedEvent').id
                        ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'))
                        : null,
                    signup: model.get('type') === 'created' &&
                        model.related('subscriptionCreatedEvent') &&
                        model.related('subscriptionCreatedEvent').id &&
                        model.related('subscriptionCreatedEvent').related('memberCreatedEvent') &&
                        model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id
                        ? true
                        : false,
                    tierName
                };
                delete d.stripeSubscription;
                return {
                    type: 'subscription_event',
                    data: d
                };
            }
        );
    }

    async getPaymentEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberPaymentEvent,
            options,
            filter,
            ['member'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ],
            (model) => ({
                type: 'payment_event',
                data: model.toJSON(options)
            })
        );
    }

    async getLoginEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberLoginEvent,
            options,
            filter,
            ['member'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ],
            (model) => ({
                type: 'login_event',
                data: model.toJSON(options)
            })
        );
    }

    async getSignupEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberCreatedEvent,
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.source': 'source'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            ],
            (model) => {
                const json = model.toJSON(options);
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
            }
        );
    }

    async getDonationEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._DonationPaymentEvent,
            options,
            filter,
            ['member', 'postAttribution', 'userAttribution', 'tagAttribution'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                }),
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            ],
            (model) => {
                const json = model.toJSON(options);
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
            }
        );
    }

    async getCommentEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._Comment,
            options,
            filter,
            ['member', 'post', 'parent'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ],
            (model) => ({
                type: 'comment_event',
                data: model.toJSON(options)
            })
        );
    }

    async getClickEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberLinkClickEvent,
            options,
            filter,
            ['member', 'link', 'link.post'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ],
            (model) => ({
                type: 'click_event',
                data: model.toJSON(options)
            })
        );
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
        if (!options) options = {};
        const postId = this.getPostIdFromFilter(filter);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line
        filter = this.removePostIdFilter(otherFilter);
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
            cte: [
                {name: `PostClicks`, query: postClicksQuery},
                {name: `FirstClicks`, query: firstClicksQuery}
            ],
            from: 'FirstClicks',
            order: ''
        };
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);
        const data = models.map((model) => ({
            type: 'aggregated_click_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getFeedbackEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberFeedback,
            options,
            filter,
            ['member', 'post'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ],
            (model) => ({
                type: 'feedback_event',
                data: model.toJSON(options)
            })
        );
    }

    async getEmailSentEvents(options, filter) {
        if (!options) options = {};
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
        const data = models.map((model) => ({
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
        if (!options) options = {};
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
        const data = models.map((model) => ({
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
        if (!options) options = {};
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
        const data = models.map((model) => ({
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
        if (!options) options = {};
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
        const data = models.map((model) => ({
            type: 'email_complaint_event',
            data: model.toJSON(options)
        }));
        return {data, meta};
    }

    async getEmailFailedEvents(options, filter) {
        if (!options) options = {};
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
        const data = models.map((model) => ({
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
        if (!options) options = {};
        return this._fetchEventPage(
            this._MemberEmailChangeEvent,
            options,
            filter,
            ['member'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ],
            (model) => ({
                type: 'email_change_event',
                data: model.toJSON(options)
            })
        );
    }

    async getAutomatedEmailSentEvents(options, filter) {
        if (!options) options = {};
        return this._fetchEventPage(
            this._AutomatedEmailRecipient,
            options,
            filter,
            ['member', 'automatedEmail'],
            [
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            ],
            (model) => {
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
        );
    }

    /**
     * Splits the filter into type and other parts.
     * @param {string} filter - NQL filter string.
     * @returns {[Object, Object]} [typeFilter, otherFilter]
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
            throw new errors.BadRequestError({message: e.message});
        }
        const keys = getUsedKeys(parsed);
        for (const key of keys) {
            if (!allowList.includes(key)) {
                throw new errors.IncorrectUsageError({message: 'Cannot filter by ' + key});
            }
        }
        try {
            return splitFilter(parsed, ['type']);
        } catch (e) {
            throw new errors.IncorrectUsageError({message: e.message});
        }
    }

    /**
     * Removes the post_id filter from a mongo filter.
     * @param {Object} filter - Mongo filter.
     * @returns {Object} Filter without post_id.
     */
    removePostIdFilter(filter) {
        if (!filter) {
            return filter;
        }
        try {
            return rejectStatements(filter, key => key === 'data.post_id');
        } catch (e) {
            throw new errors.IncorrectUsageError({message: e.message});
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