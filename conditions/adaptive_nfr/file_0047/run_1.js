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

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Wraps a transactional method so it auto-starts a transaction when called
     * without options.
     */
    _withTransaction(fn) {
        return (options) => {
            if (!options) {
                return this.models.Product.transaction(transacting => fn({transacting}));
            }
            return fn(options);
        };
    }

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

    async _parseSetting(key, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        try {
            return JSON.parse(setting.get('value'));
        } catch {
            return null;
        }
    }

    async _addStripePrice(priceData, stripeProductId, options) {
        return this.models.StripePrice.add({
            stripe_price_id: priceData.id,
            stripe_product_id: stripeProductId,
            active: priceData.active,
            nickname: priceData.nickname,
            currency: priceData.currency,
            amount: priceData.unit_amount,
            type: 'recurring',
            interval: priceData.recurring.interval
        }, options);
    }

    async _createAndSaveStripePrice({currency, amount, nickname, interval, stripeProductId}, options) {
        const price = await this.api.createPrice({
            currency,
            amount,
            nickname,
            interval,
            active: true,
            type: 'recurring',
            product: stripeProductId
        });
        return this._addStripePrice(price, stripeProductId, options);
    }

    async _updatePortalPlansSetting(newPortalPlans, settingId, options) {
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit(
            {key: 'portal_plans', value: JSON.stringify(newPortalPlans)},
            {...options, id: settingId}
        );
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async execute() {
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return;
        }
        if (this.api.testEnv) {
            logging.info('Stripe is in test mode - skipping migrations');
            return;
        }

        const migrations = [
            () => this.populateProductsAndPrices(),
            () => this.populateStripePricesFromStripePlansSetting(),
            () => this.populateMembersMonthlyPriceIdSettings(),
            () => this.populateMembersYearlyPriceIdSettings(),
            () => this.populateDefaultProductMonthlyPriceId(),
            () => this.populateDefaultProductYearlyPriceId(),
            () => this.revertPortalPlansSetting(),
            () => this.removeInvalidSubscriptions(),
            () => this.setDefaultProductName(),
            () => this.updateStripeProductNamesFromDefaultProduct()
        ];

        try {
            for (const migration of migrations) {
                await migration();
            }
        } catch (err) {
            logging.error(err);
        }
    }

    // -------------------------------------------------------------------------
    // Migrations
    // -------------------------------------------------------------------------

    populateProductsAndPrices(options) {
        return this._withTransaction(async (opts) => {
            const [subscriptions, prices, products, defaultProduct] = await Promise.all([
                this.models.StripeCustomerSubscription.findAll(opts).then(m => m.toJSON()),
                this.models.StripePrice.findAll(opts).then(m => m.toJSON()),
                this.models.StripeProduct.findAll(opts).then(m => m.toJSON()),
                this._getDefaultProduct(opts).then(p => p && p.toJSON())
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
                const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
                const stripePrices = await this._fetchStripePrices(uniquePlans);

                logging.info(`Adding ${stripePrices.length} prices from Stripe`);
                for (const stripePrice of stripePrices) {
                    const stripeProduct = stripePrice.product;
                    await this.models.StripeProduct.upsert({
                        product_id: defaultProduct.id,
                        stripe_product_id: stripeProduct.id
                    }, opts);
                    await this._addStripePrice(stripePrice, stripeProduct.id, opts);
                }
            } catch (e) {
                logging.error('Failed to populate products/prices from stripe');
                logging.error(e);
            }
        })(options);
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

    async findPriceByPlan(plan, options) {
        return this.models.StripePrice.findOne({
            currency: plan.currency ? plan.currency.toLowerCase() : 'usd',
            amount: Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount),
            interval: plan.interval
        }, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        const intervalMap = {month: 'monthly', year: 'yearly'};
        return price ? (intervalMap[price.get('interval')] ?? null) : null;
    }

    populateStripePricesFromStripePlansSetting(options) {
        return this._withTransaction(async (opts) => {
            const plans = await this._parseSetting('stripe_plans', opts);
            if (!plans) {
                return;
            }

            let defaultStripeProduct = await this._getDefaultStripeProduct(opts);

            if (!defaultStripeProduct) {
                defaultStripeProduct = await this._createDefaultStripeProduct(opts);
                if (!defaultStripeProduct) {
                    return;
                }
            }

            for (const plan of plans) {
                const existingPrice = await this.findPriceByPlan(plan, opts);
                if (!existingPrice) {
                    await this._createPlanPrice(plan, defaultStripeProduct, opts);
                }
            }
        })(options);
    }

    async _createDefaultStripeProduct(options) {
        logging.info('Could not find Stripe Product - creating one');
        const defaultProduct = await this._getDefaultProduct(options);

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

    async _createPlanPrice(plan, defaultStripeProduct, options) {
        logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
        logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
        try {
            await this._createAndSaveStripePrice({
                currency: plan.currency,
                amount: plan.amount,
                nickname: plan.name,
                interval: plan.interval,
                stripeProductId: defaultStripeProduct.get('stripe_product_id')
            }, options);
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async updatePortalPlansSetting(plans, options) {
        return this._withTransaction(async (opts) => {
            logging.info('Migrating portal_plans setting from names to ids');
            const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);
            let portalPlans;

            try {
                portalPlans = JSON.parse(portalPlansSetting.get('value'));
            } catch (err) {
                logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
                return;
            }

            const containsOldValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
            if (!containsOldValues) {
                logging.info('Could not find names in portal_plans setting, skipping migration');
                return;
            }

            const newPortalPlans = await this._mapPortalPlansToIds(portalPlans, plans, opts);
            await this._updatePortalPlansSetting(newPortalPlans, portalPlansSetting.id, opts);
        })(options);
    }

    async _mapPortalPlansToIds(portalPlans, plans, options) {
        const planNameMap = {monthly: 'Monthly', yearly: 'Yearly'};
        const result = [];

        for (const plan of portalPlans) {
            if (!planNameMap[plan]) {
                result.push(plan);
                continue;
            }
            const matchedPlan = plans.find(p => p.name === planNameMap[plan]);
            if (!matchedPlan) {
                continue;
            }
            const price = await this.findPriceByPlan(matchedPlan, options);
            result.push(price.id);
        }

        return result;
    }

    populateMembersMonthlyPriceIdSettings(options) {
        return this._withTransaction(async (opts) => {
            await this._populatePriceIdSetting({
                settingKey: 'members_monthly_price_id',
                planName: 'Monthly',
                interval: 'month',
                defaultAmount: 5000,
                defaultCurrency: 'usd',
                defaultNickname: 'Monthly',
                logLabel: 'members_monthly_price_id'
            }, opts);
        })(options);
    }

    populateMembersYearlyPriceIdSettings(options) {
        return this._withTransaction(async (opts) => {
            await this._populatePriceIdSetting({
                settingKey: 'members_yearly_price_id',
                planName: 'Yearly',
                interval: 'year',
                defaultAmount: 500,
                defaultCurrency: 'usd',
                defaultNickname: 'Yearly',
                logLabel: 'members_yearly_price_id'
            }, opts);
        })(options);
    }

    async _populatePriceIdSetting({settingKey, planName, interval, defaultAmount, defaultCurrency, defaultNickname, logLabel}, options) {
        logging.info(`Populating ${logLabel} from stripe_plans`);
        const priceIdSetting = await this.models.Settings.findOne({key: settingKey}, options);

        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${logLabel}, already populated`);
            return;
        }

        const plans = await this._parseSetting('stripe_plans', options);
        if (!plans) {
            logging.warn(`Skipping population of ${logLabel}, could not parse stripe_plans`);
            return;
        }

        const matchedPlan = plans.find(p => p.name === planName);
        if (!matchedPlan) {
            logging.warn(`Skipping population of ${logLabel}, could not find ${planName} plan`);
            return;
        }

        let price = await this.models.StripePrice.findOne({
            amount: matchedPlan.amount,
            currency: matchedPlan.currency,
            interval: matchedPlan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${planName} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval, active: true}).fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${planName} price - creating a new one`);
            const defaultStripeProduct = await this._getDefaultStripeProduct(options);
            price = await this._createAndSaveStripePrice({
                currency: defaultCurrency,
                amount: defaultAmount,
                nickname: defaultNickname,
                interval,
                stripeProductId: defaultStripeProduct.get('stripe_product_id')
            }, options);
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    populateDefaultProductMonthlyPriceId(options) {
        return this._withTransaction(async (opts) => {
            await this._populateDefaultProductPriceId({
                settingKey: 'members_monthly_price_id',
                productField: 'monthly_price_id',
                logLabel: 'monthly_price_id'
            }, opts);
        })(options);
    }

    populateDefaultProductYearlyPriceId(options) {
        return this._withTransaction(async (opts) => {
            await this._populateDefaultProductPriceId({
                settingKey: 'members_yearly_price_id',
                productField: 'yearly_price_id',
                logLabel: 'yearly_price_id'
            }, opts);
        })(options);
    }

    async _populateDefaultProductPriceId({settingKey, productField, logLabel}, options) {
        logging.info(`Migrating ${settingKey} setting to ${logLabel} column`);
        const defaultProduct = await this._getDefaultProduct(options);

        if (defaultProduct.get(productField)) {
            logging.warn(`Skipping migration, ${logLabel} already set`);
            return;
        }

        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        await this.models.Product.edit(
            {[productField]: setting.get('value')},
            {...options, id: defaultProduct.id}
        );
    }

    revertPortalPlansSetting(options) {
        return this._withTransaction(async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlansSetting = await this.models.Settings.findOne({