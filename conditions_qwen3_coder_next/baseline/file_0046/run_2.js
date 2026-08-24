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
                return;
            }

            if (customers.length === 1) {
                return customers[0].id;
            }

            return this._findCustomerWithLatestSubscription(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    _findCustomerWithLatestSubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            if (this._hasValidSubscriptions(customer)) {
                for (const subscription of customer.subscriptions.data) {
                    if (subscription.current_period_end && subscription.current_period_end > latestSubscriptionTime) {
                        latestSubscriptionTime = subscription.current_period_end;
                        latestCustomer = customer;
                    }
                }
            }
        }

        return latestCustomer.id;
    }

    _hasValidSubscriptions(customer) {
        return customer.subscriptions
            && customer.subscriptions.data
            && customer.subscriptions.data.length > 0;
    }