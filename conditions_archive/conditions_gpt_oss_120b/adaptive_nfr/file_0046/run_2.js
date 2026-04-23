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

    /**
     * @returns {IPaymentMethodType[]|undefined}
     */
    get PAYMENT_METHOD_TYPES() {
        return this.labs.isSet('additionalPaymentMethods') ? undefined : ['card'];
    }

    /** Returns true if the Stripe API is configured. */
    get configured() {
        return this._configured;
    }

    /** Returns true if this package is running in a test environment (i.e. browser tests). */
    get testEnv() {
        return this._config.testEnv;
    }

    /** Returns the Stripe API mode (test or live). */
    get mode() {
        return this._testMode ? 'test' : 'live';
    }

    /**
     * Configure the Stripe API.
     * @param {IStripeAPIConfig} config
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
        this._rateLimitBucket = new LeakyBucket(
            (this._testMode ? TEST_MODE_RATE_LIMIT : LIVE_MODE_RATE_LIMIT) * EXPECTED_API_EFFICIENCY,
            1
        );
        this._searchRateLimitBucket = new LeakyBucket(SEARCH_MODE_RATE_LIMIT * EXPECTED_SEARCH_API_EFFICIENCY, 1);
        this._configured = true;
    }

    /** Create a new Stripe Coupon. */
    async createCoupon(options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.coupons.create(options);
    }

    /** Retrieve the Stripe Product object by ID. */
    async getProduct(id) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.products.retrieve(id);
    }

    /** Create a new Stripe Product. */
    async createProduct(options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.products.create(options);
    }

    /** Create a new Stripe Price. */
    async createPrice(options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.prices.create({
            currency: options.currency,
            product: options.product,
            unit_amount: options.amount,
            active: options.active,
            nickname: options.nickname,
            // @ts-ignore
            custom_unit_amount: options.custom_unit_amount,
            recurring: options.type === 'recurring' && options.interval ? {interval: options.interval} : undefined
        });
    }

    /** Update the Stripe Price object by ID. */
    async updatePrice(id, options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.prices.update(id, {
            active: options.active,
            nickname: options.nickname
        });
    }

    /** Update the Stripe Product object by ID. */
    async updateProduct(id, options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.products.update(id, {name: options.name});
    }

    /**
     * Retrieve the Stripe Customer object by ID.
     * @param {string} id
     * @param {ICustomerRetrieveParams} [options={}]
     * @returns {Promise<ICustomer|IDeletedCustomer>}
     */
    async getCustomer(id, options = {}) {
        debug(`getCustomer(${id}, ${JSON.stringify(options)})`);
        try {
            await this._rateLimitBucket.throttle();
            options.expand = options.expand ? [...options.expand, 'subscriptions'] : ['subscriptions'];
            const customer = await this._stripe.customers.retrieve(id, options);
            debug(`getCustomer(${id}, ${JSON.stringify(options)}) -> Success`);
            return customer;
        } catch (err) {
            debug(`getCustomer(${id}, ${JSON.stringify(options)}) -> ${err.type}`);
            throw err;
        }
    }

    /** @deprecated Finds or creates a Stripe Customer for a Member. */
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
        return await this.createCustomer({email: member.get('email')});
    }

    /**
     * Finds a Stripe Customer ID based on the provided email address.
     * Returns null if no customer is found.
     * @param {string} email
     * @returns {Promise<string|null>}
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
            if (customers.length === 0) {
                return null;
            }
            if (customers.length === 1) {
                return customers[0].id;
            }
            return this._pickLatestCustomer(customers)?.id ?? null;
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
            return null;
        }
    }

    /** @private */
    _pickLatestCustomer(customers) {
        let latestCustomer = null;
        let latestTime = 0;
        for (const customer of customers) {
            const subs = customer.subscriptions?.data ?? [];
            for (const sub of subs) {
                if (sub.current_period_end && sub.current_period_end > latestTime) {
                    latestTime = sub.current_period_end;
                    latestCustomer = customer;
                }
            }
        }
        return latestCustomer;
    }

    /** Create a new Stripe Customer. */
    async createCustomer(options = {}) {
        debug(`createCustomer(${JSON.stringify(options)})`);
        try {
            await this._rateLimitBucket.throttle();
            const customer = await this._stripe.customers.create(options);
            debug(`createCustomer(${JSON.stringify(options)}) -> Success`);
            return customer;
        } catch (err) {
            debug(`createCustomer(${JSON.stringify(options)}) -> ${err.type}`);
            throw err;
        }
    }

    /** Update the email address for a Stripe Customer. */
    async updateCustomerEmail(id, email) {
        debug(`updateCustomerEmail(${id}, ${email})`);
        try {
            await this._rateLimitBucket.throttle();
            const customer = await this._stripe.customers.update(id, {email});
            debug(`updateCustomerEmail(${id}, ${email}) -> Success`);
            return customer;
        } catch (err) {
            debug(`updateCustomerEmail(${id}, ${email}) -> ${err.type}`);
            throw err;
        }
    }

    /** Create a new Stripe Webhook Endpoint. */
    async createWebhookEndpoint(url, events) {
        debug(`createWebhook(${url})`);
        try {
            await this._rateLimitBucket.throttle();
            const webhook = await this._stripe.webhookEndpoints.create({
                url,
                enabled_events: events,
                api_version: STRIPE_API_VERSION
            });
            debug(`createWebhook(${url}) -> Success`);
            return webhook;
        } catch (err) {
            debug(`createWebhook(${url}) -> ${err.type}`);
            throw err;
        }
    }

    /** Delete a Stripe Webhook Endpoint by ID. */
    async deleteWebhookEndpoint(id) {
        debug(`deleteWebhook(${id})`);
        try {
            await this._rateLimitBucket.throttle();
            await this._stripe.webhookEndpoints.del(id);
            debug(`deleteWebhook(${id}) -> Success`);
        } catch (err) {
            debug(`deleteWebhook(${id}) -> ${err.type}`);
            throw err;
        }
    }

    /** Update a Stripe Webhook Endpoint by ID and URL. */
    async updateWebhookEndpoint(id, url, events) {
        debug(`updateWebhook(${id}, ${url})`);
        try {
            await this._rateLimitBucket.throttle();
            const webhook = await this._stripe.webhookEndpoints.update(id, {
                url,
                enabled_events: events
            });
            if (webhook.api_version !== STRIPE_API_VERSION) {
                throw new VersionMismatchError({message: 'Webhook has incorrect api_version'});
            }
            debug(`updateWebhook(${id}, ${url}) -> Success`);
            return webhook;
        } catch (err) {
            debug(`updateWebhook(${id}, ${url}) -> ${err.type}`);
            throw err;
        }
    }

    /** Parse a Stripe Webhook event. */
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
     * Create a new Stripe Checkout Session for a new subscription.
     * @param {string} priceId
     * @param {ICustomer} customer
     * @param {object} options
     */
    async createCheckoutSession(priceId, customer, options) {
        await this._rateLimitBucket.throttle();

        const discounts = options.coupon ? [{coupon: options.coupon}] : undefined;
        const subscriptionData = this._buildSubscriptionData(options, priceId);
        const sessionOpts = this._buildBaseSessionOptions(discounts, subscriptionData, options);
        this._applyCustomerInfo(sessionOpts, customer, options);
        this._applyAutomaticTax(sessionOpts, customer?.id);

        // @ts-ignore
        return await this._stripe.checkout.sessions.create(sessionOpts);
    }

    /** @private */
    _buildSubscriptionData(options, priceId) {
        const metadata = options.metadata || {};
        const data = {
            trial_from_plan: true,
            items: [{plan: priceId}],
            metadata: {
                attribution_id: metadata.attribution_id,
                attribution_url: metadata.attribution_url,
                attribution_type: metadata.attribution_type,
                referrer_source: metadata.referrer_source,
                referrer_medium: metadata.referrer_medium,
                referrer_url: metadata.referrer_url,
                utm_source: metadata.utm_source,
                utm_medium: metadata.utm_medium,
                utm_campaign: metadata.utm_campaign,
                utm_term: metadata.utm_term,
                utm_content: metadata.utm_content
            }
        };
        if (typeof options.trialDays === 'number' && options.trialDays > 0) {
            delete data.trial_from_plan;
            data.trial_period_days = options.trialDays;
        }
        return data;
    }

    /** @private */
    _buildBaseSessionOptions(discounts, subscriptionData, options) {
        return {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSessionCancelUrl,
            // @ts-ignore
            allow_promotion_codes: discounts ? undefined : this._config.enablePromoCodes,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata: options.metadata,
            discounts,
            subscription_data: subscriptionData
        };
    }

    /** @private */
    _applyCustomerInfo(sessionOpts, customer, options) {
        if (customer?.id) {
            sessionOpts.customer = customer.id;
        } else {
            sessionOpts.customer_email = options.customerEmail || options.email;
        }
    }

    /** @private */
    _applyAutomaticTax(sessionOpts, customerId) {
        if (customerId && this._config.enableAutomaticTax) {
            sessionOpts.customer_update = {address: 'auto'};
        }
    }

    /**
     * Create a new Stripe Checkout Session for a donation.
     * @param {object} param0
     */
    async createDonationCheckoutSession({priceId, successUrl, cancelUrl, metadata, customer, customerEmail, personalNote}) {
        await this._rateLimitBucket.throttle();

        const mergedMetadata = {ghost_donation: true, ...metadata};

        const sessionOpts = {
            mode: 'payment',
            success_url: successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: cancelUrl || this._config.checkoutSessionCancelUrl,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata: mergedMetadata,
            customer: customer?.id,
            customer_email: !customer && customerEmail ? customerEmail : undefined,
            submit_type: 'pay',
            invoice_creation: {
                enabled: true,
                invoice_data: {metadata: mergedMetadata}
            },
            line_items: [{price: priceId, quantity: 1}],
            custom_fields: [
                {
                    key: 'donation_message',
                    label: {
                        type: 'custom',
                        custom: personalNote || 'Add a personal note'
                    },
                    type: 'text',
                    optional: true
                }
            ]
        };

        if (customer && this._config.enableAutomaticTax) {
            sessionOpts.customer_update = {address: 'auto'};
        }

        // @ts-ignore
        return await this._stripe.checkout.sessions.create(sessionOpts);
    }

    /**
     * Create a new Stripe Checkout Setup Session.
     * @param {ICustomer} customer
     * @param {object} options
     */
    async createCheckoutSetupSession(customer, options) {
        await this._rateLimitBucket.throttle();
        const session = await this._stripe.checkout.sessions.create({
            mode: 'setup',
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSetupSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSetupSessionCancelUrl,
            customer_email: customer.email,
            setup_intent_data: {metadata: {customer_id: customer.id}},
            // @ts-ignore
            currency: this.labs.isSet('additionalPaymentMethods') ? options.currency : undefined
        });
        return session;
    }

    /** Create a new Stripe Billing Portal Session. */
    async createBillingPortalSession(customer, options) {
        await this._rateLimitBucket.throttle();

        const stripeOptions = {
            customer: customer.id,
            return_url: options.returnUrl || this._config.billingPortalReturnUrl
        };
        if (options.configurationId) {
            stripeOptions.configuration = options.configurationId;
        }

        return await this._stripe.billingPortal.sessions.create(stripeOptions);
    }

    /** Get the Stripe public key. */
    getPublicKey() {
        return this._config.publicKey;
    }

    /** Retrieve the Stripe Price object by ID. */
    async getPrice(id, options = {}) {
        debug(`getPrice(${id}, ${JSON.stringify(options)})`);
        return await this._stripe.prices.retrieve(id, options);
    }

    /** Retrieve the Stripe Subscription object by ID. */
    async getSubscription(id, options = {}) {
        debug(`getSubscription(${id}, ${JSON.stringify(options)})`);
        try {
            await this._rateLimitBucket.throttle();
            const subscription = await this._stripe.subscriptions.retrieve(id, options);
            debug(`getSubscription(${id}, ${JSON.stringify(options)}) -> Success`);
            return subscription;
        } catch (err) {
            debug(`getSubscription(${id}, ${JSON.stringify(options)}) -> ${err.type}`);
            throw err;
        }
    }

    /** Cancel the Stripe Subscription by ID. */
    async cancelSubscription(id) {
        debug(`cancelSubscription(${id})`);
        try {
            await this._rateLimitBucket.throttle();
            const subscription = await this._stripe.subscriptions.del(id);
            debug(`cancelSubscription(${id}) -> Success`);
            return subscription;
        } catch (err) {
            debug(`cancelSubscription(${id}) -> ${err.type}`);
            throw err;
        }
    }

    /** Cancel the Stripe Subscription at period end. */
    async cancelSubscriptionAtPeriodEnd(id, reason = '') {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(id, {
            cancel_at_period_end: true,
            metadata: {cancellation_reason: reason}
        });
    }

    /** Continue the Stripe Subscription at period end. */
    async continueSubscriptionAtPeriodEnd(id) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(id, {
            cancel_at_period_end: false,
            metadata: {cancellation_reason: null}
        });
    }

    /** Remove the coupon from the Stripe Subscription by ID. */
    async removeCouponFromSubscription(id) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(id, {coupon: ''});
    }

    /** Add a coupon to the Stripe Subscription by ID. */
    async addCouponToSubscription(id, couponId) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(id, {coupon: couponId});
    }

    /** Update the trial end for a Stripe Subscription by ID. */
    async updateSubscriptionTrialEnd(id, trialEnd, options = {}) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(id, {
            trial_end: trialEnd,
            proration_behavior: options.prorationBehavior || 'none'
        });
    }

    /** Update the price of the Stripe SubscriptionItem. */
    async updateSubscriptionItemPrice(subscriptionId, id, price, options = {}) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(subscriptionId, {
            proration_behavior: options.prorationBehavior || 'always_invoice',
            items: [{id, price}],
            cancel_at_period_end: false,
            metadata: {cancellation_reason: options.cancellationReason ?? null}
        });
    }

    /** Create a new Stripe Subscription for a Customer by ID and Price ID. */
    async createSubscription(customer, price) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.create({customer, items: [{price}]});
    }

    /** Retrieve the Stripe SetupIntent object by ID. */
    async getSetupIntent(id, options = {}) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.setupIntents.retrieve(id, options);
    }

    /** Attach a PaymentMethod to a Customer */
    async attachPaymentMethodToCustomer(customer, paymentMethod) {
        await this._rateLimitBucket.throttle();
        await this._stripe.paymentMethods.attach(paymentMethod, {customer});
    }

    /** Retrieve the Stripe PaymentMethod object by ID. */
    async getCardPaymentMethod(id) {
        await this._rateLimitBucket.throttle();
        const paymentMethod = await this._stripe.paymentMethods.retrieve(id);
        return paymentMethod.type === 'card' ? paymentMethod : null;
    }

    /** Update the default PaymentMethod for a Subscription. */
    async updateSubscriptionDefaultPaymentMethod(subscription, paymentMethod) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(subscription, {
            default_payment_method: paymentMethod
        });
    }

    /** Cancel the trial for a Stripe Subscription by ID. */
    async cancelSubscriptionTrial(id) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(id, {trial_end: 'now'});
    }

    /** Create a new Stripe Billing Portal Configuration. */
    async createBillingPortalConfiguration(options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.billingPortal.configurations.create(options);
    }

    /** Update an existing Stripe Billing Portal Configuration. */
    async updateBillingPortalConfiguration(id, options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.billingPortal.configurations.update(id, options);
    }
};
```