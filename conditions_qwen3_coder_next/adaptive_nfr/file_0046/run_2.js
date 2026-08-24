/**
     * Finds a Stripe Customer ID based on the provided email address. Returns null if no customer is found.
     * @param {string} email
     * @see https://stripe.com/docs/api/customers/search
     *
     * @returns {Promise<string|null>} Stripe Customer ID, if found
     */
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

            return this._getCustomerWithLatestSubscription(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
            return null;
        }
    }

    /**
     * _getCustomerWithLatestSubscription
     * Selects the customer with the most recent active subscription from a list of customers.
     *
     * @param {Array} customers - Array of Stripe Customer objects with expanded subscriptions
     * @returns {string} customer.id of the selected customer
     * @private
     */
    _getCustomerWithLatestSubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            const subscriptions = this._getSubscriptions(customer);
            if (!subscriptions) {
                continue;
            }

            for (const subscription of subscriptions) {
                if (subscription.current_period_end && subscription.current_period_end > latestSubscriptionTime) {
                    latestSubscriptionTime = subscription.current_period_end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer.id;
    }

    /**
     * _getSubscriptions
     * Safely extract subscriptions array from a customer object
     *
     * @param {Object} customer - Stripe Customer object
     * @returns {Array|undefined} Array of subscription objects or undefined if not available
     * @private
     */
    _getSubscriptions(customer) {
        if (!customer.subscriptions || !customer.subscriptions.data) {
            return undefined;
        }
        return customer.subscriptions.data;
    }