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

    // ------------------------------------------------------------------
    // Products & Prices
    // ------------------------------------------------------------------
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

        await this._populateProductsAndPricesFromSubscriptions(subscriptionData, defaultProduct, options);
    }

    async _populateProductsAndPricesFromSubscriptions(subscriptions, defaultProduct, options) {
        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._getStripePricesForPlans(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this._upsertStripeProductAndPrice(stripePrice, defaultProduct, options);
            }
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    async _getStripePricesForPlans(plans) {
        const stripePrices = [];
        for (const plan of plans) {
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

    async _upsertStripeProductAndPrice(stripePrice, defaultProduct, options) {
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

    // ------------------------------------------------------------------
    // Stripe Prices from Settings
    // ------------------------------------------------------------------
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

        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);

        for (const plan of plans) {
            await this._ensurePriceForPlan(plan, defaultStripeProduct, options);
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

    async _ensurePriceForPlan(plan, defaultStripeProduct, options) {
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

    // ------------------------------------------------------------------
    // Portal Plans
    // ------------------------------------------------------------------
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

        if (!this._containsOldPortalPlanValues(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._convertPortalPlanNamesToIds(portalPlans, plans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    _containsOldPortalPlanValues(portalPlans) {
        return !!portalPlans.find(plan => ['monthly', 'yearly'].includes(plan));
    }

    async _convertPortalPlanNamesToIds(portalPlans, plans, options) {
        const newPortalPlans = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly' || plan === 'yearly') {
                const planItem = plans.find(p => p.name === this._capitalize(plan));
                if (!planItem) continue;
                const price = await this.findPriceByPlan(planItem, options);
                if (price) newPortalPlans.push(price.id);
            } else {
                newPortalPlans.push(plan);
            }
        }
        return newPortalPlans;
    }

    _capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
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

        if (this._containsNamedPortalPlanValues(portalPlans)) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter(plan => plan !== 'free');
        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter(plan => plan === 'free');
        const newPortalPlans = await this._convertPortalPlanIdsToNames(portalPlanIds, defaultPortalPlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    _containsNamedPortalPlanValues(portalPlans) {
        return !!portalPlans.find(plan => ['monthly', 'yearly'].includes(plan));
    }

    async _convertPortalPlanIdsToNames(priceIds, defaultPortalPlans, options) {
        const newPortalPlans = [...defaultPortalPlans];
        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (!plan) continue;
            const updated = newPortalPlans.filter(p => p !== plan).concat(plan);
            newPortalPlans.splice(0, newPortalPlans.length, ...updated);
        }
        return newPortalPlans;
    }

    // ------------------------------------------------------------------
    // Member Price Settings
    // ------------------------------------------------------------------
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

        const monthlyPrice = await this._findOrCreateMonthlyPrice(options);
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

        const yearlyPrice = await this._findOrCreateYearlyPrice(options);
        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceIdSetting.id});
    }

    async _findOrCreateMonthlyPrice(options) {
        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return null;
        }

        const monthlyPlan = plans.find(p => p.name === 'Monthly');
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
            monthlyPrice = await this._searchPriceByInterval('month', options);
        }

        if (!monthlyPrice) {
            monthlyPrice = await this._createPriceForInterval('month', 'Monthly', 5000, options);
        }

        return monthlyPrice;
    }

    async _findOrCreateYearlyPrice(options) {
        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
            return null;
        }

        const yearlyPlan = plans.find(p => p.name === 'Yearly');
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
            yearlyPrice = await this._searchPriceByInterval('year', options);
        }

        if (!yearlyPrice) {
            yearlyPrice = await this._createPriceForInterval('year', 'Yearly', 500, options);
        }

        return yearlyPrice;
    }

    async _searchPriceByInterval(interval, options) {
        return await this.models.StripePrice.where('amount', '>', 0)
            .where({interval, active: true}).fetch(options);
    }

    async _createPriceForInterval(interval, nickname, amount, options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];
        const price = await this.api.createPrice({
            currency: 'usd',
            amount,
            nickname,
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

    // ------------------------------------------------------------------
    // Default Product Price Migration
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Subscription Cleanup
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Default Product Name
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Stripe Product Names
    // ------------------------------------------------------------------
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
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
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
};