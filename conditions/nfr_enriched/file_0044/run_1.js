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
     * Builds a complimentary subscription object for a product
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
     * Determines the start date for a subscription based on product event
     */
    getSubscriptionStartDate(productAddEvent) {
        if (!productAddEvent || productAddEvent.action !== 'added') {
            return moment();
        }
        return moment(productAddEvent.created_at);
    }

    /**
     * @private
     * Adds missing complimentary subscriptions to a member
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
                const productAddEvent = member.productEvents.find(event => event.product_id === product.id);
                const subscription = this.buildComplimentarySubscription(product, member, productAddEvent);
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
     * Builds a map between subscriptions and their offer representation (from OfferMapper)
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
    normalizeWithRelated(options) {
        const withRelated = new Set((options.withRelated || []).concat(this.getDefaultWithRelated()));

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
     * Attaches email suppression data to a member
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
     * Attaches unsubscribe URL to a member
     */
    attachUnsubscribeUrl(member) {
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    /**
     * @private
     * Processes a single member model into enriched member data
     */
    async processMemberModel(model, options, subscriptionIdMap, offerMap) {
        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, offerMap);
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);
        await this.attachEmailSuppressionData(member, model);
        this.attachUnsubscribeUrl(member);
        return member;
    }

    async read(data, options = {}) {
        const withRelated = this.normalizeWithRelated(options);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated
        });

        if (!model) {
            return null;
        }

        // We need to know the real IDs for each subscription to fetch the member attribution
        const subscriptionIdMap = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }

        const offerMap = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        const member = await this.processMemberModel(model, options, subscriptionIdMap, offerMap);

        return member;
    }

    /**
     * @private
     * Validates stripe configuration for member import
     */
    validateStripeConfigurationForImport(data) {
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
     * Handles stripe customer linking errors
     */
    async handleStripeLinkingError(error, model, options) {
        const isStripeLinkingError = error.message && (error.message.match(/customer|plan|subscription/g));
        if (isStripeLinkingError) {
            if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                error.message = `Member not imported. ${error.message}`;
                error.context = 'Missing Stripe Customer';
                error.help = 'Make sure you\'re connected to the correct Stripe Account';
            }

            await this.memberRepository.destroy({
                id: model.id
            }, options);
        }
        throw error;
    }

    /**
     * @private
     * Links stripe customer to member if provided
     */
    async linkStripeCustomerIfProvided(data, model, options) {
        if (!data.stripe_customer_id) {
            return;
        }

        const sharedOptions = this.buildSharedOptions(options);

        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            await this.handleStripeLinkingError(error, model, options);
        }
    }

    /**
     * @private
     * Sends magic link email if requested
     */
    async sendMagicLinkEmailIfRequested(model, options) {
        if (!options.send_email) {
            return;
        }

        await this.emailService.sendEmailWithMagicLink({
            email: model.get('email'),
            requestedType: options.email_type
        });
    }

    /**
     * @private
     * Sets complimentary subscription if requested
     */
    async setComplimentarySubscriptionIfRequested(data, model, options) {
        if (!data.comped) {
            return;
        }

        await this.memberRepository.setComplimentarySubscription(model, options);
    }

    async add(data, options) {
        this.validateStripeConfigurationForImport(data);

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

        await this.linkStripeCustomerIfProvided(data, model, options);
        await this.sendMagicLinkEmailIfRequested(model, options);
        await this.setComplimentarySubscriptionIfRequested(data, model, options);

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Updates email disabled status based on suppression list
     */
    async updateEmailDisabledStatus(data) {
        if (!data.email) {
            return;
        }

        const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
        data.email_disabled = !!isSuppressed;
    }

    /**
     * @private
     * Manages complimentary subscription state during edit
     */
    async manageComplimentarySubscription(data, model, options) {
        if (!this.stripeService.configured) {
            return;
        }

        const hasCompedSubscription = !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

        if (typeof data.comped !== 'boolean') {
            return;
        }

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

        let model;

        try {
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

        await this.manageComplimentarySubscription(data, model, options);

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Validates member exists and returns model
     */
    async getMemberOrThrow(memberId) {
        const model = await this.memberRepository.get({id: memberId});

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }

        return model;
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
        const model = await this.getMemberOrThrow(memberId);

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
     * Normalizes browse limit option
     */
    normalizeBrowseLimit(options) {
        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }
    }

    /**
     * @private
     * Processes browse page data into enriched member list
     */
    async processBrowsePageData(page, options, originalWithRelated, offerMap, bulkSuppressionData) {
        const data = await Promise.all(page.data.map(async (model, index) => {
            const member = model.toJSON(options);
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
        }));

        return {
            data,
            meta: page.meta
        };
    }

    async browse(options) {
        const withRelated = this.normalizeWithRelated(options);
        this.normalizeBrowseLimit(options);

        const originalWithRelated = options.withRelated || [];

        //option param to skip distinct from count query, distinct adds a lot of latency and in this case the result set will always be unique.
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
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(page.data.map(member => member.get('email')));

        return this.processBrowsePageData(page, options, originalWithRelated, offerMap, bulkSuppressionData);
    }
};
```