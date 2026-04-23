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
        /** @private */
        this.memberRepository = memberRepository;
        /** @private */
        this.labsService = labsService;
        /** @private */
        this.emailService = emailService;
        /** @private */
        this.stripeService = stripeService;
        /** @private */
        this.memberAttributionService = memberAttributionService;
        /** @private */
        this.emailSuppressionList = emailSuppressionList;
        /** @private */
        this.settingsHelpers = settingsHelpers;
        /** @private */
        this.nextPaymentCalculator = nextPaymentCalculator;
        /** @private */
        this.commentsService = commentsService;
    }

    /**
     * @private
     * Determines the start date for a complimentary subscription based on product events
     */
    getComplimentarySubscriptionStartDate(product, productEvents) {
        const productAddEvent = productEvents.find(event => event.product_id === product.id);
        if (!productAddEvent || productAddEvent.action !== 'added') {
            return moment();
        }
        return moment(productAddEvent.created_at);
    }

    /**
     * @private
     * Creates a complimentary subscription object for a product
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
     * Adds missing complimentary subscriptions to member
     */
    addMissingComplimentarySubscriptions(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return;
        }

        const subscriptionProducts = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        for (const product of member.products) {
            if (!subscriptionProducts.includes(product.id)) {
                const startDate = this.getComplimentarySubscriptionStartDate(product, member.productEvents);
                const subscription = this.createComplimentarySubscription(product, member, startDate);
                member.subscriptions.push(subscription);
            }
        }
    }

    /**
     * @private
     * Ensures all subscriptions have their tier set correctly
     */
    attachTiersToSubscriptions(member) {
        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(product => product.id === subscription.price.product.product_id);
            }
        }
    }

    /**
     * @private
     * Adds missing complimentary subscriptions to a member and makes sure the tier of all subscriptions is set correctly.
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        // Remove incomplete subscriptions from the API
        member.subscriptions = member.subscriptions.filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        this.addMissingComplimentarySubscriptions(member);
        this.attachTiersToSubscriptions(member);
    }

    /**
     * @private
     * Fetches offer for a single subscription
     */
    async fetchOfferForSubscription(subscriptionModel, fetchedOffers) {
        const offerId = subscriptionModel.get('offer_id');

        if (!offerId) {
            return null;
        }

        let offer = fetchedOffers.get(offerId);
        if (!offer) {
            offer = await this.offersAPI.getOffer({id: offerId});
            fetchedOffers.set(offerId, offer);
        }

        return offer;
    }

    /**
     * @private Builds a map between subscriptions and their offer representation (from OfferMapper)
     * @returns {Promise<Map<string, OfferDTO>>}
     */
    async fetchSubscriptionOffers(subscriptions) {
        const fetchedOffers = new Map();
        const subscriptionOffers = new Map();

        try {
            for (const subscriptionModel of subscriptions) {
                const offer = await this.fetchOfferForSubscription(subscriptionModel, fetchedOffers);
                if (offer) {
                    subscriptionOffers.set(subscriptionModel.get('subscription_id'), offer);
                }
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
     * @param {Map<string, OfferDTO>} subscriptionOffers result from fetchSubscriptionOffers
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            const offer = subscriptionOffers.get(subscription.id);
            subscription.offer = offer || null;
            return subscription;
        });
    }

    /**
     * @private
     * Attaches next_payment information to each subscription
     * Must be called after attachOffersToSubscriptions so that subscription.offer is available
     * @param {Object} member JSON serialized member
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }

    /**
     * @private
     * Adds missing complimentary subscriptions to a member and makes sure the tier of all subscriptions is set correctly.
     */
    async attachAttributionsToMember(member, subscriptionIdMap) {
        // Created attribution
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        // Subscriptions attributions
        for (const subscription of member.subscriptions) {
            if (!subscription.id) {
                continue;
            }

            // Convert stripe ID to database id
            const id = subscriptionIdMap.get(subscription.id);
            if (!id) {
                continue;
            }
            subscription.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(id);
        }
    }

    /**
     * @private
     * Builds the default withRelated array for member queries
     */
    getDefaultWithRelated() {
        return [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];
    }

    /**
     * @private
     * Normalizes withRelated options for member queries
     */
    normalizeWithRelated(withRelated) {
        const normalized = new Set((withRelated || []).concat(this.getDefaultWithRelated()));

        if (!normalized.has('productEvents')) {
            normalized.add('productEvents');
        }

        if (normalized.has('email_recipients')) {
            normalized.add('email_recipients.email');
        }

        return normalized;
    }

    /**
     * @private
     * Builds subscription ID map from stripe subscriptions
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
     * @private
     * Enriches member with subscription and related data
     */
    async enrichMemberData(member, model, subscriptionIdMap) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);
        await this.attachEmailSuppressionData(member, model);
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    async read(data, options = {}) {
        const withRelated = this.normalizeWithRelated(options.withRelated);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        const member = model.toJSON(options);

        await this.enrichMemberData(member, model, subscriptionIdMap);

        return member;
    }

    /**
     * @private
     * Validates stripe configuration for member creation
     */
    validateStripeConfigurationForAdd(data) {
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
     * Creates a new member in the repository
     */
    async createMember(data, options) {
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            return await this.memberRepository.create(data, options);
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
    }

    /**
     * @private
     * Builds shared options for downstream calls
     */
    buildSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Links stripe customer to member
     */
    async linkStripeCustomer(stripeCustomerId, memberId, sharedOptions, options) {
        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: stripeCustomerId,
                member_id: memberId
            }, sharedOptions);
        } catch (error) {
            const isStripeLinkingError = error.message && (error.message.match(/customer|plan|subscription/g));
            if (isStripeLinkingError) {
                if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }

                await this.memberRepository.destroy({
                    id: memberId
                }, options);
            }
            throw error;
        }
    }

    /**
     * @private
     * Sends magic link email if requested
     */
    async sendMagicLinkEmail(email, emailType, shouldSend) {
        if (shouldSend) {
            await this.emailService.sendEmailWithMagicLink({
                email,
                requestedType: emailType
            });
        }
    }

    /**
     * @private
     * Sets complimentary subscription if requested
     */
    async setComplimentaryIfRequested(model, shouldComp, options) {
        if (shouldComp) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
    }

    async add(data, options) {
        this.validateStripeConfigurationForAdd(data);

        const model = await this.createMember(data, options);

        const sharedOptions = this.buildSharedOptions(options);

        if (data.stripe_customer_id) {
            await this.linkStripeCustomer(data.stripe_customer_id, model.id, sharedOptions, options);
        }

        await this.sendMagicLinkEmail(model.get('email'), options.email_type, options.send_email);

        await this.setComplimentaryIfRequested(model, data.comped, options);

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Updates email disabled status based on suppression list
     */
    async updateEmailDisabledStatus(data) {
        if (data.email) {
            const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
            data.email_disabled = !!isSuppressed;
        }
    }

    /**
     * @private
     * Updates member in repository
     */
    async updateMember(data, options) {
        try {
            return await this.memberRepository.update(data, options);
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
    }

    /**
     * @private
     * Checks if member has active complimentary subscription
     */
    hasActiveComplimentarySubscription(model) {
        return !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');
    }

    /**
     * @private
     * Updates complimentary subscription status
     */
    async updateComplimentarySubscription(data, model, options) {
        if (typeof data.comped !== 'boolean') {
            return;
        }

        const hasCompedSubscription = this.hasActiveComplimentarySubscription(model);
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

    async edit(data, options) {
        delete data.last_seen_at;

        await this.updateEmailDisabledStatus(data);
        const model = await this.updateMember(data, options);

        if (this.stripeService.configured) {
            await this.updateComplimentarySubscription(data, model, options);
        }

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Hides comments for a member
     */
    async hideCommentsForMember(memberId) {
        await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
    }

    /**
     * @param {string} memberId
     * @param {string} reason
     * @param {Date|null} until
     * @param {boolean} hideComments
     * @param {Object} context
     * @returns {Promise<Object>}
     */
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
            await this.hideCommentsForMember(memberId);
        }

        return this.read({id: memberId});
    }

    /**
     * @param {string} memberId
     * @param {Object} context
     * @returns {Promise<Object>}
     */
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
     * @private
     * Enriches browse member data with subscriptions and related information
     */
    enrichBrowseMemberData(member, model, offerMap, bulkSuppressionData, index, originalWithRelated) {
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
    }

    async browse(options) {
        const originalWithRelated = options.withRelated || [];
        const withRelated = this.normalizeWithRelated(originalWithRelated);

        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!page) {
            return null;
        }

        const subscriptions = page.data.flatMap(model => model.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(page.data.map(member => member.get('email')));

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);
            this.enrichBrowseMemberData(member, model, offerMap, bulkSuppressionData, index, originalWithRelated);
            return member;
        });

        return {
            data,
            meta: page.meta
        };
    }
};