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
        if (!this.isStripeConfigured()) {
            logging.info('Stripe not configured - skipping migrations');
            return;
        }

        if (this.api.testEnv) {
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

    isStripeConfigured() {
        return this.api._configured;
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateProductsAndPrices({transacting});
            });
        }

        const hasExistingSubscriptions = await this.hasExistingSubscriptions(options);
        const hasNoProductsOrPrices = await this.hasNoProductsOrPrices(options);
        const hasDefaultProduct = await this.hasDefaultProduct(options);

        if (hasExistingSubscriptions && hasNoProductsOrPrices && hasDefaultProduct) {
            await this.addStripePrices(options);
        }
    }

    async hasExistingSubscriptions(options) {
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(options);
        return subscriptionModels.length > 0;
    }

    async hasNoProductsOrPrices(options) {
        const priceModels = await this.models.StripePrice.findAll(options);
        const productModels = await this.models.StripeProduct.findAll(options);
        return priceModels.length === 0 && productModels.length === 0;
    }

    async hasDefaultProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    async addStripePrices(options) {
        const uniquePlans = await this.getUniquePlans(options);
        const stripePrices = await this.getStripePrices(uniquePlans, options);

        for (const stripePrice of stripePrices) {
            await this.addStripeProduct(options, stripePrice);
            await this.addStripePrice(options, stripePrice);
        }
    }

    async getUniquePlans(options) {
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(options);
        const subscriptions = subscriptionModels.toJSON();
        return _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
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

    async addStripeProduct(options, stripePrice) {
        const defaultProduct = await this.getDefaultProduct(options);
        await this.models.StripeProduct.upsert({
            product_id: defaultProduct.id,
            stripe_product_id: stripePrice.product.id
        }, options);
    }

    async addStripePrice(options, stripePrice) {
        const defaultProduct = await this.getDefaultProduct(options);
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

    async getDefaultProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
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

        const plansSetting = await this.getPlansSetting(options);
        if (!plansSetting) {
            return;
        }

        const plans = await this.parsePlansSetting(plansSetting, options);
        if (!plans) {
            return;
        }

        const defaultStripeProduct = await this.getDefaultStripeProduct(options);
        if (!defaultStripeProduct) {
            defaultStripeProduct = await this.createDefaultStripeProduct(options);
        }

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);
            if (!existingPrice) {
                await this.createStripePrice(plan, defaultStripeProduct, options);
            }
        }
    }

    async getPlansSetting(options) {
        return await this.models.Settings.findOne({key: 'stripe_plans'}, options);
    }

    async parsePlansSetting(plansSetting, options) {
        try {
            return JSON.parse(plansSetting.get('value'));
        } catch (err) {
            return;
        }
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

    async createStripePrice(plan, defaultStripeProduct, options) {
        try {
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

        const portalPlansSetting = await this.getPortalPlansSetting(options);
        if (!portalPlansSetting) {
            return;
        }

        const portalPlans = await this.parsePortalPlansSetting(portalPlansSetting, options);
        if (!portalPlans) {
            return;
        }

        const newPortalPlans = await this.updatePortalPlans(portalPlans, plans, options);
        await this.savePortalPlansSetting(newPortalPlans, portalPlansSetting, options);
    }

    async getPortalPlansSetting(options) {
        return await this.models.Settings.findOne({key: 'portal_plans'}, options);
    }

    async parsePortalPlansSetting(portalPlansSetting, options) {
        try {
            return JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({
                message: 'Could not parse portal_plans setting, skipping migration',
                err
            });
            return;
        }
    }

    async updatePortalPlans(portalPlans, plans, options) {
        const newPortalPlans = await portalPlans.reduce(async (newPortalPlansPromise, plan) => {
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

        return newPortalPlans;
    }

    async savePortalPlansSetting(newPortalPlans, portalPlansSetting, options) {
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }

        const monthlyPriceIdSetting = await this.getMembersMonthlyPriceIdSetting(options);
        if (monthlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const stripePlans = await this.getStripePlansSetting(options);
        if (!stripePlans) {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return;
        }

        const monthlyPlan = stripePlans.find((plan) => {
            return plan.name === 'Monthly';
        });

        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        let monthlyPrice;

        monthlyPrice = await this.findPriceByPlan(monthlyPlan, options);

        if (!monthlyPrice) {
            monthlyPrice = await this.findActiveMonthlyPrice(options);
        }

        if (!monthlyPrice) {
            monthlyPrice = await this.createMonthlyPrice(options);
        }

        await this.saveMembersMonthlyPriceIdSetting(monthlyPrice, monthlyPriceIdSetting, options);
    }

    async getMembersMonthlyPriceIdSetting(options) {
        return await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
    }

    async getStripePlansSetting(options) {
        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        try {
            return JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            return;
        }
    }

    async findActiveMonthlyPrice(options) {
        return await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true}).fetch(options);
    }

    async createMonthlyPrice(options) {
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

    async saveMembersMonthlyPriceIdSetting(monthlyPrice, monthlyPriceIdSetting, options) {
        await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...options, id: monthlyPriceIdSetting.id});
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersYearlyPriceIdSettings({transacting});
            });
        }

        const yearlyPriceIdSetting = await this.getMembersYearlyPriceIdSetting(options);
        if (yearlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const stripePlans = await this.getStripePlansSetting(options);
        if (!stripePlans) {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
            return;
        }

        const yearlyPlan = stripePlans.find((plan) => {
            return plan.name === 'Yearly';
        });

        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        let yearlyPrice;

        yearlyPrice = await this.findPriceByPlan(yearlyPlan, options);

        if (!yearlyPrice) {
            yearlyPrice = await this.findActiveYearlyPrice(options);
        }

        if (!yearlyPrice) {
            yearlyPrice = await this.createYearlyPrice(options);
        }

        await this.saveMembersYearlyPriceIdSetting(yearlyPrice, yearlyPriceIdSetting, options);
    }

    async getMembersYearlyPriceIdSetting(options) {
        return await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
    }

    async findActiveYearlyPrice(options) {
        return await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'year', active: true}).fetch(options);
    }

    async createYearlyPrice(options) {
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

    async saveMembersYearlyPriceIdSetting(yearlyPrice, yearlyPriceIdSetting, options) {
        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceIdSetting.id});
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductMonthlyPriceId({transacting});
            });
        }

        const defaultProduct = await this.getDefaultProduct(options);
        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const monthlyPriceIdSetting = await this.getMembersMonthlyPriceIdSetting(options);
        const monthlyPriceId = monthlyPriceIdSetting.get('value');

        await this.models.Product.edit({monthly_price_id: monthlyPriceId}, {...options, id: defaultProduct.id});
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }

        const defaultProduct = await this.getDefaultProduct(options);
        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const yearlyPriceIdSetting = await this.getMembersYearlyPriceIdSetting(options);
        const yearlyPriceId = yearlyPriceIdSetting.get('value');

        await this.models.Product.edit({yearly_price_id: yearlyPriceId}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.revertPortalPlansSetting({transacting});
            });
        }

        const portalPlansSetting = await this.getPortalPlansSetting(options);
        if (!portalPlansSetting) {
            return;
        }

        const portalPlans = await this.parsePortalPlansSetting(portalPlansSetting, options);
        if (!portalPlans) {
            return;
        }

        const newPortalPlans = await this.revertPortalPlans(portalPlans, options);
        await this.savePortalPlansSetting(newPortalPlans, portalPlansSetting, options);
    }

    async revertPortalPlans(portalPlans, options) {
        const defaultPortalPlans = portalPlans.filter((plan) => {
            return plan === 'free';
        });

        const portalPlanIds = portalPlans.filter((plan) => {
            return plan !== 'free';
        });

        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return portalPlans;
        }

        const newPortalPlans = await portalPlanIds.reduce(async (newPortalPlansPromise, priceId) => {
            const plan = await this.getPlanFromPrice(priceId, options);

            if (!plan) {
                return newPortalPlansPromise;
            }

            const newPortalPlansMemo = await newPortalPlansPromise;
            const updatedPortalPlans = newPortalPlansMemo.filter(d => d !== plan).concat(plan);

            return updatedPortalPlans;
        }, defaultPortalPlans);

        return newPortalPlans;
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
            const siteTitle = await this.getSiteTitle(options);
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

    async getSiteTitle(options) {
        return await this.models.Settings.findOne({key: 'title'}, options);
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updateStripeProductNamesFromDefaultProduct({transacting});
            });
        }

        const siteTitle = await this.getSiteTitle(options);
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