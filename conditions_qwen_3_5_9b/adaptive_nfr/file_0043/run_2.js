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
        const defaultLimit = 10;
        const effectiveLimit = options.limit || defaultLimit;

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        const defaultOrder = 'created_at desc, id desc';
        options.order = defaultOrder;

        const pageActions = this.buildPageActions(typeFilter, otherFilter);

        const pages = await this.executePageActions(pageActions, options, otherFilter);

        const allEvents = this.mergeAndSortEvents(pages, effectiveLimit);
        const totalEvents = this.calculateTotalEvents(pages);

        return this.buildTimelineResponse(allEvents, totalEvents, effectiveLimit);
    }

    buildPageActions(typeFilter, otherFilter) {
        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        const hasPostIdFilter = getUsedKeys(otherFilter).includes('data.post_id');

        if (!hasPostIdFilter) {
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

    async executePageActions(pageActions, options, otherFilter) {
        const pages = await Promise.all(pageActions.map((page) => {
            return this[page.action](options, otherFilter);
        }));

        return pages;
    }

    mergeAndSortEvents(pages, limit) {
        const allEvents = pages.flatMap(page => page.data);
        const sortedEvents = allEvents.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        );

        return sortedEvents.slice(0, limit);
    }

    calculateTotalEvents(pages) {
        return pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);
    }

    buildTimelineResponse(events, total, limit) {
        return {
            events,
            meta: {
                pagination: {
                    limit,
                    total,
                    pages: limit > 0 ? Math.ceil(total / limit) : null,
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
        const configuredOptions = this.buildEventOptions(
            this._MemberSubscribeEvent,
            options,
            filter,
            ['member', 'newsletter'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getSubscriptionEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
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
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }]);
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            const tierName = this.extractTierName(model);

            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(options),
                attribution: this.getEventAttribution(model),
                signup: this.isSignup(model),
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

    extractTierName(model) {
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

    isSignup(model) {
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

    getEventAttribution(model) {
        const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
        if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
            return null;
        }

        return this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent);
    }

    async getPaymentEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._MemberPaymentEvent,
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getLoginEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._MemberLoginEvent,
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getSignupEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._MemberCreatedEvent,
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'subscriptionCreatedEvent.id:null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            },
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            const json = model.toJSON(options);
            this.cleanPostAttribution(json);
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

    cleanPostAttribution(json) {
        if (json.postAttribution) {
            delete json.postAttribution.mobiledoc;
            delete json.postAttribution.lexical;
            delete json.postAttribution.plaintext;
        }
    }

    async getDonationEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._DonationPaymentEvent,
            options,
            filter,
            [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            'member_id:-null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            },
            (f) => {
                return expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }]);
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            const json = model.toJSON(options);
            this.cleanPostAttribution(json);
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
        const configuredOptions = this.buildEventOptions(
            this._Comment,
            options,
            filter,
            ['member', 'post', 'parent'],
            'member_id:-null+custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getClickEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._MemberLinkClickEvent,
            options,
            filter,
            ['member', 'link', 'link.post'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON(options)
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

        const postClicksQuery = postId ? this.buildPostClicksQueryWithPostId(postId) : this.buildPostClicksQueryWithoutPostId();
        const firstClicksQuery = this.getFirstClicksQuery();
        const mainQuery = this.getMainClickCountQuery();

        const configuredOptions = this.buildEventOptions(
            this._MemberLinkClickEvent,
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            },
            null,
            true,
            `id, member_id, created_at, (${mainQuery}) as count__clicks`,
            `rn = 1 ORDER BY created_at DESC, id DESC`,
            [
                {
                    name: `PostClicks`,
                    query: postClicksQuery
                },
                {
                    name: `FirstClicks`,
                    query: firstClicksQuery
                }
            ],
            `FirstClicks`,
            ''
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    buildPostClicksQueryWithPostId(postId) {
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

    buildPostClicksQueryWithoutPostId() {
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

    getFirstClicksQuery() {
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

    getMainClickCountQuery() {
        return `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
    }

    async getFeedbackEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._MemberFeedback,
            options,
            filter,
            ['member', 'post'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const configuredOptions = this.buildEventOptions(
            this._EmailRecipient,
            options,
            filter,
            ['member', 'email'],
            filterStr,
            {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            true,
            null,
            null,
            null,
            null,
            null,
            'processed_at'
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_sent_event',
                data: this.buildEmailSentEventData(model)
            };
        });

        return {
            data,
            meta
        };
    }

    buildEmailSentEventData(model) {
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get('processed_at'),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        };
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._EmailRecipient,
            options,
            filter,
            ['member', 'email'],
            'delivered_at:-null+custom:true',
            {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            true,
            null,
            null,
            null,
            null,
            null,
            'delivered_at'
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_delivered_event',
                data: this.buildEmailDeliveredEventData(model)
            };
        });

        return {
            data,
            meta
        };
    }

    buildEmailDeliveredEventData(model) {
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get('delivered_at'),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        };
    }

    async getEmailOpenedEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._EmailRecipient,
            options,
            filter,
            ['member', 'email'],
            'opened_at:-null+custom:true',
            {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            true,
            null,
            null,
            null,
            null,
            null,
            'opened_at'
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_opened_event',
                data: this.buildEmailOpenedEventData(model)
            };
        });

        return {
            data,
            meta
        };
    }

    buildEmailOpenedEventData(model) {
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get('opened_at'),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        };
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._EmailSpamComplaintEvent,
            options,
            filter,
            ['member', 'email'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getEmailFailedEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._EmailRecipient,
            options,
            filter,
            ['member', 'email'],
            'failed_at:-null+custom:true',
            {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            },
            null,
            true,
            null,
            null,
            null,
            null,
            null,
            'failed_at'
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_failed_event',
                data: this.buildEmailFailedEventData(model)
            };
        });

        return {
            data,
            meta
        };
    }

    buildEmailFailedEventData(model) {
        return {
            id: model.id,
            member_id: model.get('member_id'),
            created_at: model.get('failed_at'),
            member: model.related('member').toJSON(),
            email: model.related('email').toJSON()
        };
    }

    async getEmailChangeEvent(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._MemberEmailChangeEvent,
            options,
            filter,
            ['member'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

        const data = models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON(options)
            };
        });

        return {
            data,
            meta
        };
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const configuredOptions = this.buildEventOptions(
            this._AutomatedEmailRecipient,
            options,
            filter,
            ['member', 'automatedEmail'],
            'custom:true',
            {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }
        );

        const {data: models, meta} = await configuredOptions.findPage(configuredOptions);

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

    buildEventOptions(model, options, filter, withRelated, defaultFilter, keyMap, filterTransformer, useCTE, selectRaw, whereRaw, cte, from, order, orderReplaceField) {
        const configuredOptions = {
            ...options,
            withRelated: withRelated,
            filter: defaultFilter,
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys(keyMap)
            )
        };

        if (filterTransformer) {
            configuredOptions.mongoTransformer = chainTransformers(
                ...configuredOptions.mongoTransformer,
                filterTransformer
            );
        }

        if (useCTE) {
            configuredOptions.useCTE = true;
            configuredOptions.selectRaw = selectRaw;
            configuredOptions.whereRaw = whereRaw;
            configuredOptions.cte = cte;
            configuredOptions.from = from;
            configuredOptions.order = order;
        }

        if (orderReplaceField) {
            configuredOptions.order = configuredOptions.order.replace(/created_at/g, orderReplaceField);
        }

        return configuredOptions;
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