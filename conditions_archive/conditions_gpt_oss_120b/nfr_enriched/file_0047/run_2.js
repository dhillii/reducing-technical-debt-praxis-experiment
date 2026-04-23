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

    /** Execute all migrations */
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

    /** Ensure a method runs inside a transaction when no options are supplied */
    async _runInTransaction(method, options) {
        if (!options) {
            return this.models.Product.transaction(t => method.call(this, {transacting: t}));
        }
        return method.call(this, options);
    }

    /** Populate products and prices for existing Stripe customers */
    async populateProductsAndPrices(options) {
        return this._runInTransaction(this._populateProductsAndPrices, options);
    }

    async _populateProductsAndPrices(options) {
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

        logging.info('Populating products and prices for existing stripe customers');
        const uniquePlanIds = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
        const stripePrices = await this._fetchStripePrices(uniquePlanIds);
        logging.info(`Adding ${stripePrices.length} prices from Stripe`);

        for (const stripePrice of stripePrices) {
            const stripeProduct = stripePrice.product; // expanded product
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

    /** Fetch Stripe prices for a list of plan ids, ignoring missing plans */
    async _fetchStripePrices(planIds) {
        const results = [];
        for (const planId of planIds) {
            try {
                const price = await this.api.getPrice(planId, {expand: ['product']});
                results.push(price);
            } catch (err) {
                if (err && err.statusCode === 404) {
                    logging.warn(`Plan ${planId} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        return results;
    }

    /** Find a price record matching a plan definition */
    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        return this.models.StripePrice.findOne({currency, amount, interval: plan.interval}, options);
    }

    /** Resolve plan name from a Stripe price id */
    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        if (!price) return null;
        const interval = price.get('interval');
        return interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null;
    }

    /** Populate Stripe prices from the legacy `stripe_plans` setting */
    async populateStripePricesFromStripePlansSetting(options) {
        return this._runInTransaction(this._populateStripePricesFromPlans, options);
    }

    async _populateStripePricesFromPlans(options) {
        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch {
            return;
        }

        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
        for (const plan of plans) {
            const existing = await this.findPriceByPlan(plan, options);
            if (!existing) {
                await this._createStripePrice(plan, defaultStripeProduct, options);
            }
        }
    }

    /** Ensure a default Stripe product exists, creating one if necessary */
    async _ensureDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];
        if (defaultStripeProduct) return defaultStripeProduct;

        logging.info('Could not find Stripe Product - creating one');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
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

    /** Create a Stripe price and corresponding local record */
    async _createStripePrice(plan, defaultStripeProduct, options) {
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

    /** Update portal_plans setting from names to ids */
    async updatePortalPlansSetting(plans, options) {
        return this._runInTransaction(this._updatePortalPlansSetting, options, plans);
    }

    async _updatePortalPlansSetting(plans, options) {
        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration'});
            return;
        }

        if (!portalPlans.some(p => ['monthly', 'yearly'].includes(p))) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPlans = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly' || plan === 'yearly') {
                const matching = plans.find(p => p.name.toLowerCase() === plan);
                if (matching) {
                    const price = await this.findPriceByPlan(matching, options);
                    if (price) newPlans.push(price.id);
                }
            } else {
                newPlans.push(plan);
            }
        }

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPlans)
        }, {...options, id: portalPlansSetting.id});
    }

    /** Populate members_monthly_price_id from stripe_plans */
    async populateMembersMonthlyPriceIdSettings(options) {
        return this._runInTransaction(this._populateMembersMonthlyPriceId, options);
    }

    async _populateMembersMonthlyPriceId(options) {
        logging.info('Populating members_monthly_price_id from stripe_plans');
        const monthlySetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        if (monthlySetting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return;
        }

        const monthlyPlan = plans.find(p => p.name === 'Monthly');
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        let price = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'month', active: true}).fetch(options);
        }

        if (!price) {
            price = await this._createFallbackMonthlyPrice(options);
        }

        await this.models.Settings.edit({
            key: 'members_monthly_price_id',
            value: price.id
        }, {...options, id: monthlySetting.id});
    }

    /** Create a fallback monthly price when none exists */
    async _createFallbackMonthlyPrice(options) {
        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
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

    /** Populate members_yearly_price_id from stripe_plans */
    async populateMembersYearlyPriceIdSettings(options) {
        return this._runInTransaction(this._populateMembersYearlyPriceId, options);
    }

    async _populateMembersYearlyPriceId(options) {
        logging.info('Populating members_yearly_price_id from stripe_plans');
        const yearlySetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        if (yearlySetting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
            return;
        }

        const yearlyPlan = plans.find(p => p.name === 'Yearly');
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        let price = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info('Could not find active yearly price from stripe_plans - searching by interval');
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'year', active: true}).fetch(options);
        }

        if (!price) {
            price = await this._createFallbackYearlyPrice(options);
        }

        await this.models.Settings.edit({
            key: 'members_yearly_price_id',
            value: price.id
        }, {...options, id: yearlySetting.id});
    }

    /** Create a fallback yearly price when none exists */
    async _createFallbackYearlyPrice(options) {
        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);
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

    /** Migrate members_monthly_price_id to product.monthly_price_id */
    async populateDefaultProductMonthlyPriceId(options) {
        return this._runInTransaction(this._populateDefaultProductMonthlyPriceId, options);
    }

    async _populateDefaultProductMonthlyPriceId(options) {
        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];
        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        await this.models.Product.edit({
            monthly_price_id: setting.get('value')
        }, {...options, id: defaultProduct.id});
    }

    /** Migrate members_yearly_price_id to product.yearly_price_id */
    async populateDefaultProductYearlyPriceId(options) {
        return this._runInTransaction(this._populateDefaultProductYearlyPriceId, options);
    }

    async _populateDefaultProductYearlyPriceId(options) {
        logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];
        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        await this.models.Product.edit({
            yearly_price_id: setting.get('value')
        }, {...options, id: defaultProduct.id});
    }

    /** Revert portal_plans setting from ids back to names */
    async revertPortalPlansSetting(options) {
        return this._runInTransaction(this._revertPortalPlansSetting, options);
    }

    async _revertPortalPlansSetting(options) {
        logging.info('Migrating portal_plans setting from ids to names');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration'});
            return;
        }

        if (portalPlans.some(p => ['monthly', 'yearly'].includes(p))) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const priceIds = portalPlans.filter(p => p !== 'free');
        if (!priceIds.length) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const freePlans = portalPlans.filter(p => p === 'free');
        const resolved = await this._resolvePortalPlanNames(priceIds, freePlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(resolved)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(resolved)
        }, {...options, id: portalPlansSetting.id});
    }

    /** Resolve price ids to plan names, preserving any existing free entries */
    async _resolvePortalPlanNames(priceIds, freePlans, options) {
        const names = [];
        for (const priceId of priceIds) {
            const name = await this.getPlanFromPrice(priceId, options);
            if (name) names.push(name);
        }
        return [...freePlans, ...names];
    }

    /** Remove subscriptions that have no associated price */
    async removeInvalidSubscriptions(options) {
        return this._runInTransaction(this._removeInvalidSubscriptions, options);
    }

    async _removeInvalidSubscriptions(options) {
        const subs = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });
        const invalid = subs.filter(sub => !sub.toJSON().price);
        if (!invalid.length) {
            logging.info('No invalid subscriptions, skipping migration');
            return;
        }

        logging.warn(`Deleting ${invalid.length} invalid subscription(s)`);
        for (const sub of invalid) {
            logging.warn(`Deleting subscription - ${sub.id} - no price found`);
            await sub.destroy(options);
        }
    }

    /** Update default product name from site title if still generic */
    async setDefaultProductName(options) {
        return this._runInTransaction(this._setDefaultProductName, options);
    }

    async _setDefaultProductName(options) {
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

    /** Sync Stripe product names with the default product name */
    async updateStripeProductNamesFromDefaultProduct(options) {
        return this._runInTransaction(this._updateStripeProductNamesFromDefaultProduct, options);
    }

    async _updateStripeProductNamesFromDefaultProduct(options) {
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