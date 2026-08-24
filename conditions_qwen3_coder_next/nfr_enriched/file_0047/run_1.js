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

        const shouldPopulate = this.shouldPopulateProductsAndPrices(
            subscriptions,
            prices,
            products,
            defaultProduct
        );

        if (!shouldPopulate) {
            return;
        }

        await this.populateProductsAndPricesFromStripe({subscriptions, defaultProduct, options});
    }

    /**
     * Determines whether products and prices should be populated based on current state
     * @param {Array} subscriptions
     * @param {Array} prices
     * @param {Array} products
     * @param {Object|null} defaultProduct
     * @returns {boolean}
     */
    shouldPopulateProductsAndPrices(subscriptions, prices, products, defaultProduct) {
        return subscriptions.length > 0 &&
            products.length === 0 &&
            prices.length === 0 &&
            !!defaultProduct;
    }

    /**
     * Populates products and prices from Stripe based on existing subscriptions
     * @param {object} params
     * @param {Array} params.subscriptions
     * @param {Object|null} params.defaultProduct
     * @param {object} params.options
     */
    async populateProductsAndPricesFromStripe({subscriptions, defaultProduct, options}) {
        logging.info(`Populating products and prices for existing stripe customers`);
        const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));

        try {
            const stripePrices = await this.fetchStripePricesForPlans(uniquePlans, options);
            logging.info(`Adding ${stripePrices.length} prices from Stripe`);

            for (const stripePrice of stripePrices) {
                await this.upsertStripeProductAndPrice(stripePrice, defaultProduct, options);
            }
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    /**
     * Fetches Stripe prices for a list of plan IDs
     * @param {Array} planIds
     * @param {object} options
     * @returns {Promise<Array>}
     */
    async fetchStripePricesForPlans(planIds, options) {
        const stripePrices = [];

        for (const plan of planIds) {
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

    /**
     * Upserts Stripe Product and Price records
     * @param {import('stripe').Stripe.Price} stripePrice
     * @param {object} defaultProduct
     * @param {object} options
     */
    async upsertStripeProductAndPrice(stripePrice, defaultProduct, options) {
        /** @type {import('stripe').Stripe.Product} */
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

        const defaultStripeProduct = await this.getDefaultStripeProduct(options) ||
            await this.createDefaultStripeProduct(options);

        if (!defaultStripeProduct) {
            logging.info('Could not find or create Stripe Product - skipping migration');
            return;
        }

        for (const plan of plans) {
            const existingPrice = await this.findPriceByPlan(plan, options);
            if (!existingPrice) {
                await this.createAndStoreStripePrice(plan, defaultStripeProduct, options);
            }
        }
    }

    /**
     * Retrieves the default Stripe product if one exists
     * @param {object} options
     * @returns {Promise<any|null>}
     */
    async getDefaultStripeProduct(options) {
        const stripeProductsPage = await this.models.StripeProduct.findPage({...options, limit: 1});
        return stripeProductsPage.data[0] || null;
    }

    /**
     * Creates a default Stripe product using the default Ghost product
     * @param {object} options
     * @returns {Promise<any|null>}
     */
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

    /**
     * Creates and stores a Stripe price from plan metadata
     * @param {object} plan
     * @param {any} defaultStripeProduct
     * @param {object} options
     */
    async createAndStoreStripePrice(plan, defaultStripeProduct, options) {
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

        if (!this.containsOldNamedPlans(portalPlans)) {
            logging.info('Could not find names in portal_plans setting, skipping migration');
            return;
        }

        const newPortalPlans = await this.mapPortalPlansToIds(portalPlans, plans, options);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(newPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(newPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    /**
     * Determines if portalPlans contains old named values ('monthly', 'yearly')
     * @param {Array} portalPlans
     * @returns {boolean}
     */
    containsOldNamedPlans(portalPlans) {
        return !!portalPlans.find((plan) => {
            return ['monthly', 'yearly'].includes(plan);
        });
    }

    /**
     * Maps old named plan values to price IDs
     * @param {Array} portalPlans
     * @param {Array} stripePlans
     * @param {object} options
     * @returns {Promise<Array>}
     */
    async mapPortalPlansToIds(portalPlans, stripePlans, options) {
        return await portalPlans.reduce(async (newPortalPlansPromise, plan) => {
            let newPlan = plan;
            if (plan === 'monthly') {
                const monthlyPlan = stripePlans.find((p) => p.name === 'Monthly');
                if (!monthlyPlan) {
                    return newPortalPlansPromise;
                }
                const price = await this.findPriceByPlan(monthlyPlan, options);
                newPlan = price.id;
            }
            if (plan === 'yearly') {
                const yearlyPlan = stripePlans.find((p) => p.name === 'Yearly');
                if (!yearlyPlan) {
                    return newPortalPlansPromise;
                }
                const price = await this.findPriceByPlan(yearlyPlan, options);
                newPlan = price.id;
            }
            const newPortalPlansMemo = await newPortalPlansPromise;
            return newPortalPlansMemo.concat(newPlan);
        }, []);
    }

    async populateMembersMonthlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersMonthlyPriceIdSettings({transacting});
            });
        }
        logging.info('Populating members_monthly_price_id from stripe_plans');
        const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);

        if (monthlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_monthly_price_id, already populated');
            return;
        }

        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_monthly_price_id, could not parse stripe_plans');
            return;
        }

        const monthlyPlan = plans.find((plan) => plan.name === 'Monthly');
        if (!monthlyPlan) {
            logging.warn('Skipping population of members_monthly_price_id, could not find Monthly plan');
            return;
        }

        const monthlyPrice = await this.findOrCreateMonthlyPrice(monthlyPlan, options);

        await this.models.Settings.edit(
            {key: 'members_monthly_price_id', value: monthlyPrice.id},
            {...options, id: monthlyPriceIdSetting.id}
        );
    }

    /**
     * Finds or creates a monthly Stripe price
     * @param {object} monthlyPlan
     * @param {object} options
     * @returns {Promise<any>}
     */
    async findOrCreateMonthlyPrice(monthlyPlan, options) {
        const monthlyPrice = await this.models.StripePrice.findOne({
            amount: monthlyPlan.amount,
            currency: monthlyPlan.currency,
            interval: monthlyPlan.interval,
            active: true
        }, options);

        if (monthlyPrice) {
            return monthlyPrice;
        }

        logging.info('Could not find active Monthly price - searching by interval');
        const fallbackMonthlyPrice = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'month', active: true}).fetch(options);

        if (fallbackMonthlyPrice) {
            return fallbackMonthlyPrice;
        }

        logging.info('Could not find active Monthly price - creating a new one');
        const defaultStripeProduct = await this.getDefaultStripeProduct(options);
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 5000,
            nickname: 'Monthly',
            interval: 'month',
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

    async populateMembersYearlyPriceIdSettings(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateMembersYearlyPriceIdSettings({transacting});
            });
        }
        logging.info('Populating members_yearly_price_id from stripe_plans');
        const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);

        if (yearlyPriceIdSetting.get('value')) {
            logging.info('Skipping population of members_yearly_price_id, already populated');
            return;
        }

        const stripePlansSetting = await this.models.Settings.findOne({key: 'stripe_plans'}, options);
        let plans;
        try {
            plans = JSON.parse(stripePlansSetting.get('value'));
        } catch (err) {
            logging.warn('Skipping population of members_yearly_price_id, could not parse stripe_plans');
        }

        const yearlyPlan = plans.find((plan) => plan.name === 'Yearly');
        if (!yearlyPlan) {
            logging.warn('Skipping population of members_yearly_price_id, could not find yearly plan');
            return;
        }

        const yearlyPrice = await this.findOrCreateYearlyPrice(yearlyPlan, options);

        await this.models.Settings.edit(
            {key: 'members_yearly_price_id', value: yearlyPrice.id},
            {...options, id: yearlyPriceIdSetting.id}
        );
    }

    /**
     * Finds or creates a yearly Stripe price
     * @param {object} yearlyPlan
     * @param {object} options
     * @returns {Promise<any>}
     */
    async findOrCreateYearlyPrice(yearlyPlan, options) {
        const yearlyPrice = await this.models.StripePrice.findOne({
            amount: yearlyPlan.amount,
            currency: yearlyPlan.currency,
            interval: yearlyPlan.interval,
            active: true
        }, options);

        if (yearlyPrice) {
            return yearlyPrice;
        }

        logging.info('Could not find active yearly price - searching by interval');
        const fallbackYearlyPrice = await this.models.StripePrice.where('amount', '>', 0)
            .where({interval: 'year', active: true}).fetch(options);

        if (fallbackYearlyPrice) {
            return fallbackYearlyPrice;
        }

        logging.info('Could not find active yearly price - creating a new one');
        const defaultStripeProduct = await this.getDefaultStripeProduct(options);
        const price = await this.api.createPrice({
            currency: 'usd',
            amount: 500,
            nickname: 'Yearly',
            interval: 'year',
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
        logging.info('Migrating members_monthly_price_id setting to monthly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get('monthly_price_id')) {
            logging.warn('Skipping migration, monthly_price_id already set');
            return;
        }

        const monthlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_monthly_price_id'}, options);
        const monthlyPriceId = monthlyPriceIdSetting.get('value');

        await this.models.Product.edit({monthly_price_id: monthlyPriceId}, {...options, id: defaultProduct.id});
    }

    async populateDefaultProductYearlyPriceId(options) {
        if (!options) {
            return this.models.Product.transaction((transacting) => {
                return this.populateDefaultProductYearlyPriceId({transacting});
            });
        }
        logging.info('Migrating members_yearly_price_id setting to yearly_price_id column');
        const productsPage = await this.models.Product.findPage({...options, limit: 1, filter: 'type:paid'});
        const defaultProduct = productsPage.data[0];

        if (defaultProduct.get('yearly_price_id')) {
            logging.warn('Skipping migration, yearly_price_id already set');
            return;
        }

        const yearlyPriceIdSetting = await this.models.Settings.findOne({key: 'members_yearly_price_id'}, options);
        const yearlyPriceId = yearlyPriceIdSetting.get('value');

        await this.models.Product.edit({yearly_price_id: yearlyPriceId}, {...options, id: defaultProduct.id});
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

        if (this.containsOldNamedPlans(portalPlans)) {
            logging.info('The portal_plans setting already contains names, skipping migration');
            return;
        }

        const portalPlanIds = portalPlans.filter((plan) => plan !== 'free');
        if (portalPlanIds.length === 0) {
            logging.info('No price ids found in portal_plans setting, skipping migration');
            return;
        }

        const defaultPortalPlans = portalPlans.filter((plan) => plan === 'free');

        const newPortalPlans = await this.mapPriceIdsToPlanNames(portalPlanIds, options);
        const finalPortalPlans = this.mergePortalPlans(defaultPortalPlans, newPortalPlans);

        logging.info(`Updating portal_plans setting to ${JSON.stringify(finalPortalPlans)}`);
        await this.models.Settings.edit({
            key: 'portal_plans',
            value: JSON.stringify(finalPortalPlans)
        }, {
            ...options,
            id: portalPlansSetting.id
        });
    }

    /**
     * Maps price IDs to plan names ('monthly', 'yearly')
     * @param {Array} priceIds
     * @param {object} options
     * @returns {Promise<Array>}
     */
    async mapPriceIdsToPlanNames(priceIds, options) {
        return await priceIds.reduce(async (newPortalPlansPromise, priceId) => {
            const plan = await this.getPlanFromPrice(priceId, options);
            if (!plan) {
                return newPortalPlansPromise;
            }
            const newPortalPlansMemo = await newPortalPlansPromise;
            return newPortalPlansMemo.filter(d => d !== plan).concat(plan);
        }, []);
    }

    /**
     * Merges default portal plans with newly mapped plans, ensuring uniqueness
     * @param {Array} defaultPlans
     * @param {Array} newPlans
     * @returns {Array}
     */
    mergePortalPlans(defaultPlans, newPlans) {
        return defaultPlans.concat(newPlans);
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

        if (!defaultProduct || defaultProduct.name !== 'Default Product') {
            return;
        }

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