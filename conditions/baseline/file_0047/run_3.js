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

    async withTransaction(fn) {
        return this.models.Product.transaction((transacting) => {
            return fn({transacting});
        });
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateProductsAndPrices(opts));
        }

        const [subscriptionModels, priceModels, productModels, {data}] = await Promise.all([
            this.models.StripeCustomerSubscription.findAll(options),
            this.models.StripePrice.findAll(options),
            this.models.StripeProduct.findAll(options),
            this.models.Product.findPage({
                ...options,
                limit: 1,
                filter: 'type:paid'
            })
        ]);

        const subscriptions = subscriptionModels.toJSON();
        const prices = priceModels.toJSON();
        const products = productModels.toJSON();
        const defaultProduct = data[0]?.toJSON();

        if (subscriptions.length > 0 && products.length === 0 && prices.length === 0 && defaultProduct) {
            await this.populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options);
        }
    }

    async populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options) {
        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this.fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this.addStripePrice(stripePrice, defaultProduct, options);
            }
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async fetchStripePrices(planIds) {
        const stripePrices = [];
        for (const plan of planIds) {
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

    async addStripePrice(stripePrice, defaultProduct, options) {
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

    async findPriceByPlan(plan, options) {
        const currency = (plan.currency || 'usd').toLowerCase();
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const {interval} = plan;

        return this.models.StripePrice.findOne({currency, amount, interval}, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);

        if (!price) {
            return null;
        }

        const interval = price.get('interval');
        return interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateStripePricesFromStripePlansSetting(opts));
        }

        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;

        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch (err) {
            return;
        }

        const defaultStripeProduct = await this.getOrCreateDefaultStripeProduct(options);

        if (!defaultStripeProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return;
        }

        for (const plan of plans) {
            await this.createPriceIfNotExists(plan, defaultStripeProduct, options);
        }
    }

    async getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];

        if (!defaultStripeProduct) {
            logging.info('Could not find Stripe Product - creating one');
            const productsPage = await this.models.Product.findPage({
                ...options,
                limit: 1,
                filter: 'type:paid'
            });
            const defaultProduct = productsPage.data[0];

            if (!defaultProduct) {
                return null;
            }

            const stripeProduct = await this.api.createProduct({name: defaultProduct.get('name')});
            defaultStripeProduct = await this.models.StripeProduct.add({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);
        }

        return defaultStripeProduct;
    }

    async createPriceIfNotExists(plan, stripeProduct, options) {
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
                product: stripeProduct.get('stripe_product_id')
            });

            await this.models.StripePrice.add({
                stripe_price_id: price.id,
                stripe_product_id: stripeProduct.get('stripe_product_id'),
                active: price.active,
                nickname: price.nickname,
                currency: price.currency,
                amount: price.unit_amount,
                type: 'recurring',
                interval: price.recurring.interval
            }, options);
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async updatePortalPlansSetting(plans, options) {
        if (!options) {
            return this.withTransaction((opts) => this.updatePortalPlansSetting(plans, opts));
        }

        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);

        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({message: 'Could not parse portal_plans setting, skipping migration', err});
            return;
        }

        const containsOldValues = portalPlans.some((plan) => ['monthly', 'yearly'].includes(plan));

        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this.mapPortalPlansToIds(portalPlans, plans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit(
            {key: 'portal_plans', value: JSON.stringify(newPortalPlans)},
            {...options, id: portalPlansSetting.id}
        );
    }

    async mapPortalPlansToIds(portalPlans, plans, options) {
        const newPortalPlans = [];

        for (const plan of portalPlans) {
            if (plan === 'monthly') {
                const monthlyPlan = plans.find((p) => p.name === 'Monthly');
                if (monthlyPlan) {
                    const price = await this.findPriceByPlan(monthlyPlan, options);
                    if (price) {
                        newPortalPlans.push(price.id);
                    }
                }
            } else if (plan === 'yearly') {
                const yearlyPlan = plans.find((p) => p.name === 'Yearly');
                if (yearlyPlan) {
                    const price = await this.findPriceByPlan(yearlyPlan, options);
                    if (price) {
                        newPortalPlans.push(price.id);
                    }
                }
            } else {
                newPortalPlans.push(plan);
            }
        }

        return newPortalPlans;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateMembersMonthlyPriceIdSettings(opts));
        }

        await this.populateMembersPriceIdSettings('monthly', 'members_monthly_price_id', 'month', 5000, options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateMembersYearlyPriceIdSettings(opts));
        }

        await this.populateMembersPriceIdSettings('yearly', 'members_yearly_price_id', 'year', 50000, options);
    }

    async populateMembersPriceIdSettings(planType, settingKey, interval, defaultAmount, options) {
        logging.info(`Populating ${settingKey} from stripe_plans`);
        const priceSetting = await this.models.Settings.findOne({key: settingKey}, options);

        if (priceSetting.get('value')) {
            logging.info(`Skipping population of ${settingKey}, already populated`);
            return;
        }

        const stripePlans = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;

        try {
            plans = JSON.parse(stripePlans.get('value'));
        } catch (err) {
            logging.warn(`Skipping population of ${settingKey}, could not parse stripe_plans`);
            return;
        }

        const capitalizedType = planType.charAt(0).toUpperCase() + planType.slice(1);
        const plan = plans.find((p) => p.name === capitalizedType);

        if (!plan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${capitalizedType} plan`);
            return;
        }

        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${capitalizedType} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval, active: true}).fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${capitalizedType} price - creating a new one`);
            price = await this.createDefaultPrice(capitalizedType, interval, defaultAmount, options);
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceSetting.id}
        );
    }

    async createDefaultPrice(name, interval, amount, options) {
        const defaultStripeProduct = await this.getDefaultStripeProduct(options);
        const price = await this.api.createPrice({
            currency: 'usd',
            amount,
            nickname: name,
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

    async getDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        return stripeProductsPage.data[0];
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateDefaultProductMonthlyPriceId(opts));
        }

        await this.populateDefaultProductPriceId('monthly_price_id', 'members_monthly_price_id', options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateDefaultProductYearlyPriceId(opts));
        }

        await this.populateDefaultProductPriceId('yearly_price_id', 'members_yearly_price_id', options);
    }

    async populateDefaultProductPriceId(columnName, settingKey, options) {
        logging.info(`Migrating ${settingKey} setting to ${columnName} column`);
        const productsPage = await this.