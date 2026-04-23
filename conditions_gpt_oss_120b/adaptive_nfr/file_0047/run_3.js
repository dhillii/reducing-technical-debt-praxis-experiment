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
        if (this._shouldSkipMigrations()) {
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

    _shouldSkipMigrations() {
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return true;
        }
        if (this.api.testEnv) {
            logging.info('Stripe is in test mode - skipping migrations');
            return true;
        }
        return false;
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateProductsAndPrices({transacting}));
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

        if (!this._hasExistingSubscriptionsWithoutProducts(subscriptions, products, prices, defaultProduct)) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans, defaultProduct);
            await this._upsertStripeProductsAndPrices(stripePrices, defaultProduct, options);
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    _hasExistingSubscriptionsWithoutProducts(subscriptions, products, prices, defaultProduct) {
        return subscriptions.length > 0 && products.length === 0 && prices.length === 0 && !!defaultProduct;
    }

    async _fetchStripePrices(planIds, defaultProduct) {
        const stripePrices = [];
        for (const planId of planIds) {
            try {
                const stripePrice = await this.api.getPrice(planId, {expand: ['product']});
                stripePrices.push(stripePrice);
            } catch (err) {
                if (this._isNotFoundError(err)) {
                    logging.warn(`Plan ${planId} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        logging.info(`Adding ${stripePrices.length} prices from Stripe`);
        return stripePrices;
    }

    _isNotFoundError(err) {
        return err && err.statusCode === 404;
    }

    async _upsertStripeProductsAndPrices(stripePrices, defaultProduct, options) {
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
            return this.models.Product.transaction(transacting => this.populateStripePricesFromStripePlansSetting({transacting}));
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
            if (existingPrice) {
                continue;
            }

            await this._createStripePriceForPlan(plan, defaultStripeProduct, options);
        }
    }

    async _loadStripePlansSetting(options) {
        const setting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        try {
            return JSON.parse(setting.get('value'));
        } catch {
            return null;
        }
    }

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

    async _createStripePriceForPlan(plan, defaultStripeProduct, options) {
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
        const portalPlans = this._parseJsonSetting(portalPlansSetting);
        if (!portalPlans) {
            return;
        }

        if (!this._containsOldPlanNames(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._mapPortalPlansToIds(portalPlans, plans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: portalPlansSetting.id});
    }

    _parseJsonSetting(setting) {
        try {
            return JSON.parse(setting.get('value'));
        } catch (err) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return null;
        }
    }

    _containsOldPlanNames(plans) {
        return !!plans.find(plan => ['monthly', 'yearly'].includes(plan));
    }

    async _mapPortalPlansToIds(portalPlans, plans, options) {
        const result = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly' || plan === 'yearly') {
                const priceId = await this._resolvePlanNameToPriceId(plan, plans, options);
                if (priceId) {
                    result.push(priceId);
                }
            } else {
                result.push(plan);
            }
        }
        return result;
    }

    async _resolvePlanNameToPriceId(name, plans, options) {
        const planName = name === 'monthly' ? 'Monthly' : 'Yearly';
        const matchingPlan = plans.find(p => p.name === planName);
        if (!matchingPlan) {
            return null;
        }
        const price = await this.findPriceByPlan(matchingPlan, options);
        return price ? price.id : null;
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

        const plans = await this._loadStripePlansSetting(options);
        if (!plans) {
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
            monthlyPrice = await this._findActiveMonthlyPrice(options);
        }

        if (!monthlyPrice) {
            monthlyPrice = await this._createDefaultMonthlyPrice(options);
        }

        await this.models.Settings.edit({
            key: 'members_monthly_price_id',
            value: monthlyPrice.id
        }, {...options, id: monthlyPriceIdSetting.id});
    }

    async _findActiveMonthlyPrice(options) {
        logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
        return this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true})
            .fetch(options);
    }

    async _createDefaultMonthlyPrice(options) {
        logging.info('Could not any active Monthly price - creating a new one');
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 5000,
            nickname: 'Monthly',
            interval: 'month',
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

    async _getDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        return stripeProductsPage.data[0];
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

        const plans = await this._loadStripePlansSetting(options);
        if (!plans) {
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
            yearlyPrice = await this._findActiveYearlyPrice(options);
        }

        if (!yearlyPrice) {
            yearlyPrice = await this._createDefaultYearlyPrice(options);
        }

        await this.models.Settings.edit({
            key: 'members_yearly_price_id',
            value: yearlyPrice.id
        }, {...options, id: yearlyPriceIdSetting.id});
    }

    async _findActiveYearlyPrice(options) {
        logging.info('Could not find active yearly price from stripe_plans - searching by interval');
        return this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'year', active: true})
            .fetch(options);
    }

    async _createDefaultYearlyPrice(options) {
        logging.info('Could not any active yearly price - creating a new one');
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 500,
            nickname: 'Yearly',
            interval: 'year',
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
        const monthlyPriceId = monthlyPriceIdSetting.get('value');
        await this.models.Product.edit({monthly_price_id: monthlyPriceId}, {...options, id: defaultProduct.id});
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
        const yearlyPriceId = yearlyPriceIdSetting.get('value');
        await this.models.Product.edit({yearly_price_id: yearlyPriceId}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.revertPortalPlansSetting({transacting}));
        }

        logging.info('Migrating portal_plans setting from ids to names');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        const portalPlans = this._parseJsonSetting(portalPlansSetting);
        if (!portalPlans) {
            return;
        }

        if (this._containsNamedValues(portalPlans)) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter(p => p !== 'free');
        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter(p => p === 'free');
        const newPortalPlans = await this._resolvePortalPlanIdsToNames(portalPlanIds, defaultPortalPlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: portalPlansSetting.id});
    }

    _containsNamedValues(plans) {
        return !!plans.find(p => ['monthly', 'yearly'].includes(p));
    }

    async _resolvePortalPlanIdsToNames(ids, accumulator, options) {
        const result = [...accumulator];
        for (const priceId of ids) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (!plan) {
                continue;
            }
            const filtered = result.filter(p => p !== plan);
            filtered.push(plan);
            result.splice(0, result.length, ...filtered);
        }
        return result;
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
            return this.models.Product.transaction(transacting => this.setDefaultProductName({transacting}));
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

        await this.models.Product.edit({
            name: siteTitle.get('value')
        }, {...options, id: defaultProduct.id});
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
        if (!siteTitle) {
            return;
        }

        for (const model of data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));
            if (product.name !== 'Default Product') {
                continue;
            }
            await this.api.updateProduct(product.id, {name: siteTitle.get('value')});
        }
    }
};