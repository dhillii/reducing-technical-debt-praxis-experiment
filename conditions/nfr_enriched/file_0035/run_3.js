Here's the refactored code with reduced complexity through extracted helper methods, eliminated duplication, and improved readability:

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
    constructor({ models, api }) {
        this.models = models;
        this.api = api;
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

        for (const migration of migrations) {
            try {
                await migration();
            } catch (err) {
                logging.error(err);
            }
        }
    }

    async populateProductsAndPrices(options) {
        return this._withTransaction(options, async (opts) => {
            const [subscriptions, prices, products, defaultProduct] = await Promise.all([
                this._findAllAsJSON('StripeCustomerSubscription', opts),
                this._findAllAsJSON('StripePrice', opts),
                this._findAllAsJSON('StripeProduct', opts),
                this._getDefaultProduct(opts)
            ]);

            const shouldPopulate = subscriptions.length > 0
                && products.length === 0
                && prices.length === 0
                && defaultProduct;

            if (!shouldPopulate) {
                return;
            }

            try {
                logging.info('Populating products and prices for existing stripe customers');
                const stripePrices = await this._fetchUniquePricesFromStripe(subscriptions);
                logging.info(`Adding ${stripePrices.length} prices from Stripe`);

                for (const stripePrice of stripePrices) {
                    await this._upsertStripePriceAndProduct(stripePrice, defaultProduct.id, opts);
                }
            } catch (err) {
                logging.error('Failed to populate products/prices from stripe');
                logging.error(err);
            }
        });
    }

    async populateStripePricesFromStripePlansSetting(options) {
        return this._withTransaction(options, async (opts) => {
            const plans = await this._parseSettingJSON('stripe_plans', opts);
            if (!plans) {
                return;
            }

            const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(opts);
            if (!defaultStripeProduct) {
                return;
            }

            for (const plan of plans) {
                await this._ensurePriceExistsForPlan(plan, defaultStripeProduct, opts);
            }
        });
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        return this._withTransaction(options, async (opts) => {
            await this._populatePriceIdSetting({
                settingKey: 'members_monthly_price_id',
                planName: 'Monthly',
                interval: 'month',
                defaultAmount: 5000,
                options: opts
            });
        });
    }

    async populateMembersYearlyPriceIdSettings(options) {
        return this._withTransaction(options, async (opts) => {
            await this._populatePriceIdSetting({
                settingKey: 'members_yearly_price_id',
                planName: 'Yearly',
                interval: 'year',
                defaultAmount: 500,
                options: opts
            });
        });
    }

    async populateDefaultProductMonthlyPriceId(options) {
        return this._withTransaction(options, async (opts) => {
            await this._migrateProductPriceId({
                priceColumn: 'monthly_price_id',
                settingKey: 'members_monthly_price_id',
                options: opts
            });
        });
    }

    async populateDefaultProductYearlyPriceId(options) {
        return this._withTransaction(options, async (opts) => {
            await this._migrateProductPriceId({
                priceColumn: 'yearly_price_id',
                settingKey: 'members_yearly_price_id',
                options: opts
            });
        });
    }

    async revertPortalPlansSetting(options) {
        return this._withTransaction(options, async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlansSetting = await this.models.Settings.findOne({ key: 'portal_plans' }, opts);
            const portalPlans = this._parseJSON(portalPlansSetting.get('value'), 'portal_plans');

            if (!portalPlans) {
                return;
            }

            if (this._containsNamedPlans(portalPlans)) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const planIds = portalPlans.filter(plan => plan !== 'free');
            if (planIds.length === 0) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const freePlans = portalPlans.filter(plan => plan === 'free');
            const newPortalPlans = await this._resolvePortalPlanNames(planIds, freePlans, opts);

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this._editSetting('portal_plans', newPortalPlans, portalPlansSetting.id, opts);
        });
    }

    async removeInvalidSubscriptions(options) {
        return this._withTransaction(options, async (opts) => {
            const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({
                ...opts,
                withRelated: ['stripePrice']
            });

            const invalidSubscriptions = subscriptionModels.filter(sub => !sub.toJSON().price);

            if (invalidSubscriptions.length === 0) {
                logging.info('No invalid subscriptions, skipping migration');
                return;
            }

            logging.warn(`Deleting ${invalidSubscriptions.length} invalid subscription(s)`);
            for (const sub of invalidSubscriptions) {
                logging.warn(`Deleting subscription - ${sub.id} - no price found`);
                await sub.destroy(opts);
            }
        });
    }

    async setDefaultProductName(options) {
        return this._withTransaction(options, async (opts) => {
            const defaultProduct = await this._getDefaultProduct(opts);

            if (!defaultProduct || defaultProduct.name !== 'Default Product') {
                return;
            }

            const siteTitle = await this.models.Settings.findOne({ key: 'title' }, opts);
            if (siteTitle) {
                await this.models.Product.edit(
                    { name: siteTitle.get('value') },
                    { ...opts, id: defaultProduct.id }
                );
            }
        });
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        return this._withTransaction(options, async (opts) => {
            const { data } = await this.models.StripeProduct.findPage({ ...opts, limit: 'all' });
            const siteTitle = await this.models.Settings.findOne({ key: 'title' }, opts);

            if (!siteTitle) {
                return;
            }

            for (const model of data) {
                const product = await this.api.getProduct(model.get('stripe_product_id'));
                if (product.name === 'Default Product') {
                    await this.api.updateProduct(product.id, { name: siteTitle.get('value') });
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // Shared helpers
    // -------------------------------------------------------------------------

    /**
     * Wraps a function in a transaction if no options are provided.
     */
    _withTransaction(options, fn) {
        if (!options) {
            return this.models.Product.transaction(transacting => fn({ transacting }));
        }
        return fn(options);
    }

    async _findAllAsJSON(modelName, options) {
        const models = await this.models[modelName].findAll(options);
        return models.toJSON();
    }

    async _getDefaultProduct(options) {
        const { data } = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    async _getDefaultStripeProduct(options) {
        const { data } = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
        return data[0];
    }

    _parseJSON(value, label) {
        try {
            return JSON.parse(value);
        } catch (err) {
            logging.error({ message: `Could not parse ${label} setting, skipping migration`, err });
            return null;
        }
    }

    async _parseSettingJSON(key, options) {
        const setting = await this.models.Settings.findOne({ key }, options);
        return this._parseJSON(setting.get('value'), key);
    }

    _containsNamedPlans(plans) {
        return plans.some(plan => ['monthly', 'yearly'].includes(plan));
    }

    async _editSetting(key, value, id, options) {
        await this.models.Settings.edit(
            { key, value: JSON.stringify(value) },
            { ...options, id }
        );
    }

    async _addStripePrice(priceData, options) {
        return this.models.StripePrice.add({
            stripe_price_id: priceData.id,
            stripe_product_id: priceData.stripe_product_id,
            active: priceData.active,
            nickname: priceData.nickname,
            currency: priceData.currency,
            amount: priceData.unit_amount,
            type: 'recurring',
            interval: priceData.recurring.interval
        }, options);
    }

    // -------------------------------------------------------------------------
    // populateProductsAndPrices helpers
    // -------------------------------------------------------------------------

    async _fetchUniquePricesFromStripe(subscriptions) {
        const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
        const stripePrices = [];

        for (const plan of uniquePlans) {
            try {
                const stripePrice = await this.api.getPrice(plan, { expand: ['product'] });
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

        await this._addStripePrice({
            ...stripePrice,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    // -------------------------------------------------------------------------
    // populateStripePricesFromStripePlansSetting helpers
    // -------------------------------------------------------------------------

    async _getOrCreateDefaultStripeProduct(options) {
        const existing = await this._getDefaultStripeProduct(options);
        if (existing) {
            return existing;
        }

        logging.info('Could not find Stripe Product - creating one');
        const productsPage = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type: paid'
        });
        const defaultProduct = productsPage.data[0];

        if (!defaultProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return null;
        }

        const stripeProduct = await this.api.createProduct({ name: defaultProduct.get('name') });

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
        logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);

        try {
            const price = await this.api.createPrice({
                currency: plan.currency,
                amount: plan.amount,
                nickname: plan.name,
                interval: plan.interval,
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            });

            await this._addStripePrice({
                ...price,
                stripe_product_id: defaultStripeProduct.get('stripe_product_id')
            }, options);
        } catch (err) {
            logging.error({ err, message: 'Adding price failed' });
        }
    }

    // -------------------------------------------------------------------------
    // populateMembersMonthlyPriceIdSettings / populateMembersYearlyPriceIdSettings
    // -------------------------------------------------------------------------

    async _populatePriceIdSetting({ settingKey, planName, interval, defaultAmount, options }) {
        logging.info(`Populating ${settingKey} from stripe_plans`);
        const priceIdSetting = await this.models.Settings.findOne({ key: settingKey }, options);

        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${settingKey}, already populated`);
            return;
        }

        const plans = await this._parseSettingJSON('stripe_plans', options);
        if (!plans) {
            logging.warn(`Skipping population of ${settingKey}, could not parse stripe_plans`);
            return;
        }

        const matchedPlan = plans.find(plan => plan.name === planName);
        if (!matchedPlan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
            return;
        }

        const price = await this._findOrCreatePrice(matchedPlan, interval, defaultAmount, planName, options);
        await this.models.Settings.edit(
            { key: settingKey, value: price.id },
            { ...options, id: priceIdSetting.id }
        );
    }

    async _findOrCreatePrice(plan, interval, defaultAmount, nickname, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${nickname} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice
                .where('amount', '>', 0)
                .where({ interval, active: true })
                .fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${nickname} price - creating a new one`);
            price = await this._createDefaultPrice({ interval, nickname, defaultAmount, options });
        }

        return price;
    }

    async _createDefaultPrice({ interval, nickname, defaultAmount, options }) {
        const defaultStripeProduct = await this._getDefaultStripeProduct(options);
        const stripeProductId = defaultStripeProduct.get('stripe_product_id');

        const price = await this.api.createPrice({
            currency: 'usd',
            amount: defaultAmount,
            nickname,
            interval,
            active: true,
            type: 'recurring',
            product: stripeProductId
        });

        return this._addStripePrice({
            ...price,
            stripe_product_id: stripeProductId
        }, options);
    }

    // -------------------------------------------------------------------------
    // populateDefaultProductMonthlyPriceId / populateDefaultProductYearlyPriceId
    // -------------------------------------------------------------------------

    async _migrateProductPriceId({ priceColumn, settingKey, options }) {
        logging.info(`Migrating ${settingKey} setting to ${priceColumn} column`);
        const defaultProduct = await this._getDefaultProduct(options);

        if (defaultProduct.get(priceColumn)) {
            logging.warn(`Skipping migration, ${priceColumn} already set`);
            return;
        }

        const setting = await this.models.Settings.findOne({ key: settingKey }, options);
        await this.models.Product.edit(
            { [priceColumn]: setting.get('value') },
            { ...options, id: defaultProduct.id }
        );
    }

    // -------------------------------------------------------------------------
    // revertPortalPlansSetting helpers
    // -------------------------------------------------------------------------

    async _resolvePortalPlanNames(planIds, initialPlans, options) {
        return planIds.reduce(async (accPromise, priceId) => {
            const acc = await accPromise;
            const plan = await this.getPlanFromPrice(priceId, options);

            if (!plan) {
                return acc;
            }

            return [...acc.filter(d => d !== plan), plan];
        }, Promise.resolve(initialPlans));
    }

    // -------------------------------------------------------------------------
    // Utility methods (used externally or by multiple methods)
    // -------------------------------------------------------------------------

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        return this.models.StripePrice.findOne({ currency, amount, interval }, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({ id: priceId }, options);

        if (price?.get('interval') === 'month') {
            return 'monthly';
        }
        if (price?.get('interval') === 'year') {
            return 'yearly';
        }
        return null;
    }
};
```

Key refactoring changes made:

1. **Extracted `_withTransaction`** – Eliminated the repeated `if (!options) { return this.models.Product.transaction(...) }` pattern across every public method.

2. **Extracted `_addStripePrice`** – The identical price-creation payload was duplicated in four places; now centralised.

3. **Extracted `_populatePriceIdSetting`** – `populateMembersMonthlyPriceIdSettings` and `populateMembersYearlyPriceIdSettings` were near-identical; merged into one parameterised helper.

4. **Extracted `_migrateProductPriceId`** – Same duplication between monthly/yearly product price ID migration.

5. **Extracted `_getDefaultProduct`, `_getDefaultStripeProduct`, `_findAllAsJSON`** – Repeated model-fetching patterns centralised.

6. **Extracted `_parseJSON` / `_parseSettingJSON`** – Repeated try/catch JSON parsing consolidated.

7. **Extracted `_fetchUniquePricesFromStripe`, `_upsertStripePriceAndProduct`** – Broke up the large `populateProductsAndPrices` method.

8. **Extracted `_getOrCreateDefaultStripeProduct`, `_ensurePriceExistsForPlan`** – Broke up `populateStripePricesFromStripePlansSetting`.

9. **Extracted `_findOrCreatePrice`, `_createDefaultPrice`** – Shared price-finding logic between monthly/yearly helpers.

10. **`execute` uses a loop** instead of sequential `await` calls, making it easier to add/remove migration steps.