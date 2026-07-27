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
        options = this.setLimit(options);
        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        options = this.setOrder(options);
        const pageActions = this.getPageActions(otherFilter);
        const filteredPages = this.filterPages(pageActions, typeFilter);
        const pages = await this.getPages(filteredPages, options, otherFilter);
        const allEvents = this.getAllEvents(pages);
        const totalEvents = this.getTotalEvents(pages);
        return this.formatEventTimeline(allEvents, totalEvents, options);
    }

    setLimit(options) {
        if (!options.limit) {
            options.limit = 10;
        }
        return options;
    }

    setOrder(options) {
        options.order = 'created_at desc, id desc';
        return options;
    }

    getPageActions(otherFilter) {
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

    filterPages(pageActions, typeFilter) {
        if (typeFilter) {
            const query = new mingo.Query(typeFilter);
            return pageActions.filter(page => query.test(page));
        }
        return pageActions;
    }

    async getPages(filteredPages, options, otherFilter) {
        return Promise.all(filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        }));
    }

    getAllEvents(pages) {
        return pages.flatMap(page => page.data);
    }

    getTotalEvents(pages) {
        return pages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);
    }

    formatEventTimeline(allEvents, totalEvents, options) {
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

    async getNewsletterSubscriptionEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'newsletter'], 'custom:true');
        const {data: models, meta} = await this._MemberSubscribeEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'newsletter_event');
    }

    async getSubscriptionEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, [
            'member',
            'subscriptionCreatedEvent.postAttribution',
            'subscriptionCreatedEvent.userAttribution',
            'subscriptionCreatedEvent.tagAttribution',
            'subscriptionCreatedEvent.memberCreatedEvent',
            'stripeSubscription.stripePrice.stripeProduct.product'
        ], 'custom:true');
        const {data: models, meta} = await this._MemberPaidSubscriptionEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'subscription_event', (model) => {
            const tierName = model.related('stripeSubscription') && model.related('stripeSubscription').related('stripePrice') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

            // Prevent toJSON on stripeSubscription (we don't have everything loaded)
            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(options),
                attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
                signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id ? true : false,
                tierName
            };
            delete d.stripeSubscription;
            return d;
        });
    }

    async getPaymentEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member'], 'custom:true');
        const {data: models, meta} = await this._MemberPaymentEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'payment_event');
    }

    async getLoginEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member'], 'custom:true');
        const {data: models, meta} = await this._MemberLoginEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'login_event');
    }

    async getSignupEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], 'subscriptionCreatedEvent.id:null+custom:true');
        const {data: models, meta} = await this._MemberCreatedEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'signup_event', (model) => {
            const json = model.toJSON(options);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });
    }

    async getDonationEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ], 'member_id:-null+custom:true');
        const {data: models, meta} = await this._DonationPaymentEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'donation_event', (model) => {
            const json = model.toJSON(options);
            delete json.postAttribution?.mobiledoc;
            delete json.postAttribution?.lexical;
            delete json.postAttribution?.plaintext;
            return {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            };
        });
    }

    async getCommentEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'post', 'parent'], 'member_id:-null+custom:true');
        const {data: models, meta} = await this._Comment.findPage(options);
        return this.formatGetEvents(models, meta, 'comment_event');
    }

    async getClickEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'link', 'link.post'], 'custom:true');
        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'click_event');
    }

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
        options = {
            ...options,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                // First set the filter manually
                replaceCustomFilterTransformer(otherFilter),

                // Map the used keys in that filter
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            ),
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

        const {data: models, meta} = await this._MemberLinkClickEvent.findPage(options);

        return {
            data: models.map((model) => {
                return {
                    type: 'aggregated_click_event',
                    data: model.toJSON(options)
                };
            }),
            meta
        };
    }

    async getFeedbackEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'post'], 'custom:true');
        const {data: models, meta} = await this._MemberFeedback.findPage(options);
        return this.formatGetEvents(models, meta, 'feedback_event');
    }

    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options = this.setOptionsForGetEvents(options, filter, ['member', 'email'], filterStr);
        options.order = options.order.replace(/created_at/g, 'processed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        return this.formatGetEvents(models, meta, 'email_sent_event', (model) => {
            return {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('processed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            };
        });
    }

    async getEmailDeliveredEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'email'], 'delivered_at:-null+custom:true');
        options.order = options.order.replace(/created_at/g, 'delivered_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        return this.formatGetEvents(models, meta, 'email_delivered_event', (model) => {
            return {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('delivered_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            };
        });
    }

    async getEmailOpenedEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'email'], 'opened_at:-null+custom:true');
        options.order = options.order.replace(/created_at/g, 'opened_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        return this.formatGetEvents(models, meta, 'email_opened_event', (model) => {
            return {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('opened_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            };
        });
    }

    async getEmailSpamComplaintEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'email'], 'custom:true');
        const {data: models, meta} = await this._EmailSpamComplaintEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'email_complaint_event');
    }

    async getEmailFailedEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'email'], 'failed_at:-null+custom:true');
        options.order = options.order.replace(/created_at/g, 'failed_at');
        const {data: models, meta} = await this._EmailRecipient.findPage(options);
        return this.formatGetEvents(models, meta, 'email_failed_event', (model) => {
            return {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('failed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            };
        });
    }

    async getEmailChangeEvent(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member'], 'custom:true');
        const {data: models, meta} = await this._MemberEmailChangeEvent.findPage(options);
        return this.formatGetEvents(models, meta, 'email_change_event');
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        options = this.setOptionsForGetEvents(options, filter, ['member', 'automatedEmail'], 'custom:true');
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(options);
        return this.formatGetEvents(models, meta, 'automated_email_sent_event', (model) => {
            const automatedEmail = model.related('automatedEmail').toJSON();
            return {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('created_at'),
                member: model.related('member').toJSON(),
                automatedEmail: {
                    id: automatedEmail.id,
                    slug: automatedEmail.slug
                }
            };
        });
    }

    setOptionsForGetEvents(options, filter, withRelated, filterStr) {
        options = {
            ...options,
            withRelated: withRelated,
            filter: filterStr,
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

    formatGetEvents(models, meta, type, formatter = (model) => model.toJSON()) {
        return {
            data: models.map((model) => {
                return {
                    type: type,
                    data: formatter(model)
                };
            }),
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
};