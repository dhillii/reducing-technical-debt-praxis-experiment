async populateProductsAndPrices(options) {
    if (!options) {
        return this.models.Product.transaction((transacting) => {
            return this.populateProductsAndPrices({transacting});
        });
    }

    const hasRequiredData = await this.hasRequiredData(options);
    if (!hasRequiredData) {
        return;
    }

    try {
        const uniquePlans = await this.getUniquePlans(options);
        const stripePrices = await this.getStripePrices(uniquePlans);

        logging.info(`Adding ${stripePrices.length} prices from Stripe`);
        for (const stripePrice of stripePrices) {
            await this.addStripeProductAndPrice(stripePrice, options);
        }
    } catch (e) {
        logging.error(`Failed to populate products/prices from stripe`);
        logging.error(e);
    }
}

async hasRequiredData(options) {
    const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(options);
    const priceModels = await this.models.StripePrice.findAll(options);
    const productModels = await this.models.StripeProduct.findAll(options);
    const {data} = await this.models.Product.findPage({
        ...options,
        limit: 1,
        filter: 'type:paid'
    });
    const defaultProduct = data[0] && data[0].toJSON();

    return subscriptionModels.length > 0 && productModels.length === 0 && priceModels.length === 0 && defaultProduct;
}

async getUniquePlans(options) {
    const subscriptionModels = await this.models.StripeCustomerSubscription.findAll(options);
    const subscriptions = subscriptionModels.toJSON();
    return _.uniq(subscriptions.map(d => _.get(d, 'plan.id')));
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

async addStripeProductAndPrice(stripePrice, options) {
    const stripeProduct = stripePrice.product;
    await this.models.StripeProduct.upsert({
        product_id: options.defaultProduct.id,
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