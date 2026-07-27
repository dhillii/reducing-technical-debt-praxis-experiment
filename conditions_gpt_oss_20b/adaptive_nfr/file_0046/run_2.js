const {VersionMismatchError} = require('@tryghost/errors');
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
    constructor(deps) {
        this._stripe = null;
        this._configured = false;
        this.labs = deps.labs;
    }

    get PAYMENT_METHOD_TYPES() {
        if (this.labs.isSet('additionalPaymentMethods')) {
            return undefined;
        } else {
            return ['card'];
        }
    }

    get configured() {
        return this._configured;
    }

    get testEnv() {
        return this._config.testEnv;
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
            apiVersion: STRIPE_API_VERSION
        });
        this._config = config;
        this._testMode = config.secretKey && config.secretKey.startsWith('sk_test_');
        if (this._testMode) {
            this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * TEST_MODE_RATE_LIMIT, 1);
        } else {
            this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * LIVE_MODE_RATE_LIMIT, 1);
        }
        this._searchRateLimitBucket = new LeakyBucket(EXPECTED_SEARCH_API_EFFICIENCY * SEARCH_MODE_RATE_LIMIT, 1);
        this._configured = true;
    }

    async createCoupon(options) {
        await this._rateLimitBucket.throttle();
        const coupon = await this._stripe.coupons.create(options);
        return coupon;
    }

    async getProduct(id) {
        await this._rateLimitBucket.throttle();
        const product = await this._stripe.products.retrieve(id);
        return product;
    }

    async createProduct(options) {
        await this._rateLimitBucket.throttle();
        const product = await this._stripe.products.create(options);
        return product;
    }

    async createPrice(options) {
        await this._rateLimitBucket.throttle();
        const price = await this._stripe.prices.create({
            currency: options.currency,
            product: options.product,
            unit_amount: options.amount,
            active: options.active,
            nickname: options.nickname,
            custom_unit_amount: options.custom_unit_amount,
            recurring: options.type === 'recurring' && options.interval ? {
                interval: options.interval
            } : undefined
        });
        return price;
    }

    async updatePrice(id, options) {
        await this._rateLimitBucket.throttle();
        const price = await this._stripe.prices.update(id, {
            active: options.active,
            nickname: options.nickname
        });
        return price;
    }

    async updateProduct(id, options) {
        await this._rateLimitBucket.throttle();
        const product = await this._stripe.products.update(id, {
            name: options.name
        });
        return product;
    }

    async getCustomer(id, options = {}) {
        debug(`getCustomer(${id}, ${JSON.stringify(options)})`);
        try {
            await this._rateLimitBucket.throttle();
            if (options.expand) {
                options.expand.push('subscriptions');
            } else {
                options.expand = ['subscriptions'];
            }
            const customer = await this._stripe.customers.retrieve(id, options);
            debug(`getCustomer(${id}, ${JSON.stringify(options)}) -> Success`);
            return customer;
        } catch (err) {
            debug(`getCustomer(${id}, ${JSON.stringify(options)}) -> ${err.type}`);
            throw err;
        }
    }

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

            if (!customers.length) {
                return;
            }

            if (customers.length === 1) {
                return customers[0].id;
            }

            return this._selectLatestCustomer(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * @private
     * @param {Array<ICustomer>} customers
     * @returns {string|null}
     */
    _selectLatestCustomer(customers) {
        const latest = customers.reduce((acc, customer) => {
            if (!this._hasSubscriptions(customer)) {
                return acc;
            }
            const latestSub = customer.subscriptions.data.reduce((subAcc, sub) => {
                if (sub.current_period_end && sub.current_period_end > subAcc.current_period_end) {
                    return sub;
                }
                return subAcc;
            }, {current_period_end: 0});

            if (latestSub.current_period_end > acc.current_period_end) {
                return {customer, current_period_end: latestSub.current_period_end};
            }
            return acc;
        }, {customer: null, current_period_end: 0});

        return latest.customer ? latest.customer.id : null;
    }

    /**
     * @private
     * @param {ICustomer} customer
     * @returns {boolean}
     */
    _hasSubscriptions(customer) {
        return customer.subscriptions &&
            customer.subscriptions.data &&
            customer.subscriptions.data.length > 0;
    }

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

    async deleteWebhookEndpoint(id) {
        debug(`deleteWebhook(${id})`);
        try {
            await this._rateLimitBucket.throttle();
            await this._stripe.webhookEndpoints.del(id);
            debug(`deleteWebhook(${id}) -> Success`);
            return;
        } catch (err) {
            debug(`deleteWebhook(${id}) -> ${err.type}`);
            throw err;
        }
    }

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
        const metadata = options.metadata || undefined;
        const customerId = customer ? customer.id : undefined;
        const customerEmail = customer ? customer.email : options.customerEmail;

        await this._rateLimitBucket.throttle();
        let discounts;
        if (options.coupon) {
            discounts = [{coupon: options.coupon}];
        }

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

        if (typeof options.trialDays === 'number' && options.trialDays > 0) {
            delete subscriptionData.trial_from_plan;
            subscriptionData.trial_period_days = options.trialDays;
        }

        let stripeSessionOptions = {
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSessionCancelUrl,
            allow_promotion_codes: discounts ? undefined : this._config.enablePromoCodes,
            automatic_tax: {
                enabled: this._config.enableAutomaticTax
            },
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

        const session = await this._stripe.checkout.sessions.create(stripeSessionOptions);
        return session;
    }

    async createDonationCheckoutSession({priceId, successUrl, cancelUrl, metadata, customer, customerEmail, personalNote}) {
        await this._rateLimitBucket.throttle();

        metadata = {
            ghost_donation: true,
            ...metadata
        };

        const stripeSessionOptions = {
            mode: 'payment',
            success_url: successUrl || this._config.checkoutSessionSuccessUrl,
            cancel_url: cancelUrl || this._config.checkoutSessionCancelUrl,
            automatic_tax: {
                enabled: this._config.enableAutomaticTax
            },
            metadata,
            customer: customer ? customer.id : undefined,
            customer_email: !customer && customerEmail ? customerEmail : undefined,
            submit_type: 'pay',
            invoice_creation: {
                enabled: true,
                invoice_data: {
                    metadata: {
                        ghost_donation: true,
                        ...metadata
                    }
                }
            },
            line_items: [{
                price: priceId,
                quantity: 1
            }],
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
            stripeSessionOptions.customer_update = {address: 'auto'};
        }

        const session = await this._stripe.checkout.sessions.create(stripeSessionOptions);
        return session;
    }

    async createCheckoutSetupSession(customer, options) {
        await this._rateLimitBucket.throttle();
        const session = await this._stripe.checkout.sessions.create({
            mode: 'setup',
            payment_method_types: this.PAYMENT_METHOD_TYPES,
            success_url: options.successUrl || this._config.checkoutSetupSessionSuccessUrl,
            cancel_url: options.cancelUrl || this._config.checkoutSetupSessionCancelUrl,
            customer_email: customer.email,
            setup_intent_data: {
                metadata: {
                    customer_id: customer.id
                }
            },
            currency: this.labs.isSet('additionalPaymentMethods') ? options.currency : undefined
        });

        return session;
    }

    async createBillingPortalSession(customer, options) {
        await this._rateLimitBucket.throttle();

        const stripeOptions = {
            customer: customer.id,
            return_url: options.returnUrl || this._config.billingPortalReturnUrl
        };

        if (options.configurationId) {
            stripeOptions.configuration = options.configurationId;
        }

        const session = await this._stripe.billingPortal.sessions.create(stripeOptions);
        return session;
    }

    getPublicKey() {
        return this._config.publicKey;
    }

    async getPrice(id, options = {}) {
        debug(`getPrice(${id}, ${JSON.stringify(options)})`);
        return await this._stripe.prices.retrieve(id, options);
    }

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

    async cancelSubscriptionAtPeriodEnd(id, reason = '') {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.update(id, {
            cancel_at_period_end: true,
            metadata: {
                cancellation_reason: reason
            }
        });
        return subscription;
    }

    async continueSubscriptionAtPeriodEnd(id) {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.update(id, {
            cancel_at_period_end: false,
            metadata: {
                cancellation_reason: null
            }
        });
        return subscription;
    }

    async removeCouponFromSubscription(id) {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.update(id, {
            coupon: ''
        });
        return subscription;
    }

    async addCouponToSubscription(id, couponId) {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.update(id, {
            coupon: couponId
        });
        return subscription;
    }

    async updateSubscriptionTrialEnd(id, trialEnd, options = {}) {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.update(id, {
            trial_end: trialEnd,
            proration_behavior: options.prorationBehavior || 'none'
        });
        return subscription;
    }

    async updateSubscriptionItemPrice(subscriptionId, id, price, options = {}) {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.update(subscriptionId, {
            proration_behavior: options.prorationBehavior || 'always_invoice',
            items: [{
                id,
                price
            }],
            cancel_at_period_end: false,
            metadata: {
                cancellation_reason: options.cancellationReason ?? null
            }
        });
        return subscription;
    }

    async createSubscription(customer, price) {
        await this._rateLimitBucket.throttle();
        const subscription = await this._stripe.subscriptions.create({
            customer,
            items: [{price}]
        });
        return subscription;
    }

    async getSetupIntent(id, options = {}) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.setupIntents.retrieve(id, options);
    }

    async attachPaymentMethodToCustomer(customer, paymentMethod) {
        await this._rateLimitBucket.throttle();
        await this._stripe.paymentMethods.attach(paymentMethod, {customer});
        return;
    }

    async getCardPaymentMethod(id) {
        await this._rateLimitBucket.throttle();
        const paymentMethod = await this._stripe.paymentMethods.retrieve(id);
        if (paymentMethod.type !== 'card') {
            return null;
        }
        return paymentMethod;
    }

    async updateSubscriptionDefaultPaymentMethod(subscription, paymentMethod) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.subscriptions.update(subscription, {
            default_payment_method: paymentMethod
        });
    }

    async cancelSubscriptionTrial(id) {
        await this._rateLimitBucket.throttle();
        return this._stripe.subscriptions.update(id, {
            trial_end: 'now'
        });
    }

    async createBillingPortalConfiguration(options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.billingPortal.configurations.create(options);
    }

    async updateBillingPortalConfiguration(id, options) {
        await this._rateLimitBucket.throttle();
        return await this._stripe.billingPortal.configurations.update(id, options);
    }
};