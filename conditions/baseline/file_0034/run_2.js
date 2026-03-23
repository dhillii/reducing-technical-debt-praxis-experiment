# Refactored StripeAPI

Here are the key improvements:

1. **Extracted a `_throttledRequest` helper** to eliminate the repetitive `throttle → call → return` pattern
2. **Extracted a `_debuggedRequest` helper** for methods with debug logging + error re-throwing
3. **Simplified `getCustomerIdByEmail`** by extracting `_findLatestCustomer`
4. **Simplified `configure`** by extracting `_createRateLimitBuckets`
5. **Simplified `createCheckoutSession`** by extracting `_buildSubscriptionData` and `_applyCustomerToSession`

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

    // -------------------------------------------------------------------------
    // Public getters
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

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
        this._rateLimitBucket = this._createRateLimitBucket(LeakyBucket);
        this._searchRateLimitBucket = new LeakyBucket(EXPECTED_SEARCH_API_EFFICIENCY * SEARCH_MODE_RATE_LIMIT, 1);
        this._configured = true;
    }

    /**
     * @param {Function} LeakyBucket
     * @returns {object}
     */
    _createRateLimitBucket(LeakyBucket) {
        const limit = this._testMode ? TEST_MODE_RATE_LIMIT : LIVE_MODE_RATE_LIMIT;
        return new LeakyBucket(EXPECTED_API_EFFICIENCY * limit, 1);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Throttles the rate limit bucket and executes the given API call.
     *
     * @template T
     * @param {() => Promise<T>} apiFn
     * @param {object} [bucket] - defaults to the standard rate limit bucket
     * @returns {Promise<T>}
     */
    async _throttledRequest(apiFn, bucket = this._rateLimitBucket) {
        await bucket.throttle();
        return apiFn();
    }

    /**
     * Wraps an API call with debug logging and error re-throwing.
     *
     * @template T
     * @param {string} label - debug label, e.g. `getCustomer(id)`
     * @param {() => Promise<T>} apiFn
     * @returns {Promise<T>}
     */
    async _debuggedRequest(label, apiFn) {
        debug(label);
        try {
            const result = await apiFn();
            debug(`${label} -> Success`);
            return result;
        } catch (err) {
            debug(`${label} -> ${err.type}`);
            throw err;
        }
    }

    // -------------------------------------------------------------------------
    // Coupons
    // -------------------------------------------------------------------------

    /** @param {ICouponCreateParams} options @returns {Promise<ICoupon>} */
    async createCoupon(options) {
        return this._throttledRequest(() => this._stripe.coupons.create(options));
    }

    // -------------------------------------------------------------------------
    // Products
    // -------------------------------------------------------------------------

    /** @param {string} id @returns {Promise<IProduct>} */
    async getProduct(id) {
        return this._throttledRequest(() => this._stripe.products.retrieve(id));
    }

    /** @param {IProductCreateParams} options @returns {Promise<IProduct>} */
    async createProduct(options) {
        return this._throttledRequest(() => this._stripe.products.create(options));
    }

    /**
     * @param {string} id
     * @param {{name: string}} options
     * @returns {Promise<IProduct>}
     */
    async updateProduct(id, options) {
        return this._throttledRequest(() => this._stripe.products.update(id, {name: options.name}));
    }

    // -------------------------------------------------------------------------
    // Prices
    // -------------------------------------------------------------------------

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
        const params = {
            currency: options.currency,
            product: options.product,
            unit_amount: options.amount,
            active: options.active,
            nickname: options.nickname,
            // @ts-ignore - missing in .d.ts but supported in Stripe API
            custom_unit_amount: options.custom_unit_amount,
            recurring: options.type === 'recurring' && options.interval
                ? {interval: options.interval}
                : undefined
        };
        return this._throttledRequest(() => this._stripe.prices.create(params));
    }

    /**
     * @param {string} id
     * @param {{active?: boolean; nickname?: string}} options
     * @returns {Promise<IPrice>}
     */
    async updatePrice(id, options) {
        return this._throttledRequest(() =>
            this._stripe.prices.update(id, {active: options.active, nickname: options.nickname})
        );
    }

    /**
     * @param {string} id
     * @param {object} options
     * @returns {Promise<IPrice>}
     */
    async getPrice(id, options = {}) {
        debug(`getPrice(${id}, ${JSON.stringify(options)})`);
        return this._stripe.prices.retrieve(id, options);
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
        options.expand = options.expand
            ? [...options.expand, 'subscriptions']
            : ['subscriptions'];

        return this._debuggedRequest(
            `getCustomer(${id}, ${JSON.stringify(options)})`,
            () => this._throttledRequest(() => this._stripe.customers.retrieve(id, options))
        );
    }

    /**
     * @deprecated
     * @param {any} member
     * @returns {Promise<ICustomer>}
     */
    async getCustomerForMemberCheckoutSession(member) {
        await member.related('stripeCustomers').fetch();

        for (const data of member.related('stripeCustomers').models) {
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
                this._searchRateLimitBucket
            );

            const customers = result.data;
            if (customers.length === 0) {
                return null;
            }
            if (customers.length === 1) {
                return customers[0].id;
            }
            return this._findLatestCustomer(customers).id;
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
            return null;
        }
    }

    /**
     * Returns the customer with the most recent active subscription.
     *
     * @param {ICustomer[]} customers
     * @returns {ICustomer}
     */
    _findLatestCustomer(customers) {
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

        return latestCustomer;
    }

    /**
     * @param {import('stripe').Stripe.CustomerCreateParams} options
     * @returns {Promise<ICustomer>}
     */
    async createCustomer(options = {}) {
        return this._debuggedRequest(
            `createCustomer(${JSON.stringify(options)})`,
            () => this._throttledRequest(() => this._stripe.customers.create(options))
        );
    }

    /**
     * @param {string} id
     * @param {string} email
     * @returns {Promise<ICustomer>}
     */
    async updateCustomerEmail(id, email) {
        return this._debuggedRequest(
            `updateCustomerEmail(${id}, ${email})`,
            () => this._throttledRequest(() => this._stripe.customers.update(id, {email}))
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
        return this._debuggedRequest(
            `createWebhook(${url})`,
            () => this._throttledRequest(() => this._stripe.webhookEndpoints.create({
                url,
                enabled_events: events,
                api_version: STRIPE_API_VERSION
            }))
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteWebhookEndpoint(id) {
        return this._debuggedRequest(
            `deleteWebhook(${id})`,
            () => this._throttledRequest(() => this._stripe.webhookEndpoints.del(id))
        );
    }

    /**
     * @param {string} id
     * @param {string} url
     * @param {import('stripe').Stripe.WebhookEndpointUpdateParams.EnabledEvent[]} events
     * @returns {Promise<IWebhookEndpoint>}
     */
    async updateWebhookEndpoint(id, url, events) {
        return this._debuggedRequest(
            `updateWebhook(${id}, ${url})`,
            async () => {
                const webhook = await this._throttledRequest(() =>
                    this._stripe.webhookEndpoints.update(id, {url, enabled_events: events})
                );
                if (webhook.api_version !== STRIPE_API_VERSION) {
                    throw new VersionMismatchError({message: 'Webhook has incorrect api_version'});
                }
                return webhook;
            }
        );
    }

    /**
     * @param {string} body
     * @param {string} signature
     * @param {string} secret
     * @returns {import('stripe').Stripe.Event}
     */
    parseWebhook(body, signature, secret) {
        return this._debuggedRequest(
            `parseWebhook(${body}, ${signature}, ${secret})`,
            () => this._stripe.webhooks.constructEvent(body, signature, secret)
        );
    }

    // -------------------------------------------------------------------------
    // Checkout sessions
    // -------------------------------------------------------------------------

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
        const customerEmail = customer?.email ?? options.customerEmail;
        const discounts = options.coupon ? [{coupon: options.coupon}] : undefined;

        const sessionOptions = {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSessionCancelUrl,
            // @ts-ignore
            allow_promotion_codes: discounts ? undefined : this._config.enablePromoCodes,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata,
            discounts,
            subscription_data: this._buildSubscriptionData(priceId, metadata, options.trialDays)
        };

        this._applyCustomerToSession(sessionOptions, customerId, customerEmail);

        // @ts-ignore
        return this._throttledRequest(() => this._stripe.checkout.sessions.create(sessionOptions));
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

        if (typeof trialDays === 'number' && trialDays > 0) {
            delete subscriptionData.trial_from_plan;
            subscriptionData.trial_period_days = trialDays;
        }

        return subscriptionData;
    }

    /**
     * Applies customer identity fields to a session options object.
     *
     * @param {object} sessionOptions
     * @param {string|undefined} customerId
     * @param {string|undefined} customerEmail
     */
    _applyCustomerToSession(sessionOptions, customerId, customerEmail) {
        if (customerId) {
            sessionOptions.customer = customerId;
            if (this._config.enableAutomaticTax) {
                sessionOptions.customer_update = {address: 'auto'};
            }
        } else {
            sessionOptions.customer_email = customerEmail;
        }
    }

    /**
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

        const sessionOptions = {
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
                invoice_data: {
                    metadata: {ghost_donation: true, ...enrichedMetadata}
                }
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
            sessionOptions.customer_update = {address: 'auto'};
        }

        // @ts-ignore
        return this._throttledRequest(() => this._stripe.checkout.sessions.create(sessionOptions));
    }

    /**
     * @param {ICustomer} customer
     * @param {object} options
     * @param {string} options.successUrl
     * @param {string} options.cancelUrl
     * @param {string} options.currency
     * @returns {Promise<ICheckoutSession>}
     */
    async createCheckoutSetupSession(customer, options) {
        const params = {
            mode: 'setup',
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSetupSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSetupSessionCancelUrl,
            customer_email: customer.email,
            setup_intent_data: {
                metadata: {customer_id: customer.id}
            },
            // @ts-ignore
            currency: this.labs.isSet('additionalPaymentMethods') ? options.currency : undefined
        };
        return this._throttledRequest(() => this._stripe.checkout.sessions.create(params));
    }

    // -------------------------------------------------------------------------
    // Billing portal
    // -------------------------------------------------------------------------

    /**
     * @param {ICustomer} customer
     * @param {object} options
     * @param {string} options.returnUrl
     * @param {string} [options.configurationId]
     * @returns {Promise<IBillingSession>}
     */
    async createBillingPortalSession(customer, options) {
        const params = {
            customer: customer.id,
            return_url: options.returnUrl || this._config.billingPortalReturnUrl,
            ...(options.configurationId && {configuration: options.configurationId})
        };
        return this._throttledRequest(() => this._stripe.billingPortal.sessions.create(params));
    }

    /**
     * @param {object} options
     * @returns {Promise<import('stripe').Stripe.BillingPortal.Configuration>}
     */
    async createBillingPortalConfiguration(options) {
        return this._throttledRequest(() => this._stripe.billingPortal.configurations.create(options));
    }

    /**
     * @param {string} id
     * @param {object} options
     * @returns {Promise<import('stripe').Stripe.BillingPortal.Configuration>}
     */
    async updateBillingPortalConfiguration(id, options) {
        return this._throttledRequest(() => this._stripe.billingPortal.configurations.update(id, options));
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
        return this._debuggedRequest(
            `getSubscription(${id}, ${JSON.stringify(options)})`,
            () => this._throttledRequest(() => this._stripe.subscriptions.retrieve(id, options))
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async cancelSubscription(id) {
        return this._debuggedRequest(
            `cancelSubscription(${id})`,
            () => this._throttledRequest(() => this._stripe.subscriptions.del(id))
        );
    }

    /**
     * @param {string} id
     * @param {string} [reason='']
     * @returns {Promise<ISubscription>}
     */
    async cancelSubscriptionAtPeriodEnd(id, reason = '') {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(id, {
                cancel_at_period_end: true,
                metadata: {cancellation_reason: reason}
            })
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async continueSubscriptionAtPeriodEnd(id) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(id, {
                cancel_at_period_end: false,
                metadata: {cancellation_reason: null}
            })
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async removeCouponFromSubscription(id) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(id, {coupon: ''})
        );
    }

    /**
     * @param {string} id
     * @param {string} couponId
     * @returns {Promise<ISubscription>}
     */
    async addCouponToSubscription(id, couponId) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(id, {coupon: couponId})
        );
    }

    /**
     * @param {string} id
     * @param {number} trialEnd
     * @param {object} [options={}]
     * @param {('always_invoice'|'create_prorations'|'none')} [options.prorationBehavior='none']
     * @returns {Promise<ISubscription>}
     */
    async updateSubscriptionTrialEnd(id, trialEnd, options = {}) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(id, {
                trial_end: trialEnd,
                proration_behavior: options.prorationBehavior || 'none'
            })
        );
    }

    /**
     * @param {string} subscriptionId
     * @param {string} id
     * @param {string} price
     * @param {object} [options={}]
     * @param {('always_invoice'|'create_prorations'|'none')} [options.prorationBehavior='always_invoice']
     * @param {string} [options.cancellationReason=null]
     * @returns {Promise<ISubscription>}
     */
    async updateSubscriptionItemPrice(subscriptionId, id, price, options = {}) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(subscriptionId, {
                proration_behavior: options.prorationBehavior || 'always_invoice',
                items: [{id, price}],
                cancel_at_period_end: false,
                metadata: {cancellation_reason: options.cancellationReason ?? null}
            })
        );
    }

    /**
     * @param {string} customer
     * @param {string} price
     * @returns {Promise<ISubscription>}
     */
    async createSubscription(customer, price) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.create({customer, items: [{price}]})
        );
    }

    /**
     * @param {string} subscription
     * @param {string} paymentMethod
     * @returns {Promise<ISubscription>}
     */
    async updateSubscriptionDefaultPaymentMethod(subscription, paymentMethod) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(subscription, {default_payment_method: paymentMethod})
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<ISubscription>}
     */
    async cancelSubscriptionTrial(id) {
        return this._throttledRequest(() =>
            this._stripe.subscriptions.update(id, {trial_end: 'now'})
        );
    }

    // -------------------------------------------------------------------------
    // Setup intents & payment methods
    // -------------------------------------------------------------------------

    /**
     * @param {string} id
     * @param {import('stripe').Stripe.SetupIntentRetrieveParams} options
     * @returns {Promise<import('stripe').Stripe.SetupIntent>}
     */
    async getSetupIntent(id, options = {}) {
        return this._throttledRequest(() => this._stripe.setupIntents.retrieve(id, options));
    }

    /**
     * @param {string} customer
     * @param {string} paymentMethod
     * @returns {Promise<void>}
     */
    async attachPaymentMethodToCustomer(customer, paymentMethod) {
        await this._throttledRequest(() =>
            this._stripe.paymentMethods.attach(paymentMethod, {customer})
        );
    }

    /**
     * @param {string} id
     * @returns {Promise<import('stripe').Stripe.PaymentMethod|null>}
     */
    async getCardPaymentMethod(id) {
        const paymentMethod = await this._throttledRequest(() =>
            this._stripe.paymentMethods.retrieve(id)
        );
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

## Summary of Changes

| Issue | Before | After |
|---|---|---|
| Repetitive throttle+call pattern | Duplicated in every method | `_throttledRequest()` helper |
| Repetitive debug+try/catch pattern | Duplicated in ~8 methods | `_debuggedRequest()` helper |
| Complex `getCustomerIdByEmail` | Nested loops with mutable state | `_findLatestCustomer()` extracted |
| Complex `configure` | Inline conditional bucket creation | `_createRateLimitBucket()` extracted |
| Complex `createCheckoutSession` | Large monolithic method | `_buildSubscriptionData()` and `_applyCustomerToSession()` extracted |
| Ternary in `PAYMENT_METHOD_TYPES` | `if/else` block | Single ternary expression |
| `options.expand` mutation | Mutable push/assign | Immutable spread: `[...options.expand, 'subscriptions']` |
| Redundant intermediate variables | `const x = await ...; return x;` | Direct `return` |