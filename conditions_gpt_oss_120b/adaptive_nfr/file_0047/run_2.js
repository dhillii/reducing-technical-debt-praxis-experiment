```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
     * StripeMigrations
     *
     * @param {object} params
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

    /* ---------- Helpers ---------- */

    /** @private */
    _isEmptyArray(arr) {
        return Array.isArray(arr) && arr.length === 0;
    }

    /** @private */
    _hasValidDefaultProduct(product) {
        return product && typeof product.id === 'string';
    }

    /** @private */
    _shouldPopulateProductsAndPrices(subs, prods, prices, defaultProd) {
        return subs.length > 0 && this._isEmptyArray(prods) && this._isEmptyArray(prices) && this._hasValidDefaultProduct(defaultProd);
    }

    /** @private */
    async _fetchDefaultProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    /** @private */
    async _ensureDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];
        if (defaultStripeProduct) {
            return defaultStripeProduct;
        }

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

    /** @private */
    _isPlanNotFoundError(err) {
        return err && err.statusCode === 404;
    }

    /** @private */
    async _createStripePrice(plan, defaultStripeProduct, options) {
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
    }

    /** @private */
    async _addStripePriceFromPlan(plan, defaultStripeProduct, options) {
        try {
            const stripePrice = await this.api.getPrice(plan, {expand: ['product']});
            const stripeProduct = /** @type {import('stripe').Stripe.Product} */ (stripePrice.product);
            await this.models.StripeProduct.upsert({
                product_id: defaultStripeProduct.id,
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
        } catch (err) {
            if (this._isPlanNotFoundError(err)) {
                logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
            } else {
                throw err;
            }
        }
    }

    /** @private */
    async _findPlanByName(plans, name) {
        return plans.find(p => p.name === name);
    }

    /** @private */
    async _findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        return this.models.StripePrice.findOne({currency, amount, interval: plan.interval}, options);
    }

    /** @private */
    async _ensureMonthlyPrice(plans, options) {
        const monthlyPlan = await this._findPlanByName(plans, 'Monthly');
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return null;
        }

        let price = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (!price) {
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'month', active: true}).fetch(options);
        }

        if (!price) {
            const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
            if (!defaultStripeProduct) {
                return null;
            }
            const stripePrice = await this.api.createPrice({
                currency: 'usd',
                amount: 5000,
                nickname: 'Monthly',
                interval: 'month',
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            });
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

    /** @private */
    async _ensureYearlyPrice(plans, options) {
        const yearlyPlan = await this._findPlanByName(plans, 'Yearly');
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return null;
        }

        let price = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (!price) {
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'year', active: true}).fetch(options);
        }

        if (!price) {
            const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
            if (!defaultStripeProduct) {
                return null;
            }
            const stripePrice = await this.api.createPrice({
                currency: 'usd',
                amount: 500,
                nickname: 'Yearly',
                interval: 'year',
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            });
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

    /** @private */
    async _ensureDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];
        if (defaultStripeProduct) {
            return defaultStripeProduct;
        }

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

    /** @private */
    async _planNameToId(planName, plans, options) {
        const plan = plans.find(p => p.name === planName);
        if (!plan) {
            return null;
        }
        const price = await this._findPriceByPlan(plan, options);
        return price ? price.id : null;
    }

    /** @private */
    async _convertPortalPlanNamesToIds(plans, portalPlans, options) {
        const newPlans = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly' || plan === 'yearly') {
                const id = await this._planNameToId(plan.charAt(0).toUpperCase() + plan.slice(1), plans, options);
                if (id) {
                    newPlans.push(id);
                }
            } else {
                newPlans.push(plan);
            }
        }
        return newPlans;
    }

    /** @private */
    async _convertPortalPlanIdsToNames(portalPlanIds, options) {
        const defaultPortalPlans = portalPlanIds.filter(p => p === 'free');
        const namedPlans = [];
        for (const priceId of portalPlanIds) {
            if (priceId === 'free') {
                continue;
            }
            const plan = await this.getPlanFromPrice(priceId, options);
            if (plan) {
                namedPlans.push(plan);
            }
        }
        return defaultPortalPlans.concat(namedPlans);
    }

    /** @private */
    async _hasNamedValues(plans) {
        return plans.some(p => ['monthly', 'yearly'].includes(p));
    }

    /** @private */
    async _hasIdValues(plans) {
        return plans.some(p => !['monthly', 'yearly', 'free'].includes(p));
    }

    /** @private */
    async _findInvalidSubscriptions(options) {
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });
        return subscriptionModels.filter(sub => !sub.toJSON().price);
    }

    /** @private */
    async _defaultProduct() {
        const {data} = await this.models.Product.findPage({
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    /** @private */
    async _siteTitle(options) {
        const setting = await this.models.Settings.findOne({key: 'title'}, options);
        return setting ? setting.get('value') : null;
    }

    /* ---------- Migration Methods ---------- */

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
        const defaultProduct = await this._fetchDefaultProduct(options);

        if (!this._shouldPopulateProductsAndPrices(subscriptions, products, prices, defaultProduct)) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = [];

            for (const plan of uniquePlans) {
                try {
                    const stripePrice = await this.api.getPrice(plan, {expand: ['product']});
                    stripePrices.push(stripePrice);
                } catch (err) {
                    if (this._isPlanNotFoundError(err)) {
                        logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
                    } else {
                        throw err;
                    }
                }
            }

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this._addStripePriceFromPlan(stripePrice.id, defaultProduct, options);
            }
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        return this.models.StripePrice.findOne({currency, amount, interval: plan.interval}, options);
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

        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch {
            return;
        }

        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
        if (!defaultStripeProduct) {
            return;
        }

        for (const plan of plans) {
            const existingPrice = await this._findPriceByPlan(plan, options);
            if (existingPrice) {
                continue;
            }

            logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
            try {
                logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
                await this._createStripePrice(plan, defaultStripeProduct, options);
            } catch (err) {
                logging.error({err, message: 'Adding price failed'});
            }
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

        if (!await this._hasNamedValues(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._convertPortalPlanNamesToIds(plans, portalPlans, options);
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

        const monthlyPrice = await this._ensureMonthlyPrice(plans, options);
        if (!monthlyPrice) {
            return;
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

        const yearlyPrice = await this._ensureYearlyPrice(plans, options);
        if (!yearlyPrice) {
            return;
        }

        await this.models.Settings.edit({key: 'members_yearly_price_id', value: yearlyPrice.id}, {...options, id: yearlyPriceIdSetting.id});
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.populateDefaultProductMonthlyPriceId({transacting}));
        }

        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const defaultProduct = await this._defaultProduct();
        if (!defaultProduct) {
            return;
        }

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
        const defaultProduct = await this._defaultProduct();
        if (!defaultProduct) {
            return;
        }

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
        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return;
        }

        if (await this._hasNamedValues(portalPlans)) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter(p => p !== 'free');
        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._convertPortalPlanIdsToNames(portalPlanIds, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({key: 'portal_plans', value: JSON.stringify(newPortalPlans)}, {...options, id: portalPlansSetting.id});
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.removeInvalidSubscriptions({transacting}));
        }

        const invalidSubscriptions = await this._findInvalidSubscriptions(options);
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

        const defaultProduct = await this._defaultProduct();
        if (!defaultProduct || defaultProduct.name !== 'Default Product') {
            return;
        }

        const siteTitle = await this._siteTitle(options);
        if (!siteTitle) {
            return;
        }

        await this.models.Product.edit({name: siteTitle}, {...options, id: defaultProduct.id});
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction(transacting => this.updateStripeProductNamesFromDefaultProduct({transacting}));
        }

        const {data} = await this.models.StripeProduct.findPage({limit: 'all', ...options});
        const siteTitle = await this._siteTitle(options);
        if (!siteTitle) {
            return;
        }

        for (const model of data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));
            if (product.name === 'Default Product') {
                await this.api.updateProduct(product.id, {name: siteTitle});
            }
        }
    }
};
```