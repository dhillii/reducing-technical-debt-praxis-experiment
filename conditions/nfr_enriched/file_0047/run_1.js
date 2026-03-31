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

        if (subscriptions.length === 0 || products.length > 0 || prices.length > 0 || !defaultProduct) {
            return;
        }

        try {
            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this.fetchStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            await this.saveStripePricesAndProducts(stripePrices, defaultProduct, options);
        } catch (e) {
            logging.error('Failed to populate products/prices from stripe');
            logging.error(e);
        }
    }

    async fetchStripePrices(planIds) {
        const stripePrices = [];

        for (const planId of planIds) {
            try {
                const stripePrice = await this.api.getPrice(planId, {expand: ['product']});
                stripePrices.push(stripePrice);
            } catch (err) {
                if (err?.statusCode === 404) {
                    logging.warn(`Plan ${planId} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }

        return stripePrices;
    }

    async saveStripePricesAndProducts(stripePrices, defaultProduct, options) {
        for (const stripePrice of stripePrices) {
            const stripeProduct = stripePrice.product;

            await this.models.StripeProduct.upsert({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);

            await this.models.StripePrice.add(
                this.mapStripePrice(stripePrice, stripeProduct.id),
                options
            );
        }
    }

    mapStripePrice(stripePrice, stripeProductId) {
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

    async findPriceByPlan(plan, options) {
        const currency = (plan.currency || 'usd').toLowerCase();
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);

        return this.models.StripePrice.findOne({
            currency,
            amount,
            interval: plan.interval
        }, options);
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

            const stripeProduct = await this.api.createProduct({
                name: defaultProduct.get('name')
            });

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

            await this.models.StripePrice.add(
                this.mapStripePrice(price, stripeProduct.get('stripe_product_id')),
                options
            );
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateMembersMonthlyPriceIdSettings(opts));
        }

        await this.populateMembersPriceIdSetting('monthly', 'month', 5000, options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.withTransaction((opts) => this.populateMembersYearlyPriceIdSettings(opts));
        }

        await this.populateMembersPriceIdSetting('yearly', 'year', 50000, options);
    }

    async populateMembersPriceIdSetting(planType, interval, defaultAmount, options) {
        const settingKey = `members_${planType}_price_id`;
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

        const planName = planType === 'monthly' ? 'Monthly' : 'Yearly';
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
            logging.info(`Could not find any active ${planName} price - creating a new one`);
            price = await this.createDefaultPrice(planName, interval, defaultAmount, options);
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceSetting.id}
        );
    }

    async createDefaultPrice(nickname, interval, amount, options) {
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

        return this.models.StripePrice.add(
            this.mapStripePrice(price, defaultStripeProduct.get('stripe_product_id')),
            options
        );
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

        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });

        const defaultProduct = data[0];

        if (!defaultProduct || defaultProduct.get(columnName)) {
            logging.warn(`Skipping migration, ${columnName} already set`);
            return;
        }

        const priceSetting = await this.models.Settings.findOne({key: settingKey}, options);
        const priceId = priceSetting.get('value');

        await this.models.Product.edit({[columnName]: priceId}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.withTransaction((opts) => this.revertPortalPlansSetting(opts));
        }

        logging.info('Migrating portal_plans setting from ids to names');
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

        const containsNamedValues = portalPlans.some((plan) => ['monthly', 'yearly'].includes(plan));

        if (containsNamedValues) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter((plan) => plan !== 'free');

        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter((plan) => plan === 'free');
        const newPortalPlans = await this.convertPriceIdsToPlans(portalPlanIds, defaultPortalPlans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async convertPriceIdsToPlans(priceIds, defaultPlans, options) {
        const plans = new Set(defaultPlans);

        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (plan) {
                plans.add(plan);
            }
        }

        return Array.from(plans);
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.withTransaction((opts) => this.removeInvalidSubscriptions(opts));
        }

        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({