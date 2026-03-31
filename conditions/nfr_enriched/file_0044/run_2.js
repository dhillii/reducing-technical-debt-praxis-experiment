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

const COMPLIMENTARY_PLAN = {
    id: '',
    nickname: 'Complimentary',
    interval: 'year',
    currency: 'USD',
    amount: 0
};

const COMPLIMENTARY_PRICE = {
    id: '',
    price_id: '',
    nickname: 'Complimentary',
    amount: 0,
    interval: 'year',
    type: 'recurring',
    currency: 'USD'
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

class MemberBREADService {
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
    constructor({
        memberRepository,
        labsService,
        emailService,
        stripeService,
        offersAPI,
        memberAttributionService,
        emailSuppressionList,
        settingsHelpers,
        nextPaymentCalculator,
        commentsService
    }) {
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
     * Builds a complimentary subscription object
     * @private
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
            plan: COMPLIMENTARY_PLAN,
            status: 'active',
            start_date: startDate,
            default_payment_card_last4: '****',
            cancel_at_period_end: false,
            cancellation_reason: null,
            current_period_end: moment(product.expiry_at),
            price: {
                ...COMPLIMENTARY_PRICE,
                product: {
                    id: '',
                    product_id: product.id
                }
            }
        };
    }

    /**
     * Determines the start date for a complimentary subscription
     * @private
     */
    getComplimentaryStartDate(product, productEvents) {
        const productAddEvent = productEvents.find(event => event.product_id === product.id);
        if (productAddEvent && productAddEvent.action === 'added') {
            return moment(productAddEvent.created_at);
        }
        return moment();
    }

    /**
     * Adds missing complimentary subscriptions to a member and ensures tier is set correctly
     * @private
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
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
                const startDate = this.getComplimentaryStartDate(product, member.productEvents);
                member.subscriptions.push(
                    this.buildComplimentarySubscription(product, member, startDate)
                );
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
     * Builds a map between subscriptions and their offer representation
     * @private
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

                let offer = fetchedOffers.get(offerId);
                if (!offer) {
                    offer = await this.offersAPI.getOffer({id: offerId});
                    fetchedOffers.set(offerId, offer);
                }

                subscriptionOffers.set(subscriptionModel.get('subscription_id'), offer);
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return subscriptionOffers;
    }

    /**
     * Attaches offers to subscriptions
     * @private
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.offer = subscriptionOffers.get(subscription.id) || null;
            return subscription;
        });
    }

    /**
     * Attaches next_payment information to each subscription
     * @private
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }

    /**
     * Attaches attributions to member and subscriptions
     * @private
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
     * Normalizes withRelated options
     * @private
     */
    normalizeWithRelated(options = {}) {
        const withRelated = new Set((options.withRelated || []).concat(DEFAULT_WITH_RELATED));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return Array.from(withRelated);
    }

    /**
     * Builds subscription ID map from stripe subscriptions
     * @private
     */
    buildSubscriptionIdMap(stripeSubscriptions) {
        const map = new Map();
        for (const subscription of stripeSubscriptions) {
            map.set(subscription.get('subscription_id'), subscription.id);
        }
        return map;
    }

    /**
     * Enriches member with subscription and attribution data
     * @private
     */
    async enrichMemberData(member, model, options) {
        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));

        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(
            member,
            await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'))
        );
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    async read(data, options = {}) {
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: this.normalizeWithRelated(options)
        });

        if (!model) {
            return null;
        }

        const member = model.toJSON(options);
        await this.enrichMemberData(member, model, options);

        return member;
    }

    /**
     * Validates stripe configuration for member operations
     * @private
     */
    validateStripeConfiguration(data) {
        if (!this.stripeService.configured && (data.comped || data.stripe_customer_id)) {
            const property = data.comped ? 'comped' : 'stripe_customer_id';
            throw new errors.ValidationError({
                message: tpl(messages.stripeNotConnected),
                context: 'Attempting to import members with Stripe data when there is no Stripe account connected.',
                help: 'You need to connect to Stripe to import Stripe customers.',
                property
            });
        }
    }

    /**
     * Extracts shared options for downstream calls
     * @private
     */
    extractSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * Handles stripe customer linking errors
     * @private
     */
    handleStripeLinkingError(error) {
        const isStripeLinkingError = error.message && /customer|plan|subscription/g.test(error.message);
        if (isStripeLinkingError && error.message.includes('customer') && error.code === 'resource_missing') {
            error.message = `Member not imported. ${error.message}`;
            error.context = 'Missing Stripe Customer';
            error.help = 'Make sure you\'re connected to the correct Stripe Account';
        }
        return isStripeLinkingError;
    }

    async add(data, options) {
        this.validateStripeConfiguration(data);

        let model;

        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().includes('unique')) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        const sharedOptions = this.extractSharedOptions(options);

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, sharedOptions);
            }
        } catch (error) {
            if (this.handleStripeLinkingError(error)) {
                await this.memberRepository.destroy({id: model.id}, options);
            }
            throw error;
        }

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
     * Handles complimentary subscription changes
     * @private
     */
    async handleComplimentarySubscriptionChange(model, data, options) {
        if (!this.stripeService.configured || typeof data.comped !== 'boolean') {
            return;
        }

        const hasCompedSubscription = !!model.related('stripeSubscriptions').find(
            sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active'
        );

        const sharedOptions = this.extractSharedOptions(options);

        if (data.comped && !hasCompedSubscription) {
            await this.memberRepository.setComplimentarySubscription(model, sharedOptions);
        } else if (!data.comped && hasCompedSubscription) {
            await this.memberRepository.removeComplimentarySubscription(model, sharedOptions);
        }
    }

    async edit(data, options) {
        delete data.last_seen_at;

        let model;

        try {
            if (data.email) {
                const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
                data.email_disabled = !!isSuppressed;
            }

            model = await this.memberRepository.update(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().includes('unique')) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to edit member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        await this.handleComplimentarySubscriptionChange(model, data, options);

        return this.read({id: model.id}, options);
    }

    /**
     * Validates member exists
     * @private
     */
    async validateMemberExists(memberId) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }