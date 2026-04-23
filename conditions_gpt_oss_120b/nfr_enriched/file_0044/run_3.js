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

    // -------------------------------------------------------------------------
    // Subscription handling helpers
    // -------------------------------------------------------------------------

    /**
     * Returns an array of product IDs for active subscriptions.
     * @private
     * @param {Array} subscriptions
     * @returns {Array<string>}
     */
    _getActiveSubscriptionProductIds(subscriptions) {
        return (subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);
    }

    /**
     * Removes incomplete subscriptions from a member object.
     * @private
     * @param {Object} member
     */
    _removeIncompleteSubscriptions(member) {
        if (!member.subscriptions) {
            member.subscriptions = [];
            return;
        }
        member.subscriptions = member.subscriptions.filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );
    }

    /**
     * Adds complimentary subscriptions for products that are not already subscribed.
     * @private
     * @param {Object} member
     * @param {Array<string>} activeProductIds
     */
    _addMissingComplimentarySubscriptions(member, activeProductIds) {
        for (const product of member.products || []) {
            if (activeProductIds.includes(product.id)) {
                continue;
            }
            const productAddEvent = (member.productEvents || []).find(event => event.product_id === product.id);
            const startDate = (!productAddEvent || productAddEvent.action !== 'added')
                ? moment()
                : moment(productAddEvent.created_at);

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

    /**
     * Ensures each subscription has its tier populated.
     * @private
     * @param {Object} member
     */
    _populateSubscriptionTiers(member) {
        for (const subscription of member.subscriptions || []) {
            if (!subscription.tier) {
                subscription.tier = (member.products || []).find(
                    product => product.id === subscription.price.product.product_id
                );
            }
        }
    }

    /**
     * Adds missing complimentary subscriptions and sets tier information.
     * @private
     * @param {Object} member
     */
    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return member;
        }

        const activeProductIds = this._getActiveSubscriptionProductIds(member.subscriptions);
        this._removeIncompleteSubscriptions(member);
        this._addMissingComplimentarySubscriptions(member, activeProductIds);
        this._populateSubscriptionTiers(member);
    }

    // -------------------------------------------------------------------------
    // Offer handling helpers
    // -------------------------------------------------------------------------

    /**
     * @private
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
     * @param {Object} member
     * @param {Map<string, OfferDTO>} subscriptionOffers
     */
    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = (member.subscriptions || []).map(subscription => {
            subscription.offer = subscriptionOffers.get(subscription.id) || null;
            return subscription;
        });
    }

    /**
     * @private
     * @param {Object} member
     */
    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = (member.subscriptions || []).map(subscription => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }

    // -------------------------------------------------------------------------
    // Attribution helpers
    // -------------------------------------------------------------------------

    /**
     * @private
     * @param {Object} member
     * @param {Map<string, string>} subscriptionIdMap
     */
    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const subscription of member.subscriptions || []) {
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

    // -------------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------------

    /**
     * Builds the withRelated set for read/browse operations.
     * @private
     * @param {Object} options
     * @param {Array<string>} defaultRelations
     * @returns {Set<string>}
     */
    _buildWithRelatedSet(options, defaultRelations) {
        const withRelated = new Set((options.withRelated || []).concat(defaultRelations));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return withRelated;
    }

    async read(data, options = {}) {
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

        const withRelated = this._buildWithRelatedSet(options, defaultWithRelated);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = new Map();
        for (const sub of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(sub.get('subscription_id'), sub.id);
        }

        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);

        this.attachSubscriptionsToMember(member);
        const offersMap = await this.fetchSubscriptionOffers(model.related('stripeSubscriptions'));
        this.attachOffersToSubscriptions(member, offersMap);
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };

        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

    // -------------------------------------------------------------------------
    // Add
    // -------------------------------------------------------------------------

    /**
     * Validates Stripe configuration for import scenarios.
     * @private
     * @param {Object} data
     */
    _validateStripeForImport(data) {
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
     * Creates a member model handling attribution errors.
     * @private
     * @param {Object} data
     * @param {Object} options
     * @returns {Promise<any>}
     */
    async _createMemberModel(data, options) {
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
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
     * Links a Stripe customer to a member, handling rollback on failure.
     * @private
     * @param {Object} data
     * @param {any} model
     * @param {Object} sharedOptions
     */
    async _linkStripeCustomerIfNeeded(data, model, sharedOptions) {
        if (!data.stripe_customer_id) {
            return;
        }
        try {
            await this.memberRepository.linkStripeCustomer({
                customer_id: data.stripe_customer_id,
                member_id: model.id
            }, sharedOptions);
        } catch (error) {
            const isStripeLinkingError = error.message && error.message.match(/customer|plan|subscription/g);
            if (isStripeLinkingError) {
                if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }
                await this.memberRepository.destroy({id: model.id}, sharedOptions);
            }
            throw error;
        }
    }

    async add(data, options) {
        this._validateStripeForImport(data);
        const model = await this._createMemberModel(data, options);

        const sharedOptions = {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };

        await this._linkStripeCustomerIfNeeded(data, model, sharedOptions);

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

    // -------------------------------------------------------------------------
    // Edit
    // -------------------------------------------------------------------------

    /**
     * Updates email suppression flag based on new email.
     * @private
     * @param {Object} data
     */
    async _applyEmailSuppressionFlag(data) {
        if (!data.email) {
            return;
        }
        const suppression = await this.emailSuppressionList.getSuppressionData(data.email);
        data.email_disabled = !!suppression?.suppressed;
    }

    /**
     * Handles complimentary subscription changes when Stripe is configured.
     * @private
     * @param {any} model
     * @param {Object} data
     * @param {Object} options
     */
    async _processCompedChange(model, data, options) {
        if (!this.stripeService.configured) {
            return;
        }
        const hasComped = !!model.related('stripeSubscriptions')
            .find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

        if (typeof data.comped !== 'boolean') {
            return;
        }

        if (data.comped && !hasComped) {
            await this.memberRepository.setComplimentarySubscription(model, {
                context: options.context,
                transacting: options.transacting
            });
        } else if (!data.comped && hasComped) {
            await this.memberRepository.removeComplimentarySubscription(model, {
                context: options.context,
                transacting: options.transacting
            });
        }
    }

    async edit(data, options) {
        delete data.last_seen_at;

        await this._applyEmailSuppressionFlag(data);

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

        await this._processCompedChange(model, data, options);

        return this.read({id: model.id}, options);
    }

    // -------------------------------------------------------------------------
    // Commenting
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Miscellaneous
    // -------------------------------------------------------------------------

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    async browse(options) {
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
        const withRelated = this._buildWithRelatedSet({withRelated: originalWithRelated}, defaultWithRelated);

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
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(page.data.map(m => m.get('email')));

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
};