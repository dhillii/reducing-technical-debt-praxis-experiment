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

    async execute() {
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return;
        }
        if (this.api.testEnv) {
            logging.info('Stripe is in test mode - skipping migrations');
            return;
        }

        const migrations = [
            () => this.populateProductsAndPrices(),
            () => this.populateStripePricesFromStripePlansSetting(),
            () => this.populateMembersMonthlyPriceIdSettings(),
            () => this.populateMembersYearlyPriceIdSettings(),
            () => this.populateDefaultProductMonthlyPriceId(),
            () => this.populateDefaultProductYearlyPriceId(),
            () => this.revertPortalPlansSetting(),
            () => this.removeInvalidSubscriptions(),
            () => this.setDefaultProductName(),
            () => this.updateStripeProductNamesFromDefaultProduct()
        ];

        for (const migration of migrations) {
            try {
                await migration();
            } catch (err) {
                logging.error(err);
            }
        }
    }

    async withTransaction(fn) {
        return this.models.Product.transaction((transacting) => {
            return fn({transacting});
        });
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateProductsAndPrices(opts));
        }

        const [subscriptionModels, priceModels, productModels, {data}] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options),
            this.models.StripePrice.findAll(options),
            this.models.StripeProduct.findAll(options),
            this.models.Product.findPage({
                ...options,
                limit: 1,
                filter: 'type:paid'
            })
        ]);

        const subscriptions = subscriptionModels.toJSON();
        const prices = priceModels.toJSON();
        const products = productModels.toJSON();
        const defaultProduct = data[0]?.toJSON();

        if (subscriptions.length > 0 && products.length === 0 && prices.length === 0 && defaultProduct) {
            await this.populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options);
        }
    }

    async populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options) {
        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this.fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this.addStripeProductAndPrice(stripePrice, defaultProduct, options);
            }
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async fetchStripePrices(planIds) {
        const stripePrices = [];
        for (const plan of planIds) {
            try {
                const stripePrice = await this.api.getPrice(plan, {
                    expand: ['product']
                });
                stripePrices.push(stripePrice);
            } catch (err) {
                if (err?.statusCode === 404) {
                    logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        return stripePrices;
    }

    async addStripeProductAndPrice(stripePrice, defaultProduct, options) {
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

    async findPriceByPlan(plan, options) {
        const currency = plan.currency?.toLowerCase() ?? 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        return this.models.StripePrice.findOne({
            currency,
            amount,
            interval
        }, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({
            id: priceId
        }, options);

        if (!price) {
            return null;
        }

        const interval = price.get('interval');
        return interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateStripePricesFromStripePlansSetting(opts));
        }

        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch (err) {
            return;
        }

        let defaultStripeProduct = await this.getOrCreateDefaultStripeProduct(options);

        if (!defaultStripeProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return;
        }

        for (const plan of plans) {
            await this.createPriceIfNotExists(plan, defaultStripeProduct, options);
        }
    }

    async getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];

        if (!defaultStripeProduct) {
            logging.info('Could not find Stripe Product - creating one');
            const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
            const defaultProduct = productsPage.data[0];

            if (!defaultProduct) {
                return null;
            }

            const stripeProduct = await this.api.createProduct({
                name: defaultProduct.get('name')
            });

            defaultStripeProduct = await this.models.StripeProduct.add({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);
        }

        return defaultStripeProduct;
    }

    async createPriceIfNotExists(plan, stripeProduct, options) {
        const existingPrice = await this.findPriceByPlan(plan, options);

        if (existingPrice) {
            return;
        }

        logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);

        try {
            logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
            const price = await this.api.createPrice({
                currency: plan.currency,
                amount: plan.amount,
                nickname: plan.name,
                interval: plan.interval,
                active: true,
                type: 'recurring',
                product: stripeProduct.get('stripe_product_id')
            });

            await this.models.StripePrice.add({
                stripe_price_id: price.id,
                stripe_product_id: stripeProduct.get('stripe_product_id'),
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

    async updatePortalPlansSetting(plans, options) {
        if (!options) {
            return this.withTransaction((opts) => this.updatePortalPlansSetting(plans, opts));
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

        const containsOldValues = portalPlans.some((plan) => ['monthly', 'yearly'].includes(plan));

        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this.convertPortalPlansToIds(portalPlans, plans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async convertPortalPlansToIds(portalPlans, plans, options) {
        const newPortalPlans = [];

        for (const plan of portalPlans) {
            if (plan === 'monthly') {
                const monthlyPlan = plans.find((p) => p.name === 'Monthly');
                if (monthlyPlan) {
                    const price = await this.findPriceByPlan(monthlyPlan, options);
                    if (price) {
                        newPortalPlans.push(price.id);
                    }
                }
            } else if (plan === 'yearly') {
                const yearlyPlan = plans.find((p) => p.name === 'Yearly');
                if (yearlyPlan) {
                    const price = await this.findPriceByPlan(yearlyPlan, options);
                    if (price) {
                        newPortalPlans.push(price.id);
                    }
                }
            } else {
                newPortalPlans.push(plan);
            }
        }

        return newPortalPlans;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateMembersMonthlyPriceIdSettings(opts));
        }

        logging.info('Populating members_monthly_price_id from stripe_plans');
        const monthlyPriceId = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);

        if (monthlyPriceId.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const monthlyPrice = await this.findOrCreateMonthlyPrice(options);

        if (monthlyPrice) {
            await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...options, id: monthlyPriceId.id});
        }
    }

    async findOrCreateMonthlyPrice(options) {
        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return null;
        }

        const monthlyPlan = plans.find((plan) => plan.name === 'Monthly');

        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return null;
        }

        let monthlyPrice = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (!monthlyPrice) {
            logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
            monthlyPrice = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'month', active: true}).fetch(options);
        }

        if (!monthlyPrice) {
            monthlyPrice = await this.createDefaultPrice('month', 5000, 'Monthly', options);
        }

        return monthlyPrice;
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateMembersYearlyPriceIdSettings(opts));
        }

        logging.info('Populating members_yearly_price_id from stripe_plans');
        const yearlyPriceId = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);

        if (yearlyPriceId.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const yearlyPrice = await this.findOrCreateYearlyPrice(options);

        if (yearlyPrice) {
            await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceId.id});
        }
    }

    async findOrCreateYearlyPrice(options) {
        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
            return null;
        }

        const yearlyPlan = plans.find((plan) => plan.name === 'Yearly');

        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return null;
        }

        let yearlyPrice = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (!yearlyPrice) {
            logging.info('Could not find active yearly price from stripe_plans - searching by interval');
            yearlyPrice = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'year', active: true}).fetch(options);
        }

        if (!yearlyPrice) {
            yearlyPrice = await this.createDefaultPrice('year', 50000,