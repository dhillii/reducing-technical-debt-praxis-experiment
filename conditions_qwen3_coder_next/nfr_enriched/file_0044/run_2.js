const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const tpl = require('@tryghost/tpl');
const moment = require('moment');

const messages = {
    stripeNotConnected: 'Missing Stripe connection.',
    memberAlreadyExists: 'Member already exists.',
    memberNotFound: 'Member not found.'
};

const SUBSCRIPTION_WITH_STRIPE_PROPERTIES = [
    'customer',
    'stripePrice',
    'stripePrice.stripeProduct',
    'stripePrice.stripeProduct.product'
];

module.exports = class MemberBREADService {
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
     * attachSubscriptionsToMember ensures all member products have corresponding active subscriptions.
     * Adds complimentary subscriptions for any missing products if needed.
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        const activeProductIds = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        member.subscriptions = member.subscriptions.filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        for (const product of member.products) {
            if (!activeProductIds.includes(product.id)) {
                const productAddEvent = member.productEvents.find(event => event.product_id === product.id);
                const startDate = !productAddEvent || productAddEvent.action !== 'added'
                    ? moment()
                    : moment(productAddEvent.created_at);

                member.subscriptions.push({
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
                });
            }
        }

        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(product => product.id === subscription.price.product.product_id);
            }
        }

        return member;
    }

    /**
     * fetchSubscriptionOffers retrieves offer data for all provided subscriptions and returns a mapping.
     */
    async fetchSubscriptionOffers(subscriptions) {
        const fetchedOffers = new Map();
        const subscriptionOffers = new Map();

        for (const sub of subscriptions) {
            const offerId = sub.get('offer_id');
            if (!offerId) {
                continue;
            }

            let offer = fetchedOffers.get(offerId);
            if (!offer) {
                try {
                    offer = await this.offersAPI.getOffer({id: offerId});
                    fetchedOffers.set(offerId, offer);
                } catch (e) {
                    logging.error(`Failed to load offer ${offerId}:`, e);
                }
            }

            if (offer) {
                subscriptionOffers.set(sub.get('subscription_id'), offer);
            }
        }

        return subscriptionOffers;
    }

    /**
     * attachOffersToSubscriptions enriches each subscription with its associated offer DTO.
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map(subscription => ({
            ...subscription,
            offer: subscriptionOffers.get(subscription.id) || null
        }));
    }

    /**
     * attachNextPaymentToSubscriptions calculates and adds next_payment info to each subscription.
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(subscription => ({
            ...subscription,
            next_payment: this.nextPaymentCalculator.calculate(subscription)
        }));
    }

    /**
     * attachAttributionsToMember populates member and subscription attribution metadata.
     */
    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const subscription of member.subscriptions) {
            if (!subscription.id) {
                continue;
            }

            const dbId = subscriptionIdMap.get(subscription.id);
            if (!dbId) {
                continue;
            }

            subscription.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(dbId);
        }
    }

    async read(data, options = {}) {
        const withRelated = [
            ...new Set([
                ...(options.withRelated || []),
                'labels',
                'stripeSubscriptions',
                ...SUBSCRIPTION_WITH_STRIPE_PROPERTIES,
                'products',
                'newsletters',
                'productEvents',
                ...(options.withRelated?.includes('email_recipients') ? ['email_recipients.email'] : [])
            ])
        ];

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        const member = model.toJSON(options);

        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        await this.attachOffersToSubscriptionsAndCalculateNextPayments(member, model.related('stripeSubscriptions'));
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    /**
     * Helper to enrich member subscriptions with offers and next_payment in a single pass.
     */
    async attachOffersToSubscriptionsAndCalculateNextPayments(member, subscriptions) {
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        this.attachOffersToSubscriptions(member, offerMap);
        this.attachNextPaymentToSubscriptions(member);
    }

    async add(data, options) {
        this.validateStripeImport(data);

        let model;

        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            this.handleMemberAlreadyExistsError(error);
        }

        const sharedOptions = this.extractSharedOptions(options);
        if (data.stripe_customer_id) {
            try {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, sharedOptions);
            } catch (error) {
                if (this.isStripeLinkingError(error)) {
                    if (error.message?.includes('customer') && error.code === 'resource_missing') {
                        error.message = `Member not imported. ${error.message}`;
                        error.context = 'Missing Stripe Customer';
                        error.help = 'Make sure you\'re connected to the correct Stripe Account';
                    }
                    await this.memberRepository.destroy({id: model.id}, options);
                }
                throw error;
            }
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
     * validateStripeImport ensures import attempts with Stripe identifiers only succeed when Stripe is configured.
     */
    validateStripeImport(data) {
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
     * handleMemberAlreadyExistsError adds user-friendly context for duplicate email errors.
     */
    handleMemberAlreadyExistsError(error) {
        if (error.code && error.message.toLowerCase().includes('unique')) {
            throw new errors.ValidationError({
                message: tpl(messages.memberAlreadyExists),
                context: 'Attempting to add member with existing email address',
                property: 'email'
            });
        }
        throw error;
    }

    /**
     * extractSharedOptions ensures only required options are passed to nested repository calls.
     */
    extractSharedOptions(options) {
        const sharedOptions = {};
        if (options.transacting) {
            sharedOptions.transacting = options.transacting;
        }
        if (options.context) {
            sharedOptions.context = options.context;
        }
        return sharedOptions;
    }

    /**
     * isStripeLinkingError checks if the given error is related to Stripe linking.
     */
    isStripeLinkingError(error) {
        return typeof error.message === 'string' && error.message.match(/customer|plan|subscription/g);
    }

    /**
     * buildSubscriptionIdMap maps Stripe subscription IDs to internal DB IDs.
     */
    buildSubscriptionIdMap(stripeSubscriptions) {
        const map = new Map();
        for (const sub of stripeSubscriptions) {
            map.set(sub.get('subscription_id'), sub.id);
        }
        return map;
    }

    async edit(data, options) {
        delete data.last_seen_at;

        if (data.email) {
            const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
            data.email_disabled = !!isSuppressed;
        }

        let model;

        try {
            model = await this.memberRepository.update(data, options);
        } catch (error) {
            this.handleMemberAlreadyExistsError(error);
        }

        if (this.stripeService.configured) {
            const hasCompedSubscription = model.related('stripeSubscriptions')
                .some(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

            if (typeof data.comped === 'boolean') {
                if (data.comped && !hasCompedSubscription) {
                    await this.memberRepository.setComplimentarySubscription(model, this.extractSharedOptions(options));
                } else if (!data.comped && hasCompedSubscription) {
                    await this.memberRepository.removeComplimentarySubscription(model, this.extractSharedOptions(options));
                }
            }
        }

        return this.read({id: model.id}, options);
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const model = await this.memberRepository.get({id: memberId});

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }

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

        return this.read({id: memberId});
    }

    async enableCommenting(memberId, context) {
        const model = await this.memberRepository.get({id: memberId});

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }

        const commenting = model.get('commenting');
        const updated = commenting.enable();

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            'commenting_enabled',
            context
        );

        return this.read({id: memberId});
    }

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    async browse(options) {
        const originalWithRelated = options.withRelated || [];

        const withRelated = [
            ...new Set([
                ...originalWithRelated,
                'labels',
                'stripeSubscriptions',
                ...SUBSCRIPTION_WITH_STRIPE_PROPERTIES,
                'products',
                'newsletters',
                'productEvents',
                ...(originalWithRelated.includes('email_recipients') ? ['email_recipients.email'] : [])
            ])
        ];

        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated
        });

        if (!page) {
            return null;
        }

        const subscriptions = page.data.flatMap(model => model.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(
            page.data.map(model => model.get('email'))
        );

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);

            member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);

            if (!originalWithRelated.includes('products')) {
                delete member.products;
            }

            member.email_suppression = {
                suppressed: bulkSuppressionData[index]?.suppressed || !!model.get('email_disabled'),
                info: bulkSuppressionData[index]?.info
            };
            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

            return member;
        });

        return {
            data,
            meta: page.meta
        };
    }
};