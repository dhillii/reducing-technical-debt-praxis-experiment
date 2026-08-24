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

            return this._findCustomerWithLatestSubscription(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * Find the customer with the most recent active subscription from a list of customers.
     * @param {Array} customers - Array of Stripe customer objects with subscriptions expanded
     * @returns {string|null} - Customer ID with the latest subscription
     */
    _findCustomerWithLatestSubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            if (!this._hasValidSubscriptions(customer)) {
                continue;
            }

            const latestSubscriptionTimeForCustomer = this._getLatestSubscriptionTime(customer);
            if (latestSubscriptionTimeForCustomer > latestSubscriptionTime) {
                latestSubscriptionTime = latestSubscriptionTimeForCustomer;
                latestCustomer = customer;
            }
        }

        return latestCustomer.id;
    }

    /**
     * Check if a customer has valid subscriptions.
     * @param {object} customer - Stripe customer object
     * @returns {boolean}
     */
    _hasValidSubscriptions(customer) {
        return customer.subscriptions &&
            customer.subscriptions.data &&
            customer.subscriptions.data.length > 0;
    }

    /**
     * Get the latest subscription end time for a customer.
     * @param {object} customer - Stripe customer object
     * @returns {number} - Unix timestamp of the latest subscription end time
     */
    _getLatestSubscriptionTime(customer) {
        let latestTime = 0;
        for (const subscription of customer.subscriptions.data) {
            if (subscription.current_period_end && subscription.current_period_end > latestTime) {
                latestTime = subscription.current_period_end;
            }
        }
        return latestTime;
    }