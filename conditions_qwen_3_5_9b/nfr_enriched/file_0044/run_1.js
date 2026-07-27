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
     * @param {import('@tryghost/comments/lib/api')} deps.commentsService
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
     * Builds the set of related fields to fetch based on options and defaults.
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
     * Builds the shared options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildSharedOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptions(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForEdit(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForBrowse(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param {object} options
     * @returns {object}
     */
    buildDefaultOptionsForAdd(options) {
        return {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };
    }

    /**
     * @private
     * Builds the default options object for downstream repository calls.
     * Filters out options like `withRelated` that could cause errors.
     * @param