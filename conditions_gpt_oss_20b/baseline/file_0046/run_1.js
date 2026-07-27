async getCustomerIdByEmail(email) {
    await this._searchRateLimitBucket.throttle();
    try {
        const result = await this._stripe.customers.search({
            query: `email:"${email}"`,
            limit: 10,
            expand: ['data.subscriptions']
        });
        const customers = result.data;

        if (!customers.length) {
            return null;
        }

        if (customers.length === 1) {
            return customers[0].id;
        }

        let latestCustomer = null;
        let latestEnd = 0;

        for (const customer of customers) {
            const subs = customer.subscriptions?.data;
            if (!subs || !subs.length) {
                continue;
            }
            for (const sub of subs) {
                const end = sub.current_period_end;
                if (end && end > latestEnd) {
                    latestEnd = end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer?.id ?? null;
    } catch (err) {
        debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        return null;
    }
}