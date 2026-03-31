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

class SubscriptionAttacher {
    constructor(memberRepository) {
        this.memberRepository = memberRepository;
    }

    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return;
        }

        const subscriptionProducts = this.getActiveSubscriptionProductIds(member);
        this.removeIncompleteSubscriptions(member);
        this.addMissingComplimentarySubscriptions(member, subscriptionProducts);
        this.ensureAllSubscriptionsHaveTier(member);
    }

    getActiveSubscriptionProductIds(member) {
        return (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);
    }

    removeIncompleteSubscriptions(member) {
        member.subscriptions = member.subscriptions.filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );
    }

    addMissingComplimentarySubscriptions(member, subscriptionProducts) {
        for (const product of member.products) {
            if (!subscriptionProducts.includes(product.id)) {
                member.subscriptions.push(this.buildComplimentarySubscription(member, product));
            }
        }
    }

    buildComplimentarySubscription(member, product) {
        const startDate = this.getSubscriptionStartDate(member, product);
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

    getSubscriptionStartDate(member, product) {
        const productAddEvent = member.productEvents.find(event => event.product_id === product.id);
        if (productAddEvent && productAddEvent.action === 'added') {
            return moment(productAddEvent.created_at);
        }
        return moment();
    }

    ensureAllSubscriptionsHaveTier(member) {
        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(
                    product => product.id === subscription.price.product.product_id
                );
            }
        }
    }
}

class OfferAttacher {
    constructor(offersAPI) {
        this.offersAPI = offersAPI;
        this.fetchedOffers = new Map();
    }

    async fetchSubscriptionOffers(subscriptions) {
        const subscriptionOffers = new Map();

        try {
            for (const subscriptionModel of subscriptions) {
                const offerId = subscriptionModel.get('offer_id');
                if (!offerId) {
                    continue;
                }

                const offer = await this.getOrFetchOffer(offerId);
                subscriptionOffers.set(subscriptionModel.get('subscription_id'), offer);
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return subscriptionOffers;
    }

    async getOrFetchOffer(offerId) {
        if (!this.fetchedOffers.has(offerId)) {
            const offer = await this.offersAPI.getOffer({id: offerId});
            this.fetchedOffers.set(offerId, offer);
        }
        return this.fetchedOffers.get(offerId);
    }

    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.offer = subscriptionOffers.get(subscription.id) || null;
            return subscription;
        });
    }
}

class PaymentAttacher {
    constructor(nextPaymentCalculator) {
        this.nextPaymentCalculator = nextPaymentCalculator;
    }

    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }
}

class AttributionAttacher {
    constructor(memberAttributionService) {
        this.memberAttributionService = memberAttributionService;
    }

    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const subscription of member.subscriptions) {
            if (!subscription.id) {
                continue;
            }

            const id = subscriptionIdMap.get(subscription.id);
            if (!id) {
                continue;
            }
            subscription.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(id);
        }
    }
}

class MemberEnricher {
    constructor(emailSuppressionList, settingsHelpers) {
        this.emailSuppressionList = emailSuppressionList;
        this.settingsHelpers = settingsHelpers;
    }

    async enrichMemberWithSuppression(member) {
        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!member.email_disabled,
            info: suppressionData.info
        };
    }

    enrichMemberWithUnsubscribeUrl(member) {
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    async enrichMember(member) {
        await this.enrichMemberWithSuppression(member);
        this.enrichMemberWithUnsubscribeUrl(member);
    }
}

class CommentingManager {
    constructor(memberRepository, commentsService) {
        this.memberRepository = memberRepository;
        this.commentsService = commentsService;
    }

    async getMemberOrThrow(memberId) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }
        return model;
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const model = await this.getMemberOrThrow(memberId);
        const commenting = model.get('commenting');
        const updated = commenting.disable(reason, until);

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            'commenting_disabled',
            context
        );

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
        }
    }

    async enableCommenting(memberId, context) {
        const model = await this.getMemberOrThrow(memberId);
        const commenting = model.get('commenting');
        const updated = commenting.enable();

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            'commenting_enabled',
            context
        );
    }
}

class StripeValidator {
    constructor(stripeService) {
        this.stripeService = stripeService;
    }

    validateStripeConfigured(data) {
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
}

class StripeLinker {
    constructor(memberRepository) {
        this.memberRepository = memberRepository;
    }

