```javascript
// @ts-ignore
const {VersionMismatchError} = require('@tryghost/errors');
// @ts-ignore
const debug = require('@tryghost/debug')('stripe');
const Stripe = require('stripe').Stripe;

const EXPECTED_API_EFFICIENCY = 0.95;
const EXPECTED_SEARCH_API_EFFICIENCY = 0.15;
const STRIPE_API_VERSION = '2020-08-27';

const isTesting = process.env.NODE_ENV?.includes('testing');
const RATE_LIMIT = {
    TEST: isTesting ? 10_000 : 25,
    LIVE: isTesting ? 10_000 : 100,
    SEARCH: isTesting ? 10_000 : 100
};

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
 * @prop {boolean} testEnv
 */

module.exports = class StripeAPI {
    /**
     * @param {object} deps
     * @param {object} deps.labs
     */
    constructor(deps) {
        /** @type {Stripe} */
        this._stripe = null;
        this._configured = false;
        this.labs = deps.labs;
    }

    /** @returns {IPaymentMethodType[]|undefined} */
    get PAYMENT_METHOD_TYPES() {
        return this.labs.isSet('additionalPaymentMethods') ? undefined : ['card'];
    }

    /** @returns {boolean} */
    get configured() {
        return this._configured;
    }

    /** @returns {boolean} */
    get testEnv() {
        return this._config.testEnv;
    }

    /** @returns {string} */
    get mode() {
        return this._testMode ? 'test' : 'live';
    }

    /**
     * @param {IStripeAPIConfig} config
     * @returns {void}
     */
    configure(config) {
        if (!config) {
            this._stripe = null;
            this._configured = false;
            return;
        }

        const LeakyBucket = require('leaky-bucket');

        this._stripe = new Stripe(config.secretKey, {apiVersion: STRIPE_API_VERSION});
        this._config = config;
        this._testMode = config.secretKey?.startsWith('sk_test_');

        const apiLimit = this._testMode ? RATE_LIMIT.TEST : RATE_LIMIT.LIVE;
        this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * apiLimit, 1);
        this._searchRateLimitBucket = new LeakyBucket(EXPECTED_SEARCH_API_EFFICIENCY * RATE_LIMIT.SEARCH, 1);
        this._configured = true;
    }

    /**
     * Throttle using the standard rate limit bucket, then execute the provided operation.
     * @template T
     * @param {() => Promise<T>} operation
     * @returns {Promise<T>}
     */
    async _throttled(operation) {
        await this._rateLimitBucket.throttle();
        return operation();
    }

    /**
     * Throttle using the search rate limit bucket, then execute the provided operation.
     * @template T
     * @param {() => Promise<T>} operation
     * @returns {Promise<T>}
     */
    async _searchThrottled(operation) {
        await this._searchRateLimitBucket.throttle();
        return operation();
    }

    /**
     * Wrap an async operation with debug logging and error re-throwing.
     * @template T
     * @param {string} label
     * @param {() => Promise<T>} operation
     * @returns {Promise<T>}
     */
    async _debugged(label, operation) {
        debug(label);
        try {
            const result = await operation();
            debug(`${label} -> Success`);
            return result;
        } catch (err) {
            debug(`${label} -> ${err.type}`);
            throw err;
        }
    }

    /**
     * @param {ICouponCreateParams} options
     * @returns {Promise<ICoupon>}
     */
    async createCoupon(options) {
        return this._throttled(() => this._stripe.coupons.create(options));
    }

    /**
     * @param {string} id
     * @returns {Promise<IProduct>}
     */
    async getProduct(id) {
        return this._throttled(() => this._stripe.products.retrieve(id));
    }

    /**
     * @param {IProductCreateParams} options
     * @returns {Promise<IProduct>}
     */
    async createProduct(options) {
        return this._throttled(() => this._stripe.products.create(options));
    }

    /**
     * @param {object} options
     * @param {string} options.product
     * @param {boolean} options.active
     * @param {string} options.nickname
     * @param {string} options.currency
     * @param {number} [options.amount]
     * @param {{enabled: boolean;maximum?: number;minimum?: number;preset?: number;}} [options.custom_unit_amount]
     * @param {'recurring'|'one-time'} options.type
     * @param {Stripe.Price.Recurring.Interval|null} [options.interval]
     * @returns {Promise<IPrice>}
     */
    async createPrice(options) {
        return this._throttled(() => this._stripe.prices.create({
            currency: options.currency,
            product: options.product,
            unit_amount: options.amount,
            active: options.active,
            nickname: options.nickname,
            // @ts-ignore
            custom_unit_amount: options.custom_unit_amount,
            recurring: options.type === 'recurring' && options.interval
                ? {interval: options.interval}
                : undefined
        }));
    }

    /**
     * @param {string} id
     * @param {object} options
     * @param {boolean} [options.active]
     * @param {string} [options.nickname]
     * @returns {Promise<IPrice>}
     */
    async updatePrice(id, options) {
        return this._throttled(() => this._stripe.prices.update(id, {
            active: options.active,
            nickname: options.nickname
        }));
    }

    /**
     * @param {string} id
     * @param {object} options
     * @param {string} options.name
     * @returns {Promise<IProduct>}
     */
    async updateProduct(id, options) {
        return this._throttled(() => this._stripe.products.update(id, {name: options.name}));
    }

    /**
     * @param {string} id
     * @param {ICustomerRetrieveParams} options
     * @returns {Promise<ICustomer|IDeletedCustomer>}
     */
    async getCustomer(id, options = {}) {
        const label = `getCustomer(${id}, ${JSON.stringify(options)})`;
        return this._debugged(label, async () => {
            await this._rateLimitBucket.throttle();
            options.expand = [...(options.expand || []), 'subscriptions'];
            return this._stripe.customers.retrieve(id, options);
        });
    }

    /**
     * @deprecated
     * @param {any} member
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
     * @param {string} email
     * @returns {Promise<string|null>}
     */
    async getCustomerIdByEmail(email) {
        try {
            const result = await this._searchThrottled(() => this._stripe.customers.search({
                query: `email:"${email}"`,
                limit: 10,
                expand: ['data.subscriptions']
            }));

            const customers = result.data;

            if (customers.length === 0) {
                return null;
            }

            if (customers.length === 1) {
                return customers[0].id;
            }

            return this._getMostRecentCustomerId(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * @param {ICustomer[]} customers
     * @returns {string}
     */
    _getMostRecentCustomerId(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            if (!customer.subscriptions?.data?.length) {
                continue;
            }

            for (const subscription of customer.subscriptions.data) {
                if (subscription.current_period_end > latestSubscriptionTime) {
                    latestSubscriptionTime = subscription.current_period_end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer.id;
    }

    /**
     * @param {import('stripe').Stripe.CustomerCreateParams} options
     * @returns {Promise<ICustomer>}
     */
    async createCustomer(options = {}) {
        const label = `createCustomer(${JSON.stringify(options)})`;
        return this._debugged(label, async () => {
            await this._rateLimitBucket.throttle();
            return this._stripe.customers.create(options);
        });
    }

    /**
     * @param {string} id
     * @param {string} email
     * @returns {Promise<ICustomer>}
     */
    async updateCustomerEmail(id, email) {
        const label = `updateCustomerEmail(${id}, ${email})`;
        return this._debugged(label, async () => {
            await this._rateLimitBucket.throttle();
            return this._stripe.customers.update(id, {email});
        });
    }

    /**
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     * @returns {Promise<IWebhookEndpoint>}
     */
    async createWebhookEndpoint(url, events) {
        return this._debugged(`createWebhook(${url})`, async () => {
            await this._rateLimitBucket.throttle();
            return this._stripe.webhookEndpoints.create({
                url,
                enabled_events: events,
                api_version: STRIPE_API_VERSION
            });
        });
    }

    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteWebhookEndpoint(id) {
        return this._debugged(`deleteWebhook(${id})`, async () => {
            await this._rateLimitBucket.throttle();
            await this._stripe.webhookEndpoints.del(id);
        });
    }

    /**
     * @param {string} id
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     * @returns {Promise<IWebhookEndpoint>}
     */
    async updateWebhookEndpoint(id, url, events) {
        return this._debugged(`updateWebhook(${id}, ${url})`, async () => {
            await this._rateLimitBucket.throttle();
            const webhook = await this._stripe.webhookEndpoints.update(id, {url, enabled_events: events});
            if (webhook.api_version !== STRIPE_API_VERSION) {
                throw new VersionMismatchError({message: 'Webhook has incorrect api_version'});
            }
            return webhook;
        });
    }

    /**
     * @param {string} body
     * @param {string} signature
     * @param {string} secret
     * @returns {import('stripe').Stripe.Event}
     */
    parseWebhook(body, signature, secret) {
        const label = `parseWebhook(${body}, ${signature}, ${secret})`;
        debug(label);
        try {
            const event = this._stripe.webhooks.constructEvent(body, signature, secret);
            debug(`${label} -> Success ${event.type}`);
            return event;
        } catch (err) {
            debug(`${label} -> ${err.type}`);
            throw err;
        }
    }

    /**
     * @param {string} priceId
     * @param {ICustomer} customer
     * @param {object} options
     * @param {Object.<String, any>} options.metadata
     * @param {string} options.successUrl
     * @param {string} options.cancelUrl
     * @param {string} options.customerEmail
     * @param {number} options.trialDays
     * @param {string} [options.coupon]
     * @returns {Promise<ICheckoutSession>}
     */
    async createCheckoutSession(priceId, customer, options) {
        await this._rateLimitBucket.throttle();

        const metadata = options.metadata || undefined;
        const customerId = customer?.id;
        const customerEmail = customer ? customer.email : options.customerEmail;
        const discounts = options.coupon ? [{coupon: options.coupon}] : undefined;

        const subscriptionData = this._buildSubscriptionData(priceId, metadata, options.trialDays);

        const stripeSessionOptions = {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl