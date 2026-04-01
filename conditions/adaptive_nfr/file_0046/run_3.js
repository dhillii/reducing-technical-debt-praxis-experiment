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
 * Wraps API calls with rate limiting and error handling
 * @param {Function} apiCall - The API call to execute
 * @param {string} operationName - Name of the operation for debugging
 * @returns {Promise<any>}
 */
async function executeWithRateLimit(apiCall, operationName) {
    try {
        const result = await apiCall();
        debug(`${operationName} -> Success`);
        return result;
    } catch (err) {
        debug(`${operationName} -> ${err.type}`);
        throw err;
    }
}

/**
 * Determines if a customer has valid subscriptions
 * @param {any} customer - The customer object to check
 * @returns {boolean}
 */
function hasValidSubscriptions(customer) {
    return customer.subscriptions && customer.subscriptions.data && customer.subscriptions.data.length > 0;
}

/**
 * Finds the most recent subscription timestamp from a customer
 * @param {any} customer - The customer object
 * @returns {number} - Unix timestamp of most recent subscription
 */
function getLatestSubscriptionTime(customer) {
    if (!hasValidSubscriptions(customer)) {
        return 0;
    }

    let latestTime = 0;
    for (let subscription of customer.subscriptions.data) {
        if (subscription.current_period_end && subscription.current_period_end > latestTime) {
            latestTime = subscription.current_period_end;
        }
    }
    return latestTime;
}

/**
 * Selects the customer with the most recent subscription
 * @param {any[]} customers - Array of customer objects
 * @returns {any} - Customer with most recent subscription
 */
function selectCustomerWithLatestSubscription(customers) {
    let latestCustomer = customers[0];
    let latestSubscriptionTime = 0;

    for (let customer of customers) {
        const subscriptionTime = getLatestSubscriptionTime(customer);
        if (subscriptionTime > latestSubscriptionTime) {
            latestSubscriptionTime = subscriptionTime;
            latestCustomer = customer;
        }
    }

    return latestCustomer;
}

/**
 * Builds subscription data for checkout session
 * @param {string} priceId - The price ID
 * @param {object} metadata - Metadata object
 * @param {number} [trialDays] - Optional trial days
 * @returns {object} - Subscription data object
 */
function buildSubscriptionData(priceId, metadata, trialDays) {
    const subscriptionData = {
        trial_from_plan: true,
        items: [{
            plan: priceId
        }],
        metadata: {
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
        }
    };

    if (typeof trialDays === 'number' && trialDays > 0) {
        delete subscriptionData.trial_from_plan;
        subscriptionData.trial_period_days = trialDays;
    }

    return subscriptionData;
}

/**
 * Builds checkout session options
 * @param {object} params - Parameters object
 * @param {string} params.priceId - Price ID
 * @param {string} [params.customerId] - Customer ID
 * @param {string} [params.customerEmail] - Customer email
 * @param {object} params.config - Configuration object
 * @param {object} params.subscriptionData - Subscription data
 * @param {object} [params.discounts] - Discounts array
 * @param {IPaymentMethodType[]} [params.paymentMethodTypes] - Payment method types
 * @param {string} [params.successUrl] - Success URL
 * @param {string} [params.cancelUrl] - Cancel URL
 * @returns {object} - Stripe session options
 */
function buildCheckoutSessionOptions({
    priceId,
    customerId,
    customerEmail,
    config,
    subscriptionData,
    discounts,
    paymentMethodTypes,
    successUrl,
    cancelUrl
}) {
    const stripeSessionOptions = {
        payment_method_types: paymentMethodTypes,
        success_url: successUrl || config.checkoutSessionSuccessUrl,
        cancel_url: cancelUrl || config.checkoutSessionCancelUrl,
        allow_promotion_codes: discounts ? undefined : config.enablePromoCodes,
        automatic_tax: {
            enabled: config.enableAutomaticTax
        },
        metadata: subscriptionData.metadata,
        discounts,
        subscription_data: subscriptionData
    };

    if (customerId) {
        stripeSessionOptions.customer = customerId;
    } else {
        stripeSessionOptions.customer_email = customerEmail;
    }

    if (customerId && config.enableAutomaticTax) {
        stripeSessionOptions.customer_update = {address: 'auto'};
    }

    return stripeSessionOptions;
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
        
        const rateLimitCapacity = this._testMode ? TEST_MODE_RATE_LIMIT : LIVE_MODE_RATE_LIMIT;
        this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * rateLimitCapacity, 1);
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
        debug(`getCustomer(${id}, ${JSON.stringify(options)})`);
        await this._rateLimitBucket.throttle();
        
        if (options.expand) {
            options.expand.push('subscriptions');
        } else {
            options.expand = ['subscriptions'];
        }
        
        return await executeWithRateLimit(
            () => this._stripe.customers.retrieve(id, options),
            `getCustomer(${id}, ${JSON.stringify(options)})`
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