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
     * Builds the set of related data to fetch for member queries
     */
    buildWithRelatedSet(options) {
        const defaultWithRelated = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        const withRelated = new Set((options.withRelated || []).concat(defaultWithRelated));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return withRelated;
    }

    /**
     * @private
     * Builds a subscription ID map from stripe subscriptions
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
     * Enriches member with suppression and unsubscribe data
     */
    async enrichMemberWithEmailData(member, email) {
        const suppressionData = await this.emailSuppressionList.getSuppressionData(email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!member.email_disabled,
            info: suppressionData.info
        };

        const unsubscribeUrl = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
        member.unsubscribe_url = unsubscribeUrl;
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
        await this.enrichMemberWithEmailData(member, member.email);
        return member;
    }

    async read(data, options = {}) {
        const withRelated = this.buildWithRelatedSet(options);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        const member = await this.processMemberModel(model, options, subscriptionIdMap, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));

        return member;
    }

    /**
     * @private
     * Validates stripe configuration for member creation
     */
    validateStripeConfiguration(data) {
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
     * Links stripe customer to member
     */
    async linkStripeCustomer(model, data, options) {
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
    }

    /**
     * @private
     * Sends magic link email if requested
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
     * Sets complimentary subscription if requested
     */
    async setComplimentaryIfRequested(model, data, options) {
        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
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
            if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        await this.linkStripeCustomer(model, data, options);
        await this.sendMagicLinkEmail(model, options);
        await this.setComplimentaryIfRequested(model, data, options);

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
     * Manages complimentary subscription state during edit
     */
    async manageComplimentarySubscription(model, data, options) {
        if (!this.stripeService.configured) {
            return;
        }

        const hasCompedSubscription = !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

        if (typeof data.comped === 'boolean') {
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
    }

    async edit(data, options) {
        delete data.last_seen_at;

        let model;

        try {
            await this.updateEmailDisabledStatus(data);
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

        await this.manageComplimentarySubscription(model, data, options);

        return this.read({id: model.id}, options);
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
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
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
     * Processes browse page data into enriched member objects
     */
    async processBrowsePageData(page, options, originalWithRelated, offerMap, bulkSuppressionData) {
        const subscriptionIdMap = this.buildSubscriptionIdMap(page.data.flatMap(model => model.related('stripeSubscriptions').slice()));

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
        const withRelated = this.buildWithRelatedSet(options);

        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        const originalWithRelated = options.withRelated || [];

        //option param to skip distinct from count query, distinct adds a lot of latency and in this case the result set will always be unique.
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

        return this.processBrowsePageData(page, options, originalWithRelated, offerMap, bulkSuppressionData);
    }
};