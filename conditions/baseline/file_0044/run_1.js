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
    normalizeWithRelated(withRelated = []) {
        const normalized = new Set(withRelated.concat(DEFAULT_WITH_RELATED));
        normalized.add('productEvents');
        
        if (normalized.has('email_recipients')) {
            normalized.add('email_recipients.email');
        }
        
        return Array.from(normalized);
    }

    /**
     * @private
     */
    buildSubscriptionIdMap(subscriptions) {
        const map = new Map();
        for (const subscription of subscriptions) {
            map.set(subscription.get('subscription_id'), subscription.id);
        }
        return map;
    }

    /**
     * @private
     */
    createComplimentarySubscription(product, member, productAddEvent) {
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
                const productAddEvent = member.productEvents?.find(
                    event => event.product_id === product.id
                );
                member.subscriptions.push(
                    this.createComplimentarySubscription(product, member, productAddEvent)
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

        return member;
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
            if (id) {
                subscription.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(id);
            }
        }
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
    async enrichMember(member, model, subscriptionIdMap, options) {
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
        const withRelated = this.normalizeWithRelated(options.withRelated);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        const member = model.toJSON(options);

        return this.enrichMember(member, model, subscriptionIdMap, options);
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
    buildSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
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
        this.validateStripeConnection(data);

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

        const sharedOptions = this.buildSharedOptions(options);

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
     * @private
     */
    async updateEmailSuppression(data) {
        if (data.email) {
            const suppressionData = await this.emailSuppressionList.getSuppressionData(data.email);
            data.email_disabled = !!suppressionData?.suppressed;
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

        const sharedOptions = this.buildSharedOptions(options);

        if (data.comped && !hasCompedSubscription) {
            await this.memberRepository.setComplimentarySubscription(model, sharedOptions);
        } else if (!data.comped && hasCompedSubscription) {
            await this.memberRepository.removeComplimentarySubscription(model, sharedOptions);
        }
    }

    async edit(data, options) {
        delete data.last_seen_at;

        try {
            await this.updateEmailSuppression(data);
            const model = await this.memberRepository.update(data, options);
            await this.updateComplimentarySubscription(model, data, options);
            return this.read({id: model.id}, options);
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

        await this.memberRepository.saveCommenting(memberId, updated, eventName, context);
        return this.read({id: memberId});
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const result = await this.updateCommentingStatus(
            memberId,
            (commenting) => commenting.disable(reason, until),
            'commenting_disabled',
            context
        );

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(
                `member_id:'${memberId}'+status:published`,
                'hidden'
            );
        }

        return result;
    }

    async enableCommenting(memberId, context) {
        return this.updateCommentingStatus(
            memberId,
            (commenting) => commenting.enable(),
            'commenting_enabled',
            context
        );
    }

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    /**
     * @private
     */
    enrichBrowseMembers(members, models, offerMap, bulkSuppressionData, originalWithRelated) {