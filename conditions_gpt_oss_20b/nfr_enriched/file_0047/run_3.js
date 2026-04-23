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
    constructor({models, api}) {
        this.models = models;
        this.api = api;
    }

    async execute() {
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return;
        } else if (this.api.testEnv) {
            logging.info('Stripe is in test mode - skipping migrations');
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
     * Run a function within a transaction if options are not provided.
     * @private
     */
    async _runWithTransaction(fn, options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => fn({transacting}));
        }
        return fn(options);
    }

    async populateProductsAndPrices(options) {
        return this._runWithTransaction(async (opts) => {
            const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(opts);
            const priceModels = await this.models.StripePrice.findAll(opts);
            const productModels = await this.models.StripeProduct.findAll(opts);

            const subscriptions = subscriptionModels.toJSON();
            const prices = priceModels.toJSON();
            const products = productModels.toJSON();

            const {data} = await this.models.Product.findPage({
                ...opts,
                limit: 1,
                filter: 'type:paid'
            });
            const defaultProduct = data[0] && data[0].toJSON();

            if (subscriptions.length > 0 && products.length === 0 && prices.length === 0 && defaultProduct) {
                try {
                    logging.info(`Populating products and prices for existing stripe customers`);
                    const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
                    const stripePrices = await this._fetchStripePrices(uniquePlans, opts);

                    logging.info(`Adding ${stripePrices.length} prices from Stripe`);
                    for (const stripePrice of stripePrices) {
                        await this._upsertStripeProduct(stripePrice, defaultProduct, opts);
                        await this._addStripePriceToDB(stripePrice, opts);
                    }
                } catch (e) {
                    logging.error(`Failed to populate products/prices from stripe`);
                    logging.error(e);
                }
            }
        }, options);
    }

    /**
     * Fetch Stripe prices for a list of plan IDs.
     * @private
     */
    async _fetchStripePrices(planIds, options) {
        const stripePrices = [];
        for (const plan of planIds) {
            try {
                const stripePrice = await this.api.getPrice(plan, {expand: ['product']});
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
     * Upsert a Stripe product record linking to the default Ghost product.
     * @private
     */
    async _upsertStripeProduct(stripePrice, defaultProduct, options) {
        const stripeProduct = stripePrice.product;
        await this.models.StripeProduct.upsert({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    /**
     * Add a Stripe price record to the database.
     * @private
     */
    async _addStripePriceToDB(stripePrice, options) {
        await this.models.StripePrice.add({
            stripe_price_id: stripePrice.id,
            stripe_product_id: stripePrice.product.id,
            active: stripePrice.active,
            nickname: stripePrice.nickname,
            currency: stripePrice.currency,
            amount: stripePrice.unit_amount,
            type: 'recurring',
            interval: stripePrice.recurring.interval
        }, options);
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

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);

        if (price && price.get('interval') === 'month') {
            return 'monthly';
        }
        if (price && price.get('interval') === 'year') {
            return 'yearly';
        }
        return null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        return this._runWithTransaction(async (opts) => {
            const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, opts);
            let plans;
            try {
                plans = JSON.parse(plansSetting.get('value'));
            } catch (err) {
                return;
            }

            let defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(opts);

            for (const plan of plans) {
                const existingPrice = await this.findPriceByPlan(plan, opts);

                if (!existingPrice) {
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
                        }, opts);
                    } catch (err) {
                        logging.error({err, message: 'Adding price failed'});
                    }
                }
            }
        }, options);
    }

    /**
     * Retrieve or create the default Stripe product linked to the default Ghost product.
     * @private
     */
    async _getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];

        if (!defaultStripeProduct) {
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
        }
        return defaultStripeProduct;
    }

    async updatePortalPlansSetting(plans, options) {
        return this._runWithTransaction(async (opts) => {
            logging.info('Migrating portal_plans setting from names to ids');
            const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);

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

            const containsOldValues = !!portalPlans.find((plan) => ['monthly', 'yearly'].includes(plan));

            if (!containsOldValues) {
                logging.info('Could not find names in portal_plans setting, skipping migration');
                return;
            }

            const newPortalPlans = [];
            for (const plan of portalPlans) {
                if (plan === 'monthly' || plan === 'yearly') {
                    const planItem = plans.find((p) => p.name === (plan === 'monthly' ? 'Monthly' : 'Yearly'));
                    if (!planItem) continue;
                    const price = await this.findPriceByPlan(planItem, opts);
                    if (price) newPortalPlans.push(price.id);
                } else {
                    newPortalPlans.push(plan);
                }
            }

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this.models.Settings.edit({
                key: 'portal_plans',
                value: JSON.stringify(newPortalPlans)
            }, {
                ...opts,
                id: portalPlansSetting.id
            });
        }, options);
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        return this._runWithTransaction(async (opts) => {
            logging.info('Populating members_monthly_price_id from stripe_plans');
            const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, opts);

            if (monthlyPriceIdSetting.get('value')) {
                logging.info('Skipping population of members_monthly_price_id, already populated');
                return;
            }

            const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, opts);
            let plans;
            try {
                plans = JSON.parse(stripePlansSetting.get('value'));
            } catch (err) {
                logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
                return;
            }

            const monthlyPlan = plans.find((plan) => plan.name === 'Monthly');
            if (!monthlyPlan) {
                logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
                return;
            }

            const monthlyPrice = await this._findOrCreatePrice(monthlyPlan, 'month', opts);

            await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...opts, id: monthlyPriceIdSetting.id});
        }, options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        return this._runWithTransaction(async (opts) => {
            logging.info('Populating members_yearly_price_id from stripe_plans');
            const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, opts);

            if (yearlyPriceIdSetting.get('value')) {
                logging.info('Skipping population of members_yearly_price_id, already populated');
                return;
            }

            const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, opts);
            let plans;
            try {
                plans = JSON.parse(stripePlansSetting.get('value'));
            } catch (err) {
                logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
                return;
            }

            const yearlyPlan = plans.find((plan) => plan.name === 'Yearly');
            if (!yearlyPlan) {
                logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
                return;
            }

            const yearlyPrice = await this._findOrCreatePrice(yearlyPlan, 'year', opts);

            await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...opts, id: yearlyPriceIdSetting.id});
        }, options);
    }

    /**
     * Find an existing price or create a new one if none exists.
     * @private
     */
    async _findOrCreatePrice(plan, interval, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${interval} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval, active: true}).fetch(options);
        }

        if (!price) {
            logging.info(`Could not any active ${interval} price - creating a new one`);
            const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
            const defaultStripeProduct = stripeProductsPage.data[0];
            const priceData = {
                currency: 'usd',
                amount: interval === 'month' ? 5000 : 500,
                nickname: interval === 'month' ? 'Monthly' : 'Yearly',
                interval,
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            };
            const stripePrice = await this.api.createPrice(priceData);

            price = await this.models.StripePrice.add({
                stripe_price_id: stripePrice.id,
                stripe_product_id: defaultStripeProduct.get('stripe_product_id'),
                active: stripePrice.active,
                nickname: stripePrice.nickname,
                currency: stripePrice.currency,
                amount: stripePrice.unit_amount,
                type: 'recurring',
                interval: stripePrice.recurring.interval
            }, options);
        }

        return price;
    }

    async populateDefaultProductMonthlyPriceId(options) {
        return this._runWithTransaction(async (opts) => {
            logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
            const productsPage = await this.models.Product.findPage({...opts, limit: 1, filter: 'type:paid'});
            const defaultProduct = productsPage.data[0];

            if (defaultProduct.get('monthly_price_id')) {
                logging.warn('Skipping migration, monthly_price_id already set');
                return;
            }

            const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, opts);
            const monthlyPriceId = monthlyPriceIdSetting.get('value');

            await this.models.Product.edit({monthly_price_id: monthlyPriceId}, {...opts, id: defaultProduct.id});
        }, options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        return this._runWithTransaction(async (opts) => {
            logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
            const productsPage = await this.models.Product.findPage({...opts, limit: 1, filter: 'type:paid'});
            const defaultProduct = productsPage.data[0];

            if (defaultProduct.get('yearly_price_id')) {
                logging.warn('Skipping migration, yearly_price_id already set');
                return;
            }

            const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, opts);
            const yearlyPriceId = yearlyPriceIdSetting.get('value');

            await this.models.Product.edit({yearly_price_id: yearlyPriceId}, {...opts, id: defaultProduct.id});
        }, options);
    }

    async revertPortalPlansSetting(options) {
        return this._runWithTransaction(async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);

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

            const containsNamedValues = !!portalPlans.find((plan) => ['monthly', 'yearly'].includes(plan));

            if (containsNamedValues) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const portalPlanIds = portalPlans.filter((plan) => plan !== 'free');

            if (portalPlanIds.length === 0) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const defaultPortalPlans = portalPlans.filter((plan) => plan === 'free');

            const newPortalPlans = [];
            for (const priceId of portalPlanIds) {
                const plan = await this.getPlanFromPrice(priceId, opts);
                if (!plan) continue;
                const updated = newPortalPlans.filter(d => d !== plan).concat(plan);
                newPortalPlans.length = 0;
                newPortalPlans.push(...updated);
            }
            newPortalPlans.push(...defaultPortalPlans);

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this.models.Settings.edit({
                key: 'portal_plans',
                value: JSON.stringify(newPortalPlans)
            }, {
                ...opts,
                id: portalPlansSetting.id
            });
        }, options);
    }

    async removeInvalidSubscriptions(options) {
        return this._runWithTransaction(async (opts) => {
            const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({
                ...opts,
                withRelated: ['stripePrice']
            });
            const invalidSubscriptions = subscriptionModels.filter((sub) => !sub.toJSON().price);
            if (invalidSubscriptions.length > 0) {
                logging.warn(`Deleting ${invalidSubscriptions.length} invalid subscription(s)`);
                for (let sub of invalidSubscriptions) {
                    logging.warn(`Deleting subscription - ${sub.id} - no price found`);
                    await sub.destroy(opts);
                }
            } else {
                logging.info(`No invalid subscriptions, skipping migration`);
            }
        }, options);
    }

    async setDefaultProductName(options) {
        return this._runWithTransaction(async (opts) => {
            const {data} = await this.models.Product.findPage({
                ...opts,
                limit: 1,
                filter: 'type:paid'
            });

            const defaultProduct = data[0] && data[0].toJSON();

            if (defaultProduct && defaultProduct.name === 'Default Product') {
                const siteTitle = await this.models.Settings.findOne({key: 'title'}, opts);
                if (siteTitle) {
                    await this.models.Product.edit({
                        name: siteTitle.get('value')
                    }, {
                        ...opts,
                        id: defaultProduct.id
                    });
                }
            }
        }, options);
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        return this._runWithTransaction(async (opts) => {
            const {data} = await this.models.StripeProduct.findPage({
                ...opts,
                limit: 'all'
            });

            const siteTitle = await this.models.Settings.findOne({key: 'title'}, opts);

            if (!siteTitle) {
                return;
            }

            for (const model of data) {
                const product = await this.api.getProduct(model.get('stripe_product_id'));

                if (product.name === 'Default Product') {
                    await this.api.updateProduct(product.id, {
                        name: siteTitle.get('value')
                    });
                }
            }
        }, options);
    }
};