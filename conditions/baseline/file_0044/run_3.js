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
     * Normalizes withRelated options by merging with defaults and adding required relations
     */
    normalizeWithRelated(withRelated = []) {
        const normalized = new Set([...withRelated, ...DEFAULT_WITH_RELATED]);
        
        if (!normalized.has('productEvents')) {
            normalized.add('productEvents');
        }
        
        if (normalized.has('email_recipients')) {
            normalized.add('email_recipients.email');
        }
        
        return Array.from(normalized);
    }

    /**
     * Creates a complimentary subscription object for a member
     */
    createComplimentarySubscription(product, member, startDate) {
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
     */
    getComplimentaryStartDate(product, productEvents) {
        const productAddEvent = productEvents.find(event => event.product_id === product.id);
        
        if (!productAddEvent || productAddEvent.action !== 'added') {
            return moment();
        }
        
        return moment(productAddEvent.created_at);
    }

    /**
     * Adds missing complimentary subscriptions to a member and ensures tier is set correctly
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        const activeSubscriptionProductIds = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        member.subscriptions = member.subscriptions.filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );

        for (const product of member.products) {
            if (!activeSubscriptionProductIds.includes(product.id)) {
                const startDate = this.getComplimentaryStartDate(product, member.productEvents);
                member.subscriptions.push(
                    this.createComplimentarySubscription(product, member, startDate)
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
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.offer = subscriptionOffers.get(subscription.id) || null;
            return subscription;
        });
    }

    /**
     * Attaches next_payment information to each subscription
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }

    /**
     * Attaches attribution data to member and subscriptions
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
     * Attaches email suppression data to member
     */
    async attachEmailSuppressionData(member, model) {
        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
    }

    /**
     * Enriches member data with subscriptions, offers, and other related data
     */
    async enrichMemberData(member, model, options) {
        const subscriptionIdMap = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }

        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(
            member,
            await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'))
        );
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);
        await this.attachEmailSuppressionData(member, model);

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    /**
     * Validates Stripe configuration for operations requiring it
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
     * Handles unique constraint errors
     */
    handleUniqueConstraintError(error, context) {
        if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
            throw new errors.ValidationError({
                message: tpl(messages.memberAlreadyExists),
                context,
                property: 'email'
            });
        }
        throw error;
    }

    /**
     * Extracts shared options for downstream calls
     */
    extractSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * Handles Stripe customer linking errors
     */
    async handleStripeLinkingError(error, model, options) {
        const isStripeLinkingError = error.message && error.message.match(/customer|plan|subscription/g);
        
        if (isStripeLinkingError) {
            if (error.message.indexOf('customer') !== -1 && error.code === 'resource_missing') {
                error.message = `Member not imported. ${error.message}`;
                error.context = 'Missing Stripe Customer';
                error.help = 'Make sure you\'re connected to the correct Stripe Account';
            }

            await this.memberRepository.destroy({id: model.id}, options);
        }
        
        throw error;
    }

    async read(data, options = {}) {
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: this.normalizeWithRelated(options.withRelated)
        });

        if (!model) {
            return null;
        }

        const member = model.toJSON(options);
        return this.enrichMemberData(member, model, options);
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
            this.handleUniqueConstraintError(error, 'Attempting to add member with existing email address');
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
            await this.handleStripeLinkingError(error, model, options);
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

    async edit(data, options) {
        delete data.last_seen_at;

        try {
            if (data.email) {
                const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
                data.email_disabled = !!isSuppressed;
            }

            await this.memberRepository.update(data, options);
        } catch (error) {
            this.handleUniqueConstraintError(error, 'Attempting to edit member with existing email address');
        }

        const model = await this.memberRepository.get({id: data.id}, {
            withRelated: this.normalizeWithRelated()
        });

        if (this.stripeService.configured && typeof data.comped === 'boolean') {
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

        return this.read({id: data.id}, options);
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
            await this.commentsService.api.bulkUpdateStatus(
                `member_id:'${memberId}'+status:published`,
                'hidden'
            );
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

    /**
     * Enriches member data for browse operations
     */
    enrichBrowseMemberData(model, offerMap, bulkSuppressionData, index, originalWithRelated, options) {
        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, offerMap);
        this.attachNextPaymentToSubscriptions(member);
        
        if (!originalWithRelated.includes('products')) {
            delete member.products;
        }
        
        member.email_suppression = {
            suppressed: bulkSuppressionData[index].suppressed || !!model.get('email