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
            await this.updatePortalPlansSettingFromStripePlans();
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

    /**
     * Populate products and prices by syncing with Stripe for existing subscriptions.
     */
    async populateProductsAndPrices(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateProductsAndPrices({transacting});
            });
        }

        const subscriptions = await this._fetchAllSubscriptionData(options);
        const defaultProduct = await this._fetchDefaultPaidProduct(options);

        if (!this._shouldPopulateProductsAndPrices(subscriptions, defaultProduct)) {
            return;
        }

        try {
            await this._syncProductsAndPricesFromStripe(subscriptions, defaultProduct, options);
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    /**
     * Fetches all required models for product/price population.
     */
    async _fetchAllSubscriptionData(options) {
        const [subscriptionModels, priceModels, productModels] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options),
            this.models.StripePrice.findAll(options),
            this.models.StripeProduct.findAll(options)
        ]);
        return {
            subscriptions: subscriptionModels.toJSON(),
            prices: priceModels.toJSON(),
            products: productModels.toJSON()
        };
    }

    /**
     * Fetches the first paid product as the default product.
     */
    async _fetchDefaultPaidProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    /**
     * Determines whether products/prices should be synced from Stripe.
     */
    _shouldPopulateProductsAndPrices(subscriptions, defaultProduct) {
        return subscriptions.subscriptions.length > 0 &&
            subscriptions.products.length === 0 &&
            subscriptions.prices.length === 0 &&
            defaultProduct;
    }

    /**
     * Syncs products and prices from Stripe for relevant subscriptions.
     */
    async _syncProductsAndPricesFromStripe(subscriptions, defaultProduct, options) {
        logging.info(`Populating products and prices for existing stripe customers`);
        const uniquePlans = _.uniq(subscriptions.subscriptions.map(d => _.get(d, 'plan.id')));

        const stripePrices = await this._fetchPricesForPlans(uniquePlans, options);

        logging.info(`Adding ${stripePrices.length} prices from Stripe`);
        for (const stripePrice of stripePrices) {
            const stripeProduct = stripePrice.product;

            await this._upsertStripeProduct(defaultProduct.id, stripeProduct, options);
            await this._addStripePrice(stripePrice, stripeProduct.id, options);
        }
    }

    /**
     * Fetches price data from Stripe for given plan IDs.
     */
    async _fetchPricesForPlans(planIds, options) {
        const stripePrices = [];

        for (const plan of planIds) {
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

    /**
     * Inserts or updates Stripe product data.
     */
    async _upsertStripeProduct(defaultProductId, stripeProduct, options) {
        await this.models.StripeProduct.upsert({
            product_id: defaultProductId,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    /**
     * Adds a new Stripe price record.
     */
    async _addStripePrice(stripePrice, stripeProductId, options) {
        await this.models.StripePrice.add({
            stripe_price_id: stripePrice.id,
            stripe_product_id: stripeProductId,
            active: stripePrice.active,
            nickname: stripePrice.nickname,
            currency: stripePrice.currency,
            amount: stripePrice.unit_amount,
            type: 'recurring',
            interval: stripePrice.recurring.interval
        }, options);
    }

    /**
     * Migrates stripe_plans setting into Stripe Price records.
     */
    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateStripePricesFromStripePlansSetting({transacting});
            });
        }

        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);

        if (!defaultStripeProduct) {
            logging.warn('Skipping stripe_plans → stripe_prices migration due to missing default Stripe product');
            return;
        }

        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        const plans = await this._safeParseSettingValue(plansSetting, 'stripe_plans');

        if (!plans) {
            return;
        }

        for (const plan of plans) {
            await this._maybeAddPriceForPlan(plan, defaultStripeProduct, options);
        }
    }

    /**
     * Safely parses setting value, logging errors if invalid.
     */
    async _safeParseSettingValue(setting, settingKey) {
        try {
            return JSON.parse(setting.get('value'));
        } catch (err) {
            logging.error({message: `Could not parse ${settingKey} setting`, err});
            return null;
        }
    }

    /**
     * Creates or retrieve default Stripe product.
     */
    async _ensureDefaultStripeProduct(options) {
        let defaultStripeProduct = await this._getFirstStripeProduct(options);
        if (!defaultStripeProduct) {
            logging.info('Could not find Stripe Product - creating one');
            const defaultProduct = await this._getDefaultPaidProduct(options);
            if (!defaultProduct) {
                logging.error('Could not find Product - skipping stripe_plans → stripe_prices migration');
                return null;
            }
            const stripeProduct = await this.api.createProduct({
                name: defaultProduct.get('name')
            });
            defaultStripeProduct = await this.models.StripeProduct.add({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);
        }
        return defaultStripeProduct;
    }

    /**
     * Gets the first Stripe product.
     */
    async _getFirstStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        return stripeProductsPage.data[0] || null;
    }

    /**
     * Gets the first paid product.
     */
    async _getDefaultPaidProduct(options) {
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        return productsPage.data[0];
    }

    /**
     * Adds a price for a given plan if it doesn’t already exist.
     */
    async _maybeAddPriceForPlan(plan, defaultStripeProduct, options) {
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

    /**
     * Migrates portal_plans from plan names to price IDs.
     */
    async updatePortalPlansSettingFromStripePlans(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updatePortalPlansSettingFromStripePlans({transacting});
            });
        }

        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        const portalPlans = await this._parsePortalPlansSetting(portalPlansSetting);
        if (!portalPlans) {
            return;
        }

        const containsOldValues = portalPlans.some((plan) => ['monthly', 'yearly'].includes(plan));
        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        const stripePlans = await this._safeParseSettingValue(stripePlansSetting, 'stripe_plans');

        if (!stripePlans) {
            return;
        }

        const newPortalPlans = await this._mapPortalPlansToIds(portalPlans, stripePlans, options);
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    /**
     * Parses portal_plans from settings, logging error if invalid.
     */
    async _parsePortalPlansSetting(setting) {
        try {
            return JSON.parse(setting.get('value'));
        } catch (err) {
            logging.error({
                message: 'Could not parse portal_plans setting, skipping migration',
                err
            });
            return null;
        }
    }

    /**
     * Maps membership plan names to price IDs using stripe_plans mapping.
     */
    async _mapPortalPlansToIds(portalPlans, stripePlans, options) {
        const mapPlanToId = async (plan) => {
            if (plan === 'monthly') {
                const monthlyPlan = stripePlans.find(item => item.name === 'Monthly');
                if (!monthlyPlan) {
                    return null;
                }
                const price = await this.findPriceByPlan(monthlyPlan, options);
                return price ? price.id : null;
            }
            if (plan === 'yearly') {
                const yearlyPlan = stripePlans.find(item => item.name === 'Yearly');
                if (!yearlyPlan) {
                    return null;
                }
                const price = await this.findPriceByPlan(yearlyPlan, options);
                return price ? price.id : null;
            }
            return plan;
        };

        const results = [];
        for (const plan of portalPlans) {
            const mapped = await mapPlanToId(plan);
            if (mapped !== null) {
                results.push(mapped);
            }
        }
        return results;
    }

    /**
     * Populates members_monthly_price_id from stripe_plans.
     */
    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }

        if (await this._isAlreadyPopulated('members_monthly_price_id', options)) {
            return;
        }

        const monthlyPrice = await this._getOrCreateMonthlyPrice(options);
        if (!monthlyPrice) {
            return;
        }

        await this._saveSettingValue('members_monthly_price_id', monthlyPrice.id, options);
    }

    /**
     * Populates members_yearly_price_id from stripe_plans.
     */
    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersYearlyPriceIdSettings({transacting});
            });
        }

        if (await this._isAlreadyPopulated('members_yearly_price_id', options)) {
            return;
        }

        const yearlyPrice = await this._getOrCreateYearlyPrice(options);
        if (!yearlyPrice) {
            return;
        }

        await this._saveSettingValue('members_yearly_price_id', yearlyPrice.id, options);
    }

    /**
     * Checks if a setting is already populated.
     */
    async _isAlreadyPopulated(key, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        return !!setting.get('value');
    }

    /**
     * Saves a setting value.
     */
    async _saveSettingValue(key, value, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        await this.models.Settings.edit({key, value}, {...options, id: setting.id});
    }

    /**
     * Gets or creates monthly price for members_monthly_price_id.
     */
    async _getOrCreateMonthlyPrice(options) {
        const monthlyPlan = await this._findStripePlanByName('Monthly', options);
        if (monthlyPlan) {
            const price = await this.models.StripePrice.findOne({
                amount: monthlyPlan.amount,
                currency: monthlyPlan.currency,
                interval: monthlyPlan.interval,
                active: true
            }, options);
            if (price) {
                return price;
            }
        }

        let price = await this._findActiveMonthlyPrice(options);
        if (!price) {
            logging.info('Could not find any active monthly price – creating one');
            price = await this._createDefaultMonthlyPrice(options);
        }
        return price;
    }

    /**
     * Gets or creates yearly price for members_yearly_price_id.
     */
    async _getOrCreateYearlyPrice(options) {
        const yearlyPlan = await this._findStripePlanByName('Yearly', options);
        if (yearlyPlan) {
            const price = await this.models.StripePrice.findOne({
                amount: yearlyPlan.amount,
                currency: yearlyPlan.currency,
                interval: yearlyPlan.interval,
                active: true
            }, options);
            if (price) {
                return price;
            }
        }

        let price = await this._findActiveYearlyPrice(options);
        if (!price) {
            logging.info('Could not find any active yearly price – creating one');
            price = await this._createDefaultYearlyPrice(options);
        }
        return price;
    }

    /**
     * Finds a Stripe plan by name from stripe_plans setting.
     */
    async _findStripePlanByName(name, options) {
        const setting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        const plans = await this._safeParseSettingValue(setting, 'stripe_plans');
        return plans && plans.find(p => p.name === name);
    }

    /**
     * Finds an active monthly price from existing Stripe prices.
     */
    async _findActiveMonthlyPrice(options) {
        return this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true})
            .fetch(options);
    }

    /**
     * Finds an active yearly price from existing Stripe prices.
     */
    async _findActiveYearlyPrice(options) {
        return this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'year', active: true})
            .fetch(options);
    }

    /**
     * Creates a default monthly Stripe price.
     */
    async _createDefaultMonthlyPrice(options) {
        const defaultStripeProduct = await this._getFirstStripeProduct(options);
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

    /**
     * Creates a default yearly Stripe price.
     */
    async _createDefaultYearlyPrice(options) {
        const defaultStripeProduct = await this._getFirstStripeProduct(options);
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

    /**
     * Populates default product’s monthly_price_id from setting.
     */
    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductMonthlyPriceId({transacting});
            });
        }

        const defaultProduct = await this._getDefaultPaidProduct(options);
        if (!defaultProduct) {
            return;
        }

        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const monthlyPriceId = await this._getSettingValue('members_monthly_price_id', options);
        await this.models.Product.edit({monthly_price_id: monthlyPriceId}, {...options, id: defaultProduct.id});
    }

    /**
     * Populates default product’s yearly_price_id from setting.
     */
    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }

        const defaultProduct = await this._getDefaultPaidProduct(options);
        if (!defaultProduct) {
            return;
        }

        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const yearlyPriceId = await this._getSettingValue('members_yearly_price_id', options);
        await this.models.Product.edit({yearly_price_id: yearlyPriceId}, {...options, id: defaultProduct.id});
    }

    /**
     * Retrieves a setting value by key.
     */
    async _getSettingValue(key, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        return setting.get('value');
    }

    /**
     * Reverts portal_plans back from price IDs to plan names.
     */
    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.revertPortalPlansSetting({transacting});
            });
        }

        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        const portalPlans = await this._parsePortalPlansSetting(portalPlansSetting);
        if (!portalPlans) {
            return;
        }

        if (portalPlans.some(plan => ['monthly', 'yearly'].includes(plan))) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter(plan => plan !== 'free');
        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter(plan => plan === 'free');

        const newPortalPlans = await this._mapPriceIdsToPlanNames(portalPlanIds, options);
        const updatedPortalPlans = [...defaultPortalPlans, ...newPortalPlans];

        logging.info(`Updating portal_plans setting to ${JSON.stringify(updatedPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(updatedPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    /**
     * Maps price IDs to plan names using Stripe Price records.
     */
    async _mapPriceIdsToPlanNames(priceIds, options) {
        const seen = new Set();

        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (plan && !seen.has(plan)) {
                seen.add(plan);
            }
        }

        return Array.from(seen);
    }

    /**
     * Removes subscriptions without a valid price.
     */
    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.removeInvalidSubscriptions({transacting});
            });
        }

        const allSubscriptions = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });

        const invalidSubscriptions = allSubscriptions.filter(sub => !sub.toJSON().price);

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

    /**
     * Sets default product name to site title if still using default.
     */
    async setDefaultProductName(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.setDefaultProductName({transacting});
            });
        }

        const defaultProduct = await this._fetchDefaultPaidProduct(options);
        if (!defaultProduct || defaultProduct.name !== 'Default Product') {
            return;
        }

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
        if (!siteTitle) {
            return;
        }

        await this.models.Product.edit({
            name: siteTitle.get('value')
        }, {
            ...options,
            id: defaultProduct.id
        });
    }

    /**
     * Updates Stripe product names to match site title if still using default.
     */
    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updateStripeProductNamesFromDefaultProduct({transacting});
            });
        }

        const stripeProducts = await this.models.StripeProduct.findPage({
            ...options,
            limit: 'all'
        });

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
        if (!siteTitle) {
            return;
        }

        for (const model of stripeProducts.data) {
            const stripeProductId = model.get('stripe_product_id');
            const stripeProduct = await this.api.getProduct(stripeProductId);
            if (stripeProduct.name === 'Default Product') {
                await this.api.updateProduct(stripeProduct.id, {
                    name: siteTitle.get('value')
                });
            }
        }
    }

    /**
     * Finds price by plan attributes (for compatibility).
     */
    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        return this.models.StripePrice.findOne({
            currency,
            amount,
            interval
        }, options);
    }

    /**
     * Determines plan name from Stripe Price (monthly/yearly/null).
     */
    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({
            id: priceId
        }, options);

        if (!price) {
            return null;
        }

        const interval = price.get('interval');
        if (interval === 'month') {
            return 'monthly';
        }
        if (interval === 'year') {
            return 'yearly';
        }
        return null;
    }
};