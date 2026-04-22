```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
     * @param {{models: any, api: import('./stripe-api')}} params
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
            return this.models.Product.transaction(transacting => this.populateProductsAndPrices({transacting}));
        }

        const [subscriptionModels, priceModels, productModels] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options),
            this.models.StripePrice.findAll(options),
            this.models.StripeProduct.findAll(options)
        ]);

        const subscriptions = subscriptionModels.toJSON();
        const prices = priceModels.toJSON();
        const products = productModels.toJSON();

        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = data[0] && data[0].toJSON();

        if (!subscriptions.length || products.length || prices.length || !defaultProduct) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans);
            await this._upsertStripeData(stripePrices, defaultProduct.id, options);
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async _fetchStripePrices(planIds) {
        const results = [];
        for (const planId of planIds) {
            try {
                const price = await this.api.getPrice(planId, {expand: ['product']});
                results.push(price);
            } catch (err) {
                if (err?.statusCode === 404) {
                    logging.warn(`Plan ${planId} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        return results;
    }

    async _upsertStripeData(stripePrices, defaultProductId, options) {
        logging.info(`Adding ${stripePrices.length} prices from Stripe`);
        for (const stripePrice of stripePrices) {
            const stripeProduct = stripePrice.product; // expanded product
            await this.models.StripeProduct.upsert({
                product_id: defaultProductId,
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

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const {interval} = plan;

        return this.models.StripePrice.findOne({currency, amount, interval}, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        if (!price) return null;
        const interval = price.get('interval');
        return interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateStripePricesFromStripePlansSetting({transacting}));
        }

        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch {
            return;
        }

        let defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);
            if (!existingPrice) {
                await this._createStripePriceFromPlan(plan, defaultStripeProduct, options);
            }
        }
    }

    async _ensureDefaultStripeProduct(options) {
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
            const stripeProduct = await this.api.createProduct({name: defaultProduct.get('name')});
            defaultStripeProduct = await this.models.StripeProduct.add({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);
        }
        return defaultStripeProduct;
    }

    async _createStripePriceFromPlan(plan, defaultStripeProduct, options) {
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
            return this.models.Product.transaction(transacting => this.updatePortalPlansSetting(plans, {transacting}));
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

        const containsOldValues = portalPlans.some(p => ['monthly', 'yearly'].includes(p));
        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await portalPlans.reduce(async (memoPromise, plan) => {
            const memo = await memoPromise;
            if (plan === 'monthly' || plan === 'yearly') {
                const name = plan === 'monthly' ? 'Monthly' : 'Yearly';
                const planItem = plans.find(p => p.name === name);
                if (!planItem) return memo;
                const price = await this.findPriceByPlan(planItem, options);
                return memo.concat(price.id);
            }
            return memo.concat(plan);
        }, []);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({key: 'portal_plans', value: JSON.stringify(newPortalPlans)}, {...options, id: portalPlansSetting.id});
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateMembersMonthlyPriceIdSettings({transacting}));
        }
        logging.info('Populating members_monthly_price_id from stripe_plans');
        const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        if (monthlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return;
        }

        const monthlyPlan = plans.find(p => p.name === 'Monthly');
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
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
            monthlyPrice = await this._createFallbackPrice('Monthly', 'month', options);
        }

        await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...options, id: monthlyPriceIdSetting.id});
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateMembersYearlyPriceIdSettings({transacting}));
        }
        logging.info('Populating members_yearly_price_id from stripe_plans');
        const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        if (yearlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
            return;
        }

        const yearlyPlan = plans.find(p => p.name === 'Yearly');
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
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
            yearlyPrice = await this._createFallbackPrice('Yearly', 'year', options);
        }

        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceIdSetting.id});
    }

    async _createFallbackPrice(name, interval, options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: interval === 'month' ? 5000 : 500,
            nickname: name,
            interval,
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });
        return this.models.StripePrice.add({
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
            return this.models.Product.transaction(transacting => this.populateDefaultProductMonthlyPriceId({transacting}));
        }
        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];
        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }
        const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        await this.models.Product.edit({monthly_price_id: monthlyPriceIdSetting.get('value')}, {...options, id: defaultProduct.id});
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateDefaultProductYearlyPriceId({transacting}));
        }
        logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];
        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }
        const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        await this.models.Product.edit({yearly_price_id: yearlyPriceIdSetting.get('value')}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.revertPortalPlansSetting({transacting}));
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

        const containsNamedValues = portalPlans.some(p => ['monthly', 'yearly'].includes(p));
        if (containsNamedValues) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter(p => p !== 'free');
        if (!portalPlanIds.length) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter(p => p === 'free');
        const newPortalPlans = await portalPlanIds.reduce(async (memoPromise, priceId) => {
            const memo = await memoPromise;
            const plan = await this.getPlanFromPrice(priceId, options);
            if (!plan) return memo;
            const updated = memo.filter(p => p !== plan).concat(plan);
            return updated;
        }, defaultPortalPlans);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({key: 'portal_plans', value: JSON.stringify(newPortalPlans)}, {...options, id: portalPlansSetting.id});
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.removeInvalidSubscriptions({transacting}));
        }
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });
        const invalidSubscriptions = subscriptionModels.filter(sub => !sub.toJSON().price);
        if (!invalidSubscriptions.length) {
            logging.info('No invalid subscriptions, skipping migration');
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
            return this.models.Product.transaction(transacting => this.setDefaultProductName({transacting}));
        }

        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = data[0] && data[0].toJSON();

        if (defaultProduct?.name === 'Default Product') {
            const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
            if (siteTitle) {
                await this.models.Product.edit({name: siteTitle.get('value')}, {...options, id: defaultProduct.id});
            }
        }
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.updateStripeProductNamesFromDefaultProduct({transacting}));
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
```