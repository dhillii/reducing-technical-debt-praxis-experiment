```javascript
// @ts-ignore
const {VersionMismatchError} = require('@tryghost/errors');
// @ts-ignore
const debug = require('@tryghost/debug')('stripe');
const Stripe = require('stripe').Stripe;

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

const STRIPE_CONFIG = {
    API_VERSION: '2020-08-27',
    EXPECTED_API_EFFICIENCY: 0.95,
    EXPECTED_SEARCH_API_EFFICIENCY: 0.15,
    TEST_MODE_RATE_LIMIT: process.env.NODE_ENV?.includes('testing') ? 10_000 : 25,
    LIVE_MODE_RATE_LIMIT: process.env.NODE_ENV?.includes('testing') ? 10_000 : 100,
    SEARCH_MODE_RATE_LIMIT: process.env.NODE_ENV?.includes('testing') ? 10_000 : 100
};

class StripeAPI {
    constructor(deps) {
        this._stripe = null;
        this._configured = false;
        this.labs = deps.labs;
        this._config = null;
        this._testMode = false;
        this._rateLimitBucket = null;
        this._searchRateLimitBucket = null;
    }

    get PAYMENT_METHOD_TYPES() {
        return this.labs.isSet('additionalPaymentMethods') ? undefined : ['card'];
    }

    get configured() {
        return this._configured;
    }

    get testEnv() {
        return this._config?.testEnv ?? false;
    }

    get mode() {
        return this._testMode ? 'test' : 'live';
    }

    configure(config) {
        if (!config) {
            this._stripe = null;
            this._configured = false;
            return;
        }

        const LeakyBucket = require('leaky-bucket');

        this._stripe = new Stripe(config.secretKey, {
            apiVersion: STRIPE_CONFIG.API_VERSION
        });
        this._config = config;
        this._testMode = config.secretKey?.startsWith('sk_test_') ?? false;

        const rateLimit = this._testMode 
            ? STRIPE_CONFIG.TEST_MODE_RATE_LIMIT 
            : STRIPE_CONFIG.LIVE_MODE_RATE_LIMIT;

        this._rateLimitBucket = new LeakyBucket(
            STRIPE_CONFIG.EXPECTED_API_EFFICIENCY * rateLimit,
            1
        );
        this._searchRateLimitBucket = new LeakyBucket(
            STRIPE_CONFIG.EXPECTED_SEARCH_API_EFFICIENCY * STRIPE_CONFIG.SEARCH_MODE_RATE_LIMIT,
            1
        );
        this._configured = true;
    }

    async _throttle(isSearch = false) {
        const bucket = isSearch ? this._searchRateLimitBucket : this._rateLimitBucket;
        await bucket.throttle();
    }

    async _executeWithThrottle(fn, isSearch = false) {
        await this._throttle(isSearch);
        return fn();
    }

    async _executeWithDebug(operation, fn, debugParams = '') {
        debug(`${operation}(${debugParams})`);
        try {
            const result = await fn();
            debug(`${operation}(${debugParams}) -> Success`);
            return result;
        } catch (err) {
            debug(`${operation}(${debugParams}) -> ${err.type}`);
            throw err;
        }
    }

    async createCoupon(options) {
        return this._executeWithThrottle(() => this._stripe.coupons.create(options));
    }

    async getProduct(id) {
        return this._executeWithThrottle(() => this._stripe.products.retrieve(id));
    }

    async createProduct(options) {
        return this._executeWithThrottle(() => this._stripe.products.create(options));
    }

    async createPrice(options) {
        return this._executeWithThrottle(() => this._stripe.prices.create({
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
        }));
    }

    async updatePrice(id, options) {
        return this._executeWithThrottle(() => this._stripe.prices.update(id, {
            active: options.active,
            nickname: options.nickname
        }));
    }

    async updateProduct(id, options) {
        return this._executeWithThrottle(() => this._stripe.products.update(id, {
            name: options.name
        }));
    }

    async getCustomer(id, options = {}) {
        return this._executeWithDebug(
            'getCustomer',
            async () => {
                await this._throttle();
                const expandOptions = {
                    ...options,
                    expand: [...(options.expand || []), 'subscriptions']
                };
                return this._stripe.customers.retrieve(id, expandOptions);
            },
            `${id}, ${JSON.stringify(options)}`
        );
    }

    async getCustomerForMemberCheckoutSession(member) {
        await member.related('stripeCustomers').fetch();
        const customers = member.related('stripeCustomers');

        for (const data of customers.models) {
            try {
                const customer = await this.getCustomer(data.get('customer_id'));
                if (!customer.deleted) {
                    return customer;
                }
            } catch (err) {
                debug(`Ignoring Error getting customer for member ${err.message}`);
            }
        }

        debug(`Creating customer for member ${member.get('email')}`);
        return this.createCustomer({email: member.get('email')});
    }

    async getCustomerIdByEmail(email) {
        return this._executeWithThrottle(async () => {
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

                return this._findLatestCustomer(customers);
            } catch (err) {
                debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
                return null;
            }
        }, true);
    }

    _findLatestCustomer(customers) {
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

        return latestCustomer.id;
    }

    async createCustomer(options = {}) {
        return this._executeWithDebug(
            'createCustomer',
            () => this._executeWithThrottle(() => this._stripe.customers.create(options)),
            JSON.stringify(options)
        );
    }

    async updateCustomerEmail(id, email) {
        return this._executeWithDebug(
            'updateCustomerEmail',
            () => this._executeWithThrottle(() => this._stripe.customers.update(id, {email})),
            `${id}, ${email}`
        );
    }

    async createWebhookEndpoint(url, events) {
        return this._executeWithDebug(
            'createWebhook',
            () => this._executeWithThrottle(() => this._stripe.webhookEndpoints.create({
                url,
                enabled_events: events,
                api_version: STRIPE_CONFIG.API_VERSION
            })),
            url
        );
    }

    async deleteWebhookEndpoint(id) {
        return this._executeWithDebug(
            'deleteWebhook',
            () => this._executeWithThrottle(() => this._stripe.webhookEndpoints.del(id)),
            id
        );
    }

    async updateWebhookEndpoint(id, url, events) {
        return this._executeWithDebug(
            'updateWebhook',
            async () => {
                await this._throttle();
                const webhook = await this._stripe.webhookEndpoints.update(id, {url, enabled_events: events});
                if (webhook.api_version !== STRIPE_CONFIG.API_VERSION) {
                    throw new VersionMismatchError({message: 'Webhook has incorrect api_version'});
                }
                return webhook;
            },
            `${id}, ${url}`
        );
    }

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

    async createCheckoutSession(priceId, customer, options) {
        await this._throttle();

        const customerId = customer?.id;
        const customerEmail = customer?.email || options.customerEmail;
        const metadata = options.metadata;

        const subscriptionData = this._buildSubscriptionData(priceId, metadata, options.trialDays);
        const discounts = options.coupon ? [{coupon: options.coupon}] : undefined;

        const stripeSessionOptions = {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSessionCancelUrl,
            // @ts-ignore
            allow_promotion_codes: discounts ? undefined : this._config.enablePromoCodes,
            automatic_tax: {enabled: this._config.enableAutomaticTax},
            metadata,
            discounts,
            subscription_data: subscriptionData
        };

        if (customerId) {
            stripeSessionOptions.customer = customerId;
        } else {
            stripeSessionOptions.customer_email = customerEmail;
        }

        if (customerId && this._config.enableAutomaticTax) {
            stripeSessionOptions.customer_update = {address: 'auto'};
        }

        // @ts-ignore
        return this._stripe.checkout.sessions.create(stripeSessionOptions);
    }

    _buildSubscriptionData(priceId, metadata, trialDays) {
        const subscriptionData = {
            trial_from_plan: true,
            items: [{plan: priceId}],
            metadata: this._extractMetadata(metadata)
        };

        if (typeof trialDays === 'number' && trialDays > 0) {
            delete subscriptionData.trial_from_plan;
            subscriptionData.trial_period_days = trialDays;
        }

        return subscriptionData;
    }

    _extractMetadata(metadata = {}) {
        const metadataKeys = [
            'attribution_id', 'attribution_url', 'attribution_type',
            'referrer_source', 'referrer_medium', 'referrer_url',
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
        ];

        return metadataKeys.reduce((acc, key) => {
            if (metadata?.[key]) {
                acc[key] = metadata[key];
            }
            return acc;
        }, {});
    }

    async createDonationCheckoutSession({priceId, successUrl, cancelUrl, metadata, customer, customerEmail, personalNote}) {
        await this._throttle();

        const enrichedMetadata = {
            ghost_donation: true,
            ...metadata
        };

        const stripeSessionOptions = {
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
                label: {type: 'custom', custom: personalNote || 'Add a personal note'},
                type: 'text',
                optional: true
            }]
        };

        if (customer && this._config.enableAutomaticTax) {
            stripeSessionOptions.customer_update = {address: 'auto'};
        }

        // @ts-ignore
        return this._stripe.checkout.sessions.create(stripeSessionOptions);
    }

    async createCheckoutSetupSession(customer, options) {
        await this._throttle();
        return this._stripe.checkout.sessions.create({
            mode: 'setup',
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSetupSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSetupSessionCancelUrl,
            customer_email: customer.email,
            setup_intent_data: {metadata: {customer_id: customer.id}},
            // @ts-ignore