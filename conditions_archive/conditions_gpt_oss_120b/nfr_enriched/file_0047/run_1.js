```javascript
const _ = require('lodash');
const logging = require('@tryghost/logging');

module.exports = class StripeMigrations {
    /**
     * @param {{models: any, api: import('./stripe-api')}} params
     */
    constructor({models, api}) {
        this.models = models;
        this.api = api;
    }

    /** Execute all migrations in order */
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

    /** Helper: run a method inside a transaction when options are omitted */
    async _withTransaction(method, options) {
        if (options) {
            return method(options);
        }
        return this.models.Product.transaction(transacting => method({transacting}));
    }

    /** Helper: fetch the default paid product */
    async _getDefaultProduct(options) {
        const {data} = await this.models.Product.findPage({
            ...options,
            limit: 1,
            filter: 'type:paid'
        });
        return data[0] && data[0].toJSON();
    }

    /** Helper: fetch or create the default Stripe product */
    async _getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        let defaultStripeProduct = stripeProductsPage.data[0];

        if (!defaultStripeProduct) {
            logging.info('Could not find Stripe Product - creating one');
            const defaultProduct = await this._getDefaultProduct(options);
            if (!defaultProduct) {
                logging.error('Could not find Product - skipping migration');
                return null;
            }
            const stripeProduct = await this.api.createProduct({name: defaultProduct.name});
            defaultStripeProduct = await this.models.StripeProduct.add({
                product_id: defaultProduct.id,
                stripe_product_id: stripeProduct.id
            }, options);
        }
        return defaultStripeProduct;
    }

    /** Helper: safely parse JSON setting value */
    async _parseJsonSetting(key, options) {
        const setting = await this.models.Settings.findOne({key}, options);
        if (!setting) {
            return null;
        }
        try {
            return JSON.parse(setting.get('value'));
        } catch (e) {
            return null;
        }
    }

    /** Populate products and prices for existing Stripe customers */
    async populateProductsAndPrices(options) {
        return this._withTransaction(async opts => {
            const [subs, prices, products] = await Promise.all([
                this.models.StripeCustomerSubscription.findAll(opts),
                this.models.StripePrice.findAll(opts),
                this.models.StripeProduct.findAll(opts)
            ]);
            const subscriptions = subs.toJSON();
            const defaultProduct = await this._getDefaultProduct(opts);

            if (!subscriptions.length || products.length || prices.length || !defaultProduct) {
                return;
            }

            logging.info('Populating products and prices for existing stripe customers');
            const uniquePlanIds = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
            const stripePrices = await this._fetchStripePrices(uniquePlanIds, opts);
            await this._storeStripePrices(stripePrices, defaultProduct.id, opts);
        }, options);
    }

    /** Fetch Stripe price objects for a list of plan IDs */
    async _fetchStripePrices(planIds, options) {
        const results = [];
        for (const planId of planIds) {
            try {
                const price = await this.api.getPrice(planId, {expand: ['product']});
                results.push(price);
            } catch (err) {
                if (err && err.statusCode === 404) {
                    logging.warn(`Plan ${planId} not found on Stripe - ignoring`);
                } else {
                    throw err;
                }
            }
        }
        logging.info(`Adding ${results.length} prices from Stripe`);
        return results;
    }

    /** Store fetched Stripe prices and related products */
    async _storeStripePrices(stripePrices, defaultProductId, options) {
        for (const stripePrice of stripePrices) {
            const stripeProduct = stripePrice.product;
            await this.models.StripeProduct.upsert({
                product_id: defaultProductId,
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

    /** Populate Stripe prices from the legacy `stripe_plans` setting */
    async populateStripePricesFromStripePlansSetting(options) {
        return this._withTransaction(async opts => {
            const plans = await this._parseJsonSetting('stripe_plans', opts);
            if (!plans) return;

            const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(opts);
            if (!defaultStripeProduct) return;

            for (const plan of plans) {
                const existing = await this.findPriceByPlan(plan, opts);
                if (!existing) {
                    await this._createStripePriceFromPlan(plan, defaultStripeProduct, opts);
                }
            }
        }, options);
    }

    /** Create a Stripe price from a plan definition */
    async _createStripePriceFromPlan(plan, defaultStripeProduct, options) {
        try {
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
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    /** Update portal_plans setting from names to ids */
    async updatePortalPlansSetting(plans, options) {
        return this._withTransaction(async opts => {
            logging.info('Migrating portal_plans setting from names to ids');
            const portalPlans = await this._parseJsonSetting('portal_plans', opts);
            if (!portalPlans) return;

            const hasNames = portalPlans.some(p => ['monthly', 'yearly'].includes(p));
            if (!hasNames) {
                logging.info('Could not find names in portal_plans setting, skipping migration');
                return;
            }

            const newPlans = await this._mapPortalPlanNamesToIds(portalPlans, plans, opts);
            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPlans)}`);
            const setting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);
            await this.models.Settings.edit({
                key: 'portal_plans',
                value: JSON.stringify(newPlans)
            }, {...opts, id: setting.id});
        }, options);
    }

    /** Convert portal plan names (monthly/yearly) to Stripe price ids */
    async _mapPortalPlanNamesToIds(portalPlans, allPlans, options) {
        const result = [];
        for (const planName of portalPlans) {
            if (planName === 'monthly' || planName === 'yearly') {
                const matchingPlan = allPlans.find(p => p.name.toLowerCase() === planName);
                if (matchingPlan) {
                    const price = await this.findPriceByPlan(matchingPlan, options);
                    if (price) result.push(price.id);
                }
            } else {
                result.push(planName);
            }
        }
        return result;
    }

    /** Populate members_monthly_price_id from stripe_plans */
    async populateMembersMonthlyPriceIdSettings(options) {
        return this._withTransaction(async opts => {
            logging.info('Populating members_monthly_price_id from stripe_plans');
            const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, opts);
            if (setting.get('value')) {
                logging.info('Skipping population of members_monthly_price_id, already populated');
                return;
            }

            const plans = await this._parseJsonSetting('stripe_plans', opts);
            if (!plans) return;

            const monthlyPlan = plans.find(p => p.name === 'Monthly');
            if (!monthlyPlan) {
                logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
                return;
            }

            const price = await this._findOrCreateMonthlyPrice(monthlyPlan, opts);
            await this.models.Settings.edit({
                key: 'members_monthly_price_id',
                value: price.id
            }, {...opts, id: setting.id});
        }, options);
    }

    /** Find or create a monthly Stripe price */
    async _findOrCreateMonthlyPrice(plan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info('Could not find active Monthly price from stripe_plans - searching by interval');
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'month', active: true}).fetch(options);
        }

        if (!price) {
            logging.info('Could not any active Monthly price - creating a new one');
            const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(options);
            const stripePrice = await this.api.createPrice({
                currency: 'usd',
                amount: 5000,
                nickname: 'Monthly',
                interval: 'month',
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            });
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
        return price;
    }

    /** Populate members_yearly_price_id from stripe_plans */
    async populateMembersYearlyPriceIdSettings(options) {
        return this._withTransaction(async opts => {
            logging.info('Populating members_yearly_price_id from stripe_plans');
            const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, opts);
            if (setting.get('value')) {
                logging.info('Skipping population of members_yearly_price_id, already populated');
                return;
            }

            const plans = await this._parseJsonSetting('stripe_plans', opts);
            if (!plans) return;

            const yearlyPlan = plans.find(p => p.name === 'Yearly');
            if (!yearlyPlan) {
                logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
                return;
            }

            const price = await this._findOrCreateYearlyPrice(yearlyPlan, opts);
            await this.models.Settings.edit({
                key: 'members_yearly_price_id',
                value: price.id
            }, {...opts, id: setting.id});
        }, options);
    }

    /** Find or create a yearly Stripe price */
    async _findOrCreateYearlyPrice(plan, options) {
        let price = await this.models.StripePrice.findOne({
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            active: true
        }, options);

        if (!price) {
            logging.info('Could not find active yearly price from stripe_plans - searching by interval');
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval: 'year', active: true}).fetch(options);
        }

        if (!price) {
            logging.info('Could not any active yearly price - creating a new one');
            const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(options);
            const stripePrice = await this.api.createPrice({
                currency: 'usd',
                amount: 500,
                nickname: 'Yearly',
                interval: 'year',
                active: true,
                type: 'recurring',
                product: defaultStripeProduct.get('stripe_product_id')
            });
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
        return price;
    }

    /** Migrate members_monthly_price_id to product.monthly_price_id column */
    async populateDefaultProductMonthlyPriceId(options) {
        return this._withTransaction(async opts => {
            logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
            const product = await this._getDefaultProduct(opts);
            if (!product || product.monthly_price_id) {
                logging.warn('Skipping migration, monthly_price_id already set');
                return;
            }
            const setting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, opts);
            await this.models.Product.edit({
                monthly_price_id: setting.get('value')
            }, {...opts, id: product.id});
        }, options);
    }

    /** Migrate members_yearly_price_id to product.yearly_price_id column */
    async populateDefaultProductYearlyPriceId(options) {
        return this._withTransaction(async opts => {
            logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
            const product = await this._getDefaultProduct(opts);
            if (!product || product.yearly_price_id) {
                logging.warn('Skipping migration, yearly_price_id already set');
                return;
            }
            const setting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, opts);
            await this.models.Product.edit({
                yearly_price_id: setting.get('value')
            }, {...opts, id: product.id});
        }, options);
    }

    /** Revert portal_plans setting from ids back to names */
    async revertPortalPlansSetting(options) {
        return this._withTransaction(async opts => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlans = await this._parseJsonSetting('portal_plans', opts);
            if (!portalPlans) return;

            const hasNames = portalPlans.some(p => ['monthly', 'yearly'].includes(p));
            if (hasNames) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const priceIds = portalPlans.filter(p => p !== 'free');
            if (!priceIds.length) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const defaultPlans = portalPlans.filter(p => p === 'free');
            const newPlans = await this._convertPriceIdsToNames(priceIds, defaultPlans, opts);
            logging.info(`Updating portal_plans setting to ${JSON.stringify(newPlans)}`);
            const setting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);
            await this.models.Settings.edit({
                key: 'portal_plans',
                value: JSON.stringify(newPlans)
            }, {...opts, id: setting.id});
        }, options);
    }

    /** Convert price IDs to plan names (monthly/yearly) */
    async _convertPriceIdsToNames(priceIds, accumulator, options) {
        for (const priceId of priceIds) {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (plan) {
                accumulator = accumulator.filter(p => p !== plan).concat(plan);
            }
        }
        return accumulator;
    }

    /** Remove subscriptions that have no associated price */
    async removeInvalidSubscriptions(options) {
        return this._withTransaction(async opts => {
            const subs = await this.models.StripeCustomerSubscription.findAll({
                ...opts,
                withRelated: ['stripePrice']
            });
            const invalid = subs.filter(s => !s.toJSON().price);
            if (!invalid.length) {
                logging.info('No invalid subscriptions, skipping migration');
                return;
            }
            logging.warn(`Deleting ${invalid.length} invalid subscription(s)`);
            for (const sub of invalid) {
                logging.warn(`Deleting subscription - ${sub.id} - no price found`);
                await sub.destroy(opts);
            }
        }, options);
    }

    /** Set default product name from site title if still generic */
    async setDefaultProductName(options) {
        return this._withTransaction(async opts => {
            const {data} = await this.models.Product.findPage({
                ...opts,
                limit: 1,
                filter: 'type:paid'
            });
            const defaultProduct = data[0] && data[0].toJSON();
            if (!defaultProduct || defaultProduct.name !== 'Default Product') return;

            const siteTitle = await this.models.Settings.findOne({key: 'title'}, opts);
            if (siteTitle) {
                await this.models.Product.edit({
                    name: siteTitle.get('value')
                }, {...opts, id: defaultProduct.id});
            }
        }, options);
    }

    /** Update Stripe product names to match the default product name */
    async updateStripeProductNamesFromDefaultProduct(options) {
        return this._withTransaction(async opts => {
            const {data} = await this.models.StripeProduct.findPage({
                ...opts,
                limit: 'all'
            });
            const siteTitle = await this.models.Settings.findOne({key: 'title'}, opts);
            if (!siteTitle) return;

            for (const model of data) {
                const product = await this.api.getProduct(model.get('stripe_product_id'));
                if (product.name === 'Default Product') {
                    await this.api.updateProduct(product.id, {name: siteTitle.get('value')});
                }
            }
        }, options);
    }

    /** Find a Stripe price matching a plan definition */
    async findPriceByPlan(plan, options) {
        const currency = plan.currency ? plan.currency.toLowerCase() : 'usd';
        const amount = Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount);
        return this.models.StripePrice.findOne({currency, amount, interval: plan.interval}, options);
    }

    /** Resolve plan name (monthly/yearly) from a Stripe price ID */
    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        if (!price) return null;
        const interval = price.get('interval');
        return interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null;
    }
};
```