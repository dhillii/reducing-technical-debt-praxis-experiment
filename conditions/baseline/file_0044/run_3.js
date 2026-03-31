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

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * @private
     * Builds the withRelated set from provided options, ensuring required relations are included.
     */
    buildWithRelated(optionsWithRelated = []) {
        const withRelated = new Set(optionsWithRelated.concat(DEFAULT_WITH_RELATED));
        withRelated.add('productEvents');

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return Array.from(withRelated);
    }

    /**
     * @private
     * Creates a complimentary subscription object for a product.
     */
    buildComplimentarySubscription(product, member) {
        const productAddEvent = (member.productEvents || []).find(
            event => event.product_id === product.id
        );

        const startDate = (productAddEvent?.action === 'added')
            ? moment(productAddEvent.created_at)
            : moment();

        return {
            id: '',
            tier: product,
            customer: {id: '', name: member.name, email: member.email},
            plan: {id: '', nickname: 'Complimentary', interval: 'year', currency: 'USD', amount: 0},
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
        };
    }

    /**
     * @private
     * Adds missing complimentary subscriptions and ensures tier is set on all subscriptions.
     */
    attachSubscriptionsToMember(member) {
        if (!Array.isArray(member.products)) {
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
                member.subscriptions.push(this.buildComplimentarySubscription(product, member));
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
     * Builds a map between subscription IDs and their offer representation.
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

                if (!fetchedOffers.has(offerId)) {
                    fetchedOffers.set(offerId, await this.offersAPI.getOffer({id: offerId}));
                }

                subscriptionOffers.set(
                    subscriptionModel.get('subscription_id'),
                    fetchedOffers.get(offerId)
                );
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return subscriptionOffers;
    }

    /**
     * @private
     * Attaches offer data to each subscription.
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map(subscription => ({
            ...subscription,
            offer: subscriptionOffers.get(subscription.id) ?? null
        }));
    }

    /**
     * @private
     * Attaches next_payment information to each subscription.
     * Must be called after attachOffersToSubscriptions.
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(subscription => ({
            ...subscription,
            next_payment: this.nextPaymentCalculator.calculate(subscription)
        }));
    }

    /**
     * @private
     * Attaches attribution data to member and their subscriptions.
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
     * Builds a map of stripe subscription_id -> database id from a model.
     */
    buildSubscriptionIdMap(model) {
        const map = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            map.set(subscription.get('subscription_id'), subscription.id);
        }
        return map;
    }

    /**
     * @private
     * Applies all subscription enrichments to a member JSON object.
     */
    async enrichMemberSubscriptions(member, stripeSubscriptions) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(stripeSubscriptions));
        this.attachNextPaymentToSubscriptions(member);
    }

    /**
     * @private
     * Throws a ValidationError for duplicate email.
     */
    throwDuplicateEmailError(context) {
        throw new errors.ValidationError({
            message: tpl(messages.memberAlreadyExists),
            context,
            property: 'email'
        });
    }

    /**
     * @private
     * Extracts shared transacting/context options.
     */
    extractSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Retrieves a member model by ID or throws NotFoundError.
     */
    async getModelOrThrow(memberId) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
        }
        return model;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async read(data, options = {}) {
        const withRelated = this.buildWithRelated(options.withRelated);
        const model = await this.memberRepository.get(data, {...options, withRelated});

        if (!model) {
            return null;
        }

        const subscriptionIdMap = this.buildSubscriptionIdMap(model);
        const member = model.toJSON(options);

        await this.enrichMemberSubscriptions(member, model.related('stripeSubscriptions'));
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    async add(data, options) {
        this.validateStripeData(data);

        let model;

        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().includes('unique')) {
                this.throwDuplicateEmailError('Attempting to add member with existing email address');
            }
            throw error;
        }

        const sharedOptions = this.extractSharedOptions(options);

        if (data.stripe_customer_id) {
            await this.linkStripeCustomerOrRollback(data.stripe_customer_id, model, options, sharedOptions);
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

        let model;

        try {
            if (data.email) {
                const suppressionData = await this.emailSuppressionList.getSuppressionData(data.email);
                data.email_disabled = !!suppressionData?.suppressed;
            }

            model = await this.memberRepository.update(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().includes('unique')) {
                this.throwDuplicateEmailError('Attempting to edit member with existing email address');
            }
            throw error;
        }

        if (this.stripeService.configured && typeof data.comped === 'boolean') {
            await this.syncComplimentarySubscription(model, data.comped, options);
        }

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
        const model = await this.getModelOrThrow(memberId);
        const updated = model.get('commenting').disable(reason, until);

        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_disabled', context);

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(
                `member_id:'${memberId}'+status:published`,
                'hidden'
            );
        }

        return this.read({id: memberId});
    }

    /**
     * @param {string} memberId
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async enableCommenting(memberId, context) {
        const model = await this.getModelOrThrow(memberId);
        const updated = model.get('commenting').enable();

        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_enabled', context);

        return this.read({id: memberId});
    }

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    async browse(options) {
        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        const originalWithRelated = options.withRelated || [];
        const withRelated = this.buildWithRelated(originalWithRelated);

        options.useBasicCount = true;

        const page = await this.memberRepository.list({...options, withRelated});

        if (!page) {
            return null;
        }

        const allSubscriptions = page.data.flatMap(model => model.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(allSubscriptions);

        const emails = page.data.map(model => model.get('email'));
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(emails);

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);

            member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);

            if (!originalWithRelated.includes('products')) {