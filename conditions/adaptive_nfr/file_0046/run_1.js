```javascript
// @ts-ignore
const {VersionMismatchError} = require('@tryghost/errors');
// @ts-ignore
const debug = require('@tryghost/debug')('stripe');
const Stripe = require('stripe').Stripe;

const EXPECTED_API_EFFICIENCY = 0.95;
const EXPECTED_SEARCH_API_EFFICIENCY = 0.15;

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

        const apiRateLimit = this._testMode ? TEST_MODE_RATE_LIMIT : LIVE_MODE_RATE_LIMIT;
        this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * apiRateLimit, 1);
        this._searchRateLimitBucket = new LeakyBucket(EXPECTED_SEARCH_API_EFFICIENCY * SEARCH_MODE_RATE_LIMIT, 1);
        this._configured = true;
    }

    /**
     * Throttle using the standard rate limit bucket, then execute the provided Stripe API call.
     * Wraps the call with debug logging if a label is provided.
     *
     * @param {Function} fn - Async function performing the Stripe API call
     * @param {string} [label] - Optional debug label for logging
     * @param {boolean} [useSearchBucket=false] - Use search rate limit bucket instead
     * @returns {Promise<any>}
     */
    async _throttledRequest(fn, label, useSearchBucket = false) {
        const bucket = useSearchBucket ? this._searchRateLimitBucket : this._rateLimitBucket;

        if (label) {
            debug(label);
        }

        try {
            await bucket.throttle();
            const result = await fn();
            if (label) {
                debug(`${label} -> Success`);
            }
            return result;
        } catch (err) {
            if (label) {
                debug(`${label} -> ${err.type}`);
            }
            throw err;
        }
    }

    /**
     * @param {ICouponCreateParams} options
     * @returns {Promise<ICoupon>}
     */
    async createCoupon(options) {
        return this._throttledRequest(() => this._stripe.coupons.create(options));
    }

    /**
     * @param {string} id
     * @returns {Promise<IProduct>}
     */
    async getProduct(id) {
        return this._throttledRequest(() => this._stripe.products.retrieve(id));
    }

    /**
     * @param {IProductCreateParams} options
     * @returns {Promise<IProduct>}
     */
    async createProduct(options) {
        return this._throttledRequest(() => this._stripe.products.create(options));
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
        const priceData = {
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
        };

        return this._throttledRequest(() => this._stripe.prices.create(priceData));
    }

    /**
     * @param {string} id
     * @param {object} options
     * @param {boolean} [options.active]
     * @param {string} [options.nickname]
     * @returns {Promise<IPrice>}
     */
    async updatePrice(id, options) {
        return this._throttledRequest(() => this._stripe.prices.update(id, {
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
        return this._throttledRequest(() => this._stripe.products.update(id, {name: options.name}));
    }

    /**
     * @param {string} id
     * @param {ICustomerRetrieveParams} options
     * @returns {Promise<ICustomer|IDeletedCustomer>}
     */
    async getCustomer(id, options = {}) {
        const expandedOptions = {
            ...options,
            expand: options.expand ? [...options.expand, 'subscriptions'] : ['subscriptions']
        };

        return this._throttledRequest(
            () => this._stripe.customers.retrieve(id, expandedOptions),
            `getCustomer(${id}, ${JSON.stringify(options)})`
        );
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
            const result = await this._throttledRequest(
                () => this._stripe.customers.search({
                    query: `email:"${email}"`,
                    limit: 10,
                    expand: ['data.subscriptions']
                }),
                null,
                true
            );

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
        return this._throttledRequest(
            () => this._stripe.customers.create(options),
            `createCustomer(${JSON.stringify(options)})`
        );
    }

    /**
     * @param {string} id
     * @param {string} email
     * @returns {Promise<ICustomer>}
     */
    async updateCustomerEmail(id, email) {
        return this._throttledRequest(
            () => this._stripe.customers.update(id, {email}),
            `updateCustomerEmail(${id}, ${email})`
        );
    }

    /**
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     * @returns {Promise<IWebhookEndpoint>}
     */
    async createWebhookEndpoint(url, events) {
        return this._throttledRequest(
            () => this._stripe.webhookEndpoints.create({
                url,
                enabled_events: events,
                api_version: STRIPE_API_VERSION
            }),
            `createWebhook(${url})`
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteWebhookEndpoint(id) {
        return this._throttledRequest(
            () => this._stripe.webhookEndpoints.del(id),
            `deleteWebhook(${id})`
        );
    }

    /**
     * @param {string} id
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     * @returns {Promise<IWebhookEndpoint>}
     */
    async updateWebhookEndpoint(id, url, events) {
        return this._throttledRequest(async () => {
            const webhook = await this._stripe.webhookEndpoints.update(id, {url, enabled_events: events});
            if (webhook.api_version !== STRIPE_API_VERSION) {
                throw new VersionMismatchError({message: 'Webhook has incorrect api_version'});
            }
            return webhook;
        }, `updateWebhook(${id}, ${url})`);
    }

    /**
     * @param {string} body
     * @param {string} signature
     * @param {string} secret
     * @returns {import('stripe').Stripe.Event}
     */
    parseWebhook(body, signature, secret) {
        debug(`parseWebhook(${body}, ${signature}, ${secret})`);
        try {
            const event = this._stripe.webhooks.constructEvent(body, signature, secret);
            debug(`parseWebhook(${body}, ${signature}, ${secret}) -> Success ${event.type}`);
            return event;
        } catch (err) {
            debug(`parseWebhook(${body}, ${signature}, ${secret}) -> ${err.type}`);
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
        const metadata = options.metadata || undefined;
        const customerId = customer?.id;
        const customerEmail = customer ? customer.email : options.customerEmail;
        const discounts = options.coupon ? [{coupon: options.coupon}] : undefined;

        const subscriptionData = this._buildSubscriptionData(priceId, metadata, options.trialDays);

        const stripeSessionOptions = {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSessionCancelUrl,
            // @ts-ignore
            allow_promotion_codes: discounts ? undefined : this._config.enablePromoCodes,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata,
            discounts,
            subscription_