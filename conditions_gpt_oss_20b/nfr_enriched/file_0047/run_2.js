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

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateProductsAndPrices({transacting});
            });
        }

        const [subscriptions, prices, products] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options),
            this.models.StripePrice.findAll(options),
            this.models.StripeProduct.findAll(options)
        ]);

        const subscriptionData = subscriptions.toJSON();
        const priceData = prices.toJSON();
        const productData = products.toJSON();

        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = data[0] && data[0].toJSON();

        if (subscriptionData.length === 0 || productData.length > 0 || priceData.length > 0 || !defaultProduct) {
            return;
        }

        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptionData.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this.fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this.upsertStripeProduct(stripePrice, defaultProduct.id, options);
                await this.addStripePrice(stripePrice, options);
            }
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    async fetchStripePrices(plans) {
        const stripePrices = [];
        for (const plan of plans) {
            try {
                const stripePrice = await this.api.getPrice(plan, {expand: ['product']});
                stripePrices.push(stripePrice);
            } catch (err) {
                if (err && err.statusCode !== 404) {
                    throw err;
                }
                logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
            }
        }
        return stripePrices;
    }

    async upsertStripeProduct(stripePrice, defaultProductId, options) {
        const stripeProduct = stripePrice.product;
        await this.models.StripeProduct.upsert({
            product_id: defaultProductId,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    async addStripePrice(stripePrice, options) {
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

        const price = await this.models.StripePrice.findOne({currency, amount, interval}, options);
        return price;
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        if (!price) return null;
        if (price.get('interval') === 'month') return 'monthly';
        if (price.get('interval') === 'year') return 'yearly';
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

        let defaultStripeProduct = await this.ensureDefaultStripeProduct(options);
        if (!defaultStripeProduct) return;

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);
            if (existingPrice) continue;

            logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
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
    }

    async ensureDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];
        if (defaultStripeProduct) return defaultStripeProduct;

        logging.info('Could not find Stripe Product - creating one');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
        const defaultProduct = productsPage.data[0];
        if (!defaultProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return null;
        }
        const stripeProduct = await this.api.createProduct({name: defaultProduct.get('name')});
        defaultStripeProduct = await this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
        return defaultStripeProduct;
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
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return;
        }

        const containsOldValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this.mapPortalPlansToIds(plans, portalPlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: portalPlansSetting.id});
    }

    async mapPortalPlansToIds(plans, portalPlans, options) {
        const newPortalPlans = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly' || plan === 'yearly') {
                const planItem = plans.find(p => p.name === (plan === 'monthly' ? 'Monthly' : 'Yearly'));
                if (!planItem) continue;
                const price = await this.findPriceByPlan(planItem, options);
                if (price) newPortalPlans.push(price.id);
            } else {
                newPortalPlans.push(plan);
            }
        }
        return newPortalPlans;
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

        const stripePlans = await this.getStripePlans(options);
        if (!stripePlans) return;

        const monthlyPlan = stripePlans.find(p => p.name === 'Monthly');
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        let monthlyPrice = await this.findPriceByPlan(monthlyPlan, options);
        if (!monthlyPrice) {
            monthlyPrice = await this.findPriceByInterval('month', options);
        }

        if (!monthlyPrice) {
            monthlyPrice = await this.createDefaultPrice('Monthly', 'usd', 5000, 'month', options);
        }

        await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...options, id: monthlyPriceIdSetting.id});
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

        const stripePlans = await this.getStripePlans(options);
        if (!stripePlans) return;

        const yearlyPlan = stripePlans.find(p => p.name === 'Yearly');
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        let yearlyPrice = await this.findPriceByPlan(yearlyPlan, options);
        if (!yearlyPrice) {
            yearlyPrice = await this.findPriceByInterval('year', options);
        }

        if (!yearlyPrice) {
            yearlyPrice = await this.createDefaultPrice('Yearly', 'usd', 500, 'year', options);
        }

        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceIdSetting.id});
    }

    async getStripePlans(options) {
        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        try {
            return JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_*_price_id, could not parse stripe_plans');
            return null;
        }
    }

    async findPriceByInterval(interval, options) {
        const price = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval, active: true}).fetch(options);
        return price;
    }

    async createDefaultPrice(name, currency, amount, interval, options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];
        const price = await this.api.createPrice({
            currency,
            amount,
            nickname: name,
            interval,
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
        if (!defaultProduct) return;

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
        if (!defaultProduct) return;

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
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return;
        }

        const containsNamedValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
        if (containsNamedValues) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter(plan => plan !== 'free');
        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter(plan => plan === 'free');
        const newPortalPlans = await this.mapIdsToNames(portalPlanIds, defaultPortalPlans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: portalPlansSetting.id});
    }

    async mapIdsToNames(priceIds, defaultPortalPlans, options) {
        const newPortalPlans = [...defaultPortalPlans];
        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (!plan) continue;
            const index = newPortalPlans.indexOf(plan);
            if (index !== -1) newPortalPlans.splice(index, 1);
            newPortalPlans.push(plan);
        }
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

        const invalidSubscriptions = subscriptionModels.filter(sub => !sub.toJSON().price);
        if (invalidSubscriptions.length === 0) {
            logging.info(`No invalid subscriptions, skipping migration`);
            return;
        }

        logging.warn(`Deleting ${invalidSubscriptions.length} invalid subscription(s)`);
        for (const sub of invalidSubscriptions) {
            logging.warn(`Deleting subscription - ${sub.id} - no price found`);
            await sub.destroy(options);
        }
    }

    async setDefaultProductName(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.setDefaultProductName({transacting});
            });
        }

        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });

        const defaultProduct = data[0] && data[0].toJSON();
        if (!defaultProduct || defaultProduct.name !== 'Default Product') return;

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
        if (!siteTitle) return;

        await this.models.Product.edit({
            name: siteTitle.get('value')
        }, {...options, id: defaultProduct.id});
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updateStripeProductNamesFromDefaultProduct({transacting});
            });
        }

        const {data} = await this.models.StripeProduct.findPage({
            ...options,
            limit: 'all'
        });

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
        if (!siteTitle) return;

        for (const model of data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));
            if (product.name === 'Default Product') {
                await this.api.updateProduct(product.id, {name: siteTitle.get('value')});
            }
        }
    }
};