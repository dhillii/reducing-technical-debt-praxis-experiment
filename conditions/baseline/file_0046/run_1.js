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

const STRIPE_API_VERSION = '2020-08-27';
const RATE_LIMIT_CONFIG = {
    EXPECTED_API_EFFICIENCY: 0.95,
    EXPECTED_SEARCH_API_EFFICIENCY: 0.15,
    TEST_MODE_RATE_LIMIT: 25,
    LIVE_MODE_RATE_LIMIT: 100,
    SEARCH_MODE_RATE_LIMIT: 100,
    TEST_ENV_RATE_LIMIT: 10_000
};

const isTesting = process.env.NODE_ENV?.includes('testing');

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

class StripeAPI {
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
        return this.labs.isSet('additionalPaymentMethods') ? undefined : ['card'];
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
        
        this._initializeRateLimitBuckets();
        this._configured = true;
    }

    /**
     * Initialize rate limit buckets based on API mode
     * @private
     */
    _initializeRateLimitBuckets() {
        const LeakyBucket = require('leaky-bucket');
        const testModeLimit = isTesting ? RATE_LIMIT_CONFIG.TEST_ENV_RATE_LIMIT : RATE_LIMIT_CONFIG.TEST_MODE_RATE_LIMIT;
        const liveModeLimit = isTesting ? RATE_LIMIT_CONFIG.TEST_ENV_RATE_LIMIT : RATE_LIMIT_CONFIG.LIVE_MODE_RATE_LIMIT;
        const searchLimit = isTesting ? RATE_LIMIT_CONFIG.TEST_ENV_RATE_LIMIT : RATE_LIMIT_CONFIG.SEARCH_MODE_RATE_LIMIT;

        const apiLimit = this._testMode ? testModeLimit : liveModeLimit;
        this._rateLimitBucket = new LeakyBucket(
            RATE_LIMIT_CONFIG.EXPECTED_API_EFFICIENCY * apiLimit,
            1
        );
        this._searchRateLimitBucket = new LeakyBucket(
            RATE_LIMIT_CONFIG.EXPECTED_SEARCH_API_EFFICIENCY * searchLimit,
            1
        );
    }

    /**
     * Execute a Stripe API call with rate limiting and error handling
     * @private
     * @param {Function} fn - The async function to execute
     * @param {string} operationName - Name of the operation for debugging
     * @param {boolean} useSearchLimit - Whether to use search rate limit
     * @returns {Promise<any>}
     */
    async _executeWithRateLimit(fn, operationName, useSearchLimit = false) {
        const bucket = useSearchLimit ? this._searchRateLimitBucket : this._rateLimitBucket;
        await bucket.throttle();
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
     * Create a new Stripe Coupon.
     *
     * @param {ICouponCreateParams} options
     *
     * @returns {Promise<ICoupon>}
     */
    async createCoupon(options) {
        return this._executeWithRateLimit(
            () => this._stripe.coupons.create(options),
            'createCoupon'
        );
    }

    /**
     * Retrieve the Stripe Product object by ID.
     * @param {string} id
     *
     * @returns {Promise<IProduct>}
     */
    async getProduct(id) {
        return this._executeWithRateLimit(
            () => this._stripe.products.retrieve(id),
            `getProduct(${id})`
        );
    }

    /**
     * Create a new Stripe Product.
     * @param {IProductCreateParams} options
     *
     * @returns {Promise<IProduct>}
     */
    async createProduct(options) {
        return this._executeWithRateLimit(
            () => this._stripe.products.create(options),
            'createProduct'
        );
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
        const priceOptions = {
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
        };

        return this._executeWithRateLimit(
            () => this._stripe.prices.create(priceOptions),
            'createPrice'
        );
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
        return this._executeWithRateLimit(
            () => this._stripe.prices.update(id, {
                active: options.active,
                nickname: options.nickname
            }),
            `updatePrice(${id})`
        );
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
        return this._executeWithRateLimit(
            () => this._stripe.products.update(id, {name: options.name}),
            `updateProduct(${id})`
        );
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
        const expandOptions = {
            ...options,
            expand: options.expand ? [...options.expand, 'subscriptions'] : ['subscriptions']
        };

        return this._executeWithRateLimit(
            () => this._stripe.customers.retrieve(id, expandOptions),
            `getCustomer(${id})`
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
        return this.createCustomer({email: member.get('email')});
    }

    /**
     * Finds a Stripe Customer ID based on the provided email address. Returns null if no customer is found.
     * @param {string} email
     * @see https://stripe.com/docs/api/customers/search
     *
     * @returns {Promise<string|null>} Stripe Customer ID, if found
     */
    async getCustomerIdByEmail(email) {
        try {
            const result = await this._executeWithRateLimit(
                () => this._stripe.customers.search({
                    query: `email:"${email}"`,
                    limit: 10,
                    expand: ['data.subscriptions']
                }),
                `getCustomerIdByEmail(${email})`,
                true
            );

            return this._selectCustomerFromResults(result.data);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * Select the most appropriate customer from search results
     * @private
     * @param {Array} customers
     * @returns {string|null}
     */
    _selectCustomerFromResults(customers) {
        if (customers.length === 0) {
            return null;
        }

        if (customers.length === 1) {
            return customers[0].id;
        }

        return this._getCustomerWithLatestSubscription(customers).id;
    }

    /**
     * Get the customer with the most recent subscription
     * @private
     * @param {Array} customers
     * @returns {object}
     */
    _getCustomerWithLatestSubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            const subscriptions = customer.subscriptions?.data || [];
            
            for (const subscription of subscriptions) {
                if (subscription.current_period_end > latestSubscriptionTime) {
                    latestSubscriptionTime = subscription.current_period_end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer;
    }

    /**
     * Create a new Stripe Customer.
     *
     * @param {import('stripe').Stripe.CustomerCreateParams} options
     *
     * @returns {Promise<ICustomer>}
     */
    async createCustomer(options = {}) {
        return this._executeWithRateLimit(
            () => this._stripe.customers.create(options),
            `createCustomer(${JSON.stringify(options)})`
        );
    }

    /**
     * Update the email address for a Stripe Customer.
     *
     * @param {string} id
     * @param {string} email
     *
     * @returns {Promise<ICustomer>}
     */
    async updateCustomerEmail(id, email) {
        return this._executeWithRateLimit(
            () => this._stripe.customers.update(id, {email}),
            `updateCustomerEmail(${id}, ${email})`
        );
    }

    /**
     * Create a new Stripe Webhook Endpoint.
     *
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     *
     * @returns {Promise<IWebhookEndpoint>}
     */
    async createWebhookEndpoint(url, events) {
        return this._executeWithRateLimit(
            () => this._stripe.webhookEndpoints.create({
                url,
                enabled_events