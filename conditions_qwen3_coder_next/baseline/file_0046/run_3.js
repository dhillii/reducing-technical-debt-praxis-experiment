async getCustomerIdByEmail(email) {
        await this._searchRateLimitBucket.throttle();
        try {
            const result = await this._stripe.customers.search({
                query: `email:"${email}"`,
                limit: 10,
                expand: ['data.subscriptions']
            });
            const customers = result.data;

            // No customer found, return null
            if (customers.length === 0) {
                return;
            }

            // Return the only customer found
            if (customers.length === 1) {
                return customers[0].id;
            }

            // Multiple customers found, return the one with the most recent subscription
            return this._getLatestCustomerBySubscription(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    _getLatestCustomerBySubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (let customer of customers) {
            // skip customers with no subscriptions
            if (!customer.subscriptions?.data?.length) {
                continue;
            }

            // find the customer with the most recent subscription
            for (let subscription of customer.subscriptions.data) {
                if (subscription.current_period_end && subscription.current_period_end > latestSubscriptionTime) {
                    latestSubscriptionTime = subscription.current_period_end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer.id;
    }