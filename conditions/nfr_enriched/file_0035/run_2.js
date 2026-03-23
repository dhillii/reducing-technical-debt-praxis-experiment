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

        try {
            for (const migration of migrations) {
                await migration();
            }
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
            const newPortalPlans = await this._resolvePlanIdsToNames(planIds, freePlans, opts);

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
    // Private helpers
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

    /**
     * Finds all records of a model and returns them as plain JSON.
     */
    async _findAllAsJSON(modelName, options) {
        const models = await this.models[modelName].findAll(options);
        return models.toJSON();
    }

    /**
     * Retrieves the default paid product as plain JSON.
     */
    async _getDefaultProduct(options) {
        const { data } = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    /**
     * Fetches unique Stripe prices from subscriptions, ignoring missing plans.
     */
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

    /**
     * Upserts a StripeProduct and adds a StripePrice for the given Stripe price object.
     */
    async _upsertStripePriceAndProduct(stripePrice, productId, options) {
        const stripeProduct = stripePrice.product;

        await this.models.StripeProduct.upsert({
            product_id: productId,
            stripe_product_id: stripeProduct.id
        }, options);

        await this.models.StripePrice.add(
            this._buildStripePriceData(stripePrice, stripeProduct.id),
            options
        );
    }

    /**
     * Builds a StripePrice data object from a Stripe price response.
     */
    _buildStripePriceData(stripePrice, stripeProductId) {
        return {
            stripe_price_id: stripePrice.id,
            stripe_product_id: stripeProductId,
            active: stripePrice.active,
            nickname: stripePrice.nickname,
            currency: stripePrice.currency,
            amount: stripePrice.unit_amount,
            type: 'recurring',
            interval: stripePrice.recurring.interval
        };
    }

    /**
     * Parses a JSON setting value, logging a warning on failure.
     */
    _parseJSON(value, settingKey) {
        try {
            return JSON.parse(value);
        } catch (err) {
            logging.error({ message: `Could not parse ${settingKey} setting, skipping migration`, err });
            return null;
        }
    }

    /**
     * Finds a setting by key and parses its JSON value.
     */
    async _parseSettingJSON(key, options) {
        const setting = await this.models.Settings.findOne({ key }, options);
        return this._parseJSON(setting.get('value'), key);
    }

    /**
     * Gets or creates the default StripeProduct.
     */
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

    /**
     * Ensures a Stripe price exists for a given plan, creating one if needed.
     */
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

            await this.models.StripePrice.add(
                this._buildStripePriceData(price, defaultStripeProduct.get('stripe_product_id')),
                options
            );
        } catch (err) {
            logging.error({ err, message: 'Adding price failed' });
        }
    }

    /**
     * Populates a price ID setting (monthly or yearly) from stripe_plans.
     */
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

        const price = await this._findOrCreatePrice(matchedPlan, interval, defaultAmount, options);
        await this.models.Settings.edit(
            { key: settingKey, value: price.id },
            { ...options, id: priceIdSetting.id }
        );
    }

    /**
     * Finds an active price by plan details, falling back to interval search,
     * then creating a new price if none is found.
     */
    async _findOrCreatePrice(plan, interval, defaultAmount, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${interval}ly price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice
                .where('amount', '>', 0)
                .where({ interval, active: true })
                .fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${interval}ly price - creating a new one`);
            price = await this._createDefaultPrice(interval, defaultAmount, options);
        }

        return price;
    }

    /**
     * Creates a default Stripe price and saves it to the database.
     */
    async _createDefaultPrice(interval, amount, options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
        const defaultStripeProduct = stripeProductsPage.data[0];
        const nickname = interval === 'month' ? 'Monthly' : 'Yearly';

        const price = await this.api.createPrice({
            currency: 'usd',
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

    /**
     * Migrates a price ID from a settings key to a product column.
     */
    async _migrateProductPriceId({ priceColumn, settingKey, options }) {
        logging.info(`Migrating ${settingKey} setting to ${priceColumn} column`);
        const productsPage = await this.models.Product.findPage({ ...options, limit: 1, filter: 'type:paid' });
        const defaultProduct = productsPage.data[0];

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

    /**
     * Checks whether a portal plans array contains named plan values.
     */
    _containsNamedPlans(plans) {
        return plans.some(plan => ['monthly', 'yearly'].includes(plan));
    }

    /**
     * Resolves an array of price IDs to their named plan equivalents.
     */
    async _resolvePlanIdsToNames(planIds, initialPlans, options) {
        return planIds.reduce(async (accPromise, priceId) => {
            const acc = await accPromise;
            const plan = await this.getPlanFromPrice(priceId, options);

            if (!plan) {
                return acc;
            }

            return [...acc.filter(d => d !== plan), plan];
        }, Promise.resolve(initialPlans));
    }

    /**
     * Edits a setting by key and value.
     */
    async _editSetting(key, value, id, options) {
        await this.models.Settings.edit(
            { key, value: JSON.stringify(value) },
            { ...options, id }
        );
    }

    // -------------------------------------------------------------------------
    // Utility methods (used externally or by other methods)
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

1. **`_withTransaction`** — Eliminated the repeated `if (!options) { return this.models.Product.transaction(...) }` guard pattern across every public method.

2. **`_buildStripePriceData`** — Extracted the repeated Stripe price data object construction into a single reusable method.

3. **`_populatePriceIdSetting`** — Merged the near-identical `populateMembersMonthlyPriceIdSettings` and `populateMembersYearlyPriceIdSettings` into one parameterised helper.

4. **`_migrateProductPriceId`** — Merged the near-identical `populateDefaultProductMonthlyPriceId` and `populateDefaultProductYearlyPriceId` into one parameterised helper.

5. **`_findOrCreatePrice` / `_createDefaultPrice`** — Extracted the repeated price lookup/creation logic shared between monthly and yearly migrations.

6. **`_parseJSON` / `_parseSettingJSON`** — Centralised JSON parsing with consistent error handling.

7. **`_getOrCreateDefaultStripeProduct`**, **`_fetchUniquePricesFromStripe`**, **`_ensurePriceExistsForPlan`**, **`_containsNamedPlans`**, **`_resolvePlanIdsToNames`**, **`_editSetting`** — Each extracted to give a single responsibility and improve readability of the public methods.

8. **`execute`** — Replaced the long chain of `await` calls with a declarative migrations array iterated in a loop.