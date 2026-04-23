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

/**
 * @typedef {object} ISubscriptionProcessor
 * @prop {(member: Object) => Object} processSubscriptions
 * @prop {(subscriptions: any[]) => Promise<Map<string, OfferDTO>>} fetchSubscriptionOffers
 * @prop {(member: Object, subscriptionOffers: Map<string, OfferDTO>) => void} attachOffersToSubscriptions
 * @prop {(member: Object) => void} attachNextPaymentToSubscriptions
 * @prop {(member: Object, subscriptionIdMap: Map<string, string>) => Promise<void>} attachAttributionsToMember
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
     * Adds missing complimentary subscriptions to a member and ensures tier is set correctly.
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
                let startDate;
                if (!productAddEvent || productAddEvent.action !== 'added') {
                    startDate = moment();
                } else {
                    startDate = moment(productAddEvent.created_at);
                }
                member.subscriptions.push({
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
     * @private
     * Builds a map between subscriptions and their offer representation.
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
     * Attaches offer data to each subscription.
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
     * Attaches next_payment information to each subscription.
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
     * Adds missing complimentary subscriptions to a member and ensures tier is set correctly.
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
     * Extracts subscription IDs from model for attribution lookup.
     * @param {Object} model
     * @returns {Map<string, string>}
     */
    extractSubscriptionIdMap(model) {
        const subscriptionIdMap = new Map();
        for (const subscription of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }
        return subscriptionIdMap;
    }

    /**
     * @private
     * Prepares member data by filtering subscriptions and attaching related data.
     * @param {Object} member
     * @param {Object} model
     * @param {Map<string, OfferDTO>} subscriptionOffers
     * @param {Map<string, string>} subscriptionIdMap
     * @returns {Object}
     */
    prepareMemberData(member, model, subscriptionOffers, subscriptionIdMap) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, subscriptionOffers);
        this.attachNextPaymentToSubscriptions(member);
        this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    /**
     * @private
     * Prepares member data for browse endpoint.
     * @param {Object} member
     * @param {Object} model
     * @param {Map<string, OfferDTO>} subscriptionOffers
     * @param {Object} bulkSuppressionData
     * @param {boolean} includeProducts
     * @returns {Object}
     */
    prepareBrowseMemberData(member, model, subscriptionOffers, bulkSuppressionData, includeProducts) {
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, subscriptionOffers);
        this.attachNextPaymentToSubscriptions(member);

        if (!includeProducts) {
            delete member.products;
        }

        member.email_suppression = {
            suppressed: bulkSuppressionData.suppressed || !!model.get('email_disabled'),
            info: bulkSuppressionData.info
        };

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    /**
     * @private
     * Validates Stripe connection when member has Stripe-related data.
     * @param {Object} data
     * @returns {boolean}
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
        return true;
    }

    /**
     * @private
     * Handles member creation errors.
     * @param {Error} error
     * @returns {Error}
     */
    handleMemberCreationError(error) {
        if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
            throw new errors.ValidationError({
                message: tpl(messages.memberAlreadyExists),
                context: 'Attempting to add member with existing email address',
                property: 'email'
            });
        }
        throw error;
    }

    /**
     * @private
     * Handles member update errors.
     * @param {Error} error
     * @returns {Error}
     */
    handleMemberUpdateError(error) {
        if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
            throw new errors.ValidationError({
                message: tpl(messages.memberAlreadyExists),
                context: 'Attempting to edit member with existing email address',
                property: 'email'
            });
        }
        throw error;
    }

    /**
     * @private
     * Handles Stripe linking errors.
     * @param {Error} error
     * @returns {boolean}
     */
    handleStripeLinkingError(error) {
        const isStripeLinkingError = error.message && (error.message.match(/customer|plan|subscription/g));
        if (isStripeLinkingError) {
            if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                error.message = `Member not imported. ${error.message}`;
                error.context = 'Missing Stripe Customer';
                error.help = 'Make sure you\'re connected to the correct Stripe Account';
            }
            return true;
        }
        return false;
    }

    /**
     * @private
     * Checks if member has complimentary subscription.
     * @param {Object} model
     * @returns {boolean}
     */
    hasComplimentarySubscription(model) {
        return !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');
    }

    /**
     * @private
     * Prepares shared options for repository calls.
     * @param {Object} options
     * @returns {Object}
     */
    prepareSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Prepares default withRelated fields.
     * @returns {Set<string>}
     */
    prepareDefaultWithRelated() {
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

        const withRelated = new Set(defaultWithRelated);

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
     * Prepares withRelated set for repository calls.
     * @param {Set<string>} originalWithRelated
     * @returns {Set<string>}
     */
    prepareWithRelatedSet(originalWithRelated) {
        const withRelated = new Set(originalWithRelated);

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
     * Limits page size to 100.
     * @param {Object} options
     */
    limitPageSize(options) {
        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }
    }

    /**
     * @private
     * Enables basic count to skip distinct query.
     * @param {Object} options
     */
    enableBasicCount(options) {
        options.useBasicCount = true;
    }

    /**
     * @private
     * Disables commenting for a member.
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
     * @private
     * Enables commenting for a member.
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

    /**
     * @private
     * Cycles transient ID for logout.
     * @param {Object} options
     */
    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    /**
     * @private
     * Fetches member data from repository.
     * @param {Object} data
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async fetchMember(data, options) {
        const withRelated = this.prepareWithRelatedSet(options.withRelated || []);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!model) {
            return null;
        }

        return model.toJSON(options);
    }

    /**
     * @private
     * Fetches member list from repository.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async fetchMemberList(options) {
        const withRelated = this.prepareWithRelatedSet(options.withRelated || []);

        this.limitPageSize(options);
        this.enableBasicCount(options);

        const page = await this.memberRepository.list({
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!page) {
            return null;
        }

        return page;
    }

    /**
     * @private
     * Fetches bulk suppression data for multiple emails.
     * @param {string[]} emails
     * @returns {Promise<Object>}
     */
    async fetchBulkSuppressionData(emails) {
        return this.emailSuppressionList.getBulkSuppressionData(emails);
    }

    /**
     * @private
     * Fetches suppression data for single email.
     * @param {string} email
     * @returns {Promise<Object>}
     */
    async fetchSuppressionData(email) {
        return this.emailSuppressionList.getSuppressionData(email);
    }

    /**
     * @private
     * Sends magic link email to member.
     * @param {Object} model
     * @param {Object} options
     */
    async sendMagicLinkEmail(model, options) {
        await this.emailService.sendEmailWithMagicLink({
            email: model.get('email'),
            requestedType: options.email_type
        });
    }

    /**
     * @private
     * Sets complimentary subscription for member.
     * @param {Object} model
     * @param {Object} options
     */
    async setComplimentarySubscription(model, options) {
        await this.memberRepository.setComplimentarySubscription(model, options);
    }

    /**
     * @private
     * Removes complimentary subscription from member.
     * @param {Object} model
     * @param {Object} options
     */
    async removeComplimentarySubscription(model, options) {
        await this.memberRepository.removeComplimentarySubscription(model, options);
    }

    /**
     * @private
     * Destroys member from repository.
     * @param {Object} data
     * @param {Object} options
     */
    async destroyMember(data, options) {
        await this.memberRepository.destroy(data, options);
    }

    /**
     * @private
     * Reads member data with all related data.
     * @param {Object} data
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async read(data, options = {}) {
        const model = await this.fetchMember(data, options);

        if (!model) {
            return null;
        }

        const member = model.toJSON(options);
        const subscriptionIdMap = this.extractSubscriptionIdMap(model);
        const subscriptionOffers = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));

        return this.prepareMemberData(member, model, subscriptionOffers, subscriptionIdMap);
    }

    /**
     * @private
     * Adds a new member.
     * @param {Object} data
     * @param {Object} options
     * @returns {Promise<Object>}
     */
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
            this.handleMemberCreationError(error);
        }

        const sharedOptions = this.prepareSharedOptions(options);

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, sharedOptions);
            }
        } catch (error) {
            const shouldDestroy = this.handleStripeLinkingError(error);
            if (shouldDestroy) {
                await this.destroyMember({id: model.id}, options);
            }
            throw error;
        }

        if (options.send_email) {
            await this.sendMagicLinkEmail(model, options);
        }

        if (data.comped) {
            await this.setComplimentarySubscription(model, options);
        }

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Edits an existing member.
     * @param {Object} data
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async edit(data, options) {
        delete data.last_seen_at;

        let model;

        try {
            if (data.email) {
                const isSuppressed = (await this.fetchSuppressionData(data.email))?.suppressed;
                data.email_disabled = !!isSuppressed;
            }

            model = await this.memberRepository.update(data, options);
        } catch (error) {
            this.handleMemberUpdateError(error);
        }

        if (this.stripeService.configured) {
            const hasCompedSubscription = this.hasComplimentarySubscription(model);

            if (typeof data.comped === 'boolean') {
                if (data.comped && !hasCompedSubscription) {
                    await this.setComplimentarySubscription(model, {
                        context: options.context,
                        transacting: options.transacting
                    });
                } else if (!(data.comped) && hasCompedSubscription) {
                    await this.removeComplimentarySubscription(model, {
                        context: options.context,
                        transacting: options.transacting
                    });
                }
            }
        }

        return this.read({id: model.id}, options);
    }

    /**
     * @private
     * Browses all members.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async browse(options) {
        const page = await this.fetchMemberList(options);

        if (!page) {
            return null;
        }

        const subscriptions = page.data.flatMap(model => model.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppressionData = await this.fetchBulkSuppressionData(page.data.map(member => member.get('email')));

        const originalWithRelated = options.withRelated || [];
        const includeProducts = originalWithRelated.includes('products');

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);
            return this.prepareBrowseMemberData(member, model, offerMap, bulkSuppressionData[index], includeProducts);
        });

        return {
            data,
            meta: page.meta
        };
    }
};