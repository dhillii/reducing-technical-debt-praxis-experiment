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

    withTransaction(fn) {
        return this.models.Product.transaction(transacting => fn({transacting}));
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.withTransaction(opts => this.populateProductsAndPrices(opts));
        }

        const [subscriptions, prices, products, defaultProduct] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options).then(m => m.toJSON()),
            this.models.StripePrice.findAll(options).then(m => m.toJSON()),
            this.models.StripeProduct.findAll(options).then(m => m.toJSON()),
            this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'})
                .then(({data}) => data[0]?.toJSON())
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
            const stripePrices = await this._fetchUniquePricesFromSubscriptions(subscriptions);
            logging.info(`Adding ${stripePrices.length} prices from Stripe`);

            for (const stripePrice of stripePrices) {
                await this._upsertStripePriceAndProduct(stripePrice, defaultProduct, options);
            }
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async _fetchUniquePricesFromSubscriptions(subscriptions) {
        const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
        const stripePrices = [];

        for (const plan of uniquePlans) {
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

    async _upsertStripePriceAndProduct(stripePrice, defaultProduct, options) {
        const stripeProduct = stripePrice.product;

        await this.models.StripeProduct.upsert({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);

        await this.models.StripePrice.add(
            this._buildStripePriceData(stripePrice, stripeProduct.id),
            options
        );
    }

    _buildStripePriceData(price, stripeProductId) {
        return {
            stripe_price_id: price.id,
            stripe_product_id: stripeProductId,
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        };
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
        return intervalMap[price?.get('interval')] ?? null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.withTransaction(opts => this.populateStripePricesFromStripePlansSetting(opts));
        }

        const plans = await this._parsePlansFromSettings('stripe_plans', options);
        if (!plans) {
            return;
        }

        const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(options);
        if (!defaultStripeProduct) {
            return;
        }

        for (const plan of plans) {
            await this._ensurePriceExistsForPlan(plan, defaultStripeProduct, options);
        }
    }

    async _parsePlansFromSettings(settingKey, options) {
        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        try {
            return JSON.parse(setting.get('value'));
        } catch (err) {
            return null;
        }
    }

    async _getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        if (stripeProductsPage.data[0]) {
            return stripeProductsPage.data[0];
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

    async _ensurePriceExistsForPlan(plan, defaultStripeProduct, options) {
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

            await this.models.StripePrice.add(
                this._buildStripePriceData(price, defaultStripeProduct.get('stripe_product_id')),
                options
            );
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async updatePortalPlansSetting(plans, options) {
        if (!options) {
            return this.withTransaction(opts => this.updatePortalPlansSetting(plans, opts));
        }

        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);
        const portalPlans = this._parsePortalPlans(portalPlansSetting);

        if (!portalPlans) {
            return;
        }

        const hasOldValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
        if (!hasOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._mapPortalPlansToIds(portalPlans, plans, options);

        await this._savePortalPlansSetting(newPortalPlans, portalPlansSetting, options);
    }

    async _mapPortalPlansToIds(portalPlans, plans, options) {
        const planNameMap = {monthly: 'Monthly', yearly: 'Yearly'};
        const result = [];

        for (const plan of portalPlans) {
            if (!planNameMap[plan]) {
                result.push(plan);
                continue;
            }

            const matchingPlan = plans.find(p => p.name === planNameMap[plan]);
            if (!matchingPlan) {
                continue;
            }

            const price = await this.findPriceByPlan(matchingPlan, options);
            result.push(price.id);
        }

        return result;
    }

    _parsePortalPlans(portalPlansSetting) {
        try {
            return JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return null;
        }
    }

    async _savePortalPlansSetting(plans, portalPlansSetting, options) {
        logging.info(`Updating portal_plans setting to ${JSON.stringify(plans)}`);
        await this.models.Settings.edit(
            {key: 'portal_plans', value: JSON.stringify(plans)},
            {...options, id: portalPlansSetting.id}
        );
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction(opts => this.populateMembersMonthlyPriceIdSettings(opts));
        }

        await this._populatePriceIdSetting({
            settingKey: 'members_monthly_price_id',
            planName: 'Monthly',
            interval: 'month',
            defaultPrice: {currency: 'usd', amount: 5000, nickname: 'Monthly'},
            options
        });
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction(opts => this.populateMembersYearlyPriceIdSettings(opts));
        }

        await this._populatePriceIdSetting({
            settingKey: 'members_yearly_price_id',
            planName: 'Yearly',
            interval: 'year',
            defaultPrice: {currency: 'usd', amount: 500, nickname: 'Yearly'},
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

        const price = await this._findOrCreatePrice({planName, interval, defaultPrice, options});
        if (!price) {
            return;
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    async _findOrCreatePrice({planName, interval, defaultPrice, options}) {
        const plans = await this._parsePlansFromSettings('stripe_plans', options);

        if (!plans) {
            logging.warn(`Skipping price population, could not parse stripe_plans`);
            return null;
        }

        const matchingPlan = plans.find(plan => plan.name === planName);

        if (!matchingPlan) {
            logging.warn(`Skipping price population, could not find ${planName} plan`);
            return null;
        }

        let price = await this.models.StripePrice.findOne({
            amount: matchingPlan.amount,
            currency: matchingPlan.currency,
            interval: matchingPlan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${planName} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval, active: true}).fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${planName} price - creating a new one`);
            price = await this._createDefaultPrice({...defaultPrice, interval}, options);
        }

        return price;
    }

    async _createDefaultPrice({currency, amount, nickname, interval}, options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];

        const price = await this.api.createPrice({
            currency,
            amount,
            nickname,
            interval,
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        return this.models.StripePrice.add(
            this._buildStripePriceData(price, defaultStripeProduct.get('stripe_product_id')),
            options
        );
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.withTransaction(opts => this.populateDefaultProductMonthlyPriceId(opts));
        }

        await this._migrateProductPriceId({
            settingKey: 'members_monthly_price_id',
            productField: 'monthly_price_id',
            options
        });
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.withTransaction(opts => this.populateDefaultProductYearlyPriceId(opts));
        }

        await this._migrateProductPriceId({
            settingKey: 'members_yearly_price_id',
            productField: 'yearly_price_id',
            options
        });
    }

    async _migrateProductPriceId({settingKey, productField, options}) {
        logging.info(`Migrating ${settingKey} setting to ${productField} column`);
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];