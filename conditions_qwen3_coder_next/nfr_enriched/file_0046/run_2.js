async getCustomerIdByEmail(email) {
        await this._searchRateLimitBucket.throttle();

        try {
            const customers = await this._searchCustomersByEmail(email);

            if (!customers || customers.length === 0) {
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
     * Searches Stripe customers by email and returns matching customer records.
     * @param {string} email
     * @returns {Promise<Array>} Array of customer objects with subscriptions expanded
     */
    async _searchCustomersByEmail(email) {
        const result = await this._stripe.customers.search({
            query: `email:"${email}"`,
            limit: 10,
            expand: ['data.subscriptions']
        });

        return result.data;
    }

    /**
     * Finds the customer with the most recent active subscription from a list.
     * @param {Array} customers
     * @returns {string} ID of the customer with the latest subscription
     */
    _findCustomerWithLatestSubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            if (!this._hasValidSubscriptions(customer)) {
                continue;
            }

            const recentSubscriptionTime = this._getLatestSubscriptionTime(customer);
            if (recentSubscriptionTime > latestSubscriptionTime) {
                latestSubscriptionTime = recentSubscriptionTime;
                latestCustomer = customer;
            }
        }

        return latestCustomer.id;
    }

    /**
     * Checks if the customer has valid subscriptions.
     * @param {object} customer
     * @returns {boolean}
     */
    _hasValidSubscriptions(customer) {
        return customer.subscriptions &&
               customer.subscriptions.data &&
               customer.subscriptions.data.length > 0;
    }

    /**
     * Gets the latest subscription end time for a customer.
     * @param {object} customer
     * @returns {number} Unix timestamp of latest subscription end, or 0 if none
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