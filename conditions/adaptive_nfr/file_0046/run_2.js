```javascript
// @ts-ignore
const {VersionMismatchError} = require('@tryghost/errors');
// @ts-ignore
const debug = require('@tryghost/debug')('stripe');
const Stripe = require('stripe').Stripe;

/* Stripe has the following rate limits:
*  - For most APIs, 100 read requests per second in live mode, 25 read requests per second in test mode
*  - For search, 20 requests per second in both live and test modes
*
* For the testing environment, we increase these limits to 10,000 req/s to keep tests fast
*/
const EXPECTED_API_EFFICIENCY = 0.95;
const EXPECTED_SEARCH_API_EFFICIENCY = 0.15;

// If we're running in a testing environment, we don't want to rate limit the Stripe API like we do in production
const isTesting = process.env.NODE_ENV?.includes('testing');
const TEST_MODE_RATE_LIMIT = isTesting ? 10_000 : 25;
const LIVE_MODE_RATE_LIMIT = isTesting ? 10_000 : 100;
const SEARCH_MODE_RATE_LIMIT = isTesting ? 10_000 : 100;

const STRIPE_API_VERSION = '2020-08-27';

/**
 * @typedef {import('stripe').Stripe.Customer} ICustomer
 * @typedef {import('stripe').Stripe.DeletedCustomer} IDeletedCustomer
 * @typedef {import('stripe').Stripe.Product} IProduct
 * @typedef {import('stripe').Stripe.Plan} IPlan
 * @typedef {import('stripe').Stripe.Price} IPrice
 * @typedef {import('stripe').Stripe.WebhookEndpoint} IWebhookEndpoint
 * @typedef {import('stripe').Stripe.Coupon} ICoupon
 * @typedef {import('stripe').Stripe.CouponCreateParams} ICouponCreateParams
 * @typedef {import('stripe').Stripe.ProductCreateParams} IProductCreateParams
 * @typedef {import('stripe').Stripe.CustomerRetrieveParams} ICustomerRetrieveParams
 * @typedef {import('stripe').Stripe.Checkout.Session} ICheckoutSession
 * @typedef {import('stripe').Stripe.Checkout.SessionCreateParams} ICheckoutSessionCreateParams
 * @typedef {import('stripe').Stripe.SubscriptionRetrieveParams} ISubscriptionRetrieveParams
 * @typedef {import('stripe').Stripe.Subscription} ISubscription
 * @typedef {import('stripe').Stripe.Checkout.SessionCreateParams.PaymentMethodType} IPaymentMethodType
 * @typedef {import('stripe').Stripe.BillingPortal.Session} IBillingSession
 */

/**
 * @typedef {object} IStripeAPIConfig
 * @prop {string} secretKey
 * @prop {string} publicKey
 * @prop {boolean} enablePromoCodes
 * @prop {boolean} enableAutomaticTax
 * @prop {string} checkoutSessionSuccessUrl
 * @prop {string} checkoutSessionCancelUrl
 * @prop {string} checkoutSetupSessionSuccessUrl
 * @prop {string} checkoutSetupSessionCancelUrl
 * @prop {string} billingPortalReturnUrl
 * @prop {boolean} testEnv  - indicates if the module is run in test environment (note, NOT the test mode)
 */

/**
 * Determines the rate limit based on test mode
 * @param {boolean} testMode
 * @returns {number}
 */
function getRateLimitForMode(testMode) {
    return testMode ? EXPECTED_API_EFFICIENCY * TEST_MODE_RATE_LIMIT : EXPECTED_API_EFFICIENCY * LIVE_MODE_RATE_LIMIT;
}

/**
 * Wraps API calls with rate limiting and error handling
 * @param {Function} apiCall
 * @param {string} operationName
 * @param {string} operationDetails
 * @returns {Promise<any>}
 */
async function executeWithRateLimit(apiCall, operationName, operationDetails) {
    debug(`${operationName}(${operationDetails})`);
    try {
        const result = await apiCall();
        debug(`${operationName}(${operationDetails}) -> Success`);
        return result;
    } catch (err) {
        debug(`${operationName}(${operationDetails}) -> ${err.type}`);
        throw err;
    }
}

/**
 * Finds the customer with the most recent subscription
 * @param {Array} customers
 * @returns {object}
 */
function findCustomerWithLatestSubscription(customers) {
    let latestCustomer = customers[0];
    let latestSubscriptionTime = 0;

    for (let customer of customers) {
        if (!customer.subscriptions?.data?.length) {
            continue;
        }

        for (let subscription of customer.subscriptions.data) {
            if (subscription.current_period_end && subscription.current_period_end > latestSubscriptionTime) {
                latestSubscriptionTime = subscription.current_period_end;
                latestCustomer = customer;
            }
        }
    }

    return latestCustomer;
}

/**
 * Determines customer ID from search results
 * @param {Array} customers
 * @returns {string|undefined}
 */
function getCustomerIdFromSearchResults(customers) {
    if (customers.length === 0) {
        return;
    }

    if (customers.length === 1) {
        return customers[0].id;
    }

    return findCustomerWithLatestSubscription(customers).id;
}

/**
 * Builds subscription metadata from options
 * @param {object} metadata
 * @returns {object}
 */
function buildSubscriptionMetadata(metadata) {
    return {
        attribution_id: metadata?.attribution_id,
        attribution_url: metadata?.attribution_url,
        attribution_type: metadata?.attribution_type,
        referrer_source: metadata?.referrer_source,
        referrer_medium: metadata?.referrer_medium,
        referrer_url: metadata?.referrer_url,
        utm_source: metadata?.utm_source,
        utm_medium: metadata?.utm_medium,
        utm_campaign: metadata?.utm_campaign,
        utm_term: metadata?.utm_term,
        utm_content: metadata?.utm_content
    };
}

/**
 * Builds subscription data for checkout session
 * @param {string} priceId
 * @param {object} metadata
 * @param {number} trialDays
 * @returns {object}
 */
function buildSubscriptionData(priceId, metadata, trialDays) {
    const subscriptionData = {
        trial_from_plan: true,
        items: [{
            plan: priceId
        }],
        metadata: buildSubscriptionMetadata(metadata)
    };

    if (typeof trialDays === 'number' && trialDays > 0) {
        delete subscriptionData.trial_from_plan;
        subscriptionData.trial_period_days = trialDays;
    }

    return subscriptionData;
}

/**
 * Builds checkout session options
 * @param {object} params
 * @returns {object}
 */
function buildCheckoutSessionOptions(params) {
    const {
        paymentMethodTypes,
        successUrl,
        cancelUrl,
        enablePromoCodes,
        enableAutomaticTax,
        metadata,
        discounts,
        subscriptionData,
        customerId,
        customerEmail
    } = params;

    const options = {
        payment_method_types: paymentMethodTypes,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: discounts ? undefined : enablePromoCodes,
        automatic_tax: {
            enabled: enableAutomaticTax
        },
        metadata,
        discounts,
        subscription_data: subscriptionData
    };

    if (customerId) {
        options.customer = customerId;
    } else {
        options.customer_email = customerEmail;
    }

    return options;
}

/**
 * Applies customer update settings if needed
 * @param {object} options
 * @param {string} customerId
 * @param {boolean} enableAutomaticTax
 */
function applyCustomerUpdateIfNeeded(options, customerId, enableAutomaticTax) {
    if (customerId && enableAutomaticTax) {
        options.customer_update = {address: 'auto'};
    }
}

module.exports = class StripeAPI {
    /**
     * StripeAPI
     * @param {object} deps
     * @param {object} deps.labs
     */
    constructor(deps) {
        /** @type {Stripe} */
        this._stripe = null;
        this._configured = false;
        this.labs = deps.labs;
    }

    /**
     * @returns {IPaymentMethodType[]|undefined}
     */
    get PAYMENT_METHOD_TYPES() {
        if (this.labs.isSet('additionalPaymentMethods')) {
            return undefined;
        } else {
            return ['card'];
        }
    }

    /**
     * Returns true if the Stripe API is configured.
     * @returns {boolean}
     */
    get configured() {
        return this._configured;
    }

    /**
     * Returns true if this package is running in a test environment (i.e. browser tests).
     *
     * Note: This is not the same as the Stripe API's test mode.
     * @returns {boolean}
     */
    get testEnv() {
        return this._config.testEnv;
    }

    /**
     * Returns the Stripe API mode (test or live).
     *
     * @returns {string}
     */
    get mode() {
        return this._testMode ? 'test' : 'live';
    }

    /**
     * Configure the Stripe API.
     * - Instantiates the Stripe API client
     * - Sets the Stripe API mode
     * - Configures rate limiting buckets
     *
     * @param {IStripeAPIConfig} config
     *
     * @returns {void}
     */
    configure(config) {
        if (!config) {
            this._stripe = null;
            this._configured = false;
            return;
        }

        // Lazyloaded to protect sites without Stripe configured
        const LeakyBucket = require('leaky-bucket');

        this._stripe = new Stripe(config.secretKey, {
            apiVersion: STRIPE_API_VERSION
        });
        this._config = config;
        this._testMode = config.secretKey && config.secretKey.startsWith('sk_test_');
        this._rateLimitBucket = new LeakyBucket(getRateLimitForMode(this._testMode), 1);
        this._searchRateLimitBucket = new LeakyBucket(EXPECTED_SEARCH_API_EFFICIENCY * SEARCH_MODE_RATE_LIMIT, 1);
        this._configured = true;
    }

    /**
     * Create a new Stripe Coupon.
     *
     * @param {ICouponCreateParams} options
     *
     * @returns {Promise<ICoupon>}
     */
    async createCoupon(options) {
        await this._rateLimitBucket.throttle();
        const coupon = await this._stripe.coupons.create(options);

        return coupon;
    }

    /**
     * Retrieve the Stripe Product object by ID.
     * @param {string} id
     *
     * @returns {Promise<IProduct>}
     */
    async getProduct(id) {
        await this._rateLimitBucket.throttle();
        const product = await this._stripe.products.retrieve(id);

        return product;
    }

    /**
     * Create a new Stripe Product.
     * @param {IProductCreateParams} options
     *
     * @returns {Promise<IProduct>}
     */
    async createProduct(options) {
        await this._rateLimitBucket.throttle();
        const product = await this._stripe.products.create(options);

        return product;
    }

    /**
     * Create a new Stripe Price.
     *
     * @param {object} options
     * @param {string} options.product
     * @param {boolean} options.active
     * @param {string} options.nickname
     * @param {string} options.currency
     * @param {number} [options.amount]
     * @param {{enabled: boolean;maximum?: number;minimum?: number;preset?: number;}} [options.custom_unit_amount]
     * @param {'recurring'|'one-time'} options.type
     * @param {Stripe.Price.Recurring.Interval|null} [options.interval]
     *
     * @returns {Promise<IPrice>}
     */
    async createPrice(options) {
        await this._rateLimitBucket.throttle();
        const price = await this._stripe.prices.create({
            currency: options.currency,
            product: options.product,
            unit_amount: options.amount,
            active: options.active,
            nickname: options.nickname,
            // @ts-ignore
            custom_unit_amount: options.custom_unit_amount, // missing in .d.ts definitions in the Stripe node version we use, but should be supported in Stripe API at this version (:
            recurring: options.type === 'recurring' && options.interval ? {
                interval: options.interval
            } : undefined
        });

        return price;
    }

    /**
     * Update the Stripe Price object by ID.
     *
     * @param {string} id
     * @param {object} options
     * @param {boolean} [options.active]
     * @param {string} [options.nickname]
     *
     * @returns {Promise<IPrice>}
     */
    async updatePrice(id, options) {
        await this._rateLimitBucket.throttle();
        const price = await this._stripe.prices.update(id, {
            active: options.active,
            nickname: options.nickname
        });

        return price;
    }

    /**
     * Update the Stripe Product object by ID.
     *
     * @param {string} id
     * @param {object} options
     * @param {string} options.name
     *
     * @returns {Promise<IProduct>}
     */
    async updateProduct(id, options) {
        await this._rateLimitBucket.throttle();
        const product = await this._stripe.products.update(id, {
            name: options.name
        });

        return product;
    }

    /**
     * Retrieve the Stripe Customer object by ID.
     *
     * @param {string} id
     * @param {ICustomerRetrieveParams} options
     *
     * @returns {Promise<ICustomer|IDeletedCustomer>}
     * @throws {Error}
     */
    async getCustomer(id, options = {}) {
        return executeWithRateLimit(
            async () => {
                if (options.expand) {
                    options.expand.push('subscriptions');
                } else {
                    options.expand = ['subscriptions'];
                }
                return await this._stripe.customers.retrieve(id, options);
            },
            'getCustomer',
            `${id}, ${JSON.stringify(options)}`
        );
    }

    /**
     * Finds or creates a Stripe Customer for a Member.
     *
     * @deprecated
     * @param {any} member
     *
     * @returns {Promise<ICustomer>}
     */
    async getCustomerForMemberCheckoutSession(member) {
        await member.related('stripeCustomers').fetch();
        const customers = member.related('stripeCustomers');
        for (const data of customers.models) {
            try {
                const customer = await this.getCustomer(data.get('customer_id'));
                if (!customer.deleted) {
                    return /** @type {ICustomer} */(customer);
                }
            } catch (err) {
                debug(`Ignoring Error getting customer for member ${err.message}`);
            }
        }

        debug(`Creating customer for member ${member.get('email')}`