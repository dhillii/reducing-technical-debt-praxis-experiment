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
 * @typedef {object} IEmailSuppressionList
 * @prop {(email: string) => Promise<{suppressed: boolean, info: any}>} getSuppressionData
 * @prop {(emails: string[]) => Promise<Array<{suppressed: boolean, info: any}>>} getBulkSuppressionData
 */

/**
 * @typedef {object} ISettingsHelpers
 * @prop {(uuid: string) => string} createUnsubscribeUrl
 */

/**
 * @typedef {object} ICommentsService
 * @prop {object} api
 * @prop {(query: string, status: string) => Promise<any>} api.bulkUpdateStatus
 */

/**
 * @typedef {object} IStripeService
 * @prop {boolean} configured
 */

/**
 * @typedef {object} ICommenting
 * @prop {(reason: string, until: Date|null) => object} disable
 * @prop {() => object} enable
 */

/**
 * @typedef {object} MemberRepository
 * @prop {(data: object, options: object) => Promise<object>} create
 * @prop {(data: object, options: object) => Promise<object>} update
 * @prop {(data: object, options: object) => Promise<object>} get
 * @prop {(data: object, options: object) => Promise<object>} destroy
 * @prop {(memberId: string, commenting: object, reason: string, context: object) => Promise<void>} saveCommenting
 * @prop {(data: object, options: object) => Promise<void>} cycleTransientId
 * @prop {(memberId: string, customerId: string, options: object) => Promise<void>} linkStripeCustomer
 * @prop {(memberId: string, options: object) => Promise<void>} removeComplimentarySubscription
 * @prop {(memberId: string, options: object) => Promise<void>} setComplimentarySubscription
 * @prop {(memberId: string, options: object) => Promise<void>} list
 * @prop {(memberId: string, options: object) => Promise<object>} getMemberCreatedAttribution
 * @prop {(subscriptionId: string) => Promise<object>} getSubscriptionCreatedAttribution
 * @prop {(context: object) => Promise<object>} getAttributionFromContext
 * @prop {(memberId: string, options: object) => Promise<void>} destroy
 * @prop {(memberId: string, options: object) => Promise<void>} destroy
 * @prop {(memberId: string, options: object) => Promise<void>} destroy
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
     * @param {IEmailSuppressionList} deps.emailSuppressionList
     * @param {ISettingsHelpers} deps.settingsHelpers
     * @param {import('./next-payment-calculator')} deps.nextPaymentCalculator
     * @param {ICommentsService} deps.commentsService
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
     * Builds the withRelated set based on options and defaults
     * @param {object} options
     * @returns {Set<string>}
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
     * Extracts subscription IDs from a model for attribution lookup
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
     * Filters out subscriptions without price data
     * @param {Array} subscriptions
     * @returns {Array}
     */
    filterValidSubscriptions(subscriptions) {
        return subscriptions.filter(sub => !!sub.price);
    }

    /**
     * @private
     * Prepares member data with all subscriptions and related information
     * @param {object} member
     * @param {Map<string, OfferDTO>} subscriptionOffers
     * @param {Map<string, string>} subscriptionIdMap
     * @param {object} suppressionData
     * @param {string} unsubscribeUrl
     * @param {boolean} shouldIncludeProducts
     * @returns {object}
     */
    prepareMemberData(member, subscriptionOffers, subscriptionIdMap, suppressionData, unsubscribeUrl, shouldIncludeProducts) {
        member.subscriptions = this.filterValidSubscriptions(member.subscriptions);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, subscriptionOffers);
        this.attachNextPaymentToSubscriptions(member);

        if (!shouldIncludeProducts) {
            delete member.products;
        }

        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!member.get('email_disabled'),
            info: suppressionData.info
        };

        member.unsubscribe_url = unsubscribeUrl;

        return member;
    }

    /**
     * @private
     * Prepares bulk member data for browse operation
     * @param {Array} members
     * @param {Map<string, OfferDTO>} offerMap
     * @param {Array} bulkSuppressionData
     * @param {boolean} shouldIncludeProducts
     * @returns {Array}
     */
    prepareBulkMemberData(members, offerMap, bulkSuppressionData, shouldIncludeProducts) {
        return members.map((model, index) => {
            const member = model.toJSON();
            member.subscriptions = this.filterValidSubscriptions(member.subscriptions);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);

            if (!shouldIncludeProducts) {
                delete member.products;
            }

            member.email_suppression = {
                suppressed: bulkSuppressionData[index].suppressed || !!model.get('email_disabled'),
                info: bulkSuppressionData[index].info
            };

            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

            return member;
        });
    }

    /**
     * @private
     * Validates Stripe connection for member operations
     * @param {object} data
     * @returns {boolean}
     */
    validateStripeConnection(data) {
        return !this.stripeService.configured && (data.comped || data.stripe_customer_id);
    }

    /**
     * @private
     * Determines if an error is related to Stripe linking
     * @param {Error} error
     * @returns {boolean}
     */
    isStripeLinkingError(error) {
        return error.message && (error.message.match(/customer|plan|subscription/g));
    }

    /**
     * @private
     * Determines if an error indicates missing Stripe customer
     * @param {Error} error
     * @returns {boolean}
     */
    isMissingStripeCustomerError(error) {
        return error.message.indexOf('customer') && error.code === 'resource_missing';
    }

    /**
     * @private
     * Checks if member already exists based on error
     * @param {Error} error
     * @returns {boolean}
     */
    isMemberAlreadyExistsError(error) {
        return error.code && error.message.toLowerCase().indexOf('unique') !== -1;
    }

    /**
     * @private
     * Checks if member was found
     * @param {object} model
     * @returns {boolean}
     */
    isMemberNotFound(model) {
        return !model;
    }

    /**
     * @private
     * Checks if member has complimentary subscription
     * @param {object} model
     * @returns {boolean}
     */
    hasComplimentarySubscription(model) {
        return !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');
    }

    /**
     * @private
     * Checks if data has comped flag
     * @param {object} data
     * @returns {boolean}
     */
    hasCompedFlag(data) {
        return data.comped;
    }

    /**
     * @private
     * Checks if data has stripe customer ID
     * @param {object} data
     * @returns {boolean}
     */
    hasStripeCustomerId(data) {
        return data.stripe_customer_id;
    }

    /**
     * @private
     * Checks if options include send_email flag
     * @param {object} options
     * @returns {boolean}
     */
    hasSendEmailFlag(options) {
        return options.send_email;
    }

    /**
     * @private
     * Checks if options include email_type
     * @param {object} options
     * @returns {boolean}
     */
    hasEmailTypeOption(options) {
        return options.email_type;
    }

    /**
     * @private
     * Checks if options include context
     * @param {object} options
     * @returns {boolean}
     */
    hasContextOption(options) {
        return options.context;
    }

    /**
     * @private
     * Checks if options include transacting
     * @param {object} options
     * @returns {boolean}
     */
    hasTransactingOption(options) {
        return options.transacting;
    }

    /**
     * @private
     * Checks if options include withRelated
     * @param {object} options
     * @returns {boolean}
     */
    hasWithRelatedOption(options) {
        return options.withRelated;
    }

    /**
     * @private
     * Checks if options include limit
     * @param {object} options
     * @returns {boolean}
     */
    hasLimitOption(options) {
        return options.limit;
    }

    /**
     * @private
     * Checks if limit is 'all' or greater than 100
     * @param {object} options
     * @returns {boolean}
     */
    hasLargeLimitOption(options) {
        return options.limit === 'all' || options.limit > 100;
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes productEvents
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductEventsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('productEvents');
    }

    /**
     * @private
     * Checks if original withRelated includes email_recipients
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasEmailRecipientsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('email_recipients');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct.product');
    }

    /**
     * @private
     * Checks if original withRelated includes products
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasProductsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('products');
    }

    /**
     * @private
     * Checks if original withRelated includes newsletters
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasNewslettersInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('newsletters');
    }

    /**
     * @private
     * Checks if original withRelated includes labels
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasLabelsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('labels');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.customer
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsCustomerInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.customer');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct
     * @param {Array} originalWithRelated
     * @returns {boolean}
     */
    hasStripeSubscriptionsStripePriceStripeProductInOriginalWithRelated(originalWithRelated) {
        return originalWithRelated.includes('stripeSubscriptions.stripePrice.stripeProduct');
    }

    /**
     * @private
     * Checks if original withRelated includes stripeSubscriptions.stripePrice.stripeProduct.product
     * @param {Array}