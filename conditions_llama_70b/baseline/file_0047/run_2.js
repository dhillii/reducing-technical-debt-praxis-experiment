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

    const defaultProduct = await this.getDefaultProduct(options);

    if (subscriptions.length > 0 && products.length === 0 && prices.length === 0 && defaultProduct) {
        try {
            logging.info(`Populating products and prices for existing stripe customers`);
            const uniquePlans = _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));

            const stripePrices = await this.getStripePrices(uniquePlans);

            logging.info(`Adding ${stripePrices.length} prices from Stripe`);
            await this.addStripePrices(stripePrices, defaultProduct, options);
        } catch (e) {
            logging.error(`Failed to populate products/prices from stripe`);
            logging.error(e);
        }
    }
}

async getDefaultProduct(options) {
    const {data} = await this.models.Product.findPage({
        ...options,
        limit: 1,
        filter: 'type:paid'
    });
    return data[0] && data[0].toJSON();
}

async getStripePrices(uniquePlans) {
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

async addStripePrices(stripePrices, defaultProduct, options) {
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