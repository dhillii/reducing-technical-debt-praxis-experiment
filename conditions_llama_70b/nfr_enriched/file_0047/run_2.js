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
        const defaultProduct = await this.getDefaultProduct(options);

        if (this.shouldPopulateProducts(subscriptions, products, prices, defaultProduct)) {
            await this.addProductsAndPrices(subscriptions, defaultProduct, options);
        }
    }

    async getDefaultProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    shouldPopulateProducts(subscriptions, products, prices, defaultProduct) {
        return subscriptions.length > 0 && products.length === 0 && prices.length === 0 && defaultProduct;
    }

    async addProductsAndPrices(subscriptions, defaultProduct, options) {
        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));

            const stripePrices = await this.getStripePrices(uniquePlans, options);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                // We expanded the product when fetching this price.
                /** @type {import('stripe').Stripe.Product} */
                const stripeProduct = (stripePrice.product);

                await this.addStripeProduct(stripeProduct, defaultProduct, options);
                await this.addStripePrice(stripePrice, stripeProduct, options);
            }
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    async getStripePrices(uniquePlans, options) {
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

    async addStripeProduct(stripeProduct, defaultProduct, options) {
        await this.models.StripeProduct.upsert({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    async addStripePrice(stripePrice, stripeProduct, options) {
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
        const price = await this.models.StripePrice.findOne({
            id: priceId
        }, options);

        if (price && price.get('interval') === 'month') {
            return 'monthly';
        }
        if (price && price.get('interval') === 'year') {
            return 'yearly';
        }
        return null;
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
        const defaultStripeProduct = await this.getDefaultStripeProduct(options);

        if (!defaultStripeProduct) {
            defaultStripeProduct = await this.createDefaultStripeProduct(options);
        }

        await this.addStripePrices(plans, defaultStripeProduct, options);
    }

    async getDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        return stripeProductsPage.data[0];
    }

    async createDefaultStripeProduct(options) {
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
        const defaultProduct = productsPage.data[0];
        const stripeProduct = await this.api.createProduct({
            name: defaultProduct.get('name')
        });
        return await this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    async addStripePrices(plans, defaultStripeProduct, options) {
        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);

            if (!existingPrice) {
                await this.createStripePrice(plan, defaultStripeProduct, options);
            }
        }
    }

    async createStripePrice(plan, defaultStripeProduct, options) {
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

        const containsOldValues = !!portalPlans.find((plan) => {
            return ['monthly', 'yearly'].includes(plan);
        });

        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this.updatePortalPlans(portalPlans, plans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async updatePortalPlans(portalPlans, plans, options) {
        return portalPlans.reduce(async (newPortalPlansPromise, plan) => {
            let newPlan = plan;
            if (plan === 'monthly') {
                const monthlyPlan = plans.find((planItem) => {
                    return planItem.name === 'Monthly';
                });
                if (!monthlyPlan) {
                    return newPortalPlansPromise;
                }
                const price = await this.findPriceByPlan(monthlyPlan, options);
                newPlan = price.id;
            }
            if (plan === 'yearly') {
                const yearlyPlan = plans.find((planItem) => {
                    return planItem.name === 'Yearly';
                });
                if (!yearlyPlan) {
                    return newPortalPlansPromise;
                }
                const price = await this.findPriceByPlan(yearlyPlan, options);
                newPlan = price.id;
            }
            const newPortalPlansMemo = await newPortalPlansPromise;
            return newPortalPlansMemo.concat(newPlan);
        }, []);
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }
        logging.info('Populating members_monthly_price_id from stripe_plans');
        const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);

        if (monthlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return;
        }

        const monthlyPlan = plans.find((plan) => {
            return plan.name === 'Monthly';
        });

        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        let monthlyPrice;

        monthlyPrice = await this.findMonthlyPrice(monthlyPlan, options);

        if (!monthlyPrice) {
            monthlyPrice = await this.createMonthlyPrice(monthlyPlan, options);
        }

        await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...options, id: monthlyPriceIdSetting.id});
    }

    async findMonthlyPrice(monthlyPlan, options) {
        const price = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (!price) {
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'month', active: true}).fetch(options);
        }

        return price;
    }

    async createMonthlyPrice(monthlyPlan, options) {
        let defaultStripeProduct;
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        defaultStripeProduct = stripeProductsPage.data[0];
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 5000,
            nickname: 'Monthly',
            interval: 'month',
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        return await this.models.StripePrice.add({
            stripe_price_id: price.id,
            stripe_product_id: defaultStripeProduct.get('stripe_product_id'),
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        }, options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersYearlyPriceIdSettings({transacting});
            });
        }
        logging.info('Populating members_yearly_price_id from stripe_plans');
        const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);

        if (yearlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
        }

        const yearlyPlan = plans.find((plan) => {
            return plan.name === 'Yearly';
        });

        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        let yearlyPrice;

        yearlyPrice = await this.findYearlyPrice(yearlyPlan, options);

        if (!yearlyPrice) {
            yearlyPrice = await this.createYearlyPrice(yearlyPlan, options);
        }

        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceIdSetting.id});
    }

    async findYearlyPrice(yearlyPlan, options) {
        const price = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (!price) {
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'year', active: true}).fetch(options);
        }

        return price;
    }

    async createYearlyPrice(yearlyPlan, options) {
        let defaultStripeProduct;
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        defaultStripeProduct = stripeProductsPage.data[0];
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 500,
            nickname: 'Yearly',
            interval: 'year',
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        return await this.models.StripePrice.add({
            stripe_price_id: price.id,
            stripe_product_id: defaultStripeProduct.get('stripe_product_id'),
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        }, options);
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductMonthlyPriceId({transacting});
            });
        }
        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        const monthlyPriceId = monthlyPriceIdSetting.get('value');

        await this.models.Product.edit({monthly_price_id: monthlyPriceId}, {...options, id: defaultProduct.id});
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }
        logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        const yearlyPriceId = yearlyPriceIdSetting.get('value');

        await this.models.Product.edit({yearly_price_id: yearlyPriceId}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.revertPortalPlansSetting({transacting});
            });
        }
        logging.info('Migrating portal_plans setting from ids to names');
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

        const containsNamedValues = !!portalPlans.find((plan) => {
            return ['monthly', 'yearly'].includes(plan);
        });

        if (containsNamedValues) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }
        const portalPlanIds = portalPlans.filter((plan) => {
            return plan !== 'free';
        });

        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }
        const defaultPortalPlans = portalPlans.filter((plan) => {
            return plan === 'free';
        });

        const newPortalPlans = await this.updatePortalPlans(portalPlanIds, defaultPortalPlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async updatePortalPlans(portalPlanIds, defaultPortalPlans, options) {
        return portalPlanIds.reduce(async (newPortalPlansPromise, priceId) => {
            const plan = await this.getPlanFromPrice(priceId, options);

            if (!plan) {
                return newPortalPlansPromise;
            }

            const newPortalPlansMemo = await newPortalPlansPromise;
            const updatedPortalPlans = newPortalPlansMemo.filter(d => d !== plan).concat(plan);

            return updatedPortalPlans;
        }, defaultPortalPlans);
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.removeInvalidSubscriptions({transacting});
            });
        }
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });
        const invalidSubscriptions = subscriptionModels.filter((sub) => {
            return !sub.toJSON().price;
        });
        if (invalidSubscriptions.length > 0) {
            logging.warn(`Deleting ${invalidSubscriptions.length} invalid subscription(s)`);
            for (let sub of invalidSubscriptions) {
                logging.warn(`Deleting subscription - ${sub.id} - no price found`);
                await sub.destroy(options);
            }
        } else {
            logging.info(`No invalid subscriptions, skipping migration`);
        }
    }

    async setDefaultProductName(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.setDefaultProductName({transacting});
            });
        }

        const defaultProduct = await this.getDefaultProduct(options);

        if (defaultProduct && defaultProduct.name === 'Default Product') {
            const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
            if (siteTitle) {
                await this.models.Product.edit({
                    name: siteTitle.get('value')
                }, {
                    ...options,
                    id: defaultProduct.id
                });
            }
        }
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updateStripeProductNamesFromDefaultProduct({transacting});
            });
        }

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);

        if (!siteTitle) {
            return;
        }

        const stripeProducts = await this.models.StripeProduct.findPage({
            ...options,
            limit: 'all'
        });

        for (const model of stripeProducts.data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));

            if (product.name === 'Default Product') {
                await this.api.updateProduct(product.id, {
                    name: siteTitle.get('value')
                });
            }
        }
    }
};