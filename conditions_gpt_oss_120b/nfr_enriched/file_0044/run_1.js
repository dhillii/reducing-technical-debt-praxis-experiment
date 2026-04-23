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
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Attach complimentary subscriptions and ensure tier consistency.
     * @param {Object} member
     */
    attachSubscriptionsToMember(member) {
        if (!Array.isArray(member.products)) {
            return member;
        }

        const activeProductIds = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        // Remove incomplete subscriptions
        member.subscriptions = (member.subscriptions || []).filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        for (const product of member.products) {
            if (!activeProductIds.includes(product.id)) {
                const productAddEvent = member.productEvents?.find(event => event.product_id === product.id);
                const startDate = (!productAddEvent || productAddEvent.action !== 'added')
                    ? moment()
                    : moment(productAddEvent.created_at);

                member.subscriptions.push(this._buildComplimentarySubscription(member, product, startDate));
            }
        }

        // Ensure tier reference exists for each subscription
        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(p => p.id === subscription.price.product.product_id);
            }
        }
    }

    /**
     * Build a complimentary subscription object.
     * @private
     */
    _buildComplimentarySubscription(member, product, startDate) {
        return {
            id: '',
            tier: product,
            customer: {
                id: '',
                name: member.name,
                email: member.email
            },
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
                product: {
                    id: '',
                    product_id: product.id
                }
            }
        };
    }

    /**
     * Fetch offers for a list of subscription models.
     * @param {Array} subscriptions
     * @returns {Promise<Map<string, OfferDTO>>}
     */
    async fetchSubscriptionOffers(subscriptions) {
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
     * Attach offers map to member subscriptions.
     * @param {Object} member
     * @param {Map<string, OfferDTO>} offersMap
     */
    attachOffersToSubscriptions(member, offersMap) {
        member.subscriptions = member.subscriptions.map(sub => {
            sub.offer = offersMap.get(sub.id) || null;
            return sub;
        });
    }

    /**
     * Attach next payment info to each subscription.
     * @param {Object} member
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(sub => {
            sub.next_payment = this.nextPaymentCalculator.calculate(sub);
            return sub;
        });
    }

    /**
     * Attach attribution data to member and its subscriptions.
     * @param {Object} member
     * @param {Map<string, string>} subscriptionIdMap
     */
    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const sub of member.subscriptions) {
            if (!sub.id) continue;
            const dbId = subscriptionIdMap.get(sub.id);
            if (!dbId) continue;
            sub.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(dbId);
        }
    }

    /**
     * Build the default set of related models for read/browse.
     * @param {Object} options
     * @returns {Set<string>}
     */
    _buildDefaultWithRelated(options) {
        const base = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];
        const withRelated = new Set((options.withRelated || []).concat(base));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }
        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }
        return withRelated;
    }

    /**
     * Populate email suppression and unsubscribe URL on a member object.
     * @param {Object} member
     * @param {Object} suppressionData
     */
    _enrichMemberWithEmailInfo(member, suppressionData) {
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!member.email_disabled,
            info: suppressionData.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async read(data, options = {}) {
        const withRelated = this._buildDefaultWithRelated(options);
        const model = await this.memberRepository.get(data, {...options, withRelated: Array.from(withRelated)});

        if (!model) return null;

        const subscriptionIdMap = new Map();
        for (const sub of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(sub.get('subscription_id'), sub.id);
        }

        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(s => !!s.price);

        this.attachSubscriptionsToMember(member);
        const offersMap = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        this.attachOffersToSubscriptions(member, offersMap);
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppression = await this.emailSuppressionList.getSuppressionData(member.email);
        this._enrichMemberWithEmailInfo(member, suppression);

        return member;
    }

    async add(data, options) {
        this._validateStripePrerequisite(data);

        const model = await this._createMemberWithAttribution(data, options);
        await this._linkStripeCustomerIfNeeded(data, model, options);
        await this._handlePostCreateActions(data, model, options);

        return this.read({id: model.id}, options);
    }

    /**
     * Validate Stripe related fields when Stripe is not configured.
     * @private
     */
    _validateStripePrerequisite(data) {
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
     * Create member record and attach attribution if available.
     * @private
     */
    async _createMemberWithAttribution(data, options) {
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
     * Link Stripe customer to member if stripe_customer_id is provided.
     * @private
     */
    async _linkStripeCustomerIfNeeded(data, model, options) {
        if (!data.stripe_customer_id) return;

        const sharedOptions = {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };

        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            await this._handleStripeLinkError(error, model, options);
            throw error;
        }
    }

    /**
     * Cleanup on Stripe linking errors and rethrow.
     * @private
     */
    async _handleStripeLinkError(error, model, options) {
        const isStripeLinkingError = error.message && /customer|plan|subscription/.test(error.message);
        if (isStripeLinkingError) {
            if (error.message.includes('customer') && error.code === 'resource_missing') {
                error.message = `Member not imported. ${error.message}`;
                error.context = 'Missing Stripe Customer';
                error.help = "Make sure you're connected to the correct Stripe Account";
            }
            await this.memberRepository.destroy({id: model.id}, options);
        }
    }

    /**
     * Execute actions after member creation (email, comped subscription).
     * @private
     */
    async _handlePostCreateActions(data, model, options) {
        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'),
                requestedType: options.email_type
            });
        }

        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
    }

    async edit(data, options) {
        delete data.last_seen_at;

        const model = await this._updateMemberWithSuppression(data, options);
        if (this.stripeService.configured) {
            await this._syncCompedSubscription(model, data, options);
        }
        return this.read({id: model.id}, options);
    }

    /**
     * Update member and adjust email_disabled based on suppression list.
     * @private
     */
    async _updateMemberWithSuppression(data, options) {
        try {
            if (data.email) {
                const suppression = await this.emailSuppressionList.getSuppressionData(data.email);
                data.email_disabled = !!suppression?.suppressed;
            }
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
     * Ensure complimentary subscription state matches the `comped` flag.
     * @private
     */
    async _syncCompedSubscription(model, data, options) {
        const hasComped = !!model.related('stripeSubscriptions')
            .find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

        if (typeof data.comped !== 'boolean') return;

        if (data.comped && !hasComped) {
            await this.memberRepository.setComplimentarySubscription(model, {
                context: options.context,
                transacting: options.transacting
            });
        } else if (!data.comped && hasComped) {
            await this.memberRepository.removeComplimentarySubscription(model, {
                context: options.context,
                transacting: options.transacting
            });
        }
    }

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
        this._normalizeBrowseOptions(options);
        const withRelated = this._buildDefaultWithRelated(options);
        const page = await this.memberRepository.list({
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!page) return null;

        const subscriptions = page.data.flatMap(m => m.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppression = await this.emailSuppressionList.getBulkSuppressionData(page.data.map(m => m.get('email')));

        const data = page.data.map((model, idx) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(s => !!s.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);
            if (!options.withRelated?.includes('products')) {
                delete member.products;
            }
            this._enrichMemberWithEmailInfo(member, bulkSuppression[idx]);
            return member;
        });

        return {data, meta: page.meta};
    }

    /**
     * Ensure browse limit does not exceed allowed maximum.
     * @private
     */
    _normalizeBrowseOptions(options) {
        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }
        options.useBasicCount = true;
    }
};