    async linkStripeCustomer(stripeCustomerId, memberId, options) {
        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: stripeCustomerId,
                member_id: memberId
            }, this.extractSharedOptions(options));
        } catch (error) {
            await this.handleStripeLinkingError(error, memberId, options);
        }
    }

    extractSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    async handleStripeLinkingError(error, memberId, options) {
        const isStripeLinkingError = error.message && error.message.match(/customer|plan|subscription/g);
        if (isStripeLinkingError) {
            if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                error.message = `Member not imported. ${error.message}`;
                error.context = 'Missing Stripe Customer';
                error.help = 'Make sure you\'re connected to the correct Stripe Account';
            }
            await this.memberRepository.destroy({id: memberId}, options);
        }
        throw error;
    }
}

class ComplementarySubscriptionManager {
    constructor(memberRepository, stripeService) {
        this.memberRepository = memberRepository;
        this.stripeService = stripeService;
    }

    async manageComplementarySubscription(model, data, options) {
        if (!this.stripeService.configured || typeof data.comped !== 'boolean') {
            return;
        }

        const hasCompedSubscription = this.hasActiveComplimentarySubscription(model);

        if (data.comped && !hasCompedSubscription) {
            await this.memberRepository.setComplimentarySubscription(model, this.extractContextOptions(options));
        } else if (!data.comped && hasCompedSubscription) {
            await this.memberRepository.removeComplimentarySubscription(model, this.extractContextOptions(options));
        }
    }

    hasActiveComplimentarySubscription(model) {
        return !!model.related('stripeSubscriptions').find(
            sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active'
        );
    }

    extractContextOptions(options) {
        return {
            context: options.context,
            transacting: options.transacting
        };
    }
}

class WithRelatedBuilder {
    static build(options = {}) {
        const withRelated = new Set((options.withRelated || []).concat(DEFAULT_WITH_RELATED));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return Array.from(withRelated);
    }
}

module.exports = class MemberBREADService {
    constructor({
        memberRepository, labsService, emailService, stripeService, offersAPI,
        memberAttributionService, emailSuppressionList, settingsHelpers,
        nextPaymentCalculator, commentsService
    }) {
        this.memberRepository = memberRepository;
        this.labsService = labsService;
        this.emailService = emailService;
        this.stripeService = stripeService;
        this.offersAPI = offersAPI;
        this.memberAttributionService = memberAttributionService;
        this.emailSuppressionList = emailSuppressionList;
        this.settingsHelpers = settingsHelpers;
        this.nextPaymentCalculator = nextPaymentCalculator;
        this.commentsService = commentsService;

        this.subscriptionAttacher = new SubscriptionAttacher(memberRepository);
        this.offerAttacher = new OfferAttacher(offersAPI);
        this.paymentAttacher = new PaymentAttacher(nextPaymentCalculator);
        this.attributionAttacher = new AttributionAttacher(memberAttributionService);
        this.memberEnricher = new MemberEnricher(emailSuppressionList, settingsHelpers);
        this.commentingManager = new CommentingManager(memberRepository, commentsService);
        this.stripeValidator = new StripeValidator(stripeService);
        this.stripeLinker = new StripeLinker(memberRepository);
        this.complementarySubscriptionManager = new ComplementarySubscriptionManager(memberRepository, stripeService);
    }

    buildSubscriptionIdMap(model) {
        const subscriptionIdMap = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }
        return subscriptionIdMap;
    }

    async enrichMemberData(member, model, options, subscriptionIdMap) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.subscriptionAttacher.attachSubscriptionsToMember(member);
        this.offerAttacher.attachOffersToSubscriptions(
            member,
            await this.offerAttacher.fetchSubscriptionOffers(model.related('stripeSubscriptions'))
        );
        this.paymentAttacher.attachNextPaymentToSubscriptions(member);
        await this.attributionAttacher.attachAttributionsToMember(member, subscriptionIdMap);
        await this.memberEnricher.enrichMember(member);
    }

    async read(data, options = {}) {
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: WithRelatedBuilder.build(options)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model);
        const member = model.toJSON(options);

        await this.enrichMemberData(member, model, options, subscriptionIdMap);

        return member;
    }

    async add(data, options) {
        this.stripeValidator.validateStripe