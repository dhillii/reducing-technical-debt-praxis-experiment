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

const SHARED_OPTIONS_KEYS = ['transacting', 'context'];

module.exports = class MemberBREADService {
    /**
     * @param {object} deps
     * @param {import('../repositories/member-repository')} deps.memberRepository
     * @param {import('@tryghost/members-offers/lib/application/OffersAPI')} deps.offersAPI
     * @param {object} deps.labsService
     * @param {object} deps.emailService
     * @param {object} deps.stripeService
     * @param {import('@tryghost/member-attribution/lib/service')} deps.memberAttributionService
     * @param {object} deps.emailSuppressionList
     * @param {object} deps.settingsHelpers
     * @param {object} deps.nextPaymentCalculator
     * @param {object} deps.commentsService
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
     * @private
     */
    buildComplimentarySubscription(product, member, productAddEvent) {
        const startDate = this.getSubscriptionStartDate(productAddEvent);

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
    getSubscriptionStartDate(productAddEvent) {
        if (!productAddEvent || productAddEvent.action !== 'added') {
            return moment();
        }
        return moment(productAddEvent.created_at);
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

        member.subscriptions = member.subscriptions.filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );

        for (const product of member.products) {
            if (!subscriptionProducts.includes(product.id)) {
                const productAddEvent = member.productEvents.find(event => event.product_id === product.id);
                member.subscriptions.push(
                    this.buildComplimentarySubscription(product, member, productAddEvent)
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
     * @private
     * @returns {Promise<Map<string, object>>}
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
    async attachEmailSuppressionData(member, model) {
        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
    }

    /**
     * @private
     */
    attachUnsubscribeUrl(member) {
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    /**
     * @private
     */
    async enrichMember(model, subscriptionIdMap, options = {}) {
        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);
        await this.attachEmailSuppressionData(member, model);
        this.attachUnsubscribeUrl(member);

        return member;
    }

    async read(data, options = {}) {
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: this.buildWithRelated(options)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        return this.enrichMember(model, subscriptionIdMap, options);
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
                help: 'You need to connect to Stripe to import Stripe customers.',
                property
            });
        }
    }

    /**
     * @private
     */
    filterSharedOptions(options) {
        const sharedOptions = {};
        for (const key of SHARED_OPTIONS_KEYS) {
            if (options[key]) {
                sharedOptions[key] = options[key];
            }
        }
        return sharedOptions;
    }

    /**
     * @private
     */
    async linkStripeCustomer(model, data, sharedOptions) {
        if (!data.stripe_customer_id) {
            return;
        }

        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            const isStripeLinkingError = error.message && error.message.match(/customer|plan|subscription/g);
            if (isStripeLinkingError) {
                if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }
                await this.memberRepository.destroy({id: model.id}, sharedOptions);
            }
            throw error;
        }
    }

    /**
     * @private
     */
    async sendMagicLinkEmail(model, options) {
        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'),
                requestedType: options.email_type
            });
        }
    }

    /**
     * @private
     */
    async setComplimentarySubscription(model, data, options) {
        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
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
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        const sharedOptions = this.filterSharedOptions(options);

        await this.linkStripeCustomer(model, data, sharedOptions);
        await this.sendMagicLinkEmail(model, options);
        await this.setComplimentarySubscription(model, data, sharedOptions);

        return this.read({id: model.id}, options);
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
    async updateComplimentarySubscription(model, data, options) {
        if (!this.stripeService.configured || typeof data.comped !== 'boolean') {
            return;
        }

        const hasCompedSubscription = !!model.related('stripeSubscriptions').find(
            sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active'
        );

        const sharedOptions = this.filterSharedOptions(options);

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
            await this.updateEmailSuppression(data);
            model = await this.memberRepository.update(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to edit member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        await this.updateComplimentarySubscription(model, data, options);

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     */
    async updateCommentingStatus(memberId, updater, eventName, context) {
        const model = await this.memberRepository.get({id: memberId});

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }

        const commenting = model.get('commenting');
        const updated = updater(commenting);

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            eventName,
            context
        );

        return this.read({id: memberId});
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const member = await this.updateCommentingStatus(
            memberId,
            (commenting) => commenting.disable(reason, until),