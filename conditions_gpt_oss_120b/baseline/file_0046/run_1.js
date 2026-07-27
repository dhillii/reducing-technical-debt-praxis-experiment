async getCustomerIdByEmail(email) {
    await this._searchRateLimitBucket.throttle();
    try {
        const result = await this._stripe.customers.search({
            query: `email:"${email}"`,
            limit: 10,
            expand: ['data.subscriptions']
        });
        const customers = result.data;

        if (customers.length === 0) {
            return null;
        }
        if (customers.length === 1) {
            return customers[0].id;
        }

        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            const subs = customer.subscriptions?.data;
            if (!subs?.length) {
                continue;
            }
            for (const subscription of subs) {
                const end = subscription.current_period_end;
                if (end && end > latestSubscriptionTime) {
                    latestSubscriptionTime = end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer.id;
    } catch (err) {
        debug(`getCustomerIdByEmail(${email}) -> ${err.type}:${err.message}`);
    }
}