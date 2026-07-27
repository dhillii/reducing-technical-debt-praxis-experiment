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
 * @typedef {object} IStripeLinkingOptions
 * @prop {boolean} transacting
 * @prop {object} context
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
     * @param {import('@tryghost/comments')} deps.commentsService
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
     * Adds missing complimentary subscriptions to a member and makes sure the tier of all subscriptions is set correctly.
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        const subscriptionProducts = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        // Remove incomplete subscriptions from the API
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
            const offer = subscriptionOffers.get(subscription.id);
            if (offer) {
                subscription.offer = offer;
            } else {
                subscription.offer = null;
            }
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
     * Builds the set of related fields to fetch from the repository.
     * @param {Array<string>} optionsWithRelated
     * @returns {Set<string>}
     */
    buildRelatedSet(optionsWithRelated) {
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

        const withRelated = new Set((optionsWithRelated || []).concat(defaultWithRelated));

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
     * Extracts subscription IDs from a model's related subscriptions.
     * @param {object} model
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
     * Enriches a member object with subscriptions, offers, attributions, and suppression data.
     * @param {object} model
     * @param {object} options
     * @returns {Promise<object>}
     */
    async enrichMember(model, options) {
        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        const subscriptionIdMap = this.extractSubscriptionIdMap(model);
        const offerMap = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        this.attachOffersToSubscriptions(member, offerMap);
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };

        const unsubscribeUrl = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
        member.unsubscribe_url = unsubscribeUrl;

        return member;
    }

    /**
     * @private
     * Handles Stripe linking errors and cleans up the member if linking fails.
     * @param {object} model
     * @param {object} error
     * @param {object} options
     * @returns {Promise<void>}
     */
    async handleStripeLinkingError(model, error, options) {
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
     * Determines if a member has an active complimentary subscription.
     * @param {object} model
     * @returns {boolean}
     */
    hasActiveComplimentarySubscription(model) {
        return !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');
    }

    /**
     * @private
     * Prepares shared options for downstream repository calls.
     * @param {object} options
     * @returns {object}
     */
    prepareSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Sends a magic link email to the member.
     * @param {object} model
     * @param {object} options
     */
    async sendMagicLink(model, options) {
        await this.emailService.sendEmailWithMagicLink({
            email: model.get('email'), requestedType: options.email_type
        });
    }

    /**
     * @private
     * Sets a complimentary subscription for a member.
     * @param {object} model
     * @param {object} options
     */
    async setComplimentarySubscription(model, options) {
        await this.memberRepository.setComplimentarySubscription(model, options);
    }

    /**
     * @private
     * Removes a complimentary subscription for a member.
     * @param {object} model
     * @param {object} options
     */
    async removeComplimentarySubscription(model, options) {
        await this.memberRepository.removeComplimentarySubscription(model, options);
    }

    /**
     * @private
     * Fetches a member by ID.
     * @param {object} data
     * @param {object} options
     * @returns {Promise<object>}
     */
    async getMember(data, options) {
        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(this.buildRelatedSet(options.withRelated))
        });

        if (!model) {
            return null;
        }

        return this.enrichMember(model, options);
    }

    /**
     * @private
     * Fetches a page of members.
     * @param {object} options
     * @returns {Promise<object>}
     */
    async listMembers(options) {
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

        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        const originalWithRelated = options.withRelated || [];

        const withRelated = new Set((originalWithRelated).concat(defaultWithRelated));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

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
     * Validates Stripe configuration before attempting to import members with Stripe data.
     * @param {object} data
     * @returns {void}
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
     * Handles duplicate member errors by throwing a validation error.
     * @param {object} error
     * @returns {void}
     */
    handleDuplicateMemberError(error) {
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
     * Handles member not found errors.
     * @param {object} error
     * @returns {void}
     */
    handleMemberNotFoundError(error) {
        throw new errors.NotFoundError({
            message: tpl(messages.memberNotFound)
        });
    }

    /**
     * @private
     * Updates the email_disabled flag based on suppression list status.
     * @param {object} data
     * @returns {void}
     */
    updateEmailDisabledFlag(data) {
        if (data.email) {
            const isSuppressed = (this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
            data.email_disabled = !!isSuppressed;
        }
    }

    /**
     * @private
     * Handles commenting state changes.
     * @param {object} model
     * @param {string} action
     * @param {string} reason
     * @param {Date|null} until
     * @param {boolean} hideComments
     * @param {Object} context
     * @returns {Promise<object>}
     */
    async handleCommentingState(model, action, reason, until, hideComments, context) {
        const commenting = model.get('commenting');
        const updated = action === 'disable' ? commenting.disable(reason, until) : commenting.enable();

        await this.memberRepository.saveCommenting(
            model.id,
            updated,
            action === 'disable' ? 'commenting_disabled' : 'commenting_enabled',
            context
        );

        if (hideComments && action === 'disable') {
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${model.id}'+status:published`, 'hidden');
        }

        return this.getMember({id: model.id}, context);
    }

    /**
     * @private
     * Cycles the transient ID for a member.
     * @param {object} options
     */
    async cycleTransientId(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    /**
     * @private
     * Creates a member from data.
     * @param {object} data
     * @param {object} options
     * @returns {Promise<object>}
     */
    async createMember(data, options) {
        this.validateStripeConfiguration(data);

        let model;

        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            this.handleDuplicateMemberError(error);
        }

        // Only pass specific options to downstream calls, filtering out options like
        // `withRelated` that could cause errors in repositories that don't support them.
        // - transacting: needed for database transaction consistency
        // - context: needed to determine source (admin/api/member/import) for staff notifications
        const sharedOptions = this.prepareSharedOptions(options);

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, sharedOptions);
            }
        } catch (error) {
            await this.handleStripeLinkingError(model, error, options);
        }

        if (options.send_email) {
            await this.sendMagicLink(model, options);
        }

        if (data.comped) {
            await this.setComplimentarySubscription(model, options);
        }

        return this.getMember({id: model.id}, options);
    }

    /**
     * @private
     * Updates a member's data.
     * @param {object} data
     * @param {object} options
     * @returns {Promise<object>}
     */
    async updateMember(data, options) {
        delete data.last_seen_at;

        let model;

        try {
            this.updateEmailDisabledFlag(data);
            model = await this.memberRepository.update(data, options);
        } catch (error) {
            this.handleDuplicateMemberError(error);
        }

        if (this.stripeService.configured) {
            const hasCompedSubscription = this.hasActiveComplimentarySubscription(model);

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

        return this.getMember({id: model.id}, options);
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
        const model = await this.getMember({id: memberId}, context);
        if (!model) {
            this.handleMemberNotFoundError(new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            }));
        }

        return this.handleCommentingState(model, 'disable', reason, until, hideComments, context);
    }

    /**
     * @private
     * Enables commenting for a member.
     * @param {string} memberId
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async enableCommenting(memberId, context) {
        const model = await this.getMember({id: memberId}, context);
        if (!model) {
            this.handleMemberNotFoundError(new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            }));
        }

        return this.handleCommentingState(model, 'enable', null, null, false, context);
    }

    /**
     * @private
     * Logs out a member by cycling their transient ID.
     * @param {object} options
     */
    async logout(options) {
        await this.cycleTransientId(options);
    }

    /**
     * @private
     * Browses members with pagination and enrichment.
     * @param {object} options
     * @returns {Promise<object>}
     */
    async browse(options) {
        return this.listMembers(options);
    }

    /**
     * @private
     * Reads a single member by ID.
     * @param {object} data
     * @param {object} options
     * @returns {Promise<object>}
     */
    async read(data, options = {}) {
        return this.getMember(data, options);
    }

    /**
     * @private
     * Adds a new member.
     * @param {object} data
     * @param {object} options
     * @returns {Promise<object>}
     */
    async add(data, options) {
        return this.createMember(data, options);
    }

    /**
     * @private
     * Edits an existing member.
     * @param {object} data
     * @param {object} options
     * @returns {Promise<object>}
     */
    async edit(data, options) {
        return this.updateMember(data, options);
    }
};