```javascript
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const tpl = require('@tryghost/tpl');
const moment = require('moment');

const messages = {
    stripeNotConnected: 'Missing Stripe connection.',
    memberAlreadyExists: 'Member already exists.',
    memberNotFound: 'Member not found.'
};

/**
 * @typedef {object} ILabsService
 * @prop {(key: string) => boolean} isSet
 */

/**
 * @typedef {object} IEmailService
 * @prop {(data: {email: string, requestedType: string}) => Promise<any>} sendEmailWithMagicLink
 */

/**
 * @typedef {object} IStripeService
 * @prop {boolean} configured
 */

/**
 * @typedef {import('@tryghost/members-offers/lib/application/OfferMapper').OfferDTO} OfferDTO
 */

module.exports = class MemberBREADService {
    /**
     * @param {object} deps
     * @param {import('../repositories/member-repository')} deps.memberRepository
     * @param {import('@tryghost/members-offers/lib/application/OffersAPI')} deps.offersAPI
     * @param {ILabsService} deps.labsService
     * @param {IEmailService} deps.emailService
     * @param {IStripeService} deps.stripeService
     * @param {import('@tryghost/member-attribution/lib/service')} deps.memberAttributionService
     * @param {import('@tryghost/email-suppression-list/lib/email-suppression-list').IEmailSuppressionList} deps.emailSuppressionList
     * @param {import('@tryghost/settings-helpers')} deps.settingsHelpers
     * @param {import('./next-payment-calculator')} deps.nextPaymentCalculator
     */
    constructor({memberRepository, labsService, emailService, stripeService, offersAPI, memberAttributionService, emailSuppressionList, settingsHelpers, nextPaymentCalculator, commentsService}) {
        this.offersAPI = offersAPI;
        this.memberRepository = memberRepository;
        this.labsService = labsService;
        this.emailService = emailService;
        this.stripeService = stripeService;
        this.memberAttributionService = memberAttributionService;
        this.emailSuppressionList = emailSuppressionList;
        this.settingsHelpers = settingsHelpers;
        this.nextPaymentCalculator = nextPaymentCalculator;
        this.commentsService = commentsService;
    }

    // -------------------------------------------------------------------------
    // Private helpers – each with a single responsibility
    // -------------------------------------------------------------------------

    /**
     * Ensure a member has complimentary subscriptions for missing products.
     * @param {Object} member
     */
    _attachComplimentarySubscriptions(member) {
        if (!Array.isArray(member.products)) {
            return;
        }

        const activeProductIds = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        // Remove incomplete subscriptions
        member.subscriptions = (member.subscriptions || []).filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );

        for (const product of member.products) {
            if (activeProductIds.includes(product.id)) continue;

            const productAddEvent = member.productEvents?.find(event => event.product_id === product.id);
            const startDate = (!productAddEvent || productAddEvent.action !== 'added')
                ? moment()
                : moment(productAddEvent.created_at);

            member.subscriptions.push(this._buildComplimentarySubscription(member, product, startDate));
        }

        // Ensure tier reference exists on each subscription
        for (const sub of member.subscriptions) {
            if (!sub.tier) {
                sub.tier = member.products.find(p => p.id === sub.price.product.product_id);
            }
        }
    }

    /**
     * Build a complimentary subscription object.
     * @param {Object} member
     * @param {Object} product
     * @param {moment.Moment} startDate
     * @returns {Object}
     */
    _buildComplimentarySubscription(member, product, startDate) {
        return {
            id: '',
            tier: product,
            customer: {id: '', name: member.name, email: member.email},
            plan: {
                id: '',
                nickname: 'Complimentary',
                interval: 'year',
                currency: 'USD',
                amount: 0
            },
            status: 'active',
            start_date: startDate,
            default_payment_card_last4: '****',
            cancel_at_period_end: false,
            cancellation_reason: null,
            current_period_end: moment(product.expiry_at),
            price: {
                id: '',
                price_id: '',
                nickname: 'Complimentary',
                amount: 0,
                interval: 'year',
                type: 'recurring',
                currency: 'USD',
                product: {id: '', product_id: product.id}
            }
        };
    }

    /**
     * Fetch offers for a list of subscription models and return a map.
     * @param {Array} subscriptions
     * @returns {Promise<Map<string, OfferDTO>>}
     */
    async _fetchSubscriptionOffers(subscriptions) {
        const fetched = new Map();
        const result = new Map();

        try {
            for (const subModel of subscriptions) {
                const offerId = subModel.get('offer_id');
                if (!offerId) continue;

                let offer = fetched.get(offerId);
                if (!offer) {
                    offer = await this.offersAPI.getOffer({id: offerId});
                    fetched.set(offerId, offer);
                }
                result.set(subModel.get('subscription_id'), offer);
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return result;
    }

    /**
     * Attach offers to a member's subscriptions.
     * @param {Object} member
     * @param {Map<string, OfferDTO>} offersMap
     */
    _attachOffers(member, offersMap) {
        member.subscriptions = member.subscriptions.map(sub => ({
            ...sub,
            offer: offersMap.get(sub.id) || null
        }));
    }

    /**
     * Attach next payment information to a member's subscriptions.
     * @param {Object} member
     */
    _attachNextPayments(member) {
        member.subscriptions = member.subscriptions.map(sub => ({
            ...sub,
            next_payment: this.nextPaymentCalculator.calculate(sub)
        }));
    }

    /**
     * Attach attribution data to a member and its subscriptions.
     * @param {Object} member
     * @param {Map<string, string>} subscriptionIdMap
     */
    async _attachAttributions(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const sub of member.subscriptions) {
            if (!sub.id) continue;
            const dbId = subscriptionIdMap.get(sub.id);
            if (!dbId) continue;
            sub.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(dbId);
        }
    }

    /**
     * Build the set of relations to fetch based on options.
     * @param {Object} options
     * @param {Array<string>} defaults
     * @returns {Set<string>}
     */
    _buildWithRelatedSet(options, defaults) {
        const set = new Set((options.withRelated || []).concat(defaults));

        if (!set.has('productEvents')) set.add('productEvents');
        if (set.has('email_recipients')) set.add('email_recipients.email');

        return set;
    }

    /**
     * Map Stripe subscription IDs to internal DB IDs.
     * @param {Object} model
     * @returns {Map<string, string>}
     */
    _mapSubscriptionIds(model) {
        const map = new Map();
        for (const sub of model.related('stripeSubscriptions')) {
            map.set(sub.get('subscription_id'), sub.id);
        }
        return map;
    }

    /**
     * Populate common member fields (suppression, unsubscribe URL, etc.).
     * @param {Object} member
     * @param {Object} model
     * @param {Object} suppressionData
     */
    _populateMemberExtras(member, model, suppressionData) {
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async read(data, options = {}) {
        const defaultWithRelated = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        const withRelated = this._buildWithRelatedSet(options, defaultWithRelated);
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!model) return null;

        const subscriptionIdMap = this._mapSubscriptionIds(model);
        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);

        this._attachComplimentarySubscriptions(member);
        const offersMap = await this._fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        this._attachOffers(member, offersMap);
        this._attachNextPayments(member);
        await this._attachAttributions(member, subscriptionIdMap);

        const suppression = await this.emailSuppressionList.getSuppressionData(member.email);
        this._populateMemberExtras(member, model, suppression);

        return member;
    }

    async add(data, options) {
        this._ensureStripeConnectionForImport(data);

        const model = await this._createMemberModel(data, options);
        await this._linkStripeCustomerIfNeeded(data, model, options);
        await this._maybeSendWelcomeEmail(data, model, options);
        await this._maybeAddComplimentarySubscription(data, model, options);

        return this.read({id: model.id}, options);
    }

    /**
     * Validate Stripe connection when importing Stripe‑related data.
     * @private
     */
    _ensureStripeConnectionForImport(data) {
        if (!this.stripeService.configured && (data.comped || data.stripe_customer_id)) {
            const property = data.comped ? 'comped' : 'stripe_customer_id';
            throw new errors.ValidationError({
                message: tpl(messages.stripeNotConnected),
                context: 'Attempting to import members with Stripe data when there is no Stripe account connected.',
                help: 'You need to connect to Stripe to import Stripe customers. ',
                property
            });
        }
    }

    /**
     * Create a member model, handling attribution and duplicate‑email errors.
     * @private
     */
    async _createMemberModel(data, options) {
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) data.attribution = attribution;
            return await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && /unique/.test(error.message.toLowerCase())) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }
    }

    /**
     * Link a Stripe customer to the newly created member, cleaning up on failure.
     * @private
     */
    async _linkStripeCustomerIfNeeded(data, model, options) {
        if (!data.stripe_customer_id) return;

        const shared = this._filterSharedOptions(options);
        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, shared);
        } catch (error) {
            await this._handleStripeLinkError(error, model, options);
            throw error;
        }
    }

    /**
     * Keep only options relevant for downstream repository calls.
     * @private
     */
    _filterSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * Cleanup on Stripe linking failures.
     * @private
     */
    async _handleStripeLinkError(error, model, options) {
        const isStripeError = error.message && /customer|plan|subscription/.test(error.message);
        if (!isStripeError) return;

        if (error.message.includes('customer') && error.code === 'resource_missing') {
            error.message = `Member not imported. ${error.message}`;
            error.context = 'Missing Stripe Customer';
            error.help = "Make sure you're connected to the correct Stripe Account";
        }

        await this.memberRepository.destroy({id: model.id}, options);
    }

    /**
     * Send a magic‑link email if requested.
     * @private
     */
    async _maybeSendWelcomeEmail(data, model, options) {
        if (!options.send_email) return;
        await this.emailService.sendEmailWithMagicLink({
            email: model.get('email'),
            requestedType: options.email_type
        });
    }

    /**
     * Add a complimentary subscription when requested.
     * @private
     */
    async _maybeAddComplimentarySubscription(data, model, options) {
        if (!data.comped) return;
        await this.memberRepository.setComplimentarySubscription(model, options);
    }

    async edit(data, options) {
        delete data.last_seen_at;
        await this._maybeUpdateEmailSuppressionFlag(data);
        const model = await this._updateMemberModel(data, options);
        await this._syncComplimentarySubscription(data, model, options);
        return this.read({id: model.id}, options);
    }

    /**
     * Update email_disabled based on suppression list.
     * @private
     */
    async _maybeUpdateEmailSuppressionFlag(data) {
        if (!data.email) return;
        const suppression = await this.emailSuppressionList.getSuppressionData(data.email);
        data.email_disabled = !!suppression?.suppressed;
    }

    /**
     * Update the member record, handling duplicate‑email errors.
     * @private
     */
    async _updateMemberModel(data, options) {
        try {
            return await this.memberRepository.update(data, options);
        } catch (error) {
            if (error.code && /unique/.test(error.message.toLowerCase())) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to edit member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }
    }

    /**
     * Ensure complimentary subscription state matches the requested flag.
     * @private
     */
    async _syncComplimentarySubscription(data, model, options) {
        if (!this.stripeService.configured) return;

        const hasComped = !!model.related('stripeSubscriptions')
            .find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

        if (typeof data.comped !== 'boolean') return;

        const shared = {
            context: options.context,
            transacting: options.transacting
        };

        if (data.comped && !hasComped) {
            await this.memberRepository.setComplimentarySubscription(model, shared);
        } else if (!data.comped && hasComped) {
            await this.memberRepository.removeComplimentarySubscription(model, shared);
        }
    }

    /**
     * Disable commenting for a member.
     */
    async disableCommenting(memberId, reason, until, hideComments, context) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
        }

        const updated = model.get('commenting').disable(reason, until);
        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_disabled', context);

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
        }

        return this.read({id: memberId});
    }

    /**
     * Enable commenting for a member.
     */
    async enableCommenting(memberId, context) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
        }

        const updated = model.get('commenting').enable();
        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_enabled', context);
        return this.read({id: memberId});
    }

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    async browse(options) {
        const defaultWithRelated = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        this._enforceBrowseLimit(options);
        const withRelated = this._buildWithRelatedSet(options, defaultWithRelated);
        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!page) return null;

        const subscriptions = page.data.flatMap(m => m.related('stripeSubscriptions').slice());
        const offersMap = await this._fetchSubscriptionOffers(subscriptions);
        const bulkSuppression = await this.emailSuppressionList.getBulkSuppressionData(
            page.data.map(m => m.get('email'))
        );

        const data = page.data.map((model, idx) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
            this._attachComplimentarySubscriptions(member);
            this._attachOffers(member, offersMap);
            this._attachNextPayments(member);
            if (!options.withRelated?.includes('products')) delete member.products;
            this._populateMemberExtras(member, model, bulkSuppression[idx]);
            return member;
        });

        return {data, meta: page.meta};
    }

    /**
     * Enforce a maximum limit for browse queries.
     * @private
     */
    _enforceBrowseLimit(options) {
        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }
    }
};
```