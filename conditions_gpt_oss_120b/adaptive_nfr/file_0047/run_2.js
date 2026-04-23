const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
     * @param {object} params
     * @param {any} params.models
     * @param {import('./stripe-api')} params.api
     */
    constructor({models, api}) {
        this.models = models;
        this.api = api;
    }

    async execute() {
        if (!this._isStripeConfigured()) {
            logging.info('Stripe not configured - skipping migrations');
            return;
        }
        if (this._isTestEnv()) {
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

    _isStripeConfigured() {
        return this.api._configured;
    }

    _isTestEnv() {
        return this.api.testEnv;
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

        if (!this._hasSubscriptionsWithoutProductsOrPrices(subscriptions, products, prices, defaultProduct)) {
            return;
        }

        await this._populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options);
    }

    /**
     * @private
     */
    _hasSubscriptionsWithoutProductsOrPrices(subscriptions, products, prices, defaultProduct) {
        return subscriptions.length > 0 && products.length === 0 && prices.length === 0 && !!defaultProduct;
    }

    /**
     * @private
     */
    async _populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options) {
        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = [];

            for (const plan of uniquePlans) {
                const stripePrice = await this._fetchStripePrice(plan);
                if (stripePrice) {
                    stripePrices.push(stripePrice);
                }
            }

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                /** @type {import('stripe').Stripe.Product} */
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
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    /**
     * @private
     */
    async _fetchStripePrice(plan) {
        try {
            return await this.api.getPrice(plan, {expand: ['product']});
        } catch (err) {
            if (err && err.statusCode === 404) {
                logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
                return null;
            }
            throw err;
        }
    }

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        return this.models.StripePrice.findOne({currency, amount, interval}, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        if (!price) {
            return null;
        }
        const interval = price.get('interval');
        return interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateStripePricesFromStripePlansSetting({transacting});
            });
        }

        const plans = await this._loadStripePlansSetting(options);
        if (!plans) {
            return;
        }

        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
        if (!defaultStripeProduct) {
            return;
        }

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);
            if (!existingPrice) {
                await this._createStripePriceFromPlan(plan, defaultStripeProduct, options);
            }
        }
    }

    /**
     * @private
     */
    async _loadStripePlansSetting(options) {
        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        try {
            return JSON.parse(plansSetting.get('value'));
        } catch {
            return null;
        }
    }

    /**
     * @private
     */
    async _ensureDefaultStripeProduct(options) {
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

        const stripeProduct = await this.api.createProduct({name: defaultProduct.get('name')});
        return this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    /**
     * @private
     */
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
            return this.models.Product.transaction((transacting) => {
                return this.updatePortalPlansSetting(plans, {transacting});
            });
        }

        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlans = await this._loadPortalPlansSetting(options);
        if (!portalPlans) {
            return;
        }

        if (!this._containsOldPlanNames(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._mapPortalPlanNamesToIds(portalPlans, plans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: (await this.models.Settings.findOne({key: 'portal_plans'}, options)).id});
    }

    /**
     * @private
     */
    async _loadPortalPlansSetting(options) {
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        try {
            return JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({
                message: 'Could not parse portal_plans setting, skipping migration',
                err
            });
            return null;
        }
    }

    /**
     * @private
     */
    _containsOldPlanNames(portalPlans) {
        return portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
    }

    /**
     * @private
     */
    async _mapPortalPlanNamesToIds(portalPlans, plans, options) {
        return portalPlans.reduce(async (memoPromise, plan) => {
            const memo = await memoPromise;
            if (plan === 'monthly') {
                const monthlyPlan = plans.find(p => p.name === 'Monthly');
                if (!monthlyPlan) {
                    return memo;
                }
                const price = await this.findPriceByPlan(monthlyPlan, options);
                return memo.concat(price.id);
            }
            if (plan === 'yearly') {
                const yearlyPlan = plans.find(p => p.name === 'Yearly');
                if (!yearlyPlan) {
                    return memo;
                }
                const price = await this.findPriceByPlan(yearlyPlan, options);
                return memo.concat(price.id);
            }
            return memo.concat(plan);
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

        const monthlyPlan = await this._findPlanByName('Monthly', 'stripe_plans', options);
        if (!monthlyPlan) {
            return;
        }

        const monthlyPrice = await this._findOrCreateMonthlyPrice(monthlyPlan, options);
        await this.models.Settings.edit(
            {key: 'members_monthly_price_id', value: monthlyPrice.id},
            {...options, id: monthlyPriceIdSetting.id}
        );
    }

    /**
     * @private
     */
    async _findPlanByName(name, settingKey, options) {
        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        try {
            const plans = JSON.parse(setting.get('value'));
            return plans.find(p => p.name === name);
        } catch {
            logging.warn(`Skipping population, could not parse ${settingKey}`);
            return null;
        }
    }

    /**
     * @private
     */
    async _findOrCreateMonthlyPrice(monthlyPlan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (price) {
            return price;
        }

        logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
        price = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true})
            .fetch(options);

        if (price) {
            return price;
        }

        logging.info('Could not any active Monthly price - creating a new one');
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const stripePrice = await this.api.createPrice({
            currency: 'usd',
            amount: 5000,
            nickname: 'Monthly',
            interval: 'month',
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        return this.models.StripePrice.add({
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

        const yearlyPlan = await this._findPlanByName('Yearly', 'stripe_plans', options);
        if (!yearlyPlan) {
            return;
        }

        const yearlyPrice = await this._findOrCreateYearlyPrice(yearlyPlan, options);
        await this.models.Settings.edit(
            {key: 'members_yearly_price_id', value: yearlyPrice.id},
            {...options, id: yearlyPriceIdSetting.id}
        );
    }

    /**
     * @private
     */
    async _findOrCreateYearlyPrice(yearlyPlan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (price) {
            return price;
        }

        logging.info('Could not find active yearly price from stripe_plans - searching by interval');
        price = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'year', active: true})
            .fetch(options);

        if (price) {
            return price;
        }

        logging.info('Could not any active yearly price - creating a new one');
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const stripePrice = await this.api.createPrice({
            currency: 'usd',
            amount: 500,
            nickname: 'Yearly',
            interval: 'year',
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        return this.models.StripePrice.add({
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

    /**
     * @private
     */
    async _getDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        return stripeProductsPage.data[0];
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
        const portalPlans = await this._loadPortalPlansSetting(options);
        if (!portalPlans) {
            return;
        }

        if (this._containsNamedValues(portalPlans)) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const newPortalPlans = await this._convertPortalPlanIdsToNames(portalPlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: (await this.models.Settings.findOne({key: 'portal_plans'}, options)).id});
    }

    /**
     * @private
     */
    _containsNamedValues(portalPlans) {
        return portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
    }

    /**
     * @private
     */
    async _convertPortalPlanIdsToNames(portalPlanIds, options) {
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        const portalPlans = JSON.parse(portalPlansSetting.get('value'));

        const freePlans = portalPlans.filter(p => p === 'free');
        const priceIds = portalPlans.filter(p => p !== 'free');

        const names = await priceIds.reduce(async (memoPromise, priceId) => {
            const memo = await memoPromise;
            const plan = await this.getPlanFromPrice(priceId, options);
            if (!plan) {
                return memo;
            }
            const filtered = memo.filter(d => d !== plan);
            return filtered.concat(plan);
        }, freePlans);

        return names;
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

        if (!defaultProduct || defaultProduct.name !== 'Default Product') {
            return;
        }

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
        if (!siteTitle) {
            return;
        }

        await this.models.Product.edit(
            {name: siteTitle.get('value')},
            {...options, id: defaultProduct.id}
        );
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
        if (!siteTitle) {
            return;
        }

        for (const model of data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));
            if (product.name === 'Default Product') {
                await this.api.updateProduct(product.id, {name: siteTitle.get('value')});
            }
        }
    }
};