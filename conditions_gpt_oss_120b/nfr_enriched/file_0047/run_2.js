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
        await this._populateProductsAndPricesCore(options);
    }

    // Core logic extracted to keep cognitive complexity low
    async _populateProductsAndPricesCore(options) {
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

        if (subscriptions.length === 0 || !defaultProduct) {
            return;
        }
        if (products.length > 0 || prices.length > 0) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans);
            await this._storeStripePrices(stripePrices, defaultProduct.id, options);
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async _fetchStripePrices(planIds) {
        const stripePrices = [];
        for (const planId of planIds) {
            try {
                const price = await this.api.getPrice(planId, {expand: ['product']});
                stripePrices.push(price);
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

    async _storeStripePrices(stripePrices, defaultProductId, options) {
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
                await this._createStripePriceForPlan(plan, defaultStripeProduct, options);
            }
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
        const page = await this.models.StripeProduct.findPage({...options, limit: 1});
        let product = page.data[0];
        if (product) {
            return product;
        }

        logging.info('Could not find Stripe Product - creating one');
        const prodPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
        const defaultProduct = prodPage.data[0];
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

    async _createStripePriceForPlan(plan, stripeProduct, options) {
        try {
            logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
            const price = await this.api.createPrice({
                currency: plan.currency,
                amount: plan.amount,
                nickname: plan.name,
                interval: plan.interval,
                active: true,
                type: 'recurring',
                product: stripeProduct.get('stripe_product_id')
            });

            await this.models.StripePrice.add({
                stripe_price_id: price.id,
                stripe_product_id: stripeProduct.get('stripe_product_id'),
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
        const setting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        let portalPlans;
        try {
            portalPlans = JSON.parse(setting.get('value'));
        } catch {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration'});
            return;
        }

        if (!portalPlans.some(p => ['monthly', 'yearly'].includes(p))) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPlans = await this._mapPortalPlanNamesToIds(portalPlans, plans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPlans)}`);
        await this.models.Settings.edit({key: 'portal_plans', value: JSON.stringify(newPlans)}, {...options, id: setting.id});
    }

    async _mapPortalPlanNamesToIds(portalPlans, allPlans, options) {
        const result = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly') {
                const monthly = allPlans.find(p => p.name === 'Monthly');
                if (monthly) {
                    const price = await this.findPriceByPlan(monthly, options);
                    result.push(price.id);
                }
            } else if (plan === 'yearly') {
                const yearly = allPlans.find(p => p.name === 'Yearly');
                if (yearly) {
                    const price = await this.findPriceByPlan(yearly, options);
                    result.push(price.id);
                }
            } else {
                result.push(plan);
            }
        }
        return result;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }
        logging.info('Populating members_monthly_price_id from stripe_plans');
        const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        if (setting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const monthlyPlan = await this._findPlanByName('Monthly', options);
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        const price = await this._findOrCreateMonthlyPrice(monthlyPlan, options);
        await this.models.Settings.edit({key: 'members_monthly_price_id', value: price.id}, {...options, id: setting.id});
    }

    async _findPlanByName(name, options) {
        const setting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        try {
            const plans = JSON.parse(setting.get('value'));
            return plans.find(p => p.name === name);
        } catch {
            logging.warn(`Skipping population, could not parse stripe_plans`);
            return null;
        }
    }

    async _findOrCreateMonthlyPrice(plan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
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
        const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        if (setting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const yearlyPlan = await this._findPlanByName('Yearly', options);
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        const price = await this._findOrCreateYearlyPrice(yearlyPlan, options);
        await this.models.Settings.edit({key: 'members_yearly_price_id', value: price.id}, {...options, id: setting.id});
    }

    async _findOrCreateYearlyPrice(plan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
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

    async _getDefaultStripeProduct(options) {
        const page = await this.models.StripeProduct.findPage({...options, limit: 1});
        return page.data[0];
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductMonthlyPriceId({transacting});
            });
        }
        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const prodPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = prodPage.data[0];
        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        await this.models.Product.edit({monthly_price_id: setting.get('value')}, {...options, id: defaultProduct.id});
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }
        logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
        const prodPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = prodPage.data[0];
        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        await this.models.Product.edit({yearly_price_id: setting.get('value')}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.revertPortalPlansSetting({transacting});
            });
        }
        logging.info('Migrating portal_plans setting from ids to names');
        const setting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        let portalPlans;
        try {
            portalPlans = JSON.parse(setting.get('value'));
        } catch {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration'});
            return;
        }

        if (portalPlans.some(p => ['monthly', 'yearly'].includes(p))) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const ids = portalPlans.filter(p => p !== 'free');
        if (ids.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const freePlans = portalPlans.filter(p => p === 'free');
        const newPlans = await this._convertPortalPlanIdsToNames(ids, freePlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPlans)}`);
        await this.models.Settings.edit({key: 'portal_plans', value: JSON.stringify(newPlans)}, {...options, id: setting.id});
    }

    async _convertPortalPlanIdsToNames(ids, freePlans, options) {
        const result = [...freePlans];
        for (const priceId of ids) {
            const name = await this.getPlanFromPrice(priceId, options);
            if (name && !result.includes(name)) {
                result.push(name);
            }
        }
        return result;
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.removeInvalidSubscriptions({transacting});
            });
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
            const titleSetting = await this.models.Settings.findOne({key: 'title'}, options);
            if (titleSetting) {
                await this.models.Product.edit({name: titleSetting.get('value')}, {...options, id: defaultProduct.id});
            }
        }
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
        const titleSetting = await this.models.Settings.findOne({key: 'title'}, options);
        if (!titleSetting) {
            return;
        }
        const siteTitle = titleSetting.get('value');

        for (const model of data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));
            if (product.name === 'Default Product') {
                await this.api.updateProduct(product.id, {name: siteTitle});
            }
        }
    }
};