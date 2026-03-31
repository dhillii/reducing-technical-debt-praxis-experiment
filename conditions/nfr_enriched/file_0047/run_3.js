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
    // Settings helpers
    // -------------------------------------------------------------------------

    async _getSetting(key, options) {
        return this.models.Settings.findOne({key}, options);
    }

    async _getSettingValue(key, options) {
        const setting = await this._getSetting(key, options);
        return setting ? setting.get('value') : null;
    }

    async _parseJsonSetting(key, options) {
        const setting = await this._getSetting(key, options);
        try {
            return JSON.parse(setting.get('value'));
        } catch {
            return null;
        }
    }

    async _updateSetting(key, value, settingId, options) {
        await this.models.Settings.edit(
            {key, value: JSON.stringify(value)},
            {...options, id: settingId}
        );
    }

    // -------------------------------------------------------------------------
    // Product helpers
    // -------------------------------------------------------------------------

    async _getDefaultProduct(options) {
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

    // -------------------------------------------------------------------------
    // Price helpers
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

    async _findActivePriceByInterval(interval, options) {
        return this.models.StripePrice
            .where('amount', '>', 0)
            .where({interval, active: true})
            .fetch(options);
    }

    async _createStripePrice(priceData, stripeProductId, options) {
        const price = await this.api.createPrice({
            ...priceData,
            active: true,
            type: 'recurring',
            product: stripeProductId
        });

        return this.models.StripePrice.add({
            stripe_price_id: price.id,
            stripe_product_id: stripeProductId,
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        }, options);
    }

    async _getOrCreateStripeProduct(options) {
        let stripeProduct = await this._getDefaultStripeProduct(options);

        if (!stripeProduct) {
            logging.info('Could not find Stripe Product - creating one');
            const defaultProduct = await this._getDefaultProduct(options);

            if (!defaultProduct) {
                logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
                return null;
            }

            const createdStripeProduct = await this.api.createProduct({
                name: defaultProduct.get('name')
            });

            stripeProduct = await this.models.StripeProduct.add({
                product_id: defaultProduct.id,
                stripe_product_id: createdStripeProduct.id
            }, options);
        }

        return stripeProduct;
    }

    // -------------------------------------------------------------------------
    // Migration methods
    // -------------------------------------------------------------------------

    async populateProductsAndPrices(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateProductsAndPrices(opts));
        }

        const [subscriptions, prices, products, defaultProduct] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options).then(m => m.toJSON()),
            this.models.StripePrice.findAll(options).then(m => m.toJSON()),
            this.models.StripeProduct.findAll(options).then(m => m.toJSON()),
            this._getDefaultProduct(options).then(p => p && p.toJSON())
        ]);

        const shouldMigrate = subscriptions.length > 0
            && products.length === 0
            && prices.length === 0
            && defaultProduct;

        if (!shouldMigrate) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const stripePrices = await this._fetchUniquePricesFromStripe(subscriptions);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this._upsertStripePriceAndProduct(stripePrice, defaultProduct.id, options);
            }
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async _fetchUniquePricesFromStripe(subscriptions) {
        const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
        const stripePrices = [];

        for (const plan of uniquePlans) {
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

    async _upsertStripePriceAndProduct(stripePrice, defaultProductId, options) {
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

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateStripePricesFromStripePlansSetting(opts));
        }

        const plans = await this._parseJsonSetting(SETTINGS_KEYS.STRIPE_PLANS, options);
        if (!plans) return;

        const stripeProduct = await this._getOrCreateStripeProduct(options);
        if (!stripeProduct) return;

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);
            if (!existingPrice) {
                await this._createMissingPlanPrice(plan, stripeProduct, options);
            }
        }
    }

    async _createMissingPlanPrice(plan, stripeProduct, options) {
        logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
        logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);

        try {
            await this._createStripePrice(
                {
                    currency: plan.currency,
                    amount: plan.amount,
                    nickname: plan.name,
                    interval: plan.interval
                },
                stripeProduct.get('stripe_product_id'),
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
        await this._populatePriceIdSetting('monthly', options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateMembersYearlyPriceIdSettings(opts));
        }
        await this._populatePriceIdSetting('yearly', options);
    }

    async _populatePriceIdSetting(period, options) {
        const settingKey = period === 'monthly'
            ? SETTINGS_KEYS.MONTHLY_PRICE_ID
            : SETTINGS_KEYS.YEARLY_PRICE_ID;
        const planName = period === 'monthly' ? PLAN_NAMES.MONTHLY : PLAN_NAMES.YEARLY;
        const interval = period === 'monthly' ? INTERVALS.MONTH : INTERVALS.YEAR;

        logging.info(`Populating ${settingKey} from stripe_plans`);

        const priceIdSetting = await this._getSetting(settingKey, options);
        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${settingKey}, already populated`);
            return;
        }

        const plans = await this._parseJsonSetting(SETTINGS_KEYS.STRIPE_PLANS, options);
        if (!plans) {
            logging.warn(`Skipping population of ${settingKey}, could not parse stripe_plans`);
            return;
        }

        const matchedPlan = plans.find(p => p.name === planName);
        if (!matchedPlan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
            return;
        }

        const price = await this._findOrCreatePrice(matchedPlan, interval, planName, options);
        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    async _findOrCreatePrice(plan, interval, nickname, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${nickname} price from stripe_plans - searching by interval`);
            price = await this._findActivePriceByInterval(interval, options);
        }

        if (!price) {
            logging.info(`Could not find any active ${nickname} price - creating a new one`);
            const stripeProduct = await this._getDefaultStripeProduct(options);
            price = await this._createStripePrice(
                DEFAULT_PRICES[interval === INTERVALS.MONTH ? 'monthly' : 'yearly'],
                stripeProduct.get('stripe_product_id'),
                options
            );
        }

        return price;
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateDefaultProductMonthlyPriceId(opts));
        }
        await this._populateDefaultProductPriceId('monthly', options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this._withTransaction(opts => this.populateDefaultProductYearlyPriceId(opts));
        }
        await this._populateDefaultProductPriceId('yearly', options);
    }

    async _populateDefaultProductPriceId(period, options) {
        const column = `${period}_price_id`;
        const settingKey = period === 'monthly'
            ? SETTINGS_KEYS.MONTHLY_PRICE_ID
            : SETTINGS_KEYS.YEARLY_PRICE_ID;

        logging.info(`Migrating ${settingKey} setting to ${column} column`);

        const defaultProduct = await this._getDefaultProduct(options);
        if (defaultProduct.get(column)) {
            logging.warn(`Skipping migration, ${column} already set`);
            return;
        }

        const priceId = await this._getSettingValue(settingKey, options);
        await this.models.Product.edit(
            {[column]: priceId},
            {...options, id: defaultProduct.id}
        );
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this._withTransaction(opts => this.revertPortalPlansSetting(opts));
        }

        logging.info('Migrating portal_plans setting from ids to names');
        const portalPlansSetting = await this._getSetting(SETTINGS_KEYS.PORTAL_PLANS, options);
        const portalPlans = this._parsePortalPlans(portalPlansSetting);
        if (!portalPlans) return;

        const containsNamedValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
        if (containsNamedValues) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;