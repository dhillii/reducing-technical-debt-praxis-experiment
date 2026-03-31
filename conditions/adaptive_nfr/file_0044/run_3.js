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
     * @private
     */
    buildComplimentarySubscription(product, member, productAddEvent) {
        const startDate = productAddEvent?.action === 'added' 
            ? moment(productAddEvent.created_at)
            : moment();

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
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        const subscriptionProducts = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        member.subscriptions = member.subscriptions.filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        for (const product of member.products) {
            if (!subscriptionProducts.includes(product.id)) {
                const productAddEvent = member.productEvents.find(event => event.product_id === product.id);
                member.subscriptions.push(this.buildComplimentarySubscription(product, member, productAddEvent));
            }
        }

        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(product => product.id === subscription.price.product.product_id);
            }
        }
    }

    /**
     * @private
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
     * @private
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.offer = subscriptionOffers.get(subscription.id) || null;
            return subscription;
        });
    }

    /**
     * @private
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }

    /**
     * @private
     */
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

    /**
     * @private
     */
    buildWithRelated(options = {}) {
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
     * @private
     */
    buildSubscriptionIdMap(stripeSubscriptions) {
        const subscriptionIdMap = new Map();
        for (const subscription of stripeSubscriptions) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }
        return subscriptionIdMap;
    }

    /**
     * @private
     */
    async enrichMember(member, model, subscriptionIdMap, options) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    /**
     * @private
     */
    validateStripeConnection(data) {
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
     * @private
     */
    handleUniqueConstraintError(context) {
        throw new errors.ValidationError({
            message: tpl(messages.memberAlreadyExists),
            context,
            property: 'email'
        });
    }

    /**
     * @private
     */
    buildSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     */
    isStripeLinkingError(error) {
        return error.message && /customer|plan|subscription/g.test(error.message);
    }

    /**
     * @private
     */
    async handleStripeCustomerLink(data, model, sharedOptions, options) {
        if (!data.stripe_customer_id) {
            return;
        }

        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            if (this.isStripeLinkingError(error)) {
                if (error.message.indexOf('customer') !== -1 && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }

                await this.memberRepository.destroy({id: model.id}, options);
            }
            throw error;
        }
    }

    /**
     * @private
     */
    async handleComplementarySubscription(data, model, options) {
        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
    }

    /**
     * @private
     */
    async updateEmailSuppression(data) {
        if (data.email) {
            const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
            data.email_disabled = !!isSuppressed;
        }
    }

    /**
     * @private
     */
    async updateComplementarySubscription(data, model, options) {
        if (!this.stripeService.configured || typeof data.comped !== 'boolean') {
            return;
        }

        const hasCompedSubscription = !!model.related('stripeSubscriptions').find(
            sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active'
        );

        const sharedOptions = {
            context: options.context,
            transacting: options.transacting
        };

        if (data.comped && !hasCompedSubscription) {
            await this.memberRepository.setComplimentarySubscription(model, sharedOptions);
        } else if (!data.comped && hasCompedSubscription) {
            await this.memberRepository.removeComplimentarySubscription(model, sharedOptions);
        }
    }

    /**
     * @private
     */
    async getMemberOrThrow(id) {
        const model = await this.memberRepository.get({id});
        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }
        return model;
    }

    /**
     * @private
     */
    async updateCommentingStatus(memberId, action, reason, until, context) {
        const model = await this.getMemberOrThrow(memberId);
        const commenting = model.get('commenting');
        const updated = commenting[action](reason, until);

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            `commenting_${action}d`,
            context
        );

        return updated;
    }

    /**
     * @private
     */
    enrichBrowseMember(member, model, offerMap, bulkSuppressionData, index, originalWithRelated) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, offerMap);
        this.attachNextPaymentToSubscriptions(member);

        if (!originalWithRelated.includes('products')) {
            delete member.products;
        }

        member.email_suppression = {
            suppressed: bulkSuppressionData[index].suppressed || !!model.get('email_disabled'),
            info: bulkSuppressionData[index].info
        };

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    async read(data, options = {}) {
        const withRelated = this.buildWithRelated(options);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        const member = model.toJSON(options);

        await this.enrichMember(member, model, subscriptionIdMap, options);

        return member;
    }

    async add(data, options) {
        this.validateStripeConnection(data);

        let model;

        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
                this.handleUniqueConstraintError('Attempting to add member with existing email address');
            }
            throw error;
        }

        const sharedOptions = this.buildSharedOptions(options);

        await this.handleStripeCustomerLink(data, model, sharedOptions, options);
        await this.handleComplementarySubscription(data, model, options);

        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'),
                requestedType: options.email_type
            });
        }