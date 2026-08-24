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
     * Adds missing complimentary subscriptions to a member and makes sure the tier of all subscriptions is set correctly.
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        const activeSubscriptions = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status));

        const activeProductIds = activeSubscriptions.map(sub => sub.price.product.product_id);

        member.subscriptions = activeSubscriptions
            .filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        for (const product of member.products) {
            if (!activeProductIds.includes(product.id)) {
                member.subscriptions.push(this.buildComplimentarySubscription(product, member));
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
     * @private
     */
    buildComplimentarySubscription(product, member) {
        const productAddEvent = member.productEvents?.find(event => event.product_id === product.id);
        const startDate = !productAddEvent || productAddEvent.action !== 'added'
            ? moment()
            : moment(productAddEvent.created_at);

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
     * @private Builds a map between subscriptions and their offer representation (from OfferMapper)
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
            subscription.offer = subscriptionOffers.get(subscription.id) ?? null;
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
     * @param {Object} member JSON serialized member
     * @param {Map<string, string>} subscriptionIdMap Maps stripe subscription id -> internal id
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

    async read(data, options = {}) {
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: this.getReadWithRelated(options.withRelated)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }

        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);

        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        this.applySuppressionData(member);
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    /**
     * @private
     * Returns list of relations needed for read operation
     */
    getReadWithRelated(withRelated = []) {
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

        const set = new Set([...withRelated, ...defaultWithRelated]);
        set.add('productEvents');
        if (set.has('email_recipients')) {
            set.add('email_recipients.email');
        }

        return Array.from(set);
    }

    /**
     * @private
     * Applies suppression data and unsubscribe_url to member object
     */
    applySuppressionData(member) {
        return this.emailSuppressionList.getSuppressionData(member.email)
            .then(suppressionData => {
                member.email_suppression = {
                    suppressed: suppressionData.suppressed || !!member.email_disabled,
                    info: suppressionData.info
                };
            });
    }

    async add(data, options = {}) {
        await this.validateStripeIntegrity(data);
        const model = await this.createMemberWithAttribution(data, options);

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, this.getSharedOptions(options));
            }
        } catch (error) {
            await this.handleStripeLinkingError(error, model.id, options);
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
     * Validates that Stripe fields are only used when Stripe is configured
     */
    async validateStripeIntegrity(data) {
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
     * Creates a member and applies attribution if present
     */
    async createMemberWithAttribution(data, options) {
        const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
        if (attribution) {
            data.attribution = attribution;
        }
        try {
            return await this.memberRepository.create(data, options);
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
    }

    /**
     * @private
     * Returns shared options for nested operations
     */
    getSharedOptions(originalOptions) {
        return {
            ...(originalOptions.transacting && {transacting: originalOptions.transacting}),
            ...(originalOptions.context && {context: originalOptions.context})
        };
    }

    /**
     * @private
     * Cleans up member on Stripe linking failure and throws re-consolidated error
     */
    async handleStripeLinkingError(error, memberId, options) {
        const isStripeLinkingError = error.message && (error.message.match(/customer|plan|subscription/g));
        if (!isStripeLinkingError) {
            return;
        }

        if (error.message.indexOf('customer') !== -1 && error.code === 'resource_missing') {
            error.message = `Member not imported. ${error.message}`;
            error.context = 'Missing Stripe Customer';
            error.help = 'Make sure you\'re connected to the correct Stripe Account';
        }

        await this.memberRepository.destroy({
            id: memberId
        }, options);
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
            if (error.code && error.message.toLowerCase().includes('unique')) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to edit member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        await this.maintainComplimentarySubscription(model, data, options);

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Ensures complimentary subscription stays in sync with data.comped flag
     */
    async maintainComplimentarySubscription(model, data, options) {
        if (!this.stripeService.configured || typeof data.comped !== 'boolean') {
            return;
        }

        const hasCompedSubscription = model.related('stripeSubscriptions')
            .some(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

        if (data.comped && !hasCompedSubscription) {
            await this.memberRepository.setComplimentarySubscription(model, this.getSharedOptions(options));
        } else if (!data.comped && hasCompedSubscription) {
            await this.memberRepository.removeComplimentarySubscription(model, this.getSharedOptions(options));
        }
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

    async browse(options) {
        const withRelated = this.getBrowseWithRelated(options);

        options.limit = Math.min(options.limit === 'all' ? 100 : options.limit, 100);
        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated
        });

        if (!page) {
            return null;
        }

        const subscriptions = page.data.flatMap(model => model.related('stripeSubscriptions'));
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(page.data.map(model => model.get('email')));

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);

            if (!options.withRelated?.includes('products')) {
                delete member.products;
            }

            member.email_suppression = {
                suppressed: bulkSuppressionData[index].suppressed || !!model.get('email_disabled'),
                info: bulkSuppressionData[index].info
            };

            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

            return member;
        });

        return {
            data,
            meta: page.meta
        };
    }

    /**
     * @private
     * Returns list of relations needed for browse operation
     */
    getBrowseWithRelated(options = {}) {
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

        const set = new Set([...(options.withRelated || []), ...defaultWithRelated]);
        set.add('productEvents');

        if (set.has('email_recipients')) {
            set.add('email_recipients.email');
        }

        return Array.from(set);
    }
};