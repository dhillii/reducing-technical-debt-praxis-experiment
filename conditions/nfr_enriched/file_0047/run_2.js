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
    MONTHLY_PRICE_ID: 'members_monthly_price_id',
    YEARLY_PRICE_ID: 'members_yearly_price_id',
    TITLE: 'title'
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
        return data[0] || null;
    }

    async _getDefaultStripeProduct(options) {
        const {data} = await this.models.StripeProduct.findPage({...options, limit: 1});
        return data[0] || null;
    }

    async _getSettingValue(key, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        return setting ? setting.get('value') : null;
    }

    async _parseSettingJSON(key, options) {
        const value = await this._getSettingValue(key, options);
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }

    async _updateSetting(key, value, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        if (!setting) {
            return;
        }
        await this.models.Settings.edit(
            {key, value: JSON.stringify(value)},
            {...options, id: setting.id}
        );
        return setting;
    }

    // -------------------------------------------------------------------------
    // Stripe price helpers
    // -------------------------------------------------------------------------

    async findPriceByPlan(plan, options) {
        return this.models.StripePrice.findOne({
            currency: plan.currency ? plan.currency.toLowerCase() : 'usd',
            amount: Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount),
            interval: plan.interval
        }, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        const interval = price && price.get('interval');

        if (interval === INTERVALS.MONTH) return 'monthly';
        if (interval === INTERVALS.YEAR) return 'yearly';
        return null;
    }

    async _addStripePriceModel(stripePrice, stripeProductId, options) {
        return this.models.StripePrice.add({
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

    async _findOrCreateStripePrice(plan, defaultStripeProduct, options) {
        const existingPrice = await this.findPriceByPlan(plan, options);
        if (existingPrice) {
            return;
        }

        logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
        logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);

        try {
            const stripeProductId = defaultStripeProduct.get('stripe_product_id');
            const price = await this.api.createPrice({
                currency: plan.currency,
                amount: plan.amount,
                nickname: plan.name,
                interval: plan.interval,
                active: true,
                type: 'recurring',
                product: stripeProductId
            });

            await this._addStripePriceModel(price, stripeProductId, options);
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async _findOrCreateActivePriceForInterval(interval, defaultPrice, options) {
        const planName = interval === INTERVALS.MONTH ? PLAN_NAMES.MONTHLY : PLAN_NAMES.YEARLY;
        const stripePlans = await this._parseSettingJSON(SETTINGS_KEYS.STRIPE_PLANS, options);
        const plan = stripePlans && stripePlans.find(p => p.name === planName);

        let price = plan
            ? await this.models.StripePrice.findOne({
                amount: plan.amount,
                currency: plan.currency,
                interval,
                active: true
            }, options)
            : null;

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

    async _createDefaultPrice(defaults, options) {
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const stripeProductId = defaultStripeProduct.get('stripe_product_id');

        const price = await this.api.createPrice({
            ...defaults,
            active: true,
            type: 'recurring',
            product: stripeProductId
        });

        return this._addStripePriceModel(price, stripeProductId, options);
    }

    // -------------------------------------------------------------------------
    // Migrations
    // -------------------------------------------------------------------------

    async populateProductsAndPrices(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateProductsAndPrices(opts));
        }

        const [subscriptions, prices, products] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options).then(m => m.toJSON()),
            this.models.StripePrice.findAll(options).then(m => m.toJSON()),
            this.models.StripeProduct.findAll(options).then(m => m.toJSON())
        ]);

        const defaultProduct = await this._getDefaultPaidProduct(options).then(p => p && p.toJSON());

        if (!subscriptions.length || products.length || prices.length || !defaultProduct) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);

            for (const stripePrice of stripePrices) {
                const stripeProduct = stripePrice.product;

                await this.models.StripeProduct.upsert({
                    product_id: defaultProduct.id,
                    stripe_product_id: stripeProduct.id
                }, options);

                await this._addStripePriceModel(stripePrice, stripeProduct.id, options);
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
                if (err && err.statusCode === 404) {
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

        const plans = await this._parseSettingJSON(SETTINGS_KEYS.STRIPE_PLANS, options);
        if (!plans) {
            return;
        }

        let defaultStripeProduct = await this._getDefaultStripeProduct(options);

        if (!defaultStripeProduct) {
            defaultStripeProduct = await this._createDefaultStripeProduct(options);
            if (!defaultStripeProduct) {
                return;
            }
        }

        for (const plan of plans) {
            await this._findOrCreateStripePrice(plan, defaultStripeProduct, options);
        }
    }

    async _createDefaultStripeProduct(options) {
        logging.info('Could not find Stripe Product - creating one');
        const defaultProduct = await this._getDefaultPaidProduct(options);

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

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateMembersMonthlyPriceIdSettings(opts));
        }
        await this._populatePriceIdSetting({
            settingKey: SETTINGS_KEYS.MONTHLY_PRICE_ID,
            interval: INTERVALS.MONTH,
            defaultPrice: DEFAULT_PRICES.monthly,
            label: 'members_monthly_price_id'
        }, options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateMembersYearlyPriceIdSettings(opts));
        }
        await this._populatePriceIdSetting({
            settingKey: SETTINGS_KEYS.YEARLY_PRICE_ID,
            interval: INTERVALS.YEAR,
            defaultPrice: DEFAULT_PRICES.yearly,
            label: 'members_yearly_price_id'
        }, options);
    }

    async _populatePriceIdSetting({settingKey, interval, defaultPrice, label}, options) {
        logging.info(`Populating ${label} from stripe_plans`);

        const priceIdSetting = await this.models.Settings.findOne({key: settingKey}, options);

        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${label}, already populated`);
            return;
        }

        const price = await this._findOrCreateActivePriceForInterval(interval, defaultPrice, options);

        if (!price) {
            logging.warn(`Could not find or create price for ${label}`);
            return;
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateDefaultProductMonthlyPriceId(opts));
        }
        await this._populateDefaultProductPriceId({
            priceColumn: 'monthly_price_id',
            settingKey: SETTINGS_KEYS.MONTHLY_PRICE_ID
        }, options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateDefaultProductYearlyPriceId(opts));
        }
        await this._populateDefaultProductPriceId({
            priceColumn: 'yearly_price_id',
            settingKey: SETTINGS_KEYS.YEARLY_PRICE_ID
        }, options);
    }

    async _populateDefaultProductPriceId({priceColumn, settingKey}, options) {
        const label = priceColumn.replace('_', ' ');
        logging.info(`Migrating ${settingKey} setting to ${priceColumn} column`);

        const defaultProduct = await this._getDefaultPaidProduct(options);

        if (defaultProduct.get(priceColumn)) {
            logging.warn(`Skipping migration, ${label} already set`);
            return;
        }

        const priceId = await this._getSettingValue(settingKey, options);
        await this.models.Product.edit(
            {[priceColumn]: priceId},
            {...options, id: defaultProduct.id}
        );
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this._withTransaction(opts => this.revertPortalPlansSetting(opts));
        }

        logging.info('Migrating portal_plans setting from ids to names');
        const portalPlansSetting = await this.models.Settings.findOne({key: SETTINGS_KEYS.PORTAL_PLANS}, options);

        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return;
        }

        const hasNamedValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
        if (hasNamedValues) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const priceIds = portalPlans.filter(plan => plan !== 'free');
        if