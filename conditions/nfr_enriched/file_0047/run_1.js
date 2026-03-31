```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

const INTERVALS = {
    MONTH: 'month',
    YEAR: 'year'
};

const PLAN_NAMES = {
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly'
};

const SETTINGS_KEYS = {
    STRIPE_PLANS: 'stripe_plans',
    PORTAL_PLANS: 'portal_plans',
    MEMBERS_MONTHLY_PRICE_ID: 'members_monthly_price_id',
    MEMBERS_YEARLY_PRICE_ID: 'members_yearly_price_id',
    SITE_TITLE: 'title'
};

const DEFAULT_PRICES = {
    monthly: {currency: 'usd', amount: 5000, nickname: 'Monthly', interval: INTERVALS.MONTH},
    yearly: {currency: 'usd', amount: 500, nickname: 'Yearly', interval: INTERVALS.YEAR}
};

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

    // -------------------------------------------------------------------------
    // Transaction wrapper utility
    // -------------------------------------------------------------------------

    _withTransaction(fn) {
        return this.models.Product.transaction(transacting => fn({transacting}));
    }

    // -------------------------------------------------------------------------
    // Model helpers
    // -------------------------------------------------------------------------

    async _getDefaultPaidProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0];
    }

    async _getDefaultStripeProduct(options) {
        const {data} = await this.models.StripeProduct.findPage({...options, limit: 1});
        return data[0];
    }

    async _parseSetting(key, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        try {
            return {setting, value: JSON.parse(setting.get('value'))};
        } catch (err) {
            return {setting, value: null};
        }
    }

    async _updateSetting(key, value, settingId, options) {
        await this.models.Settings.edit(
            {key, value: JSON.stringify(value)},
            {...options, id: settingId}
        );
    }

    // -------------------------------------------------------------------------
    // Stripe price helpers
    // -------------------------------------------------------------------------

    async _stripePriceFromModel(price) {
        return {
            stripe_price_id: price.id,
            stripe_product_id: price.product?.id ?? price.stripe_product_id,
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        };
    }

    async _createAndSaveStripePrice(priceData, stripeProductId, options) {
        const price = await this.api.createPrice({
            ...priceData,
            active: true,
            type: 'recurring',
            product: stripeProductId
        });

        return this.models.StripePrice.add(
            await this._stripePriceFromModel({...price, stripe_product_id: stripeProductId}),
            options
        );
    }

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);

        return this.models.StripePrice.findOne(
            {currency, amount, interval: plan.interval},
            options
        );
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);

        if (!price) {
            return null;
        }

        const intervalMap = {
            [INTERVALS.MONTH]: 'monthly',
            [INTERVALS.YEAR]: 'yearly'
        };

        return intervalMap[price.get('interval')] ?? null;
    }

    // -------------------------------------------------------------------------
    // Migrations
    // -------------------------------------------------------------------------

    async populateProductsAndPrices(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateProductsAndPrices(opts));
        }

        const [subscriptions, prices, products, defaultProduct] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options).then(m => m.toJSON()),
            this.models.StripePrice.findAll(options).then(m => m.toJSON()),
            this.models.StripeProduct.findAll(options).then(m => m.toJSON()),
            this._getDefaultPaidProduct(options).then(p => p?.toJSON())
        ]);

        const shouldMigrate =
            subscriptions.length > 0 &&
            products.length === 0 &&
            prices.length === 0 &&
            defaultProduct;

        if (!shouldMigrate) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);

            for (const stripePrice of stripePrices) {
                const stripeProduct = stripePrice.product;

                await this.models.StripeProduct.upsert(
                    {product_id: defaultProduct.id, stripe_product_id: stripeProduct.id},
                    options
                );

                await this.models.StripePrice.add(
                    await this._stripePriceFromModel({...stripePrice, product: stripeProduct}),
                    options
                );
            }
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async _fetchStripePrices(plans) {
        const stripePrices = [];

        for (const plan of plans) {
            try {
                const stripePrice = await this.api.getPrice(plan, {expand: ['product']});
                stripePrices.push(stripePrice);
            } catch (err) {
                if (err?.statusCode === 404) {
                    logging.warn(`Plan ${plan} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }

        return stripePrices;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateStripePricesFromStripePlansSetting(opts));
        }

        const {value: plans} = await this._parseSetting(SETTINGS_KEYS.STRIPE_PLANS, options);
        if (!plans) {
            return;
        }

        const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(options);
        if (!defaultStripeProduct) {
            return;
        }

        for (const plan of plans) {
            await this._ensureStripePriceExists(plan, defaultStripeProduct, options);
        }
    }

    async _getOrCreateDefaultStripeProduct(options) {
        let defaultStripeProduct = await this._getDefaultStripeProduct(options);

        if (defaultStripeProduct) {
            return defaultStripeProduct;
        }

        logging.info('Could not find Stripe Product - creating one');
        const defaultProduct = await this._getDefaultPaidProduct(options);

        if (!defaultProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return null;
        }

        const stripeProduct = await this.api.createProduct({name: defaultProduct.get('name')});

        return this.models.StripeProduct.add(
            {product_id: defaultProduct.id, stripe_product_id: stripeProduct.id},
            options
        );
    }

    async _ensureStripePriceExists(plan, defaultStripeProduct, options) {
        const existingPrice = await this.findPriceByPlan(plan, options);

        if (existingPrice) {
            return;
        }

        logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
        logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);

        try {
            await this._createAndSaveStripePrice(
                {
                    currency: plan.currency,
                    amount: plan.amount,
                    nickname: plan.name,
                    interval: plan.interval
                },
                defaultStripeProduct.get('stripe_product_id'),
                options
            );
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateMembersMonthlyPriceIdSettings(opts));
        }

        await this._populatePriceIdSetting({
            settingKey: SETTINGS_KEYS.MEMBERS_MONTHLY_PRICE_ID,
            planName: PLAN_NAMES.MONTHLY,
            interval: INTERVALS.MONTH,
            defaultPrice: DEFAULT_PRICES.monthly,
            options
        });
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateMembersYearlyPriceIdSettings(opts));
        }

        await this._populatePriceIdSetting({
            settingKey: SETTINGS_KEYS.MEMBERS_YEARLY_PRICE_ID,
            planName: PLAN_NAMES.YEARLY,
            interval: INTERVALS.YEAR,
            defaultPrice: DEFAULT_PRICES.yearly,
            options
        });
    }

    async _populatePriceIdSetting({settingKey, planName, interval, defaultPrice, options}) {
        logging.info(`Populating ${settingKey} from stripe_plans`);
        const priceIdSetting = await this.models.Settings.findOne({key: settingKey}, options);

        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${settingKey}, already populated`);
            return;
        }

        const price = await this._findOrCreatePriceForInterval({
            settingKey,
            planName,
            interval,
            defaultPrice,
            options
        });

        if (!price) {
            return;
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    async _findOrCreatePriceForInterval({settingKey, planName, interval, defaultPrice, options}) {
        const {value: plans} = await this._parseSetting(SETTINGS_KEYS.STRIPE_PLANS, options);

        if (!plans) {
            logging.warn(`Skipping population of ${settingKey}, could not parse stripe_plans`);
            return null;
        }

        const matchedPlan = plans.find(p => p.name === planName);

        if (!matchedPlan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
            return null;
        }

        let price = await this.models.StripePrice.findOne(
            {amount: matchedPlan.amount, currency: matchedPlan.currency, interval: matchedPlan.interval, active: true},
            options
        );

        if (!price) {
            logging.info(`Could not find active ${planName} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice
                .where('amount', '>', 0)
                .where({interval, active: true})
                .fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${planName} price - creating a new one`);
            price = await this._createDefaultPrice(defaultPrice, options);
        }

        return price;
    }

    async _createDefaultPrice(priceData, options) {
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const stripeProductId = defaultStripeProduct.get('stripe_product_id');

        return this._createAndSaveStripePrice(priceData, stripeProductId, options);
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateDefaultProductMonthlyPriceId(opts));
        }

        await this._migrateProductPriceId({
            settingKey: SETTINGS_KEYS.MEMBERS_MONTHLY_PRICE_ID,
            productField: 'monthly_price_id',
            options
        });
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateDefaultProductYearlyPriceId(opts));
        }

        await this._migrateProductPriceId({
            settingKey: SETTINGS_KEYS.MEMBERS_YEARLY_PRICE_ID,
            productField: 'yearly_price_id',
            options
        });
    }

    async _migrateProductPriceId({settingKey, productField, options}) {
        logging.info(`Migrating ${settingKey} setting to ${productField} column`);
        const defaultProduct = await this._getDefaultPaidProduct(options);

        if (defaultProduct.get(productField)) {
            logging.warn(`Skipping migration, ${productField} already set`);
            return;
        }

        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        await this.models.Product.edit(
            {[productField]: setting.get('value')},
            {...options, id: defaultProduct.id}
        );
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this._withTransaction(opts => this.revertPortalPlansSetting(opts));
        }

        logging.info('Migrating portal_plans setting from ids to names');
        const {setting: portalPlansSetting, value: portalPlans} =
            await this._parseSetting(SETTINGS_KEYS.PORTAL_PLANS, options);

        if (!portalPlans) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration'});
            return;
        }