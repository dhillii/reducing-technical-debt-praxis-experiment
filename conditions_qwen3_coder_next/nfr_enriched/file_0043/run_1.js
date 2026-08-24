class EventRepository {
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
        /** @member {typeof DonationPaymentEvent} */
        this._DonationPaymentEvent = DonationPaymentEvent;
        /** @member {typeof EmailRecipient} */
        this._EmailRecipient = EmailRecipient;
        /** @member {typeof MemberSubscribeEvent} */
        this._MemberSubscribeEvent = MemberSubscribeEvent;
        /** @member {typeof MemberPaymentEvent} */
        this._MemberPaymentEvent = MemberPaymentEvent;
        /** @member {typeof MemberStatusEvent} */
        this._MemberStatusEvent = MemberStatusEvent;
        /** @member {typeof MemberLoginEvent} */
        this._MemberLoginEvent = MemberLoginEvent;
        /** @member {typeof MemberCreatedEvent} */
        this._MemberCreatedEvent = MemberCreatedEvent;
        /** @member {typeof SubscriptionCreatedEvent} */
        this._SubscriptionCreatedEvent = SubscriptionCreatedEvent;
        /** @member {typeof MemberPaidSubscriptionEvent} */
        this._MemberPaidSubscriptionEvent = MemberPaidSubscriptionEvent;
        /** @member {typeof MemberLinkClickEvent} */
        this._MemberLinkClickEvent = MemberLinkClickEvent;
        /** @member {typeof MemberFeedback} */
        this._MemberFeedback = MemberFeedback;
        /** @member {typeof EmailSpamComplaintEvent} */
        this._EmailSpamComplaintEvent = EmailSpamComplaintEvent;
        /** @member {typeof Comment} */
        this._Comment = Comment;
        /** @member {Object} */
        this._labsService = labsService;
        /** @member {Object} */
        this._memberAttributionService = memberAttributionService;
        /** @member {typeof MemberEmailChangeEvent} */
        this._MemberEmailChangeEvent = MemberEmailChangeEvent;
        /** @member {typeof AutomatedEmailRecipient} */
        this._AutomatedEmailRecipient = AutomatedEmailRecipient;
    }

    /**
     * Builds the event timeline by aggregating events from multiple sources.
     *
     * @param {Object} options Query options including limit and filter.
     * @returns {Promise<{events: Array, meta: {pagination: Object}}>}
     */
    async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this._buildPageActions(otherFilter);
        const filteredPages = this._filterPagesByType(pageActions, typeFilter);

        const pages = await Promise.all(filteredPages.map(page => this[page.action](options, otherFilter)));
        const allEvents = pages.flatMap(page => page.data);
        const totalEvents = pages.reduce((sum, page) => sum + page.meta.pagination.total, 0);

        return {
            events: this._sortAndLimitEvents(allEvents, options.limit),
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

    /**
     * Registers a payment event.
     *
     * @param {Object} data Payment data.
     * @returns {Promise<void>}
     */
    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    /**
     * Fetches newsletter subscription events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getNewsletterSubscriptionEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberSubscribeEvent, {
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
        });

        return {
            data: models.map(model => ({
                type: 'newsletter_event',
                data: model.toJSON(options)
            })),
            meta
        };
    }

    /**
     * Fetches subscription events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getSubscriptionEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberPaidSubscriptionEvent, {
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
        });

        const data = models.map((model) => {
            const tierName = this._extractTierName(model);
            delete model.relations.stripeSubscription;
            return {
                type: 'subscription_event',
                data: {
                    ...model.toJSON(options),
                    attribution: model.get('type') === 'created' ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
                    signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent')?.related('memberCreatedEvent')?.id,
                    tierName
                }
            };
        });

        return {data, meta};
    }

    /**
     * Fetches payment events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getPaymentEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberPaymentEvent, {
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
        });

        return {
            data: models.map(model => ({type: 'payment_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches login events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getLoginEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberLoginEvent, {
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
        });

        return {
            data: models.map(model => ({type: 'login_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches signup events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getSignupEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberCreatedEvent, {
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
        });

        return {
            data: models.map(model => {
                const json = model.toJSON(options);
                this._cleanPostAttribution(json.postAttribution);
                return {
                    type: 'signup_event',
                    data: {
                        ...json,
                        attribution: this._memberAttributionService.getEventAttribution(model)
                    }
                };
            }),
            meta
        };
    }

    /**
     * Fetches donation events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getDonationEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._DonationPaymentEvent, {
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
        });

        return {
            data: models.map(model => {
                const json = model.toJSON(options);
                this._cleanPostAttribution(json.postAttribution);
                return {
                    type: 'donation_event',
                    data: {
                        ...json,
                        attribution: this._memberAttributionService.getEventAttribution(model)
                    }
                };
            }),
            meta
        };
    }

    /**
     * Fetches comment events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getCommentEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._Comment, {
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
        });

        return {
            data: models.map(model => ({type: 'comment_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches click events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getClickEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberLinkClickEvent, {
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
        });

        return {
            data: models.map(model => ({type: 'click_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Aggregates click events per member for a specific post.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getAggregatedClickEvents(options = {}, filter) {
        const postId = this.getPostIdFromFilter(filter);

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter); // eslint-disable-line no-unused-vars

        filter = this.removePostIdFilter(otherFilter);

        const postClicksQuery = postId
            ? `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM members_click_events mce
                INNER JOIN redirects r ON mce.redirect_id = r.id
                WHERE r.post_id = '${postId.toHexString()}'
            `
            : `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM members_click_events mce
                INNER JOIN redirects r ON mce.redirect_id = r.id
            `;

        const firstClicksQuery = `
            SELECT
                id,
                member_id,
                redirect_id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM PostClicks
        `;

        const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id FROM PostClicks
                    )`;

        const {data: models, meta} = await this._executeEventQuery(this._MemberLinkClickEvent, {
            ...options,
            withRelated: ['member'],
            filterRelations: false,
            filter: 'custom:true',
            useBasicCount: true,
            useCTE: true,
            selectRaw: `id, member_id, created_at, (${mainQuery}) as count__clicks`,
            whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
            cte: [
                {name: 'PostClicks', query: postClicksQuery},
                {name: 'FirstClicks', query: firstClicksQuery}
            ],
            from: 'FirstClicks',
            order: '',
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id',
                    'data.post_id': 'post_id'
                })
            )
        });

        return {
            data: models.map(model => ({type: 'aggregated_click_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches feedback events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getFeedbackEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberFeedback, {
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
        });

        return {
            data: models.map(model => ({type: 'feedback_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches email sent events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getEmailSentEvents(options = {}, filter) {
        const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
        options.order = options.order.replace(/created_at/g, 'processed_at');

        const {data: models, meta} = await this._executeEventQuery(this._EmailRecipient, {
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
        });

        return {
            data: models.map(model => ({
                type: 'email_sent_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('processed_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    /**
     * Fetches email delivered events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getEmailDeliveredEvents(options = {}, filter) {
        options.order = options.order.replace(/created_at/g, 'delivered_at');
        const {data: models, meta} = await this._executeEventQuery(this._EmailRecipient, {
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
        });

        return {
            data: models.map(model => ({
                type: 'email_delivered_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('delivered_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    /**
     * Fetches email opened events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getEmailOpenedEvents(options = {}, filter) {
        options.order = options.order.replace(/created_at/g, 'opened_at');
        const {data: models, meta} = await this._executeEventQuery(this._EmailRecipient, {
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
        });

        return {
            data: models.map(model => ({
                type: 'email_opened_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('opened_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    /**
     * Fetches email spam complaint events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getEmailSpamComplaintEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._EmailSpamComplaintEvent, {
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
        });

        return {
            data: models.map(model => ({type: 'email_complaint_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches email failed events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getEmailFailedEvents(options = {}, filter) {
        options.order = options.order.replace(/created_at/g, 'failed_at');
        const {data: models, meta} = await this._executeEventQuery(this._EmailRecipient, {
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
        });

        return {
            data: models.map(model => ({
                type: 'email_failed_event',
                data: {
                    id: model.id,
                    member_id: model.get('member_id'),
                    created_at: model.get('failed_at'),
                    member: model.related('member').toJSON(),
                    email: model.related('email').toJSON()
                }
            })),
            meta
        };
    }

    /**
     * Fetches email change events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getEmailChangeEvent(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._MemberEmailChangeEvent, {
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
        });

        return {
            data: models.map(model => ({type: 'email_change_event', data: model.toJSON(options)})),
            meta
        };
    }

    /**
     * Fetches automated email sent events.
     *
     * @param {Object} options Query options.
     * @param {String} filter Additional NQL filter string.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    async getAutomatedEmailSentEvents(options = {}, filter) {
        const {data: models, meta} = await this._executeEventQuery(this._AutomatedEmailRecipient, {
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
        });

        return {
            data: models.map(model => {
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
            }),
            meta
        };
    }

    /**
     * Extracts tier name from model relations.
     *
     * @param {Object} model Model instance.
     * @returns {String|null} Tier name or null.
     */
    _extractTierName(model) {
        if (!model || !model.related('stripeSubscription')) return null;

        const stripeSubscription = model.related('stripeSubscription');
        const stripePrice = stripeSubscription.related('stripePrice');
        const stripeProduct = stripePrice?.related('stripeProduct');
        const product = stripeProduct?.related('product');

        return product?.get('name') ?? null;
    }

    /**
     * Cleans post attribution fields in-place.
     *
     * @param {Object} postAttribution Post attribution object.
     */
    _cleanPostAttribution(postAttribution) {
        if (postAttribution) {
            delete postAttribution.mobiledoc;
            delete postAttribution.lexical;
            delete postAttribution.plaintext;
        }
    }

    /**
     * Executes a findPage query using common configuration.
     *
     * @param {Object} model Model class.
     * @param {Object} options Query options.
     * @returns {Promise<{data: Array, meta: Object}>}
     */
    _executeEventQuery(model, options) {
        return model.findPage(options);
    }

    /**
     * Sorts and limits the combined events.
     *
     * @param {Array} events All collected events.
     * @param {Number} limit Maximum number of events.
     * @returns {Array} Sorted and limited events.
     */
    _sortAndLimitEvents(events, limit) {
        return events.sort((a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) return diff;
            return b.data.id.localeCompare(a.data.id);
        }).slice(0, limit);
    }

    /**
     * Builds list of event actions based on filter conditions.
     *
     * @param {Object} otherFilter Filter excluding type.
     * @returns {Array} Array of page action descriptors.
     */
    _buildPageActions(otherFilter) {
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
            pageActions.push(
                {type: 'email_sent_event', action: 'getEmailSentEvents'},
                {type: 'email_delivered_event', action: 'getEmailDeliveredEvents'},
                {type: 'email_opened_event', action: 'getEmailOpenedEvents'},
                {type: 'email_failed_event', action: 'getEmailFailedEvents'}
            );
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService?.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }

        return pageActions;
    }

    /**
     * Filters page actions using type-based NQL filter.
     *
     * @param {Array} pageActions All possible actions.
     * @param {Object} typeFilter Filter for event types.
     * @returns {Array} Filtered actions.
     */
    _filterPagesByType(pageActions, typeFilter) {
        if (!typeFilter) return pageActions;

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Splits the NQL filter into type and non-type components.
     *
     * @param {String} filter Full filter string.
     * @returns {[Object|null, Object|null]} Type and other filters.
     */
    getNQLSubset(filter) {
        if (!filter) return [undefined, undefined];

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
     * Removes post_id filter from NQL filter.
     *
     * @param {Object} filter Input filter.
     * @returns {Object} Filter without post_id.
     */
    removePostIdFilter(filter) {
        if (!filter) return filter;

        try {
            return rejectStatements(filter, key => key === 'data.post_id');
        } catch (e) {
            throw new errors.IncorrectUsageError({message: e.message});
        }
    }

    /**
     * Extracts and validates post ID from NQL filter.
     *
     * @param {Object|null} filter Input filter.
     * @returns {Object|null} ObjectID or null.
     */
    getPostIdFromFilter(filter) {
        let postIdString = '';

        if (filter && filter.$and) {
            postIdString = filter.$and.find(condition => condition['data.post_id'])?.['data.post_id'] ?? '';
        } else if (filter && filter['data.post_id']) {
            postIdString = filter['data.post_id'];
        }

        if (!ObjectID.isValid(postIdString)) {
            return null;
        }

        return ObjectID.createFromHexString(postIdString);
    }

    /**
     * Aggregates MRR across currencies.
     *
     * @returns {Promise<Object>} MRR totals.
     */
    async getMRR() {
        const results = await this._MemberPaidSubscriptionEvent.findAll({
            aggregateMRRDeltas: true
        });

        return results.toJSON().reduce((acc, result) => {
            if (!acc[result.currency]) {
                acc[result.currency] = [];
            }

            acc[result.currency].push({
                date: result.date,
                mrr: acc[result.currency].length
                    ? acc[result.currency][acc[result.currency].length - 1].mrr + result.mrr_delta
                    : result.mrr_delta,
                currency: result.currency
            });

            return acc;
        }, {});
    }

    /**
     * Aggregates member statuses.
     *
     * @returns {Promise<Array>} Status totals per date.
     */
    async getStatuses() {
        const results = await this._MemberStatusEvent.findAll({
            aggregateStatusCounts: true
        });

        return results.toJSON().reduce((acc, result, index) => {
            if (index === 0) {
                acc.push({
                    date: result.date,
                    paid: result.paid_delta,
                    comped: result.comped_delta,
                    free: result.free_delta
                });
            } else {
                acc.push({
                    date: result.date,
                    paid: acc[index - 1].paid + result.paid_delta,
                    comped: acc[index - 1].comped + result.comped_delta,
                    free: acc[index - 1].free + result.free_delta
                });
            }
            return acc;
        }, []);
    }
}