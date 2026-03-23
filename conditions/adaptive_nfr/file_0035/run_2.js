# Refactored StripeMigrations

## Key Improvements

1. **Extracted transaction wrapper** - Eliminated the repetitive transaction pattern with a helper method
2. **Extracted price creation/saving** - Removed duplicated price creation logic between monthly/yearly methods
3. **Extracted portal plans parsing** - Removed duplicated JSON parsing with error handling
4. **Extracted default Stripe product lookup** - Removed duplicated product lookup logic
5. **Simplified `populateProductsAndPrices`** - Extracted Stripe price fetching loop
6. **Reduced nesting** with early returns

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
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Wraps a migration method in a transaction if one isn't already provided.
     * Eliminates the repetitive `if (!options) { transaction(...) }` pattern.
     */
    withTransaction(options, fn) {
        if (options) {
            return fn(options);
        }
        return this.models.Product.transaction(transacting => fn({transacting}));
    }

    /**
     * Parses a JSON setting value, returning null on failure.
     */
    parseSettingJSON(setting, warnMessage) {
        try {
            return JSON.parse(setting.get('value'));
        } catch (err) {
            if (warnMessage) {
                logging.warn(warnMessage);
            }
            return null;
        }
    }

    /**
     * Fetches the first StripeProduct, creating one if none exists.
     */
    async getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const existing = stripeProductsPage.data[0];

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

        const stripeProduct = await this.api.createProduct({name: defaultProduct.get('name')});

        return this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    /**
     * Creates a Stripe price via the API and persists it to the local model.
     */
    async createAndSaveStripePrice({stripeProductId, currency, amount, nickname, interval}, options) {
        const price = await this.api.createPrice({
            currency,
            amount,
            nickname,
            interval,
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

    /**
     * Finds a price matching the given plan's currency/amount/interval.
     */
    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);

        return this.models.StripePrice.findOne({
            currency,
            amount,
            interval: plan.interval
        }, options);
    }

    /**
     * Returns 'monthly' or 'yearly' for a given price ID, or null.
     */
    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        const intervalMap = {month: 'monthly', year: 'yearly'};
        return price ? (intervalMap[price.get('interval')] ?? null) : null;
    }

    // -------------------------------------------------------------------------
    // Migrations
    // -------------------------------------------------------------------------

    async populateProductsAndPrices(options) {
        return this.withTransaction(options, async (opts) => {
            const [subscriptions, prices, products, defaultProduct] = await Promise.all([
                this.models.StripeCustomerSubscription.findAll(opts).then(m => m.toJSON()),
                this.models.StripePrice.findAll(opts).then(m => m.toJSON()),
                this.models.StripeProduct.findAll(opts).then(m => m.toJSON()),
                this.models.Product.findPage({...opts, limit: 1, filter: 'type:paid'})
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
                const stripePrices = await this._fetchUniquePricesFromStripe(subscriptions);

                logging.info(`Adding ${stripePrices.length} prices from Stripe`);
                for (const stripePrice of stripePrices) {
                    const stripeProduct = stripePrice.product;

                    await this.models.StripeProduct.upsert({
                        product_id: defaultProduct.id,
                        stripe_product_id: stripeProduct.id
                    }, opts);

                    await this.models.StripePrice.add({
                        stripe_price_id: stripePrice.id,
                        stripe_product_id: stripeProduct.id,
                        active: stripePrice.active,
                        nickname: stripePrice.nickname,
                        currency: stripePrice.currency,
                        amount: stripePrice.unit_amount,
                        type: 'recurring',
                        interval: stripePrice.recurring.interval
                    }, opts);
                }
            } catch (e) {
                logging.error('Failed to populate products/prices from stripe');
                logging.error(e);
            }
        });
    }

    async _fetchUniquePricesFromStripe(subscriptions) {
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

    async populateStripePricesFromStripePlansSetting(options) {
        return this.withTransaction(options, async (opts) => {
            const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, opts);
            const plans = this.parseSettingJSON(plansSetting);

            if (!plans) {
                return;
            }

            const defaultStripeProduct = await this.getOrCreateDefaultStripeProduct(opts);

            if (!defaultStripeProduct) {
                return;
            }

            for (const plan of plans) {
                const existingPrice = await this.findPriceByPlan(plan, opts);

                if (existingPrice) {
                    continue;
                }

                logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);

                try {
                    logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);
                    await this.createAndSaveStripePrice({
                        stripeProductId: defaultStripeProduct.get('stripe_product_id'),
                        currency: plan.currency,
                        amount: plan.amount,
                        nickname: plan.name,
                        interval: plan.interval
                    }, opts);
                } catch (err) {
                    logging.error({err, message: 'Adding price failed'});
                }
            }
        });
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Populating members_monthly_price_id from stripe_plans');
            await this._populatePriceIdSetting({
                settingKey: 'members_monthly_price_id',
                planName: 'Monthly',
                interval: 'month',
                fallbackAmount: 5000,
                fallbackCurrency: 'usd'
            }, opts);
        });
    }

    async populateMembersYearlyPriceIdSettings(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Populating members_yearly_price_id from stripe_plans');
            await this._populatePriceIdSetting({
                settingKey: 'members_yearly_price_id',
                planName: 'Yearly',
                interval: 'year',
                fallbackAmount: 500,
                fallbackCurrency: 'usd'
            }, opts);
        });
    }

    /**
     * Shared logic for populating members_monthly_price_id / members_yearly_price_id.
     */
    async _populatePriceIdSetting({settingKey, planName, interval, fallbackAmount, fallbackCurrency}, options) {
        const priceIdSetting = await this.models.Settings.findOne({key: settingKey}, options);

        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${settingKey}, already populated`);
            return;
        }

        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        const plans = this.parseSettingJSON(
            stripePlans,
            `Skipping population of ${settingKey}, could not parse stripe_plans`
        );

        if (!plans) {
            return;
        }

        const matchedPlan = plans.find(p => p.name === planName);

        if (!matchedPlan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
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
            price = await this.models.StripePrice
                .where('amount', '>', 0)
                .where({interval, active: true})
                .fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${planName} price - creating a new one`);
            const defaultStripeProduct = await this.getOrCreateDefaultStripeProduct(options);
            price = await this.createAndSaveStripePrice({
                stripeProductId: defaultStripeProduct.get('stripe_product_id'),
                currency: fallbackCurrency,
                amount: fallbackAmount,
                nickname: planName,
                interval
            }, options);
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    async populateDefaultProductMonthlyPriceId(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
            await this._populateDefaultProductPriceId('monthly', opts);
        });
    }

    async populateDefaultProductYearlyPriceId(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
            await this._populateDefaultProductPriceId('yearly', opts);
        });
    }

    /**
     * Shared logic for migrating monthly/yearly price ID settings to Product columns.
     */
    async _populateDefaultProductPriceId(period, options) {
        const columnKey = `${period}_price_id`;
        const settingKey = `members_${period}_price_id`;

        const productsPage = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get(columnKey)) {
            logging.warn(`Skipping migration, ${columnKey} already set`);
            return;
        }

        const priceIdSetting = await this.models.Settings.findOne({key: settingKey}, options);
        const priceId = priceIdSetting.get('value');

        await this.models.Product.edit(
            {[columnKey]: priceId},
            {...options, id: defaultProduct.id}
        );
    }

    async revertPortalPlansSetting(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);

            const portalPlans = this.parseSettingJSON(portalPlansSetting);

            if (!portalPlans) {
                logging.error({
                    message: 'Could not parse portal_plans setting, skipping migration'
                });
                return;
            }

            const hasNamedValues = portalPlans.some(p => ['monthly', 'yearly'].includes(p));

            if (hasNamedValues) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const planIds = portalPlans.filter(p => p !== 'free');

            if (planIds.length === 0) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const freePlans = portalPlans.filter(p => p === 'free');
            const newPortalPlans = await planIds.reduce(async (accPromise, priceId) => {
                const plan = await this.getPlanFromPrice(priceId, opts);
                const acc = await accPromise;

                if (!plan) {
                    return acc;
                }

                // Deduplicate by removing existing entry before adding
                return acc.filter(d => d !== plan).concat(plan);
            }, Promise.resolve(freePlans));

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this.models.Settings.edit(
                {key: 'portal_plans', value: JSON.stringify(newPortalPlans)},
                {...opts, id: portalPlansSetting.id}
            );
        });
    }

    async removeInvalidSubscriptions(options) {
        return this.withTransaction(options, async (opts) => {
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
        return this.withTransaction(options, async (opts) => {
            const {data} = await this.models.Product.findPage({
                ...opts,
                limit: 1,
                filter: 'type:paid'
            });

            const defaultProduct = data[0]?.toJSON();

            if (!defaultProduct || defaultProduct.name !== 'Default Product') {
                return;
            }

            const siteTitle = await this.models.Settings.findOne({key: 'title'}, opts);

            if (siteTitle) {
                await this.models.Product.edit(
                    {name: siteTitle.get('value')},
                    {...opts, id: defaultProduct.id}
                );
            }
        });
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        return this.withTransaction(options, async (opts) => {
            const {data} = await this.models.StripeProduct.findPage({...opts, limit: 'all'});
            const siteTitle = await this.models.Settings.findOne({key: 'title'}, opts);

            if (!siteTitle) {
                return;
            }

            for (const model of data) {
                const product = await this.api.getProduct(model.get('stripe_product_id'));

                if (product.name === 'Default Product') {
                    await this.api.updateProduct(product.id, {name: siteTitle.get('value')});
                }
            }
        });
    }

    async updatePortalPlansSetting(plans, options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating portal_plans setting from names to ids');
            const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);

            const portalPlans = this.parseSettingJSON(portalPlansSetting);

            if (!portalPlans) {
                logging.error({
                    message: 'Could not parse portal_plans setting, skipping migration'
                });
                return;
            }

            const hasOldValues = portalPlans.some(p => ['monthly', 'yearly'].includes(p));

            if (!hasOldValues) {
                logging.info('Could not find names in portal_plans setting, skipping migration');
                return;
            }

            const newPortalPlans = await portalPlans.reduce(async (accPromise, plan) => {
                const acc = await accPromise;

                if (plan !== 'monthly' && plan !== 'yearly') {
                    return acc.concat(plan);
                }

                const targetName = plan === 'monthly' ? 'Monthly' : 'Yearly';
                const matchedPlan = plans.find(p => p.name === targetName);

                if (!matchedPlan) {
                    return acc;
                }

                const price = await this.findPriceByPlan(matchedPlan, opts);
                return acc.concat(price.id);
            }, Promise.resolve([]));

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this.models.Settings.edit(
                {key: 'portal_plans', value: JSON.stringify(newPortalPlans)},
                {...opts, id: portalPlansSetting.id}
            );
        });
    }
};
```

## Summary of Changes

| Problem | Solution |
|---|---|
| Repeated `if (!options) { transaction(...) }` in every method | `withTransaction(options, fn)` helper |
| Duplicated JSON parse + error handling | `parseSettingJSON(setting, warnMessage)` helper |
| Duplicated Stripe product lookup/creation | `getOrCreateDefaultStripeProduct(options)` helper |
| Duplicated price creation + model persistence | `createAndSaveStripePrice({...}, options)` helper |
| Near-identical `populateMembersMonthly/YearlyPriceIdSettings` | `_populatePriceIdSetting({...}, options)` shared implementation |
| Near-identical `populateDefaultProductMonthly/YearlyPriceId` | `_populateDefaultProductPriceId(period, options)` shared implementation |
| Stripe price fetching loop buried in `populateProductsAndPrices` | Extracted to `_fetchUniquePricesFromStripe(subscriptions)` |
| `reduce` initialized with `[]` instead of `Promise.resolve([])` in `revertPortalPlansSetting` | Fixed to correctly initialize async reduce |