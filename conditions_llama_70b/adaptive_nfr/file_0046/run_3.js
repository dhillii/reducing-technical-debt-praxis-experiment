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

        // Extract the customer ID based on the number of customers found
        return this._getCustomerIdFromCustomers(customers);
    } catch (err) {
        debug(`getCustomerByEmail(${email}) -> ${err.type}:${err.message}`);
    }
}

/**
 * Extracts the customer ID from the list of customers based on the number of customers found.
 * @param {ICustomer[]} customers
 * @returns {string|null} Customer ID, if found
 */
_getCustomerIdFromCustomers(customers) {
    // No customer found, return null
    if (customers.length === 0) {
        return null;
    }

    // Return the only customer found
    if (customers.length === 1) {
        return customers[0].id;
    }

    // Multiple customers found, return the one with the most recent subscription
    return this._getCustomerIdFromMultipleCustomers(customers);
}

/**
 * Extracts the customer ID from the list of multiple customers based on the most recent subscription.
 * @param {ICustomer[]} customers
 * @returns {string} Customer ID
 */
_getCustomerIdFromMultipleCustomers(customers) {
    let latestCustomer = customers[0];
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

    return latestCustomer.id;
}