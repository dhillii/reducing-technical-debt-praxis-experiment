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

        const pageActions = this.buildPageActions(otherFilter);

        const pages = await this.executePageActions(pageActions, typeFilter, options, otherFilter);

        const allEvents = pages.flatMap(page => page.data);
        const totalEvents = pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: this.sortAndLimitEvents(allEvents, options.limit),
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

    buildPageActions(otherFilter) {
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

    async executePageActions(pageActions, typeFilter, options, otherFilter) {
        let filteredPages = pageActions;
        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            filteredPages = filteredPages.filter(page => query.test(page));
        }

        const pages = await Promise.all(filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        }));

        return pages;
    }

    sortAndLimitEvents(allEvents, limit) {
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

    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createNewsletterSubscriptionEventOptions');
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createNewsletterSubscriptionEventOptions(options, filter) {
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

    async getSubscriptionEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createSubscriptionEventOptions');
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            const tierName = this.getTierNameFromModel(model);
            const attribution = this.getSubscriptionEventAttribution(model);
            const signup = this.getSubscriptionEventSignup(model);

            const d = {
                ...model.toJSON(options),
                attribution,
                signup,
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

    createSubscriptionEventOptions(options, filter) {
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
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'subscriptionCreatedEvent.attribution_id',
                    expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
                }])
            )
        };
    }

    getTierNameFromModel(model) {
        return model.related('stripeSubscription')
            && model.related('stripeSubscription').related('stripePrice')
            && model.related('stripeSubscription').related('stripePrice').related('stripeProduct')
            && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product')
            ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;
    }

    getSubscriptionEventAttribution(model) {
        if (model.get('type') !== 'created' || !model.related('subscriptionCreatedEvent') || !model.related('subscriptionCreatedEvent').id) {
            return null;
        }
        return this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent'));
    }

    getSubscriptionEventSignup(model) {
        return model.get('type') === 'created'
            && model.related('subscriptionCreatedEvent')
            && model.related('subscriptionCreatedEvent').id
            && model.related('subscriptionCreatedEvent').related('memberCreatedEvent')
            && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id
            ? true : false;
    }

    async getPaymentEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createPaymentEventOptions');
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createPaymentEventOptions(options, filter) {
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

    async getLoginEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createLoginEventOptions');
        const {data: models, meta} = await this._MemberLoginEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createLoginEventOptions(options, filter) {
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

    async getSignupEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createSignupEventOptions');
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(transformedOptions);

        const data = models.map((model) => {
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
        });

        return {
            data,
            meta
        };
    }

    createSignupEventOptions(options, filter) {
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
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };
    }

    async getDonationEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createDonationEventOptions');
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(transformedOptions);

        const data = models.map((model) => {
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
        });

        return {
            data,
            meta
        };
    }

    createDonationEventOptions(options, filter) {
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
                (f) => expandFilters(f, [{
                    key: 'data.post_id',
                    replacement: 'attribution_id',
                    expansion: {attribution_type: 'post'}
                }])
            )
        };
    }

    async getCommentEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createCommentEventOptions');
        const {data: models, meta} = await this._Comment.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createCommentEventOptions(options, filter) {
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

    async getClickEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createClickEventOptions');
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createClickEventOptions(options, filter) {
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
        const otherFilter = this.removePostIdFilter(filter);

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

        const transformedOptions = this.createMongoTransformedOptions(options, otherFilter, 'createAggregatedClickEventOptions');
        transformedOptions.selectRaw = `id, member_id, created_at, (${mainQuery}) as count__clicks`;
        transformedOptions.whereRaw = `rn = 1 ORDER BY created_at DESC, id DESC`;
        transformedOptions.useCTE = true;
        transformedOptions.order = '';
        transformedOptions.cte = [{
            name: `PostClicks`,
            query: postClicksQuery
        },
        {
            name: `FirstClicks`,
            query: firstClicksQuery
        }];
        transformedOptions.from = 'FirstClicks';

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createAggregatedClickEventOptions(options, filter) {
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
            )
        };
    }

    async getFeedbackEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createFeedbackEventOptions');
        const {data: models, meta} = await this._MemberFeedback.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createFeedbackEventOptions(options, filter) {
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

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const transformedOptions = this.createMongoTransformedEmailRecipientOptions(options, filter);
        transformedOptions.filter = filterStr;
        transformedOptions.order = options.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

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

    createMongoTransformedEmailRecipientOptions(options, filter) {
        return {
            ...options,
            withRelated: ['member', 'email'],
            filter: 'custom:true',
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
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const filterStr = 'delivered_at:-null+custom:true';
        const transformedOptions = this.createMongoTransformedEmailRecipientOptions(options, filter);
        transformedOptions.filter = filterStr;
        transformedOptions.order = options.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

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

    async getEmailOpenedEvents(options = {}, filter) {
        const filterStr = 'opened_at:-null+custom:true';
        const transformedOptions = this.createMongoTransformedEmailRecipientOptions(options, filter);
        transformedOptions.filter = filterStr;
        transformedOptions.order = options.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

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

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createEmailSpamComplaintEventOptions');

        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createEmailSpamComplaintEventOptions(options, filter) {
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

    async getEmailFailedEvents(options = {}, filter) {
        const filterStr = 'failed_at:-null+custom:true';
        const transformedOptions = this.createMongoTransformedEmailRecipientOptions(options, filter);
        transformedOptions.filter = filterStr;
        transformedOptions.order = options.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = await this._EmailRecipient.findPage(transformedOptions);

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

    async getEmailChangeEvent(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createEmailChangeEventOptions');

        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(transformedOptions);

        const data = models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON()
            };
        });

        return {
            data,
            meta
        };
    }

    createEmailChangeEventOptions(options, filter) {
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

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const transformedOptions = this.createMongoTransformedOptions(options, filter, 'createAutomatedEmailSentEventOptions');

        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(transformedOptions);

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

    createAutomatedEmailSentEventOptions(options, filter) {
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

    createMongoTransformedOptions(options, filter, optionsCreator) {
        const creatorMap = {
            'createNewsletterSubscriptionEventOptions': this.createNewsletterSubscriptionEventOptions.bind(this),
            'createSubscriptionEventOptions': this.createSubscriptionEventOptions.bind(this),
            'createPaymentEventOptions': this.createPaymentEventOptions.bind(this),
            'createLoginEventOptions': this.createLoginEventOptions.bind(this),
            'createSignupEventOptions': this.createSignupEventOptions.bind(this),
            'createDonationEventOptions': this.createDonationEventOptions.bind(this),
            'createCommentEventOptions': this.createCommentEventOptions.bind(this),
            'createClickEventOptions': this.createClickEventOptions.bind(this),
            'createFeedbackEventOptions': this.createFeedbackEventOptions.bind(this),
            'createEmailSpamComplaintEventOptions': this.createEmailSpamComplaintEventOptions.bind(this),
            'createEmailChangeEventOptions': this.createEmailChangeEventOptions.bind(this),
            'createAutomatedEmailSentEventOptions': this.createAutomatedEmailSentEventOptions.bind(this)
        };

        const creator = creatorMap[optionsCreator];
        return creator ? creator(options, filter) : {
            ...options,
            withRelated: [],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter)
            )
        };
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
};