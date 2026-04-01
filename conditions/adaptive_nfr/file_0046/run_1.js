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
 * @param {Function} fn - The async function to execute
 * @param {string} operationName - Name of the operation for debugging
 * @returns {Promise<any>}
 */
async function executeWithRateLimit(fn, operationName) {
    try {
        const result = await fn();
        debug(`${operationName} -> Success`);
        return result;
    } catch (err) {
        debug(`${operationName} -> ${err.type}`);
        throw err;
    }
}

/**
 * Determines the most recent customer by subscription time
 * @param {Array} customers - Array of Stripe customers
 * @returns {object} Customer with most recent subscription
 */
function findMostRecentCustomer(customers) {
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
 * Handles customer search result based on count
 * @param {Array} customers - Array of found customers
 * @returns {string|undefined} Customer ID or undefined
 */
function handleCustomerSearchResult(customers) {
    if (customers.length === 0) {
        return;
    }

    if (customers.length === 1) {
        return customers[0].id;
    }

    return findMostRecentCustomer(customers).id;
}

/**
 * Builds subscription metadata from options
 * @param {object} metadata - Source metadata object
 * @returns {object} Formatted subscription metadata
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
 * @param {string} priceId - The price ID
 * @param {object} metadata - Metadata object
 * @param {number} trialDays - Trial days if applicable
 * @returns {object} Subscription data object
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
 * Determines customer identifier for checkout session
 * @param {object} customerId - Customer ID if available
 * @param {string} customerEmail - Customer email if available
 * @returns {object} Object with customer or customer_email property
 */
function buildCustomerIdentifier(customerId, customerEmail) {
    if (customerId) {
        return {customer: customerId};
    }
    return {customer_email: customerEmail};
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
            custom_unit_amount: options.custom_unit_amount,
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
        
        return executeWithRateLimit(
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

        debug(`Creating customer for member ${member.get('email')}`);
        const customer = await this.createCustomer({
            email: member.get('email')
        });

        return customer;
    }

    /**
     * Finds a Stripe Customer ID based on the provided email address. Returns null if no customer is found.
     * @param {string} email
     * @see https://stripe.com/docs/api/customers/search
     *
     * @returns {Promise<string|null>} Stripe Customer ID, if found
     */
    async getCustomerIdByEmail(email) {
        await this._searchRateLimitBucket.throttle();
        try {
            const result = await this._stripe.customers.search({
                query: `email:"${email}"`,
                limit: 10,
                expand: ['data.subscriptions']
            });
            const customers = result.data;

            return handleCustomerSearchResult(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * Create a new Stripe Customer.
     *
     * @param {import('stripe').Stripe.CustomerCreateParams} options
     *
     * @returns {Promise