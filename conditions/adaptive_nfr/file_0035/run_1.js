# Refactored StripeMigrations

## Key Improvements

1. **Extracted transaction wrapper** - Eliminated the repetitive transaction pattern with a helper method
2. **Extracted price creation** - Consolidated duplicate price creation/saving logic into reusable methods
3. **Extracted default product lookup** - Removed repeated product fetching code
4. **Simplified `populateMembersPrice` methods** - Merged the near-identical monthly/yearly methods into a single parameterized method
5. **Simplified `populateDefaultProductPrice` methods** - Same consolidation approach
6. **Extracted portal plans parsing** - Removed duplicated JSON parse + error handling

```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
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
                    await this._saveStripeProductAndPrice(stripePrice, defaultProduct.id, opts);
                }
            } catch (e) {
                logging.error('Failed to populate products/prices from stripe');
                logging.error(e);
            }
        });
    }

    async populateStripePricesFromStripePlansSetting(options) {
        return this._withTransaction(options, async (opts) => {
            const plans = await this._parsePlansFromSetting('stripe_plans', opts);
            if (!plans) {
                return;
            }

            const defaultStripeProduct = await this._ensureDefaultStripeProduct(opts);
            if (!defaultStripeProduct) {
                return;
            }

            for (const plan of plans) {
                const existingPrice = await this.findPriceByPlan(plan, opts);
                if (!existingPrice) {
                    await this._createAndSavePrice(plan, defaultStripeProduct, opts);
                }
            }
        });
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        return this._populateMembersPriceIdSetting('monthly', options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        return this._populateMembersPriceIdSetting('yearly', options);
    }

    async populateDefaultProductMonthlyPriceId(options) {
        return this._populateDefaultProductPriceId('monthly', options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        return this._populateDefaultProductPriceId('yearly', options);
    }

    async revertPortalPlansSetting(options) {
        return this._withTransaction(options, async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');

            const { setting, plans: portalPlans } = await this._parsePortalPlansSetting(opts);
            if (!portalPlans) {
                return;
            }

            const containsNamedValues = portalPlans.some(p => ['monthly', 'yearly'].includes(p));
            if (containsNamedValues) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const freePlans = portalPlans.filter(p => p === 'free');
            const priceIds = portalPlans.filter(p => p !== 'free');

            if (priceIds.length === 0) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const newPortalPlans = await priceIds.reduce(async (memoPromise, priceId) => {
                const memo = await memoPromise;
                const plan = await this.getPlanFromPrice(priceId, opts);
                if (!plan) {
                    return memo;
                }
                return [...memo.filter(d => d !== plan), plan];
            }, Promise.resolve(freePlans));

            await this._savePortalPlansSetting(newPortalPlans, setting, opts);
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
            const defaultProduct = await this._findDefaultPaidProduct(opts);

            if (defaultProduct?.name !== 'Default Product') {
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
            const siteTitle = await this.models.Settings.findOne({ key: 'title' }, opts);
            if (!siteTitle) {
                return;
            }

            const { data } = await this.models.StripeProduct.findPage({ ...opts, limit: 'all' });

            for (const model of data) {
                const product = await this.api.getProduct(model.get('stripe_product_id'));
                if (product.name === 'Default Product') {
                    await this.api.updateProduct(product.id, { name: siteTitle.get('value') });
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // Shared helpers (used by other classes/tests)
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

        if (price?.get('interval') === 'month') return 'monthly';
        if (price?.get('interval') === 'year') return 'yearly';
        return null;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Wraps a function in a transaction if one isn't already provided.
     */
    _withTransaction(options, fn) {
        if (options) {
            return fn(options);
        }
        return this.models.Product.transaction(transacting => fn({ transacting }));
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
        return data[0]?.toJSON() ?? null;
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

    async _saveStripeProductAndPrice(stripePrice, defaultProductId, options) {
        const stripeProduct = stripePrice.product;

        await this.models.StripeProduct.upsert({
            product_id: defaultProductId,
            stripe_product_id: stripeProduct.id
        }, options);

        await this.models.StripePrice.add(
            this._buildStripePriceData(stripePrice, stripeProduct.id),
            options
        );
    }

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

    async _ensureDefaultStripeProduct(options) {
        const { data } = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
        if (data[0]) {
            return data[0];
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

    async _createAndSavePrice(plan, defaultStripeProduct, options) {
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

    async _parsePlansFromSetting(settingKey, options) {
        const setting = await this.models.Settings.findOne({ key: settingKey }, options);
        try {
            return JSON.parse(setting.get('value'));
        } catch (err) {
            return null;
        }
    }

    async _parsePortalPlansSetting(options) {
        const setting = await this.models.Settings.findOne({ key: 'portal_plans' }, options);
        try {
            return { setting, plans: JSON.parse(setting.get('value')) };
        } catch (err) {
            logging.error({ message: 'Could not parse portal_plans setting, skipping migration', err });
            return { setting, plans: null };
        }
    }

    async _savePortalPlansSetting(plans, setting, options) {
        logging.info(`Updating portal_plans setting to ${JSON.stringify(plans)}`);
        await this.models.Settings.edit(
            { key: 'portal_plans', value: JSON.stringify(plans) },
            { ...options, id: setting.id }
        );
    }

    /**
     * Shared logic for populateMembersMonthlyPriceIdSettings /
     * populateMembersYearlyPriceIdSettings.
     */
    async _populateMembersPriceIdSetting(period, options) {
        const config = this._getPeriodConfig(period);

        return this._withTransaction(options, async (opts) => {
            logging.info(`Populating ${config.settingKey} from stripe_plans`);

            const priceIdSetting = await this.models.Settings.findOne(
                { key: config.settingKey }, opts
            );

            if (priceIdSetting.get('value')) {
                logging.info(`Skipping population of ${config.settingKey}, already populated`);
                return;
            }

            const plans = await this._parsePlansFromSetting('stripe_plans', opts);
            if (!plans) {
                logging.warn(`Skipping population of ${config.settingKey}, could not parse stripe_plans`);
                return;
            }

            const matchedPlan = plans.find(p => p.name === config.planName);
            if (!matchedPlan) {
                logging.warn(`Skipping population of ${config.settingKey}, could not find ${config.planName} plan`);
                return;
            }

            let price = await this.models.StripePrice.findOne({
                amount: matchedPlan.amount,
                currency: matchedPlan.currency,
                interval: matchedPlan.interval,
                active: true
            }, opts);

            if (!price) {
                logging.info(`Could not find active ${config.planName} price from stripe_plans - searching by interval`);
                price = await this.models.StripePrice
                    .where('amount', '>', 0)
                    .where({ interval: config.interval, active: true })
                    .fetch(opts);
            }

            if (!price) {
                price = await this._createDefaultPrice(config, opts);
            }

            await this.models.Settings.edit(
                { key: config.settingKey, value: price.id },
                { ...opts, id: priceIdSetting.id }
            );
        });
    }

    async _createDefaultPrice(config, options) {
        logging.info(`Could not find any active ${config.planName} price - creating a new one`);

        const { data } = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
        const defaultStripeProduct = data[0];

        const price = await this.api.createPrice({
            currency: 'usd',
            amount: config.defaultAmount,
            nickname: config.planName,
            interval: config.interval,
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
     * Shared logic for populateDefaultProductMonthlyPriceId /
     * populateDefaultProductYearlyPriceId.
     */
    async _populateDefaultProductPriceId(period, options) {
        const config = this._getPeriodConfig(period);

        return this._withTransaction(options, async (opts) => {
            logging.info(`Migrating ${config.settingKey} setting to ${config.columnName} column`);

            const productsPage = await this.models.Product.findPage({
                ...opts, limit: 1, filter: 'type:paid'
            });
            const defaultProduct = productsPage.data[0];

            if (defaultProduct.get(config.columnName)) {
                logging.warn(`Skipping migration, ${config.columnName} already set`);
                return;
            }

            const priceIdSetting = await this.models.Settings.findOne(
                { key: config.settingKey }, opts
            );

            await this.models.Product.edit(
                { [config.columnName]: priceIdSetting.get('value') },
                { ...opts, id: defaultProduct.id }
            );
        });
    }

    _getPeriodConfig(period) {
        const isMonthly = period === 'monthly';
        return {
            period,
            planName: isMonthly ? 'Monthly' : 'Yearly',
            interval: isMonthly ? 'month' : 'year',
            settingKey: isMonthly ? 'members_monthly_price_id' : 'members_yearly_price_id',
            columnName: isMonthly ? 'monthly_price_id' : 'yearly_price_id',
            defaultAmount: isMonthly ? 5000 : 500
        };
    }
};
```

## Summary of Changes

| Technique | Applied To |
|---|---|
| **Transaction helper** (`_withTransaction`) | All 10 migration methods — eliminated 10 identical boilerplate blocks |
| **Period config object** (`_getPeriodConfig`) | Merged monthly/yearly variants of `populateMembers*` and `populateDefaultProduct*` into single parameterized methods |
| **Extracted `_buildStripePriceData`** | Removed duplicate price data object construction in 3 places |
| **Extracted `_findDefaultPaidProduct`** | Removed repeated product page query in 3 places |
| **Extracted `_ensureDefaultStripeProduct`** | Isolated product creation fallback logic |
| **Extracted `_parsePlansFromSetting` / `_parsePortalPlansSetting`** | Removed duplicated JSON parse + error handling |
| **Extracted `_fetchUniquePricesFromStripe`** | Isolated Stripe API fetching loop |
| **`Promise.resolve` on reduce seed** | Fixed implicit async reduce anti-pattern in `revertPortalPlansSetting` |