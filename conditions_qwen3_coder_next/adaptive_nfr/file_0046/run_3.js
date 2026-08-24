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

            return this._getCustomerWithLatestSubscription(customers);
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
        }
    }

    /**
     * Find the customer with the most recent subscription from a list of customers.
     * @param {Array} customers - Array of Stripe customer objects with subscriptions
     * @returns {string|null} Customer ID with the most recent subscription, or null if none found
     * @private
     */
    _getCustomerWithLatestSubscription(customers) {
        let latestCustomer = null;
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            if (!this._hasValidSubscriptions(customer)) {
                continue;
            }

            const mostRecentSubscriptionTime = this._getMostRecentSubscriptionTime(customer);
            if (mostRecentSubscriptionTime > latestSubscriptionTime) {
                latestSubscriptionTime = mostRecentSubscriptionTime;
                latestCustomer = customer;
            }
        }

        return latestCustomer ? latestCustomer.id : null;
    }

    /**
     * Check if a customer has valid subscriptions.
     * @param {object} customer - Stripe customer object
     * @returns {boolean} True if customer has valid subscriptions
     * @private
     */
    _hasValidSubscriptions(customer) {
        return customer.subscriptions &&
            customer.subscriptions.data &&
            customer.subscriptions.data.length > 0;
    }

    /**
     * Get the most recent subscription end time for a customer.
     * @param {object} customer - Stripe customer object
     * @returns {number} Unix timestamp of the most recent subscription end time
     * @private
     */
    _getMostRecentSubscriptionTime(customer) {
        let maxTime = 0;
        for (const subscription of customer.subscriptions.data) {
            if (subscription.current_period_end && subscription.current_period_end > maxTime) {
                maxTime = subscription.current_period_end;
            }
        }
        return maxTime;
    }