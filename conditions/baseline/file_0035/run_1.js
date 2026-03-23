Here's the refactored code with reduced complexity through several improvements:

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
            return logging.info('Stripe not configured - skipping migrations');
        }

        if (this.api.testEnv) {
            return logging.info('Stripe is in test mode - skipping migrations');
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
        return this._withTransaction(options, async (opts) => {
            const [subscriptions, prices, products, defaultProduct] = await Promise.all([
                this._findAllAsJSON('StripeCustomerSubscription', opts),
                this._findAllAsJSON('StripePrice', opts),
                this._findAllAsJSON('StripeProduct', opts),
                this._findDefaultPaidProduct(opts)
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
                    await this._upsertStripePriceAndProduct(stripePrice, defaultProduct, opts);
                }
            } catch (e) {
                logging.error('Failed to populate products/prices from stripe');
                logging.error(e);
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

            const hasNamedValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
            if (hasNamedValues) {
                return logging.info('The portal_plans setting already contains names, skipping migration');
            }

            const freePlans = portalPlans.filter(plan => plan === 'free');
            const priceIds = portalPlans.filter(plan => plan !== 'free');

            if (priceIds.length === 0) {
                return logging.info('No price ids found in portal_plans setting, skipping migration');
            }

            const newPortalPlans = await this._resolvePortalPlanNames(priceIds, freePlans, opts);

            await this._savePortalPlansSetting(newPortalPlans, portalPlansSetting, opts);
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
                return logging.info('No invalid subscriptions, skipping migration');
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
            const defaultProduct = await this._findDefaultPaidProduct(opts);

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

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);

        return this.models.StripePrice.findOne(
            { currency, amount, interval: plan.interval },
            options
        );
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({ id: priceId }, options);
        const intervalMap = { month: 'monthly', year: 'yearly' };
        return price ? (intervalMap[price.get('interval')] ?? null) : null;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Wraps a function in a transaction if no options are provided.
     */
    async _withTransaction(options, fn) {
        if (!options) {
            return this.models.Product.transaction(transacting => fn({ transacting }));
        }
        return fn(options);
    }

    async _findAllAsJSON(modelName, options) {
        const models = await this.models[modelName].findAll(options);
        return models.toJSON();
    }

    async _findDefaultPaidProduct(options) {
        const { data } = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] ? data[0].toJSON() : null;
    }

    async _fetchUniquePricesFromStripe(subscriptions) {
        const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
        const stripePrices = [];

        for (const plan of uniquePlans) {
            try {
                const stripePrice = await this.api.getPrice(plan, { expand: ['product'] });
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

    async _getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
        if (stripeProductsPage.data[0]) {
            return stripeProductsPage.data[0];
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
            logging.error({ err, message: 'Adding price failed' });
        }
    }

    /**
     * Shared logic for populateMembersMonthlyPriceIdSettings and
     * populateMembersYearlyPriceIdSettings.
     */
    async _populatePriceIdSetting({ settingKey, planName, interval, defaultAmount, options }) {
        logging.info(`Populating ${settingKey} from stripe_plans`);
        const priceIdSetting = await this.models.Settings.findOne({ key: settingKey }, options);

        if (priceIdSetting.get('value')) {
            return logging.info(`Skipping population of ${settingKey}, already populated`);
        }

        const plans = await this._parseSettingJSON('stripe_plans', options);
        if (!plans) {
            return logging.warn(`Skipping population of ${settingKey}, could not parse stripe_plans`);
        }

        const matchingPlan = plans.find(plan => plan.name === planName);
        if (!matchingPlan) {
            return logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
        }

        let price = await this.models.StripePrice.findOne({
            amount: matchingPlan.amount,
            currency: matchingPlan.currency,
            interval: matchingPlan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${planName} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice
                .where('amount', '>', 0)
                .where({ interval, active: true })
                .fetch(options);
        }

        if (!price) {
            price = await this._createDefaultPrice({ planName, interval, defaultAmount, options });
        }

        await this.models.Settings.edit(
            { key: settingKey, value: price.id },
            { ...options, id: priceIdSetting.id }
        );
    }

    async _createDefaultPrice({ planName, interval, defaultAmount, options }) {
        logging.info(`Could not find any active ${planName} price - creating a new one`);
        const stripeProductsPage = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
        const defaultStripeProduct = stripeProductsPage.data[0];

        const price = await this.api.createPrice({
            currency: 'usd',
            amount: defaultAmount,
            nickname: planName,
            interval,
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

    /**
     * Shared logic for populateDefaultProductMonthlyPriceId and
     * populateDefaultProductYearlyPriceId.
     */
    async _migrateProductPriceId({ priceColumn, settingKey, options }) {
        logging.info(`Migrating ${settingKey} setting to ${priceColumn} column`);
        const productsPage = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get(priceColumn)) {
            return logging.warn(`Skipping migration, ${priceColumn} already set`);
        }

        const setting = await this.models.Settings.findOne({ key: settingKey }, options);
        await this.models.Product.edit(
            { [priceColumn]: setting.get('value') },
            { ...options, id: defaultProduct.id }
        );
    }

    async _resolvePortalPlanNames(priceIds, initialPlans, options) {
        const newPortalPlans = [...initialPlans];

        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (plan && !newPortalPlans.includes(plan)) {
                newPortalPlans.push(plan);
            }
        }

        return newPortalPlans;
    }

    async _savePortalPlansSetting(newPortalPlans, portalPlansSetting, options) {
        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit(
            { key: 'portal_plans', value: JSON.stringify(newPortalPlans) },
            { ...options, id: portalPlansSetting.id }
        );
    }

    /**
     * Safely parses a JSON setting value. Returns null on failure.
     */
    async _parseSettingJSON(key, options) {
        const setting = await this.models.Settings.findOne({ key }, options);
        return this._parseJSON(setting.get('value'), key);
    }

    _parseJSON(value, label) {
        try {
            return JSON.parse(value);
        } catch (err) {
            logging.error({ message: `Could not parse ${label} setting`, err });
            return null;
        }
    }
};
```

Key refactoring decisions:

1. **`_withTransaction` helper** — Eliminates the repeated `if (!options) { return this.models.Product.transaction(...) }` guard in every public method.

2. **`_populatePriceIdSetting`** — Merges the near-identical `populateMembersMonthlyPriceIdSettings` and `populateMembersYearlyPriceIdSettings` into one parameterised helper.

3. **`_migrateProductPriceId`** — Merges the near-identical `populateDefaultProductMonthlyPriceId` and `populateDefaultProductYearlyPriceId`.

4. **`_createDefaultPrice`** — Extracts the repeated "create a fallback price" logic shared by both price-ID population methods.

5. **`_fetchUniquePricesFromStripe` / `_upsertStripePriceAndProduct`** — Breaks up the large `populateProductsAndPrices` body into focused helpers.

6. **`_getOrCreateDefaultStripeProduct`** — Extracts the repeated "find or create stripe product" pattern.

7. **`_parseSettingJSON` / `_parseJSON`** — Centralises JSON parsing with consistent error handling.

8. **`_resolvePortalPlanNames`** — Replaces the complex `reduce` with a plain `for…of` loop that is easier to follow.

9. **`_findAllAsJSON` / `_findDefaultPaidProduct`** — Small helpers that remove repeated boilerplate.