# Refactored StripeMigrations

## Key Improvements

1. **Extracted transaction wrapper** - Eliminated the repetitive transaction pattern with a helper method
2. **Extracted price creation/saving** - Removed duplicated price creation logic between monthly/yearly methods
3. **Extracted portal plans parsing** - Removed duplicated JSON parsing with error handling
4. **Extracted default Stripe product lookup** - Removed duplicated product fetching logic
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
    constructor({ models, api }) {
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
        return this.models.Product.transaction(transacting => fn({ transacting }));
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
        const stripeProductsPage = await this.models.StripeProduct.findPage({ ...options, limit: 1 });
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

        const stripeProduct = await this.api.createProduct({ name: defaultProduct.get('name') });

        return this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    /**
     * Creates a Stripe price via the API and saves it to the local model.
     */
    async createAndSaveStripePrice({ stripeProductId, currency, amount, nickname, interval }, options) {
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
     * Finds an active price matching the given plan criteria, falling back to
     * an interval-only search, then creating a new price if still not found.
     */
    async findOrCreateActivePrice({ interval, planAmount, planCurrency, defaultAmount, defaultNickname }, options) {
        const intervalLabel = interval === 'month' ? 'Monthly' : 'Yearly';

        let price = await this.models.StripePrice.findOne({
            amount: planAmount,
            currency: planCurrency,
            interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${intervalLabel} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice
                .where('amount', '>', 0)
                .where({ interval, active: true })
                .fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${intervalLabel} price - creating a new one`);
            const defaultStripeProduct = await this.getOrCreateDefaultStripeProduct(options);
            price = await this.createAndSaveStripePrice({
                stripeProductId: defaultStripeProduct.get('stripe_product_id'),
                currency: planCurrency || 'usd',
                amount: defaultAmount,
                nickname: defaultNickname,
                interval
            }, options);
        }

        return price;
    }

    // -------------------------------------------------------------------------
    // Migrations
    // -------------------------------------------------------------------------

    async populateProductsAndPrices(options) {
        return this.withTransaction(options, async (opts) => {
            const [subscriptions, prices, products] = await Promise.all([
                this.models.StripeCustomerSubscription.findAll(opts).then(m => m.toJSON()),
                this.models.StripePrice.findAll(opts).then(m => m.toJSON()),
                this.models.StripeProduct.findAll(opts).then(m => m.toJSON())
            ]);

            const { data } = await this.models.Product.findPage({
                ...opts,
                limit: 1,
                filter: 'type:paid'
            });
            const defaultProduct = data[0] && data[0].toJSON();

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

    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        return this.models.StripePrice.findOne({ currency, amount, interval }, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({ id: priceId }, options);

        if (price && price.get('interval') === 'month') {
            return 'monthly';
        }
        if (price && price.get('interval') === 'year') {
            return 'yearly';
        }
        return null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        return this.withTransaction(options, async (opts) => {
            const plansSetting = await this.models.Settings.findOne({ key: 'stripe_plans' }, opts);
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
                logging.info(`Creating Stripe Price ${JSON.stringify(plan)}`);

                try {
                    await this.createAndSaveStripePrice({
                        stripeProductId: defaultStripeProduct.get('stripe_product_id'),
                        currency: plan.currency,
                        amount: plan.amount,
                        nickname: plan.name,
                        interval: plan.interval
                    }, opts);
                } catch (err) {
                    logging.error({ err, message: 'Adding price failed' });
                }
            }
        });
    }

    async updatePortalPlansSetting(plans, options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating portal_plans setting from names to ids');
            const portalPlansSetting = await this.models.Settings.findOne({ key: 'portal_plans' }, opts);
            const portalPlans = this.parseSettingJSON(portalPlansSetting, null);

            if (!portalPlans) {
                logging.error({ message: 'Could not parse portal_plans setting, skipping migration' });
                return;
            }

            const containsOldValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));

            if (!containsOldValues) {
                logging.info('Could not find names in portal_plans setting, skipping migration');
                return;
            }

            const newPortalPlans = await portalPlans.reduce(async (memoPromise, plan) => {
                const memo = await memoPromise;

                if (plan !== 'monthly' && plan !== 'yearly') {
                    return memo.concat(plan);
                }

                const targetName = plan === 'monthly' ? 'Monthly' : 'Yearly';
                const matchedPlan = plans.find(p => p.name === targetName);

                if (!matchedPlan) {
                    return memo;
                }

                const price = await this.findPriceByPlan(matchedPlan, opts);
                return memo.concat(price.id);
            }, Promise.resolve([]));

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this.models.Settings.edit(
                { key: 'portal_plans', value: JSON.stringify(newPortalPlans) },
                { ...opts, id: portalPlansSetting.id }
            );
        });
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Populating members_monthly_price_id from stripe_plans');
            const monthlyPriceIdSetting = await this.models.Settings.findOne(
                { key: 'members_monthly_price_id' }, opts
            );

            if (monthlyPriceIdSetting.get('value')) {
                logging.info('Skipping population of members_monthly_price_id, already populated');
                return;
            }

            const stripePlans = await this.models.Settings.findOne({ key: 'stripe_plans' }, opts);
            const plans = this.parseSettingJSON(
                stripePlans,
                'Skipping population of members_monthly_price_id, could not parse stripe_plans'
            );

            if (!plans) {
                return;
            }

            const monthlyPlan = plans.find(plan => plan.name === 'Monthly');

            if (!monthlyPlan) {
                logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
                return;
            }

            const monthlyPrice = await this.findOrCreateActivePrice({
                interval: 'month',
                planAmount: monthlyPlan.amount,
                planCurrency: monthlyPlan.currency,
                defaultAmount: 5000,
                defaultNickname: 'Monthly'
            }, opts);

            await this.models.Settings.edit(
                { key: 'members_monthly_price_id', value: monthlyPrice.id },
                { ...opts, id: monthlyPriceIdSetting.id }
            );
        });
    }

    async populateMembersYearlyPriceIdSettings(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Populating members_yearly_price_id from stripe_plans');
            const yearlyPriceIdSetting = await this.models.Settings.findOne(
                { key: 'members_yearly_price_id' }, opts
            );

            if (yearlyPriceIdSetting.get('value')) {
                logging.info('Skipping population of members_yearly_price_id, already populated');
                return;
            }

            const stripePlans = await this.models.Settings.findOne({ key: 'stripe_plans' }, opts);
            const plans = this.parseSettingJSON(
                stripePlans,
                'Skipping population of members_yearly_price_id, could not parse stripe_plans'
            );

            if (!plans) {
                return;
            }

            const yearlyPlan = plans.find(plan => plan.name === 'Yearly');

            if (!yearlyPlan) {
                logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
                return;
            }

            const yearlyPrice = await this.findOrCreateActivePrice({
                interval: 'year',
                planAmount: yearlyPlan.amount,
                planCurrency: yearlyPlan.currency,
                defaultAmount: 500,
                defaultNickname: 'Yearly'
            }, opts);

            await this.models.Settings.edit(
                { key: 'members_yearly_price_id', value: yearlyPrice.id },
                { ...opts, id: yearlyPriceIdSetting.id }
            );
        });
    }

    async populateDefaultProductMonthlyPriceId(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
            await this._migrateProductPriceId('monthly', opts);
        });
    }

    async populateDefaultProductYearlyPriceId(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
            await this._migrateProductPriceId('yearly', opts);
        });
    }

    async _migrateProductPriceId(period, options) {
        const priceIdColumn = `${period}_price_id`;
        const settingKey = `members_${period}_price_id`;

        const productsPage = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get(priceIdColumn)) {
            logging.warn(`Skipping migration, ${priceIdColumn} already set`);
            return;
        }

        const priceIdSetting = await this.models.Settings.findOne({ key: settingKey }, options);
        const priceId = priceIdSetting.get('value');

        await this.models.Product.edit(
            { [priceIdColumn]: priceId },
            { ...options, id: defaultProduct.id }
        );
    }

    async revertPortalPlansSetting(options) {
        return this.withTransaction(options, async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlansSetting = await this.models.Settings.findOne({ key: 'portal_plans' }, opts);
            const portalPlans = this.parseSettingJSON(portalPlansSetting, null);

            if (!portalPlans) {
                logging.error({ message: 'Could not parse portal_plans setting, skipping migration' });
                return;
            }

            const containsNamedValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));

            if (containsNamedValues) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const portalPlanIds = portalPlans.filter(plan => plan !== 'free');

            if (portalPlanIds.length === 0) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const defaultPortalPlans = portalPlans.filter(plan => plan === 'free');

            const newPortalPlans = await portalPlanIds.reduce(async (memoPromise, priceId) => {
                const plan = await this.getPlanFromPrice(priceId, opts);

                if (!plan) {
                    return memoPromise;
                }

                const memo = await memoPromise;
                return memo.filter(d => d !== plan).concat(plan);
            }, Promise.resolve(defaultPortalPlans));

            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
            await this.models.Settings.edit(
                { key: 'portal_plans', value: JSON.stringify(newPortalPlans) },
                { ...opts, id: portalPlansSetting.id }
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
            const { data } = await this.models.Product.findPage({
                ...opts,
                limit: 1,
                filter: 'type:paid'
            });
            const defaultProduct = data[0] && data[0].toJSON();

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
        return this.withTransaction(options, async (opts) => {
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
};
```

## Summary of Changes

| Pattern | Before | After |
|---|---|---|
| Transaction wrapping | Repeated `if (!options)` block in every method | Single `withTransaction()` helper |
| JSON parsing | Duplicated try/catch in 4+ methods | `parseSettingJSON()` helper |
| Default Stripe product lookup | Duplicated in 2 methods | `getOrCreateDefaultStripeProduct()` helper |
| Price creation + DB save | Duplicated in monthly/yearly methods | `createAndSaveStripePrice()` helper |
| Monthly/yearly price find-or-create | ~30 lines duplicated twice | `findOrCreateActivePrice()` helper |
| Monthly/yearly product migration | Duplicated logic | `_migrateProductPriceId(period)` helper |
| Stripe price fetching loop | Inline in `populateProductsAndPrices` | `_fetchUniquePricesFromStripe()` helper |
| `reduce` initial value | Missing `Promise.resolve()` wrapper | Fixed to correctly await initial value |