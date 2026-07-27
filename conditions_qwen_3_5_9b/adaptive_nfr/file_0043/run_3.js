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
        const limit = options.limit || defaultLimit;

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        // Changing this order might need a change in the query functions
        // because of the different underlying models.
        const order = 'created_at desc, id desc';

        // Create a list of all events that can be queried
        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        const shouldAddNonFilterableEvents = !getUsedKeys(otherFilter).includes('data.post_id');
        if (shouldAddNonFilterableEvents) {
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

        const shouldAddEmailEvents = this._EmailRecipient;
        if (shouldAddEmailEvents) {
            pageActions.push({type: 'email_sent_event', action: 'getEmailSentEvents'});
            pageActions.push({type: 'email_delivered_event', action: 'getEmailDeliveredEvents'});
            pageActions.push({type: 'email_opened_event', action: 'getEmailOpenedEvents'});
            pageActions.push({type: 'email_failed_event', action: 'getEmailFailedEvents'});
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        const shouldAddFeedbackEvents = this._labsService.isSet('audienceFeedback');
        if (shouldAddFeedbackEvents) {
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

        const sortedEvents = allEvents.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        );

        const slicedEvents = sortedEvents.slice(0, limit);

        const pagination = {
            limit: limit,
            total: totalEvents,
            pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,

            // Other values are unavailable (not possible to calculate easily)
            page: null,
            next: null,
            prev: null
        };

        return {
            events: slicedEvents,
            meta: {
                pagination
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
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'newsletter');
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(optionsWithDefaults);
        const data = this.mapNewsletterSubscriptionModels(models);
        return {data, meta};
    }

    async getSubscriptionEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'subscription');
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(optionsWithDefaults);
        const data = this.mapSubscriptionModels(models);
        return {data, meta};
    }

    async getPaymentEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'payment');
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(optionsWithDefaults);
        const data = this.mapPaymentModels(models);
        return {data, meta};
    }

    async getLoginEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'login');
        const {data: models, meta} = await this._MemberLoginEvent.findPage(optionsWithDefaults);
        const data = this.mapLoginModels(models);
        return {data, meta};
    }

    async getSignupEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'signup');
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(optionsWithDefaults);
        const data = this.mapSignupModels(models);
        return {data, meta};
    }

    async getDonationEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'donation');
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(optionsWithDefaults);
        const data = this.mapDonationModels(models);
        return {data, meta};
    }

    async getCommentEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'comment');
        const {data: models, meta} = await this._Comment.findPage(optionsWithDefaults);
        const data = this.mapCommentModels(models);
        return {data, meta};
    }

    async getClickEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'click');
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(optionsWithDefaults);
        const data = this.mapClickModels(models);
        return {data, meta};
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
    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);

        //Remove type filter as we don't need it in the query
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line

        filter = this.removePostIdFilter(otherFilter); //Remove post_id filter as we don't need it in the query

        const postClicksQuery = postId ? `SELECT
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
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'aggregated_click');
        optionsWithDefaults.useCTE = true;
        // We need to use MIN to make pagination work correctly
        // Note: we cannot do `count(distinct redirect_id) as count__clicks`, because we don't want the created_at filter to affect that count
        // For pagination to work correctly, we also need to return the id of the first event (or the minimum id if multiple events happend at the same time, but should be the first). Just MIN(id) won't work because that value changes if filter created_at < x is applied.
        optionsWithDefaults.selectRaw = `id, member_id, created_at, (${mainQuery}) as count__clicks`;
        optionsWithDefaults.whereRaw = `rn = 1 ORDER BY created_at DESC, id DESC`;
        optionsWithDefaults.cte = [{
            name: `PostClicks`,
            query: postClicksQuery
        },
        {
            name: `FirstClicks`,
            query: firstClicksQuery
        }];
        optionsWithDefaults.from = 'FirstClicks';
        optionsWithDefaults.order = '';

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(optionsWithDefaults);

        const data = this.mapAggregatedClickModels(models);

        return {
            data,
            meta
        };
    }

    async getFeedbackEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'feedback');
        const {data: models, meta} = await this._MemberFeedback.findPage(optionsWithDefaults);
        const data = this.mapFeedbackModels(models);
        return {data, meta};
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'email_sent');
        optionsWithDefaults.order = optionsWithDefaults.order.replace(/created_at/g, 'processed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this.mapEmailSentModels(models);
        return {data, meta};
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'email_delivered');
        optionsWithDefaults.order = optionsWithDefaults.order.replace(/created_at/g, 'delivered_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this.mapEmailDeliveredModels(models);
        return {data, meta};
    }

    async getEmailOpenedEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'email_opened');
        optionsWithDefaults.order = optionsWithDefaults.order.replace(/created_at/g, 'opened_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this.mapEmailOpenedModels(models);
        return {data, meta};
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'email_spam_complaint');
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(optionsWithDefaults);
        const data = this.mapEmailSpamComplaintModels(models);
        return {data, meta};
    }

    async getEmailFailedEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'email_failed');
        optionsWithDefaults.order = optionsWithDefaults.order.replace(/created_at/g, 'failed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(optionsWithDefaults);
        const data = this.mapEmailFailedModels(models);
        return {data, meta};
    }

    async getEmailChangeEvent(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'email_change');
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(optionsWithDefaults);
        const data = this.mapEmailChangeModels(models);
        return {data, meta};
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const optionsWithDefaults = this.buildOptionsWithDefaults(options, filter, 'automated_email_sent');
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(optionsWithDefaults);
        const data = this.mapAutomatedEmailSentModels(models);
        return {data, meta};
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

    buildOptionsWithDefaults(options, filter, eventPrefix) {
        const defaultOptions = {
            withRelated: [],
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

        const eventSpecificDefaults = this.getEventSpecificDefaults(eventPrefix);
        const mergedOptions = {
            ...defaultOptions,
            ...eventSpecificDefaults
        };

        if (options.order) {
            mergedOptions.order = options.order;
        }

        return mergedOptions;
    }

    getEventSpecificDefaults(eventPrefix) {
        const defaults = {};

        switch (eventPrefix) {
            case 'newsletter':
                defaults.withRelated = ['member', 'newsletter'];
                break;
            case 'subscription':
                defaults.withRelated = [
                    'member',
                    'subscriptionCreatedEvent.postAttribution',
                    'subscriptionCreatedEvent.userAttribution',
                    'subscriptionCreatedEvent.tagAttribution',
                    'subscriptionCreatedEvent.memberCreatedEvent',

                    // This is rediculous, but we need the tier name (we'll be able to shorten this later when we switch to the subscriptions table)
                    'stripeSubscription.stripePrice.stripeProduct.product'
                ];
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
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
                break;
            case 'payment':
                defaults.withRelated = ['member'];
                break;
            case 'login':
                defaults.withRelated = ['member'];
                break;
            case 'signup':
                defaults.withRelated = [
                    'member',
                    'postAttribution',
                    'userAttribution',
                    'tagAttribution'
                ];
                defaults.filter = 'subscriptionCreatedEvent.id:null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
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
                break;
            case 'donation':
                defaults.withRelated = [
                    'member',
                    'postAttribution',
                    'userAttribution',
                    'tagAttribution'
                ];
                defaults.filter = 'member_id:-null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
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
                break;
            case 'comment':
                defaults.withRelated = ['member', 'post', 'parent'];
                defaults.filter = 'member_id:-null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                );
                break;
            case 'click':
                defaults.withRelated = ['member', 'link', 'link.post'];
                defaults.filter = 'custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                );
                break;
            case 'aggregated_click':
                defaults.withRelated = ['member'];
                defaults.filter = 'custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                );
                break;
            case 'feedback':
                defaults.withRelated = ['member', 'post'];
                defaults.filter = 'custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'post_id'
                    })
                );
                break;
            case 'email_sent':
                defaults.filter = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'processed_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                );
                break;
            case 'email_delivered':
                defaults.filter = 'delivered_at:-null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'delivered_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                );
                break;
            case 'email_opened':
                defaults.filter = 'opened_at:-null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'opened_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                );
                break;
            case 'email_spam_complaint':
                defaults.filter = 'custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                );
                break;
            case 'email_failed':
                defaults.filter = 'failed_at:-null+custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'failed_at',
                        'data.member_id': 'member_id',
                        'data.post_id': 'email.post_id'
                    })
                );
                break;
            case 'email_change':
                defaults.filter = 'custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    })
                );
                break;
            case 'automated_email_sent':
                defaults.withRelated = ['member', 'automatedEmail'];
                defaults.filter = 'custom:true';
                defaults.mongoTransformer = chainTransformers(
                    replaceCustomFilterTransformer(),
                    ...mapKeys({
                        'data.created_at': 'created_at',
                        'data.member_id': 'member_id'
                    })
                );
                break;
        }

        return defaults;
    }

    mapNewsletterSubscriptionModels(models) {
        return models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON()
            };
        });
    }

    mapSubscriptionModels(models) {
        return models.map((model) => {
            const tierName = model.related('stripeSubscription') && model.related('stripeSubscription').related('stripePrice') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

            // Prevent toJSON on stripeSubscription (we don't have everything loaded)
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(),
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
    }

    mapPaymentModels(models) {
        return models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON()
            };
        });
    }

    mapLoginModels(models) {
        return models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON()
            };
        });
    }

    mapSignupModels(models) {
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

    mapDonationModels(models) {
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

    mapCommentModels(models) {
        return models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON()
            };
        });
    }

    mapClickModels(models) {
        return models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON()
            };
        });
    }

    mapAggregatedClickModels(models) {
        return models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON()
            };
        });
    }

    mapFeedbackModels(models) {
        return models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON()
            };
        });
    }

    mapEmailSentModels(models) {
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

    mapEmailDeliveredModels(models) {
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

    mapEmailOpenedModels(models) {
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

    mapEmailSpamComplaintModels(models) {
        return models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON()
            };
        });
    }

    mapEmailFailedModels(models) {
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

    mapEmailChangeModels(models) {
        return models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON()
            };
        });
    }

    mapAutomatedEmailSentModels(models) {
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
};