async getCustomerIdByEmail(email) {
        await this._searchRateLimitBucket.throttle();
        try {
            const customers = await this._fetchCustomersByEmail(email);
            if (customers.length === 0) {
                return null;
            }
            if (customers.length === 1) {
                return customers[0].id;
            }
            return this._findCustomerWithLatestSubscription(customers).id;
        } catch (err) {
            debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
            return null;
        }
    }

    /**
     * Fetch customers by email using Stripe search API
     * @param {string} email
     * @returns {Promise<import('stripe').Stripe.Customer[]>}
     */
    async _fetchCustomersByEmail(email) {
        const result = await this._stripe.customers.search({
            query: `email:"${email}"`,
            limit: 10,
            expand: ['data.subscriptions']
        });
        return result.data;
    }

    /**
     * Find the customer with the most recent active subscription
     * @param {import('stripe').Stripe.Customer[]} customers
     * @returns {import('stripe').Stripe.Customer}
     */
    _findCustomerWithLatestSubscription(customers) {
        let latestCustomer = customers[0];
        let latestSubscriptionTime = 0;

        for (const customer of customers) {
            if (!this._hasValidSubscriptions(customer)) {
                continue;
            }

            for (const subscription of customer.subscriptions.data) {
                if (this._isRecentSubscription(subscription, latestSubscriptionTime)) {
                    latestSubscriptionTime = subscription.current_period_end;
                    latestCustomer = customer;
                }
            }
        }

        return latestCustomer;
    }

    /**
     * Check if customer has valid subscriptions
     * @param {import('stripe').Stripe.Customer} customer
     * @returns {boolean}
     */
    _hasValidSubscriptions(customer) {
        return customer.subscriptions &&
            customer.subscriptions.data &&
            customer.subscriptions.data.length > 0;
    }

    /**
     * Check if subscription is more recent than current benchmark
     * @param {import('stripe').Stripe.Subscription} subscription
     * @param {number} latestSubscriptionTime
     * @returns {boolean}
     */
    _isRecentSubscription(subscription, latestSubscriptionTime) {
        return subscription.current_period_end &&
            subscription.current_period_end > latestSubscriptionTime;
    }