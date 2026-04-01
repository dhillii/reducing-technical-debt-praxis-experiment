```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
     * StripeMigrations
     *
     * @param {object} params
     *
     * @param {any} params.models
     * @param {import('./stripe-api')} params.api
     */
    constructor({
        models,
        api
    }) {
        this.models = models;
        this.api = api;
    }

    async execute() {
        if (this.shouldSkipMigrations()) {
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

    shouldSkipMigrations() {
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return true;
        }
        if (this.api.testEnv) {
            logging.info('Stripe is in test mode - skipping migrations');
            return true;
        }
        return false;
    }

    async populateProductsAndPrices(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateProductsAndPrices({transacting});
            });
        }
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(options);
        const priceModels = await this.models.StripePrice.findAll(options);
        const productModels = await this.models.StripeProduct.findAll(options);
        const subscriptions = subscriptionModels.toJSON();
        const prices = priceModels.toJSON();
        const products = productModels.toJSON();
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = data[0] && data[0].toJSON();

        if (subscriptions.length > 0 && products.length === 0 && prices.length === 0 && defaultProduct) {
            await this.populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options);
        }
    }

    async populateProductsAndPricesFromStripe(subscriptions, defaultProduct, options) {
        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this.fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            for (const stripePrice of stripePrices) {
                await this.addStripePriceAndProduct(stripePrice, defaultProduct, options);
            }
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    async fetchStripePrices(uniquePlans) {
        const stripePrices = [];
        for (const plan of uniquePlans) {
            try {
                const stripePrice = await this.api.getPrice(plan, {
                    expand: ['product']
                });
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

    async addStripePriceAndProduct(stripePrice, defaultProduct, options) {
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
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        const interval = plan.interval;

        const price = await this.models.StripePrice.findOne({
            currency,
            amount,
            interval
        }, options);

        return price;
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({
            id: priceId
        }, options);

        if (price && price.get('interval') === 'month') {
            return 'monthly';
        }
        if (price && price.get('interval') === 'year') {
            return 'yearly';
        }
        return null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateStripePricesFromStripePlansSetting({transacting});
            });
        }
        const plansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(plansSetting.get('value'));
        } catch (err) {
            return;
        }
        let defaultStripeProduct;
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        defaultStripeProduct = stripeProductsPage.data[0];

        if (!defaultStripeProduct) {
            defaultStripeProduct = await this.createDefaultStripeProduct(options);
            if (!defaultStripeProduct) {
                return;
            }
        }

        for (const plan of plans) {
            await this.createPriceIfNotExists(plan, defaultStripeProduct, options);
        }
    }

    async createDefaultStripeProduct(options) {
        logging.info('Could not find Stripe Product - creating one');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
        const defaultProduct = productsPage.data[0];
        
        if (!defaultProduct) {
            logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
            return null;
        }

        const stripeProduct = await this.api.createProduct({
            name: defaultProduct.get('name')
        });

        return await this.models.StripeProduct.add({
            product_id: defaultProduct.id,
            stripe_product_id: stripeProduct.id
        }, options);
    }

    async createPriceIfNotExists(plan, defaultStripeProduct, options) {
        const existingPrice = await this.findPriceByPlan(plan, options);

        if (!existingPrice) {
            logging.info(`Could not find Stripe Price ${JSON.stringify(plan)}`);
            try {
                await this.createAndAddPrice(plan, defaultStripeProduct, options);
            } catch (err) {
                logging.error({err, message: 'Adding price failed'});
            }
        }
    }

    async createAndAddPrice(plan, defaultStripeProduct, options) {
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
    }

    async updatePortalPlansSetting(plans, options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updatePortalPlansSetting(plans, {transacting});
            });
        }
        logging.info('Migrating portal_plans setting from names to ids');
        const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, options);

        let portalPlans;
        try {
            portalPlans = JSON.parse(portalPlansSetting.get('value'));
        } catch (err) {
            logging.error({
                message: 'Could not parse portal_plans setting, skipping migration',
                err
            });
            return;
        }

        const containsOldValues = !!portalPlans.find((plan) => {
            return ['monthly', 'yearly'].includes(plan);
        });

        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await portalPlans.reduce(async (newPortalPlansPromise, plan) => {
            let newPlan = plan;
            if (plan === 'monthly') {
                newPlan = await this.getPriceIdForPlanName('Monthly', plans, options);
            } else if (plan === 'yearly') {
                newPlan = await this.getPriceIdForPlanName('Yearly', plans, options);
            }
            const newPortalPlansMemo = await newPortalPlansPromise;
            return newPortalPlansMemo.concat(newPlan);
        }, []);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async getPriceIdForPlanName(planName, plans, options) {
        const plan = plans.find((planItem) => planItem.name === planName);
        if (!plan) {
            return null;
        }
        const price = await this.findPriceByPlan(plan, options);
        return price ? price.id : null;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }
        await this.populateMembersPriceIdSettings('members_monthly_price_id', 'Monthly', 'month', 5000, options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersYearlyPriceIdSettings({transacting});
            });
        }
        await this.populateMembersPriceIdSettings('members_yearly_price_id', 'Yearly', 'year', 50000, options);
    }

    async populateMembersPriceIdSettings(settingKey, planName, interval, defaultAmount, options) {
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

        const plan = plans.find((p) => p.name === planName);

        if (!plan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
            return;
        }

        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info(`Could not find active ${planName} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval, active: true}).fetch(options);
        }

        if (!price) {
            price = await this.createDefaultPrice(interval, planName, defaultAmount, options);
        }

        await this.models.Settings.edit({key: settingKey, value: price.id}, {...options, id: priceSetting.id});
    }

    async createDefaultPrice(interval, nickname, amount, options) {
        logging.info(`Could not any active ${nickname} price - creating a new one`);
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];
        
        const price = await this.api.createPrice({
            currency: 'usd',
            amount,
            nickname,
            interval,
            active: true,
            type: 'recurring',
            product: defaultStripeProduct.get('stripe_product_id')
        });

        return await this.models.StripePrice.add({
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

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductMonthlyPriceId({transacting});
            });
        }
        await this.populateDefaultProductPriceId('monthly_price_id', 'members_monthly_price_id', options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }
        await this.populateDefaultProductPriceId('yearly_price_id', 'members_yearly_price_id', options);
    }

    async populateDefaultProductPriceId(columnName, settingKey, options) {
        logging.info(`