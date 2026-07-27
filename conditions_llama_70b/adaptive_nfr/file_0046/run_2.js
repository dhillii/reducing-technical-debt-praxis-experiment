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

        // No customer found, return null
        if (customers.length === 0) {
            return null;
        }

        // Return the only customer found
        if (customers.length === 1) {
            return customers[0].id;
        }

        // Multiple customers found, return the one with the most recent subscription
        return this._getLatestCustomerWithSubscription(customers);
    } catch (err) {
        debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
    }
}

/**
 * Returns the customer with the most recent subscription from a list of customers.
 * @param {ICustomer[]} customers
 * @returns {string|null} The ID of the customer with the most recent subscription, or null if no customer has a subscription
 */
_getLatestCustomerWithSubscription(customers) {
    let latestCustomer = null;
    let latestSubscriptionTime = 0;

    for (let customer of customers) {
        // skip customers with no subscriptions
        if (!customer.subscriptions || !customer.subscriptions.data || customer.subscriptions.data.length === 0) {
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

    return latestCustomer ? latestCustomer.id : null;
}