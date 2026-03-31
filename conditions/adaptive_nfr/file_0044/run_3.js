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

const DEFAULT_WITH_RELATED = [
    'labels',
    'stripeSubscriptions',
    'stripeSubscriptions.customer',
    'stripeSubscriptions.stripePrice',
    'stripeSubscriptions.stripePrice.stripeProduct',
    'stripeSubscriptions.stripePrice.stripeProduct.product',
    'products',
    'newsletters'
];

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
     * @private
     * Builds the withRelated set from provided options, ensuring required relations are included.
     */
    buildWithRelated(optionsWithRelated = []) {
        const withRelated = new Set(optionsWithRelated.concat(DEFAULT_WITH_RELATED));
        withRelated.add('productEvents');
        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }
        return withRelated;
    }

    /**
     * @private
     * Builds a complimentary subscription object for a product.
     */
    buildComplimentarySubscription(product, member, startDate) {
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
     * @private
     * Resolves the start date for a complimentary subscription from product events.
     */
    resolveComplimentaryStartDate(member, productId) {
        const productAddEvent = (member.productEvents || []).find(
            event => event.product_id === productId
        );
        return productAddEvent?.action === 'added'
            ? moment(productAddEvent.created_at)
            : moment();
    }

    /**
     * @private
     * Adds missing complimentary subscriptions to a member and ensures tier is set on all subscriptions.
     */
    attachSubscriptionsToMember(member) {
        if (!Array.isArray(member.products)) {
            return member;
        }

        const activeSubscriptionProductIds = new Set(
            (member.subscriptions || [])
                .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
                .map(sub => sub.price.product.product_id)
        );

        member.subscriptions = member.subscriptions.filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );

        for (const product of member.products) {
            if (!activeSubscriptionProductIds.has(product.id)) {
                const startDate = this.resolveComplimentaryStartDate(member, product.id);
                member.subscriptions.push(this.buildComplimentarySubscription(product, member, startDate));
            }
        }

        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(
                    product => product.id === subscription.price.product.product_id
                );
            }
        }
    }

    /**
     * @private
     * Builds a map between subscriptions and their offer representation.
     * @returns {Promise<Map<string, OfferDTO>>}
     */
    async fetchSubscriptionOffers(subscriptions) {
        const fetchedOffers = new Map();
        const subscriptionOffers = new Map();

        try {
            for (const subscriptionModel of subscriptions) {
                const offerId = subscriptionModel.get('offer_id');
                if (!offerId) {
                    continue;
                }

                if (!fetchedOffers.has(offerId)) {
                    fetchedOffers.set(offerId, await this.offersAPI.getOffer({id: offerId}));
                }

                subscriptionOffers.set(
                    subscriptionModel.get('subscription_id'),
                    fetchedOffers.get(offerId)
                );
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return subscriptionOffers;
    }

    /**
     * @private
     * @param {Object} member JSON serialized member
     * @param {Map<string, OfferDTO>} subscriptionOffers
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map(subscription => ({
            ...subscription,
            offer: subscriptionOffers.get(subscription.id) ?? null
        }));
    }

    /**
     * @private
     * Attaches next_payment information to each subscription.
     * Must be called after attachOffersToSubscriptions.
     * @param {Object} member JSON serialized member
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(subscription => ({
            ...subscription,
            next_payment: this.nextPaymentCalculator.calculate(subscription)
        }));
    }

    /**
     * @private
     * Attaches attribution data to a member and their subscriptions.
     */
    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const subscription of member.subscriptions) {
            if (!subscription.id) {
                continue;
            }
            const id = subscriptionIdMap.get(subscription.id);
            if (id) {
                subscription.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(id);
            }
        }
    }

    /**
     * @private
     * Builds a subscriptionId -> databaseId map from a model's stripeSubscriptions relation.
     */
    buildSubscriptionIdMap(model) {
        const map = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            map.set(subscription.get('subscription_id'), subscription.id);
        }
        return map;
    }

    /**
     * @private
     * Enriches a serialized member with subscriptions, offers, next payment, and suppression data.
     */
    async enrichMember(member, model, options, {offerMap, suppressionData}) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, offerMap);
        this.attachNextPaymentToSubscriptions(member);

        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    /**
     * @private
     * Extracts shared transacting/context options for downstream calls.
     */
    extractSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Throws a ValidationError for duplicate member email.
     */
    throwMemberAlreadyExistsError(context) {
        throw new errors.ValidationError({
            message: tpl(messages.memberAlreadyExists),
            context,
            property: 'email'
        });
    }

    /**
     * @private
     * Fetches a member model by ID, throwing NotFoundError if missing.
     */
    async requireMemberById(memberId) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
        }
        return model;
    }

    /**
     * @private
     * Shared logic for updating commenting state on a member.
     */
    async updateCommentingState(memberId, updateFn, eventName, context) {
        const model = await this.requireMemberById(memberId);
        const commenting = model.get('commenting');
        const updated = updateFn(commenting);

        await this.memberRepository.saveCommenting(memberId, updated, eventName, context);
        return this.read({id: memberId});
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async read(data, options = {}) {
        const withRelated = this.buildWithRelated(options.withRelated);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model);
        const member = model.toJSON(options);

        const offerMap = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);

        await this.enrichMember(member, model, options, {offerMap, suppressionData});
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        return member;
    }

    async add(data, options) {
        if (!this.stripeService.configured && (data.comped || data.stripe_customer_id)) {
            const property = data.comped ? 'comped' : 'stripe_customer_id';
            throw new errors.ValidationError({
                message: tpl(messages.stripeNotConnected),
                context: 'Attempting to import members with Stripe data when there is no Stripe account connected.',
                help: 'You need to connect to Stripe to import Stripe customers. ',
                property
            });
        }

        const model = await this.createMember(data, options);
        const sharedOptions = this.extractSharedOptions(options);

        await this.linkStripeCustomerIfNeeded(data, model, options, sharedOptions);

        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'),
                requestedType: options.email_type
            });
        }

        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     */
    async createMember(data, options) {
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            return await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().includes('unique')) {
                this.throwMemberAlreadyExistsError('Attempting to add member with existing email address');
            }
            throw error;
        }
    }

    /**
     * @private
     */
    async linkStripeCustomerIfNeeded(data, model, options, sharedOptions) {
        if (!data.stripe_customer_id) {
            return;
        }

        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            const isStripeLinkingError = error.message?.match(/customer|plan|subscription/g);
            if (isStripeLinkingError) {
                if (error.message.includes('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }
                await this.memberRepository.destroy({id: model.id}, options);
            }
            throw error;
        }
    }

    async edit(data, options) {
        delete data.last_seen_at;

        const model = await this.updateMember(data, options);

        if (this.stripeService.configured && typeof data.comped === 'boolean') {
            await this.syncComplimentarySubscription(model, data.comped, options);
        }

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     */
    async updateMember(data, options) {
        try {
            if (data.email) {
                const suppressionData = await this.emailSuppressionList.getSuppressionData(data.email);
                data.email_disabled = !!suppressionData?.suppressed;
            }
            return await this