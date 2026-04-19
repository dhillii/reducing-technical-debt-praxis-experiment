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
        if (!this.api._configured) {
            logging.info('Stripe not configured - skipping migrations');
            return;
        } else if (this.api.testEnv) {
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
            await this.updatePortalPlansSetting();
            await this.revertPortalPlansSetting();
            await this.removeInvalidSubscriptions();
            await this.setDefaultProductName();
            await this.updateStripeProductNamesFromDefaultProduct();
        } catch (err) {
            logging.error(err);
        }
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
            await this._populateProductsAndPricesForExistingCustomers(subscriptions, defaultProduct, options);
        }
    }

    async _populateProductsAndPricesForExistingCustomers(subscriptions, defaultProduct, options) {
        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlans);
            await this._upsertProductsAndPrices(stripePrices, defaultProduct, options);
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    async _fetchStripePrices(plans) {
        const stripePrices = [];
        for (const plan of plans) {
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
        logging.info(`Adding ${stripePrices.length} prices from Stripe`);
        return stripePrices;
    }

    async _upsertProductsAndPrices(stripePrices, defaultProduct, options) {
        for (const stripePrice of stripePrices) {
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
        const defaultStripeProduct = await this._ensureDefaultStripeProduct(options);

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);

            if (!existingPrice) {
                await this._createAndStorePrice(plan, defaultStripeProduct, options);
            }
        }
    }

    async _ensureDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];

        if (!defaultStripeProduct) {
            logging.info('Could not find Stripe Product - creating one');
            const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
            const defaultProduct = productsPage.data[0];
            if (!defaultProduct) {
                logging.error('Could not find Product - skipping stripe_plans -> stripe_prices migration');
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

    async _createAndStorePrice(plan, defaultStripeProduct, options) {
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
            logging.error({err, message: 'Adding price failed'});
        }
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

        const containsOldValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));

        if (!containsOldValues) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this._mapPortalPlansToIds(plans, portalPlans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async _mapPortalPlansToIds(plans, portalPlans, options) {
        const newPortalPlans = [];
        for (const plan of portalPlans) {
            let newPlan = plan;
            if (plan === 'monthly' || plan === 'yearly') {
                const planItem = plans.find(p => p.name === plan.charAt(0).toUpperCase() + plan.slice(1));
                if (!planItem) continue;
                const price = await this.findPriceByPlan(planItem, options);
                if (price) newPlan = price.id;
            }
            newPortalPlans.push(newPlan);
        }
        return newPortalPlans;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }
        await this._populateMembersPriceIdSetting('Monthly', 'members_monthly_price_id', options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersYearlyPriceIdSettings({transacting});
            });
        }
        await this._populateMembersPriceIdSetting('Yearly', 'members_yearly_price_id', options);
    }

    async _populateMembersPriceIdSetting(planName, settingKey, options) {
        logging.info(`Populating ${settingKey} from stripe_plans`);
        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        if (setting.get('value')) {
            logging.info(`Skipping population of ${settingKey}, already populated`);
            return;
        }
        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            logging.warn(`Skipping population of ${settingKey}, could not parse stripe_plans`);
            return;
        }
        const plan = plans.find(p => p.name === planName);
        if (!plan) {
            logging.warn(`Skipping population of ${settingKey}, could not find ${planName} plan`);
            return;
        }
        let price = await this._findPriceByPlanAttributes(plan, options);
        if (!price) {
            logging.info(`Could not find active ${planName} price from stripe_plans - searching by interval`);
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: planName.toLowerCase(), active: true}).fetch(options);
        }
        if (!price) {
            logging.info(`Could not any active ${planName} price - creating a new one`);
            const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
            const defaultStripeProduct = stripeProductsPage.data[0];
            const priceData = {
                currency: 'usd',
                amount: planName === 'Monthly' ? 5000 : 500,
                nickname: planName,
                interval: planName.toLowerCase(),
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            };
            const stripePrice = await this.api.createPrice(priceData);
            price = await this.models.StripePrice.add({
                stripe_price_id: stripePrice.id,
                stripe_product_id: defaultStripeProduct.get('stripe_product_id'),
                active: stripePrice.active,
                nickname: stripePrice.nickname,
                currency: stripePrice.currency,
                amount: stripePrice.unit_amount,
                type: 'recurring',
                interval: stripePrice.recurring.interval
            }, options);
        }
        await this.models.Settings.edit({key: settingKey, value: price.id}, {...options, id: setting.id});
    }

    async _findPriceByPlanAttributes(plan, options) {
        return await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);
    }

    async populateDefaultProductMonthlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductMonthlyPriceId({transacting});
            });
        }
        await this._populateDefaultProductPriceId('monthly_price_id', 'members_monthly_price_id', options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }
        await this._populateDefaultProductPriceId('yearly_price_id', 'members_yearly_price_id', options);
    }

    async _populateDefaultProductPriceId(column, settingKey, options) {
        logging.info(`Migrating ${settingKey} setting to ${column} column`);
        const productsPage = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get(column)) {
            logging.warn(`Skipping migration, ${column} already set`);
            return;
        }

        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        const value = setting.get('value');

        await this.models.Product.edit({[column]: value}, {...options, id: defaultProduct.id});
    }

    async revertPortalPlansSetting(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.revertPortalPlansSetting({transacting});
            });
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

        const newPortalPlans = await this._mapPortalPlanIdsToNames(portalPlanIds, defaultPortalPlans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    async _mapPortalPlanIdsToNames(priceIds, defaultPortalPlans, options) {
        const newPortalPlans = [...defaultPortalPlans];
        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (plan) {
                const updated = newPortalPlans.filter(p => p !== plan).concat(plan);
                newPortalPlans.splice(0, newPortalPlans.length, ...updated);
            }
        }
        return newPortalPlans;
    }

    async removeInvalidSubscriptions(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.removeInvalidSubscriptions({transacting});
            });
        }
        const subscriptionModels = await this.models.StripeCustomerSubscription.findAll({
            ...options,
            withRelated: ['stripePrice']
        });
        const invalidSubscriptions = subscriptionModels.filter((sub) => {
            return !sub.toJSON().price;
        });
        if (invalidSubscriptions.length > 0) {
            logging.warn(`Deleting ${invalidSubscriptions.length} invalid subscription(s)`);
            for (let sub of invalidSubscriptions) {
                logging.warn(`Deleting subscription - ${sub.id} - no price found`);
                await sub.destroy(options);
            }
        } else {
            logging.info(`No invalid subscriptions, skipping migration`);
        }
    }

    async setDefaultProductName(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.setDefaultProductName({transacting});
            });
        }

        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });

        const defaultProduct = data[0] && data[0].toJSON();

        if (defaultProduct && defaultProduct.name === 'Default Product') {
            const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);
            if (siteTitle) {
                await this.models.Product.edit({
                    name: siteTitle.get('value')
                }, {
                    ...options,
                    id: defaultProduct.id
                });
            }
        }
    }

    async updateStripeProductNamesFromDefaultProduct(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.updateStripeProductNamesFromDefaultProduct({transacting});
            });
        }

        const {data} = await this.models.StripeProduct.findPage({
            ...options,
            limit: 'all'
        });

        const siteTitle = await this.models.Settings.findOne({key: 'title'}, options);

        if (!siteTitle) {
            return;
        }

        for (const model of data) {
            const product = await this.api.getProduct(model.get('stripe_product_id'));

            if (product.name === 'Default Product') {
                await this.api.updateProduct(product.id, {
                    name: siteTitle.get('value')
                });
            }
        }
    }
};