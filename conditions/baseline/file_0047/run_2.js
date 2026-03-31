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
            return logging.info('Stripe not configured - skipping migrations');
        }
        if (this.api.testEnv) {
            return logging.info('Stripe is in test mode - skipping migrations');
        }

        const migrations = [
            'populateProductsAndPrices',
            'populateStripePricesFromStripePlansSetting',
            'populateMembersMonthlyPriceIdSettings',
            'populateMembersYearlyPriceIdSettings',
            'populateDefaultProductMonthlyPriceId',
            'populateDefaultProductYearlyPriceId',
            'revertPortalPlansSetting',
            'removeInvalidSubscriptions',
            'setDefaultProductName',
            'updateStripeProductNamesFromDefaultProduct'
        ];

        try {
            for (const migration of migrations) {
                await this[migration]();
            }
        } catch (err) {
            logging.error(err);
        }
    }

    /**
     * Wraps a method in a transaction if no options are provided.
     */
    withTransaction(fn) {
        return (options) => {
            if (!options) {
                return this.models.Product.transaction(transacting => fn({transacting}));
            }
            return fn(options);
        };
    }

    async populateProductsAndPrices(options) {
        return this.withTransaction(async (opts) => {
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
                const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
                const stripePrices = await this._fetchStripePrices(uniquePlans);

                logging.info(`Adding ${stripePrices.length} prices from Stripe`);
                for (const stripePrice of stripePrices) {
                    await this._upsertStripePrice(stripePrice, defaultProduct.id, opts);
                }
            } catch (e) {
                logging.error('Failed to populate products/prices from stripe');
                logging.error(e);
            }
        })(options);
    }

    async _fetchStripePrices(plans) {
        const stripePrices = [];
        for (const plan of plans) {
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

    async _upsertStripePrice(stripePrice, productId, options) {
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

    _buildStripePriceData(price, stripeProductId) {
        return {
            stripe_price_id: price.id,
            stripe_product_id: stripeProductId,
            active: price.active,
            nickname: price.nickname,
            currency: price.currency,
            amount: price.unit_amount,
            type: 'recurring',
            interval: price.recurring.interval
        };
    }

    async findPriceByPlan(plan, options) {
        return this.models.StripePrice.findOne({
            currency: plan.currency ? plan.currency.toLowerCase() : 'usd',
            amount: Number.isInteger(plan.amount) ? plan.amount : parseInt(plan.amount),
            interval: plan.interval
        }, options);
    }

    async getPlanFromPrice(priceId, options) {
        const price = await this.models.StripePrice.findOne({id: priceId}, options);
        const intervalMap = {month: 'monthly', year: 'yearly'};
        return intervalMap[price?.get('interval')] ?? null;
    }

    async populateStripePricesFromStripePlansSetting(options) {
        return this.withTransaction(async (opts) => {
            const plans = await this._parseSetting('stripe_plans', opts);
            if (!plans) {
                return;
            }

            const defaultStripeProduct = await this._getOrCreateDefaultStripeProduct(opts);
            if (!defaultStripeProduct) {
                return;
            }

            for (const plan of plans) {
                await this._ensureStripePriceExists(plan, defaultStripeProduct, opts);
            }
        })(options);
    }

    async _getOrCreateDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        if (stripeProductsPage.data[0]) {
            return stripeProductsPage.data[0];
        }

        logging.info('Could not find Stripe Product - creating one');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type: paid'});
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

    async _ensureStripePriceExists(plan, defaultStripeProduct, options) {
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
                product: defaultStripeProduct.get('stripe_product_id')
            });

            await this.models.StripePrice.add(
                this._buildStripePriceData(price, defaultStripeProduct.get('stripe_product_id')),
                options
            );
        } catch (err) {
            logging.error({err, message: 'Adding price failed'});
        }
    }

    async updatePortalPlansSetting(plans, options) {
        return this.withTransaction(async (opts) => {
            logging.info('Migrating portal_plans setting from names to ids');
            const portalPlans = await this._parsePortalPlans(opts);
            if (!portalPlans) {
                return;
            }

            const containsOldValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
            if (!containsOldValues) {
                logging.info('Could not find names in portal_plans setting, skipping migration');
                return;
            }

            const newPortalPlans = await this._mapPortalPlansToIds(portalPlans, plans, opts);
            await this._savePortalPlans(newPortalPlans, opts);
        })(options);
    }

    async _mapPortalPlansToIds(portalPlans, plans, options) {
        const result = [];
        for (const plan of portalPlans) {
            if (plan === 'monthly' || plan === 'yearly') {
                const planName = plan === 'monthly' ? 'Monthly' : 'Yearly';
                const matchedPlan = plans.find(p => p.name === planName);
                if (!matchedPlan) {
                    continue;
                }
                const price = await this.findPriceByPlan(matchedPlan, options);
                result.push(price.id);
            } else {
                result.push(plan);
            }
        }
        return result;
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        return this.withTransaction(async (opts) => {
            await this._populatePriceIdSetting({
                settingKey: 'members_monthly_price_id',
                planName: 'Monthly',
                interval: 'month',
                defaultPrice: {currency: 'usd', amount: 5000, nickname: 'Monthly'},
                logLabel: 'members_monthly_price_id'
            }, opts);
        })(options);
    }

    async populateMembersYearlyPriceIdSettings(options) {
        return this.withTransaction(async (opts) => {
            await this._populatePriceIdSetting({
                settingKey: 'members_yearly_price_id',
                planName: 'Yearly',
                interval: 'year',
                defaultPrice: {currency: 'usd', amount: 500, nickname: 'Yearly'},
                logLabel: 'members_yearly_price_id'
            }, opts);
        })(options);
    }

    async _populatePriceIdSetting({settingKey, planName, interval, defaultPrice, logLabel}, options) {
        logging.info(`Populating ${logLabel} from stripe_plans`);
        const priceIdSetting = await this.models.Settings.findOne({key: settingKey}, options);

        if (priceIdSetting.get('value')) {
            logging.info(`Skipping population of ${logLabel}, already populated`);
            return;
        }

        const plans = await this._parseSetting('stripe_plans', options);
        if (!plans) {
            logging.warn(`Skipping population of ${logLabel}, could not parse stripe_plans`);
            return;
        }

        const matchedPlan = plans.find(p => p.name === planName);
        if (!matchedPlan) {
            logging.warn(`Skipping population of ${logLabel}, could not find ${planName} plan`);
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
            price = await this.models.StripePrice.where('amount', '>', 0)
                .where({interval, active: true}).fetch(options);
        }

        if (!price) {
            logging.info(`Could not find any active ${planName} price - creating a new one`);
            price = await this._createDefaultPrice({...defaultPrice, interval}, options);
        }

        await this.models.Settings.edit(
            {key: settingKey, value: price.id},
            {...options, id: priceIdSetting.id}
        );
    }

    async _createDefaultPrice({currency, amount, nickname, interval}, options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        const defaultStripeProduct = stripeProductsPage.data[0];

        const price = await this.api.createPrice({
            currency,
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

    async populateDefaultProductMonthlyPriceId(options) {
        return this.withTransaction(async (opts) => {
            await this._populateDefaultProductPriceId({
                priceType: 'monthly',
                settingKey: 'members_monthly_price_id',
                columnName: 'monthly_price_id'
            }, opts);
        })(options);
    }

    async populateDefaultProductYearlyPriceId(options) {
        return this.withTransaction(async (opts) => {
            await this._populateDefaultProductPriceId({
                priceType: 'yearly',
                settingKey: 'members_yearly_price_id',
                columnName: 'yearly_price_id'
            }, opts);
        })(options);
    }

    async _populateDefaultProductPriceId({priceType, settingKey, columnName}, options) {
        logging.info(`Migrating ${settingKey} setting to ${columnName} column`);
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get(columnName)) {
            logging.warn(`Skipping migration, ${columnName} already set`);
            return;
        }

        const setting = await this.models.Settings.findOne({key: settingKey}, options);
        await this.models.Product.edit(
            {[columnName]: setting.get('value')},
            {...options, id: defaultProduct.id}
        );
    }

    async revertPortalPlansSetting(options) {
        return this.withTransaction(async (opts) => {
            logging.info('Migrating portal_plans setting from ids to names');
            const portalPlansSetting = await this.models.Settings.findOne({key: 'portal_plans'}, opts);
            const portalPlans = await this._parsePortalPlans(opts);
            if (!portalPlans) {
                return;
            }

            const containsNamedValues = portalPlans.some(plan => ['monthly', 'yearly'].includes(plan));
            if (containsNamedValues) {
                logging.info('The portal_plans setting already contains names, skipping migration');
                return;
            }

            const planIds = portalPlans.filter(plan => plan !== 'free');
            if (planIds.length === 0) {
                logging.info('No price ids found in portal_plans setting, skipping migration');
                return;
            }

            const freePlans = portalPlans.filter(plan => plan === 'free');
            const newPortalPlans = await this._mapPriceIdsToPlans(planIds, freePlans, opts);

            await this._savePortalPlans(newPortalPlans, opts, portalPlansS