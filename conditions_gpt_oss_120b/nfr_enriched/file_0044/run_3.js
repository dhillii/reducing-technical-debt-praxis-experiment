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

    /**
     * Adds missing complimentary subscriptions and ensures tier consistency.
     * @private
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
        member.subscriptions = (member.subscriptions || []).filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );

        // Add missing complimentary subscriptions
        for (const product of member.products) {
            if (activeProductIds.includes(product.id)) continue;

            const productAddEvent = member.productEvents?.find(event => event.product_id === product.id);
            const startDate = (!productAddEvent || productAddEvent.action !== 'added')
                ? moment()
                : moment(productAddEvent.created_at);

            member.subscriptions.push(this._buildComplimentarySubscription(member, product, startDate));
        }

        // Ensure tier reference exists on each subscription
        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(p => p.id === subscription.price.product.product_id);
            }
        }
    }

    /**
     * Builds a complimentary subscription object.
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
     * Fetches offers for a list of subscription models.
     * @private
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
     * Attaches offers to member subscriptions.
     * @private
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map(sub => ({
            ...sub,
            offer: subscriptionOffers.get(sub.id) || null
        }));
    }

    /**
     * Attaches next payment info to member subscriptions.
     * @private
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(sub => ({
            ...sub,
            next_payment: this.nextPaymentCalculator.calculate(sub)
        }));
    }

    /**
     * Attaches attribution data to member and its subscriptions.
     * @private
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
     * Builds the complete withRelated set for read/browse operations.
     * @private
     */
    _buildWithRelated(options, defaultRelations) {
        const withRelated = new Set((options.withRelated || []).concat(defaultRelations));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }
        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return Array.from(withRelated);
    }

    /**
     * Maps Stripe subscription IDs to internal DB IDs.
     * @private
     */
    _mapSubscriptionIds(model) {
        const map = new Map();
        for (const sub of model.related('stripeSubscriptions')) {
            map.set(sub.get('subscription_id'), sub.id);
        }
        return map;
    }

    /**
     * Enriches a member JSON object with subscriptions, offers, payments, attributions, and suppression data.
     * @private
     */
    async _enrichMember(member, model, subscriptionIdMap, originalWithRelated) {
        member.subscriptions = member.subscriptions.filter(s => !!s.price);
        this.attachSubscriptionsToMember(member);
        const offers = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        this.attachOffersToSubscriptions(member, offers);
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppression = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppression.suppressed || !!model.get('email_disabled'),
            info: suppression.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        if (!originalWithRelated.includes('products')) {
            delete member.products;
        }
    }

    async read(data, options = {}) {
        const defaultRelations = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        const withRelated = this._buildWithRelated(options, defaultRelations);
        const model = await this.memberRepository.get(data, {...options, withRelated});

        if (!model) return null;

        const subscriptionIdMap = this._mapSubscriptionIds(model);
        const member = model.toJSON(options);
        await this._enrichMember(member, model, subscriptionIdMap, options.withRelated || []);

        return member;
    }

    async add(data, options) {
        this._ensureStripeConnectionForImport(data);

        let model;
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) data.attribution = attribution;
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            this._handleUniqueConstraintError(error, messages.memberAlreadyExists, 'email');
        }

        const sharedOptions = {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };

        await this._linkStripeCustomerIfNeeded(data, model, sharedOptions);
        await this._sendWelcomeEmailIfRequested(data, model, options);
        await this._applyComplimentaryIfRequested(data, model, options);

        return this.read({id: model.id}, options);
    }

    /**
     * Validates Stripe connection when importing Stripe related data.
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
     * Handles unique constraint violations.
     * @private
     */
    _handleUniqueConstraintError(error, message, property) {
        if (error.code && error.message.toLowerCase().includes('unique')) {
            throw new errors.ValidationError({
                message: tpl(message),
                context: `Attempting to ${property === 'email' ? 'add' : 'edit'} member with existing email address`,
                property
            });
        }
        throw error;
    }

    /**
     * Links a Stripe customer to the newly created member.
     * @private
     */
    async _linkStripeCustomerIfNeeded(data, model, sharedOptions) {
        if (!data.stripe_customer_id) return;

        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            await this._handleStripeLinkError(error, model);
        }
    }

    /**
     * Cleans up member on Stripe linking failure and rethrows.
     * @private
     */
    async _handleStripeLinkError(error, model) {
        const isStripeError = error.message && /customer|plan|subscription/.test(error.message);
        if (isStripeError) {
            if (error.message.includes('customer') && error.code === 'resource_missing') {
                error.message = `Member not imported. ${error.message}`;
                error.context = 'Missing Stripe Customer';
                error.help = "Make sure you're connected to the correct Stripe Account";
            }
            await this.memberRepository.destroy({id: model.id}, {});
        }
        throw error;
    }

    /**
     * Sends a magic link email if requested.
     * @private
     */
    async _sendWelcomeEmailIfRequested(data, model, options) {
        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'),
                requestedType: options.email_type
            });
        }
    }

    /**
     * Applies complimentary subscription if requested.
     * @private
     */
    async _applyComplimentaryIfRequested(data, model, options) {
        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
    }

    async edit(data, options) {
        delete data.last_seen_at;

        if (data.email) {
            const suppression = await this.emailSuppressionList.getSuppressionData(data.email);
            data.email_disabled = !!suppression?.suppressed;
        }

        let model;
        try {
            model = await this.memberRepository.update(data, options);
        } catch (error) {
            this._handleUniqueConstraintError(error, messages.memberAlreadyExists, 'email');
        }

        if (this.stripeService.configured) {
            await this._syncComplimentarySubscription(model, data, options);
        }

        return this.read({id: model.id}, options);
    }

    /**
     * Synchronises complimentary subscription based on edit payload.
     * @private
     */
    async _syncComplimentarySubscription(model, data, options) {
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

    /**
     * Disables commenting for a member.
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
     * Enables commenting for a member.
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
        const defaultRelations = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        const withRelated = this._buildWithRelated(options, defaultRelations);
        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated
        });

        if (!page) return null;

        const subscriptions = page.data.flatMap(m => m.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppression = await this.emailSuppressionList.getBulkSuppressionData(
            page.data.map(m => m.get('email'))
        );

        const data = page.data.map((model, idx) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(s => !!s.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);
            member.email_suppression = {
                suppressed: bulkSuppression[idx].suppressed || !!model.get('email_disabled'),
                info: bulkSuppression[idx].info
            };
            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
            if (!options.withRelated?.includes('products')) {
                delete member.products;
            }
            return member;
        });

        return {data, meta: page.meta};
    }
};
```