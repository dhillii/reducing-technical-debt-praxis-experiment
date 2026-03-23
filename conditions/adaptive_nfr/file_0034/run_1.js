# Refactored StripeAPI

The main complexity issues I identified:
1. **Repetitive throttle + call + return patterns** across most methods
2. **Repetitive debug logging** with try/catch boilerplate in several methods
3. **Inconsistent patterns** (some methods use debug/try-catch, others don't)
4. **Rate limit bucket selection logic** scattered inline
5. **`getCustomerIdByEmail`** has nested loops with unclear intent
6. **`createCheckoutSession`** is overly long with inline comments masking structure

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

    // -------------------------------------------------------------------------
    // Properties
    // -------------------------------------------------------------------------

    /**
     * @returns {IPaymentMethodType[]|undefined}
     */
    get PAYMENT_METHOD_TYPES() {
        return this.labs.isSet('additionalPaymentMethods') ? undefined : ['card'];
    }

    /** @returns {boolean} */
    get configured() {
        return this._configured;
    }

    /**
     * Returns true if this package is running in a test environment (i.e. browser tests).
     * Note: This is not the same as the Stripe API's test mode.
     * @returns {boolean}
     */
    get testEnv() {
        return this._config.testEnv;
    }

    /** @returns {string} */
    get mode() {
        return this._testMode ? 'test' : 'live';
    }

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    /**
     * Configure the Stripe API.
     * - Instantiates the Stripe API client
     * - Sets the Stripe API mode
     * - Configures rate limiting buckets
     *
     * @param {IStripeAPIConfig} config
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

        this._stripe = new Stripe(config.secretKey, {apiVersion: STRIPE_API_VERSION});
        this._config = config;
        this._testMode = config.secretKey?.startsWith('sk_test_');

        const apiRateLimit = this._testMode ? TEST_MODE_RATE_LIMIT : LIVE_MODE_RATE_LIMIT;
        this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * apiRateLimit, 1);
        this._searchRateLimitBucket = new LeakyBucket(EXPECTED_SEARCH_API_EFFICIENCY * SEARCH_MODE_RATE_LIMIT, 1);

        this._configured = true;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Throttle using the standard API rate limit bucket, then execute the
     * provided Stripe call. Optionally wraps the call with debug logging.
     *
     * @template T
     * @param {() => Promise<T>} fn
     * @param {string} [label] - If provided, emits debug logs and re-throws with context
     * @returns {Promise<T>}
     */
    async _throttledCall(fn, label = null) {
        await this._rateLimitBucket.throttle();

        if (!label) {
            return fn();
        }

        debug(label);
        try {
            const result = await fn();
            debug(`${label} -> Success`);
            return result;
        } catch (err) {
            debug(`${label} -> ${err.type}`);
            throw err;
        }
    }

    /**
     * Throttle using the search API rate limit bucket, then execute the
     * provided Stripe call.
     *
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async _throttledSearchCall(fn) {
        await this._searchRateLimitBucket.throttle();
        return fn();
    }

    // -------------------------------------------------------------------------
    // Coupons
    // -------------------------------------------------------------------------

    /**
     * @param {ICouponCreateParams} options
     * @returns {Promise<ICoupon>}
     */
    async createCoupon(options) {
        return this._throttledCall(() => this._stripe.coupons.create(options));
    }

    // -------------------------------------------------------------------------
    // Products
    // -------------------------------------------------------------------------

    /**
     * @param {string} id
     * @returns {Promise<IProduct>}
     */
    async getProduct(id) {
        return this._throttledCall(() => this._stripe.products.retrieve(id));
    }

    /**
     * @param {IProductCreateParams} options
     * @returns {Promise<IProduct>}
     */
    async createProduct(options) {
        return this._throttledCall(() => this._stripe.products.create(options));
    }

    /**
     * @param {string} id
     * @param {{name: string}} options
     * @returns {Promise<IProduct>}
     */
    async updateProduct(id, options) {
        return this._throttledCall(() => this._stripe.products.update(id, {name: options.name}));
    }

    // -------------------------------------------------------------------------
    // Prices
    // -------------------------------------------------------------------------

    /**
     * @param {string} id
     * @param {object} options
     * @returns {Promise<IPrice>}
     */
    async getPrice(id, options = {}) {
        debug(`getPrice(${id}, ${JSON.stringify(options)})`);
        return this._stripe.prices.retrieve(id, options);
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
        const recurring = (options.type === 'recurring' && options.interval)
            ? {interval: options.interval}
            : undefined;

        return this._throttledCall(() => this._stripe.prices.create({
            currency: options.currency,
            product: options.product,
            unit_amount: options.amount,
            active: options.active,
            nickname: options.nickname,
            // @ts-ignore - missing in .d.ts definitions but supported in Stripe API at this version
            custom_unit_amount: options.custom_unit_amount,
            recurring
        }));
    }

    /**
     * @param {string} id
     * @param {{active?: boolean; nickname?: string}} options
     * @returns {Promise<IPrice>}
     */
    async updatePrice(id, options) {
        return this._throttledCall(() => this._stripe.prices.update(id, {
            active: options.active,
            nickname: options.nickname
        }));
    }

    // -------------------------------------------------------------------------
    // Customers
    // -------------------------------------------------------------------------

    /**
     * @param {string} id
     * @param {ICustomerRetrieveParams} options
     * @returns {Promise<ICustomer|IDeletedCustomer>}
     */
    async getCustomer(id, options = {}) {
        const label = `getCustomer(${id}, ${JSON.stringify(options)})`;

        if (options.expand) {
            options.expand.push('subscriptions');
        } else {
            options.expand = ['subscriptions'];
        }

        return this._throttledCall(
            () => this._stripe.customers.retrieve(id, options),
            label
        );
    }

    /**
     * Finds or creates a Stripe Customer for a Member.
     *
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
                    return /** @type {ICustomer} */ (customer);
                }
            } catch (err) {
                debug(`Ignoring Error getting customer for member ${err.message}`);
            }
        }

        debug(`Creating customer for member ${member.get('email')}`);
        return this.createCustomer({email: member.get('email')});
    }

    /**
     * Finds a Stripe Customer ID based on the provided email address.
     * Returns null if no customer is found.
     *
     * @param {string} email
     * @see https://stripe.com/docs/api/customers/search
     * @returns {Promise<string|null>} Stripe Customer ID, if found
     */
    async getCustomerIdByEmail(email) {
        try {
            const result = await this._throttledSearchCall(() => this._stripe.customers.search({
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

            return this._getMostRecentlySubscribedCustomerId(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * Given a list of customers, returns the ID of the one with the most
     * recently active subscription.
     *
     * @param {ICustomer[]} customers
     * @returns {string}
     */
    _getMostRecentlySubscribedCustomerId(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            const subscriptions = customer.subscriptions?.data ?? [];

            for (const subscription of subscriptions) {
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
        return this._throttledCall(
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
        return this._throttledCall(
            () => this._stripe.customers.update(id, {email}),
            `updateCustomerEmail(${id}, ${email})`
        );
    }

    // -------------------------------------------------------------------------
    // Webhooks
    // -------------------------------------------------------------------------

    /**
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     * @returns {Promise<IWebhookEndpoint>}
     */
    async createWebhookEndpoint(url, events) {
        return this._throttledCall(
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
        await this._throttledCall(
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
        const label = `updateWebhook(${id}, ${url})`;
        debug(label);

        try {
            await this._rateLimitBucket.throttle();
            const webhook = await this._stripe.webhookEndpoints.update(id, {url, enabled_events: events});

            if (webhook.api_version !== STRIPE_API_VERSION) {
                throw new VersionMismatchError({message: 'Webhook has incorrect api_version'});
            }

            debug(`${label} -> Success`);
            return webhook;
        } catch (err) {
            debug(`${label} -> ${err.type}`);
            throw err;
        }
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

    // -------------------------------------------------------------------------
    // Checkout Sessions
    // -------------------------------------------------------------------------

    /**
     * Create a new Stripe Checkout Session for a new subscription.
     *
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

        const sessionParams = {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSessionCancelUrl,
            // @ts-ignore - we need to update to latest stripe library to correctly use newer features
            allow_promotion_codes: discounts ? undefined : this._config.enablePromoCodes,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata,
            discounts,
            subscription_data: subscriptionData
        };

        if (customerId) {
            sessionParams.customer = customerId;
        } else {
            sessionParams.customer_email = customerEmail;
        }

        if (customerId && this._config.enableAutomaticTax) {
            sessionParams.customer_update = {address: 'auto'};
        }

        // @ts-ignore
        return this._throttledCall(() => this._stripe.checkout.sessions.create(sessionParams));
    }

    /**
     * Builds the subscription_data object for a checkout session.
     *
     * @param {string} priceId
     * @param {Object.<String, any>} metadata
     * @param {number} trialDays
     * @returns {object}
     */
    _buildSubscriptionData(priceId, metadata, trialDays) {
        const subscriptionData = {
            trial_from_plan: true,
            items: [{plan: priceId}],
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

        // `trial_from_plan` is deprecated; replace with explicit trial period days when available
        if (typeof trialDays === 'number' && trialDays > 0) {
            delete subscriptionData.trial_from_plan;
            subscriptionData.trial_period_days = trialDays;
        }

        return subscriptionData;
    }

    /**
     * Create a new Stripe Checkout Session for a donation.
     *
     * @param {object} options
     * @param {string} options.priceId
     * @param {string} options.successUrl
     * @param {string} options.cancelUrl
     * @param {Object.<String, any>} options.metadata
     * @param {ICustomer} [options.customer]
     * @param {string} [options.customerEmail]
     * @param {string} [options.personalNote]
     * @returns {Promise<ICheckoutSession>}
     */
    async createDonationCheckoutSession({priceId, successUrl, cancelUrl, metadata, customer, customerEmail, personalNote}) {
        const enrichedMetadata = {ghost_donation: true, ...metadata};

        const sessionParams = {
            mode: 'payment',
            success_url: successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: cancelUrl || this._config.checkoutSessionCancelUrl,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata: enrichedMetadata,
            customer: customer?.id,
            customer_email: !customer && customerEmail ? customerEmail : undefined,
            submit_type: 'pay',
            invoice_creation: {
                enabled: true,
                invoice_data: {metadata: enrichedMetadata}
            },
            line_items: [{price: priceId, quantity: 1}],
            custom_fields: [{
                key: 'donation_message',
                label: {
                    type: 'custom',
                    custom: personalNote || 'Add a personal note'
                },
                type: 'text',
                optional: true
            }]
        };

        if (customer && this._config.enableAutomaticTax) {
            sessionParams.customer_update = {address: 'auto'};
        }

        // @ts-ignore
        return this._throttledCall(() => this._stripe.checkout.sessions.create(sessionParams));
    }

    /**
     * Create a new Stripe Checkout Setup Session.
     *
     * @param {ICustomer} customer
     * @param {object} options
     * @param {string} options.successUrl
     * @param {string} options.cancelUrl
     * @param {string} options.currency - 3-letter ISO code in lowercase, e.g. `usd`
     * @returns {Promise<ICheckoutSession>}
     */
    async createCheckoutSetupSession(customer, options) {
        return this._throttledCall(() => this._stripe.checkout.sessions.create({
            mode: 'setup',
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSetupSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSetupSessionCancelUrl,
            customer_email: customer.email,
            setup_intent_data: {
                metadata: {customer_id: customer.id}
            },
            // Required for dynamic payment methods
            // https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-currency
            // @ts-ignore
            currency: this.labs.isSet('additionalPaymentMethods') ? options.currency : undefined
        }));
    }

    // -------------------------------------------------------------------------
    // Billing Portal
    // -------------------------------------------------------------------------

    /**
     * @param {ICustomer} customer
     * @param {object} options
     * @param {string} options.returnUrl
     * @param {string} [options.configurationId]
     * @returns {Promise<IBillingSession>}
     */
    async createBillingPortalSession(customer, options) {
        const sessionParams = {
            customer: customer.id,
            return_url: options.returnUrl || this._config.billingPortalReturnUrl
        };

        if (options.configurationId) {
            sessionParams.configuration = options.configurationId;
        }

        return this._throttledCall(() => this._stripe.billingPortal.sessions.create(sessionParams));
    }

    /**
     * @param {object} options
     * @returns {Promise<import('stripe').Stripe.BillingPortal.Configuration>}
     */
    async createBillingPortalConfiguration(options) {
        return this._throttledCall(() => this._stripe.billingPortal.configurations.create(options));
    }

    /**
     * @param {string} id
     * @param {object} options
     * @returns {Promise<import('stripe').Stripe.BillingPortal.Configuration>}
     */
    async updateBillingPortalConfiguration(id, options) {
        return this._throttledCall(() => this._stripe.billingPortal.configurations.update(id, options));
    }

    // -------------------------------------------------------------------------
    // Subscriptions
    // -------------------------------------------------------------------------

    /**
     * @param {string} id
     * @param {ISubscriptionRetrieveParams} options
     * @returns {Promise<ISubscription>}
     */
    async getSubscription(id, options = {}) {
        return this._throttledCall(
            () => this._stripe.subscriptions.retrieve(id, options),
            `getSubscription(${id}, ${JSON.stringify(options)})`
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async cancelSubscription(id) {
        return this._throttledCall(
            () => this._stripe.subscriptions.del(id),
            `cancelSubscription(${id})`
        );
    }

    /**
     * @param {string} id
     * @param {string} [reason='']
     * @returns {Promise<ISubscription>}
     */
    async cancelSubscriptionAtPeriodEnd(id, reason = '') {
        return this._throttledCall(() => this._stripe.subscriptions.update(id, {
            cancel_at_period_end: true,
            metadata: {cancellation_reason: reason}
        }));
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async continueSubscriptionAtPeriodEnd(id) {
        return this._throttledCall(() => this._stripe.subscriptions.update(id, {
            cancel_at_period_end: false,
            metadata: {cancellation_reason: null}
        }));
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async removeCouponFromSubscription(id) {
        return this._throttledCall(() => this._stripe.subscriptions.update(id, {coupon: ''}));
    }

    /**
     * @param {string} id
     * @param {string} couponId
     * @returns {Promise<ISubscription>}
     */
    async addCouponToSubscription(id, couponId) {
        return this._throttledCall(() => this._stripe.subscriptions.update(id, {coupon: couponId}));
    }

    /**
     * @param {string} id
     * @param {number} trialEnd - Unix timestamp in seconds
     * @param {object} [options={}]
     * @param {('always_invoice'|'create_prorations'|'none')} [options.prorationBehavior='none']
     * @returns {Promise<ISubscription>}
     */
    async updateSubscriptionTrialEnd(id, trialEnd, options = {}) {
        return this._throttledCall(() => this._stripe.subscriptions.update(id, {
            trial_end: trialEnd,
            proration_behavior: options.prorationBehavior || 'none'
        }));
    }

    /**
     * @param {string} subscriptionId
     * @param {string} id - SubscriptionItem ID
     * @param {string} price - New Price ID
     * @param {object} [options={}]
     * @param {('always_invoice'|'create_prorations'|'none')} [options.prorationBehavior='always_invoice']
     * @param {string} [options.cancellationReason=null]
     * @returns {Promise<ISubscription>}
     */
    async updateSubscriptionItemPrice(subscriptionId, id, price, options = {}) {
        return this._throttledCall(() => this._stripe.subscriptions.update(subscriptionId, {
            proration_behavior: options.prorationBehavior || 'always_invoice',
            items: [{id, price}],
            cancel_at_period_end: false,
            metadata: {cancellation_reason: options.cancellationReason ?? null}
        }));
    }

    /**
     * @param {string} customer
     * @param {string} price
     * @returns {Promise<ISubscription>}
     */
    async createSubscription(customer, price) {
        return this._throttledCall(() => this._stripe.subscriptions.create({
            customer,
            items: [{price}]
        }));
    }

    /**
     * @param {string} subscription
     * @param {string} paymentMethod
     * @returns {Promise<ISubscription>}
     */
    async updateSubscriptionDefaultPaymentMethod(subscription, paymentMethod) {
        return this._throttledCall(() => this._stripe.subscriptions.update(subscription, {
            default_payment_method: paymentMethod
        }));
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async cancelSubscriptionTrial(id) {
        return this._throttledCall(() => this._stripe.subscriptions.update(id, {trial_end: 'now'}));
    }

    // -------------------------------------------------------------------------
    // Setup Intents & Payment Methods
    // -------------------------------------------------------------------------

    /**
     * @param {string} id
     * @param {import('stripe').Stripe.SetupIntentRetrieveParams} options
     * @returns {Promise<import('stripe').Stripe.SetupIntent>}
     */
    async getSetupIntent(id, options = {}) {
        return this._throttledCall(() => this._stripe.setupIntents.retrieve(id, options));
    }

    /**
     * @param {string} customer
     * @param {string} paymentMethod
     * @returns {Promise<void>}
     */
    async attachPaymentMethodToCustomer(customer, paymentMethod) {
        await this._throttledCall(() => this._stripe.paymentMethods.attach(paymentMethod, {customer}));
    }

    /**
     * @param {string} id
     * @returns {Promise<import('stripe').Stripe.PaymentMethod|null>}
     */
    async getCardPaymentMethod(id) {
        const paymentMethod = await this._throttledCall(() => this._stripe.paymentMethods.retrieve(id));
        return paymentMethod.type === 'card' ? paymentMethod : null;
    }

    // -------------------------------------------------------------------------
    // Misc
    // -------------------------------------------------------------------------

    /** @returns {string} */
    getPublicKey() {
        return this._config.publicKey;
    }
};
```

## Key Changes

### 1. `_throttledCall()` helper (biggest win)
Eliminates the repetitive `await this._rateLimitBucket.throttle(); const x = await ...; return x;` pattern across ~20 methods. The optional `label` parameter also absorbs the debug/try-catch boilerplate used in ~8 methods.

### 2. `_throttledSearchCall()` helper
Mirrors `_throttledCall` for the search rate limit bucket, keeping the two bucket types explicit.

### 3. `_getMostRecentlySubscribedCustomerId()` extracted
The nested loop logic in `getCustomerIdByEmail` is now a named private method, making the intent clear and the parent method readable. Also simplified the guard from `customers.length > 1` (unreachable after the `=== 1` branch) to a plain `return`.

### 4. `_buildSubscriptionData()` extracted
Pulled the subscription data construction out of `createCheckoutSession`, reducing that method's length by ~40% and giving the logic a clear name.

### 5. Rate limit bucket selection simplified
Replaced the `if/else` in `configure()` with a ternary that selects the rate limit value before constructing the bucket.

### 6. Consistent `null` returns
`getCustomerIdByEmail` now explicitly returns `null` instead of `undefined` when no customer is found, matching the declared return type.