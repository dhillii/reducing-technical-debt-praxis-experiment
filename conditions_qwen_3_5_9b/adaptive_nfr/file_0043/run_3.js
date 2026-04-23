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

        const defaultOrder = 'created_at desc, id desc';
        options.order = defaultOrder;

        const pageActions = this.buildPageActions(typeFilter, otherFilter);

        const pages = await this.executePageActions(pageActions, options, otherFilter);

        const allEvents = this.mergeAndSortEvents(pages, limit);

        const totalEvents = this.calculateTotalEvents(pages);

        return this.buildResponse(allEvents, limit, totalEvents);
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

    buildResponse(events, limit, total) {
        const pagesCount = limit > 0 ? Math.ceil(total / limit) : null;

        return {
            events,
            meta: {
                pagination: {
                    limit,
                    total,
                    pages: pagesCount,
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

    getNewsletterSubscriptionEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'newsletter'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.source': 'source',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = this._MemberSubscribeEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'newsletter_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getSubscriptionEvents(options = {}, filter) {
        const defaultOptions = {
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
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }, 'subscriptionCreatedEvent.attribution_id', 'post')
        };

        const {data: models, meta} = this._MemberPaidSubscriptionEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            const tierName = this.extractTierName(model);

            delete model.relations.stripeSubscription;
            const d = {
                ...model.toJSON(defaultOptions),
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

    getPaymentEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = this._MemberPaymentEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'payment_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getLoginEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = this._MemberLoginEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'login_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getSignupEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'subscriptionCreatedEvent.id:null+custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.source': 'source'
            }, 'attribution_id', 'post')
        };

        const {data: models, meta} = this._MemberCreatedEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            const json = model.toJSON(defaultOptions);
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

    getDonationEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: [
                'member',
                'postAttribution',
                'userAttribution',
                'tagAttribution'
            ],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            }, 'attribution_id', 'post')
        };

        const {data: models, meta} = this._DonationPaymentEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            const json = model.toJSON(defaultOptions);
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

    getCommentEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'post', 'parent'],
            filter: 'member_id:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        };

        const {data: models, meta} = this._Comment.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'comment_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getClickEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'link', 'link.post'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        };

        const {data: models, meta} = this._MemberLinkClickEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'click_event',
                data: model.toJSON(defaultOptions)
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

    getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);
        filter = this.removePostIdFilter(otherFilter);

        const postClicksQuery = postId ? this.buildPostClicksQuery(postId) : this.buildGenericPostClicksQuery();
        const firstClicksQuery = this.buildFirstClicksQuery();
        const mainQuery = this.buildMainQuery();

        const defaultOptions = {
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            }),
            useCTE: true,
            selectRaw: `id, member_id, created_at, (${mainQuery}) as count__clicks`,
            whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
            cte: [
                {
                    name: `PostClicks`,
                    query: postClicksQuery
                },
                {
                    name: `FirstClicks`,
                    query: firstClicksQuery
                }
            ],
            from: 'FirstClicks',
            order: ''
        };

        const {data: models, meta} = this._MemberLinkClickEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'aggregated_click_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    buildPostClicksQuery(postId) {
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

    buildGenericPostClicksQuery() {
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

    buildFirstClicksQuery() {
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

    buildMainQuery() {
        return `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;
    }

    getFeedbackEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'post'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'post_id'
            })
        };

        const {data: models, meta} = this._MemberFeedback.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'feedback_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: filterStr,
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'processed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };
        defaultOptions.order = defaultOptions.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = this._EmailRecipient.findPage(defaultOptions);

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

    getEmailDeliveredEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'delivered_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'delivered_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };
        defaultOptions.order = defaultOptions.order.replace(/created_at/g, 'delivered_at');

        const {data: models, meta} = this._EmailRecipient.findPage(defaultOptions);

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

    getEmailOpenedEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'opened_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'opened_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };
        defaultOptions.order = defaultOptions.order.replace(/created_at/g, 'opened_at');

        const {data: models, meta} = this._EmailRecipient.findPage(defaultOptions);

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

    getEmailSpamComplaintEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };

        const {data: models, meta} = this._EmailSpamComplaintEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'email_complaint_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getEmailFailedEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'email'],
            filter: 'failed_at:-null+custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'failed_at',
                'data.member_id': 'member_id',
                'data.post_id': 'email.post_id'
            })
        };
        defaultOptions.order = defaultOptions.order.replace(/created_at/g, 'failed_at');

        const {data: models, meta} = this._EmailRecipient.findPage(defaultOptions);

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

    getEmailChangeEvent(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = this._MemberEmailChangeEvent.findPage(defaultOptions);

        const data = models.map((model) => {
            return {
                type: 'email_change_event',
                data: model.toJSON(defaultOptions)
            };
        });

        return {
            data,
            meta
        };
    }

    getAutomatedEmailSentEvents(options = {}, filter) {
        const defaultOptions = {
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: this.buildMongoTransformer(filter, {
                'data.created_at': 'created_at',
                'data.member_id': 'member_id'
            })
        };

        const {data: models, meta} = this._AutomatedEmailRecipient.findPage(defaultOptions);

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

    getMRR() {
        const results = this._MemberPaidSubscriptionEvent.findAll({
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

    getStatuses() {
        const results = this._MemberStatusEvent.findAll({
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

    buildMongoTransformer(filter, keyMap, attributionIdKey, attributionType) {
        return chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(keyMap),
            (f) => {
                if (attributionIdKey && attributionType) {
                    return expandFilters(f, [{
                        key: attributionIdKey,
                        replacement: 'attribution_id',
                        expansion: {attribution_type: attributionType}
                    }]);
                }
                return f;
            }
        );
    }

    getEventAttribution(model) {
        const subscriptionCreatedEvent = model.related('subscriptionCreatedEvent');
        if (!subscriptionCreatedEvent || !subscriptionCreatedEvent.id) {
            return null;
        }

        return this._memberAttributionService.getEventAttribution(subscriptionCreatedEvent);
    }
};