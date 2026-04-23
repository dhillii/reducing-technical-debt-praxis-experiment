```javascript
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
            return;
        }
        if (this._isTestEnv()) {
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
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return false;
        }
        return true;
    }

    _isTestEnv() {
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

        if (!this._shouldPopulateProductsAndPrices(subscriptions, products, prices, defaultProduct)) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans, defaultProduct.id, options);
            await this._upsertStripeProductsAndPrices(stripePrices, defaultProduct.id, options);
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    _shouldPopulateProductsAndPrices(subscriptions, products, prices, defaultProduct) {
        return subscriptions.length > 0 && products.length === 0 && prices.length === 0 && !!defaultProduct;
    }

    async _fetchStripePrices(planIds, defaultProductId, options) {
        const stripePrices = [];
        for (const planId of planIds) {
            try {
                const stripePrice = await this.api.getPrice(planId, {expand: ['product']});
                stripePrices.push(stripePrice);
            } catch (err) {
                if (err && err.statusCode === 404) {
                    logging.warn(`Plan ${planId} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        logging.info(`Adding ${stripePrices.length} prices from Stripe`);
        return stripePrices;
    }

    async _upsertStripeProductsAndPrices(stripePrices, defaultProductId, options) {
        for (const stripePrice of stripePrices) {
            /** @type {import('stripe').Stripe.Product} */
            const stripeProduct = stripePrice.product;

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
        const interval = plan.interval;

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

        const plans = await this._loadStripePlansSetting(options);
        if (!plans) return;

        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
        if (!defaultStripeProduct) return;

        for (const plan of plans) {
            await this._createMissingStripePrice(plan, defaultStripeProduct, options);
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
        const {data} = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultProduct = data[0];
        if (defaultProduct) return defaultProduct;

        logging.info('Could not find Stripe Product - creating one');
        const productPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
        const defaultProductModel = productPage.data[0];
        if (!defaultProductModel) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return null;
        }

        const stripeProduct = await this.api.createProduct({name: defaultProductModel.get('name')});
        return this.models.StripeProduct.add({
            product_id: defaultProductModel.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    async _createMissingStripePrice(plan, defaultStripeProduct, options) {
        const existingPrice = await this.findPriceByPlan(plan, options);
        if (existingPrice) return;

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

    async updatePortalPlansSetting(plans, options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.updatePortalPlansSetting(plans, {transacting}));
        }

        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlans = await this._loadPortalPlansSetting(options);
        if (!portalPlans) return;

        if (!this._containsOldValues(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._mapPortalPlansToIds(portalPlans, plans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {...options, id: portalPlans.settingId});
    }

    async _loadPortalPlansSetting(options) {
        const setting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        try {
            const value = JSON.parse(setting.get('value'));
            return {value, settingId: setting.id};
        } catch (err) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return null;
        }
    }

    _containsOldValues(portalPlans) {
        return portalPlans.value.some(plan => ['monthly', 'yearly'].includes(plan));
    }

    async _mapPortalPlansToIds(portalPlans, plans, options) {
        const memo = [];
        for (const plan of portalPlans.value) {
            if (plan === 'monthly') {
                const monthly = plans.find(p => p.name === 'Monthly');
                if (!monthly) continue;
                const price = await this.findPriceByPlan(monthly, options);
                memo.push(price.id);
            } else if (plan === 'yearly') {
                const yearly = plans.find(p => p.name === 'Yearly');
                if (!yearly) continue;
                const price = await this.findPriceByPlan(yearly, options);
                memo.push(price.id);
            } else {
                memo.push(plan);
            }
        }
        return memo;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateMembersMonthlyPriceIdSettings({transacting}));
        }

        logging.info('Populating members_monthly_price_id from stripe_plans');
        const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        if (setting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const plans = await this._loadStripePlans(options);
        if (!plans) return;

        const monthlyPlan = plans.find(p => p.name === 'Monthly');
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        const monthlyPrice = await this._findOrCreateMonthlyPrice(monthlyPlan, options);
        await this.models.Settings.edit({key: 'members_monthly_price_id', value: monthlyPrice.id}, {...options, id: setting.id});
    }

    async _loadStripePlans(options) {
        const setting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        try {
            return JSON.parse(setting.get('value'));
        } catch {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return null;
        }
    }

    async _findOrCreateMonthlyPrice(monthlyPlan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (price) return price;

        logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
        price = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true}).fetch(options);

        if (price) return price;

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

    async _getDefaultStripeProduct(options) {
        const page = await this.models.StripeProduct.findPage({...options, limit: 1});
        return page.data[0];
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateMembersYearlyPriceIdSettings({transacting}));
        }

        logging.info('Populating members_yearly_price_id from stripe_plans');
        const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        if (setting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const plans = await this._loadStripePlans(options);
        if (!plans) return;

        const yearlyPlan = plans.find(p => p.name === 'Yearly');
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        const yearlyPrice = await this._findOrCreateYearlyPrice(yearlyPlan, options);
        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: setting.id});
    }

    async _findOrCreateYearlyPrice(yearlyPlan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (price) return price;

        logging.info('Could not find active yearly price from stripe_plans - searching by interval');
        price = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'year', active: true}).fetch(options);

        if (price) return price;

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

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateDefaultProductMonthlyPriceId({transacting}));
        }

        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const product = await this._getDefaultPaidProduct(options);
        if (!product) return;

        if (product.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        await this.models.Product.edit({monthly_price_id: setting.get('value')}, {...options, id: product.id});
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateDefaultProductYearlyPriceId({transacting}));
        }

        logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
        const product = await this._getDefaultPaidProduct(options);
        if (!product) return;

        if (product.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        await this.models.Product.edit({yearly_price_id: setting.get('value')}, {...options, id: product.id});
    }

    async _getDefaultPaidProduct(options) {
        const {data} = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        return data[0];
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.revertPortalPlansSetting({transacting}));
        }

        logging.info('Migrating portal_plans setting from ids to names');
        const portalPlans = await this._loadPortalPlansSetting(options);
        if (!portalPlans) return;

        if (this._containsNamedValues(portalPlans.value)) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const idsOnly = portalPlans.value.filter(p => p !== 'free');
        if (idsOnly.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const freeOnly = portalPlans.value.filter(p => p === 'free');
        const newPlans = await this._resolvePortalPlanIds(idsOnly, freeOnly, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPlans)
        }, {...options, id: portalPlans.settingId});
    }

    _containsNamedValues(plans) {
        return plans.some(p => ['monthly', 'yearly'].includes(p));
    }

    async _resolvePortalPlanIds(ids, freePlans, options) {
        const resolved = [...freePlans];
        for (const priceId of ids) {
            const planName = await this.getPlanFromPrice(priceId, options);
            if (!planName) continue;
            const filtered = resolved.filter(p => p !== planName);
            filtered.push(planName);
            resolved.splice(0, resolved.length, ...filtered);
        }
        return resolved;
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.removeInvalidSubscriptions({transacting}));
        }

        const subs = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });
        const invalid = subs.filter(sub => !sub.toJSON().price);
        if (invalid.length === 0) {
            logging.info('No invalid subscriptions, skipping migration');
            return;
        }

        logging.warn(`Deleting ${invalid.length} invalid subscription(s)`);
        for (const sub of invalid) {
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
        if (!defaultProduct || defaultProduct.name !== 'Default Product') return;

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
        if (!siteTitle) return;

        await this.models.Product.edit({name: siteTitle.get('value')}, {...options, id: defaultProduct.id});
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