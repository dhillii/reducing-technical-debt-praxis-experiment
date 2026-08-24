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

        if (!this.shouldPopulateProductsAndPrices(subscriptions, products, prices, defaultProduct)) {
            return;
        }

        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));

            const stripePrices = await this.fetchStripePrices(uniquePlans);
            logging.info(`Adding ${stripePrices.length} prices from Stripe`);

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
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }

    /**
     * Determines whether products and prices should be populated based on current state
     * @param {Array} subscriptions
     * @param {Array} products
     * @param {Array} prices
     * @param {Object|null} defaultProduct
     * @returns {boolean}
     */
    shouldPopulateProductsAndPrices(subscriptions, products, prices, defaultProduct) {
        return subscriptions.length > 0
            && products.length === 0
            && prices.length === 0
            && !!defaultProduct;
    }

    /**
     * Fetches Stripe prices for given plan IDs
     * @param {Array} uniquePlans
     * @returns {Promise<Array>}
     */
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