```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
     * StripeMigrations
     *
     * @param {object} params
     *
     * @param {any} params.models
     * @param {import('./stripe-api')} params.api
     */
    constructor({
        models,
        api
    }) {
        this.models = models;
        this.api = api;
    }

    /**
     * Check if Stripe is configured and not in test mode
     * @returns {boolean}
     */
    isStripeConfigured() {
        return this.api._configured && !this.api.testEnv;
    }

    async execute() {
        if (!this.isStripeConfigured()) {
            const reason = !this.api._configured ? 'not configured' : 'in test mode';
            logging.info(`Stripe ${reason} - skipping migrations`);
            return;
        }

        try {
            await this.populateProductsAndPrices();
            await this.populateStripePricesFromStripePlansSetting();
            await this.populateMembersMonthlyPriceIdSettings();
            await this.populateMembersYearlyPriceIdSettings();
            await this.populateDefaultProductMonthlyPriceId();
            await this.populateDefaultProductYearlyPriceId();
            await this.revertPortalPlansSetting();
            await this.removeInvalidSubscriptions();
            await this.setDefaultProductName();
            await this.updateStripeProductNamesFromDefaultProduct();
        } catch (err) {
            logging.error(err);
        }
    }

    /**
     * Check if migration conditions are met
     * @param {number} subscriptionsCount
     * @param {number} productsCount
     * @param {number} pricesCount
     * @param {object} defaultProduct
     * @returns {boolean}
     */
    shouldMigrateProductsAndPrices(subscriptionsCount, productsCount, pricesCount, defaultProduct) {
        return subscriptionsCount > 0 && productsCount === 0 && pricesCount === 0 && defaultProduct;
    }

    /**
     * Fetch and process stripe prices for migration
     * @param {Array} uniquePlans
     * @returns {Promise<Array>}
     */
    async fetchStripePrices(uniquePlans) {
        const stripePrices = [];
        for (const plan of uniquePlans) {
            try {
                const stripePrice = await this.api.getPrice(plan, {
                    expand: ['product']
                });
                stripePrices.push(stripePrice);
            } catch (err) {
                if (err && err.statusCode === 404) {
                    logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        return stripePrices;
    }

    /**
     * Add stripe prices to database
     * @param {Array} stripePrices
     * @param {object} defaultProduct
     * @param {object} options
     */
    async addStripePricesToDatabase(stripePrices, defaultProduct, options) {
        for (const stripePrice of stripePrices) {
            const stripeProduct = stripePrice.product;

            await this.models.StripeProduct.upsert({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);

            await this.models.StripePrice.add({
                stripe_price_id: stripePrice.id,
                stripe_product_id: stripeProduct.id,
                active: stripePrice.active,
                nickname: stripePrice.nickname,
                currency: stripePrice.currency,
                amount: stripePrice.unit_amount,
                type: 'recurring',
                interval: stripePrice.recurring.interval
            }, options);
        }
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateProductsAndPrices({transacting});
            });
        }
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(options);
        const priceModels = await this.models.StripePrice.findAll(options);
        const productModels = await this.models.StripeProduct.findAll(options);
        const subscriptions = subscriptionModels.toJSON();
        const prices = priceModels.toJSON();
        const products = productModels.toJSON();
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = data[0] && data[0].toJSON();

        if (!this.shouldMigrateProductsAndPrices(subscriptions.length, products.length, prices.length, defaultProduct)) {
            return;
        }

        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this.fetchStripePrices(uniquePlans);
            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            await this.addStripePricesToDatabase(stripePrices, defaultProduct, options);
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        const price = await this.models.StripePrice.findOne({
            currency,
            amount,
            interval
        }, options);

        return price;
    }

    /**
     * Determine plan type from price interval
     * @param {string} interval
     * @returns {string|null}
     */
    getPlanTypeFromInterval(interval) {
        if (interval === 'month') {
            return 'monthly';
        }
        if (interval === 'year') {
            return 'yearly';
        }
        return null;
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({
            id: priceId
        }, options);

        if (!price) {
            return null;
        }

        return this.getPlanTypeFromInterval(price.get('interval'));
    }

    /**
     * Get or create default stripe product
     * @param {object} options
     * @returns {Promise<object>}
     */
    async getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];

        if (defaultStripeProduct) {
            return defaultStripeProduct;
        }

        logging.info('Could not find Stripe Product - creating one');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
        const defaultProduct = productsPage.data[0];

        if (!defaultProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return null;
        }

        const stripeProduct = await this.api.createProduct({
            name: defaultProduct.get('name')
        });

        defaultStripeProduct = await this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);

        return defaultStripeProduct;
    }

    /**
     * Create and add stripe price to database
     * @param {object} plan
     * @param {object} defaultStripeProduct
     * @param {object} options
     */
    async createAndAddStripePrice(plan, defaultStripeProduct, options) {
        try {
            logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
            const price = await this.api.createPrice({
                currency: plan.currency,
                amount: plan.amount,
                nickname: plan.name,
                interval: plan.interval,
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            });

            await this.models.StripePrice.add({
                stripe_price_id: price.id,
                stripe_product_id: defaultStripeProduct.get('stripe_product_id'),
                active: price.active,
                nickname: price.nickname,
                currency: price.currency,
                amount: price.unit_amount,
                type: 'recurring',
                interval: price.recurring.interval
            }, options);
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateStripePricesFromStripePlansSetting({transacting});
            });
        }
        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch (err) {
            return;
        }

        const defaultStripeProduct = await this.getOrCreateDefaultStripeProduct(options);
        if (!defaultStripeProduct) {
            return;
        }

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);

            if (!existingPrice) {
                logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
                await this.createAndAddStripePrice(plan, defaultStripeProduct, options);
            }
        }
    }

    /**
     * Check if portal plans contain old named values
     * @param {Array} portalPlans
     * @returns {boolean}
     */
    containsOldPortalPlanValues(portalPlans) {
        return !!portalPlans.find((plan) => {
            return ['monthly', 'yearly'].includes(plan);
        });
    }

    /**
     * Find plan by name
     * @param {Array} plans
     * @param {string} planName
     * @returns {object|undefined}
     */
    findPlanByName(plans, planName) {
        return plans.find((planItem) => {
            return planItem.name === planName;
        });
    }

    /**
     * Convert portal plan to price id
     * @param {string} plan
     * @param {Array} plans
     * @param {object} options
     * @returns {Promise<string|null>}
     */
    async convertPortalPlanToPriceId(plan, plans, options) {
        if (plan === 'monthly') {
            const monthlyPlan = this.findPlanByName(plans, 'Monthly');
            if (!monthlyPlan) {
                return null;
            }
            const price = await this.findPriceByPlan(monthlyPlan, options);
            return price ? price.id : null;
        }

        if (plan === 'yearly') {
            const yearlyPlan = this.findPlanByName(plans, 'Yearly');
            if (!yearlyPlan) {
                return null;
            }
            const price = await this.findPriceByPlan(yearlyPlan, options);
            return price ? price.id : null;
        }

        return plan;
    }

    async updatePortalPlansSetting(plans, options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updatePortalPlansSetting(plans, {transacting});
            });
        }
        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);

        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({
                message: 'Could not parse portal_plans setting, skipping migration',
                err
            });
            return;
        }

        if (!this.containsOldPortalPlanValues(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await portalPlans.reduce(async (newPortalPlansPromise, plan) => {
            const newPlan = await this.convertPortalPlanToPriceId(plan, plans, options);
            if (newPlan === null) {
                return newPortalPlansPromise;
            }
            const newPortalPlansMemo = await newPortalPlansPromise;
            return newPortalPlansMemo.concat(newPlan);
        }, []);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    /**
     * Find or create monthly price
     * @param {object} monthlyPlan
     * @param {object} options
     * @returns {Promise<object>}
     */
    async findOrCreateMonthlyPrice(monthlyPlan, options) {
        let monthlyPrice = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (monthlyPrice) {
            return monthlyPrice;
        }

        logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
        monthlyPrice = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true}).fetch(options);

        if (monthlyPrice) {
            return monthlyPrice;
        }

        logging.info('Could not any active Monthly price - creating a new one');
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 5000,
            nickname: 'Monthly',
            interval: 'month',
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        monthlyPrice = await this.models.StripePrice.add({
            stripe_price_id: price.id,
            stripe_product_id: defaultStripeProduct.get('stripe_product_id'),
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        }, options);

        return monthlyPrice;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }
        logging.info('Populating members_monthly_price_id from stripe_plans');
        const monthlyP