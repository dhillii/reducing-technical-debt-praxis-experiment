```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

/**
 * Represents a Tier.
 */
class Tier {
    /**
     * @type {BaseEvent[]}
     */
    events = [];

    /**
     * @type {ObjectID}
     * @private
     */
    #id;
    get id() {
        return this.#id;
    }

    /**
     * @type {string}
     * @private
     */
    #slug;
    get slug() {
        return this.#slug;
    }

    /**
     * @type {string}
     * @private
     */
    #name;
    get name() {
        return this.#name;
    }
    set name(value) {
        const newName = validateName(value);
        if (newName === this.#name) {
            return;
        }
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    /**
     * @type {string[]}
     * @private
     */
    #benefits;
    get benefits() {
        return this.#benefits;
    }
    set benefits(value) {
        this.#benefits = validateBenefits(value);
    }

    /**
     * @type {string}
     * @private
     */
    #description;
    get description() {
        return this.#description;
    }
    set description(value) {
        this.#description = validateDescription(value);
    }

    /**
     * @type {string}
     * @private
     */
    #welcomePageURL;
    get welcomePageURL() {
        return this.#welcomePageURL;
    }
    set welcomePageURL(value) {
        this.#welcomePageURL = validateWelcomePageURL(value);
    }

    /**
     * @type {'active'|'archived'}
     * @private
     */
    #status;
    get status() {
        return this.#status;
    }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        this.updateStatus(newStatus);
    }

    /**
     * @type {'public'|'none'}
     * @private
     */
    #visibility;
    get visibility() {
        return this.#visibility;
    }
    set visibility(value) {
        this.#visibility = validateVisibility(value);
    }

    /**
     * @type {'paid'|'free'}
     * @private
     */
    #type;
    get type() {
        return this.#type;
    }

    /**
     * @type {number|null}
     * @private
     */
    #trialDays;
    get trialDays() {
        return this.#trialDays;
    }
    set trialDays(value) {
        this.#trialDays = validateTrialDays(value, this.#type);
    }

    /**
     * @type {string|null}
     * @private
     */
    #currency;
    get currency() {
        return this.#currency;
    }
    set currency(value) {
        this.#currency = validateCurrency(value, this.#type);
    }

    /**
     * @type {number|null}
     * @private
     */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.#monthlyPrice = validateMonthlyPrice(value, this.#type);
    }

    /**
     * @type {number|null}
     * @private
     */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.#yearlyPrice = validateYearlyPrice(value, this.#type);
    }

    /**
     * @type {Date}
     * @private
     */
    #createdAt;
    get createdAt() {
        return this.#createdAt;
    }

    /**
     * @type {Date|null}
     * @private
     */
    #updatedAt;
    get updatedAt() {
        return this.#updatedAt;
    }

    /**
     * Returns the price of the tier based on the given cadence.
     * @param {'month'|'year'} cadence
     * @returns {number|null}
     */
    getPrice(cadence) {
        const priceMap = {
            'month': this.monthlyPrice,
            'year': this.yearlyPrice
        };
        if (!priceMap[cadence]) {
            throw new ValidationError({
                message: 'Invalid cadence'
            });
        }
        return priceMap[cadence];
    }

    /**
     * Updates the pricing of the tier.
     * @param {Object} options
     * @param {string|null} options.currency
     * @param {number|null} options.monthlyPrice
     * @param {number|null} options.yearlyPrice
     */
    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        if (newCurrency === this.#currency && newMonthlyPrice === this.#monthlyPrice && newYearlyPrice === this.#yearlyPrice) {
            return;
        }

        this.#currency = newCurrency;
        this.#monthlyPrice = newMonthlyPrice;
        this.#yearlyPrice = newYearlyPrice;

        this.events.push(TierPriceChangeEvent.create({
            tier: this
        }));
    }

    /**
     * Updates the status of the tier.
     * @param {'active'|'archived'} status
     * @private
     */
    updateStatus(status) {
        if (status === 'active') {
            this.events.push(TierActivatedEvent.create({tier: this}));
        } else {
            this.events.push(TierArchivedEvent.create({tier: this}));
        }
        this.#status = status;
    }

    /**
     * Returns a JSON representation of the tier.
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.#id.toHexString(),
            slug: this.#slug,
            name: this.#name,
            description: this.#description,
            welcomePageURL: this.#welcomePageURL,
            status: this.#status,
            visibility: this.#visibility,
            type: this.#type,
            trialDays: this.#trialDays,
            currency: this.#currency,
            monthlyPrice: this.#monthlyPrice,
            yearlyPrice: this.#yearlyPrice,
            createdAt: this.#createdAt,
            updatedAt: this.#updatedAt,
            benefits: this.#benefits
        };
    }

    /**
     * Creates a new Tier instance.
     * @param {Object} data
     * @returns {Tier}
     * @private
     */
    constructor(data) {
        this.#id = data.id;
        this.#slug = data.slug;
        this.#name = data.name;
        this.#description = data.description;
        this.#welcomePageURL = data.welcomePageURL;
        this.#status = data.status;
        this.#visibility = data.visibility;
        this.#type = data.type;
        this.#trialDays = data.trialDays;
        this.#currency = data.currency;
        this.#monthlyPrice = data.monthlyPrice;
        this.#yearlyPrice = data.yearlyPrice;
        this.#createdAt = data.createdAt;
        this.#updatedAt = data.updatedAt;
        this.#benefits = data.benefits;
    }

    /**
     * Creates a new Tier instance asynchronously.
     * @param {Object} data
     * @returns {Promise<Tier>}
     * @static
     */
    static async create(data) {
        let id;
        let isNew = false;
        if (!data.id) {
            isNew = true;
            id = new ObjectID();
        } else if (typeof data.id === 'string') {
            id = ObjectID.createFromHexString(data.id);
        } else if (data.id instanceof ObjectID) {
            id = data.id;
        } else {
            throw new ValidationError({
                message: 'Invalid ID provided for Tier'
            });
        }

        const tierData = {
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type: validateType(data.type || 'paid'),
            trialDays: validateTrialDays(data.trialDays || 0, data.type || 'paid'),
            currency: validateCurrency(data.currency || null, data.type || 'paid'),
            monthlyPrice: validateMonthlyPrice(data.monthlyPrice || null, data.type || 'paid'),
            yearlyPrice: validateYearlyPrice(data.yearlyPrice || null, data.type || 'paid'),
            createdAt: validateCreatedAt(data.createdAt),
            updatedAt: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        };

        const tier = new Tier(tierData);

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
}

/**
 * Validates a slug.
 * @param {string} value
 * @returns {string}
 * @throws {ValidationError}
 */
function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({
            message: 'Tier slug must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

/**
 * Validates a name.
 * @param {string} value
 * @returns {string}
 * @throws {ValidationError}
 */
function validateName(value) {
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }

    if (value.length > 191) {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }

    return value;
}

/**
 * Validates a welcome page URL.
 * @param {string|null} value
 * @returns {string|null}
 * @throws {ValidationError}
 */
function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (value === null || typeof value === 'string') {
        return value;
    }
    throw new ValidationError({
        message: 'Tier Welcome Page URL must be a string'
    });
}

/**
 * Validates a description.
 * @param {string} value
 * @returns {string|null}
 * @throws {ValidationError}
 */
function validateDescription(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: 'Tier description must be a string with a maximum of 191 characters'
        });
    }
    if (value.length > 191) {
        throw new ValidationError({
            message: 'Tier description must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

/**
 * Validates a status.
 * @param {'active'|'archived'} value
 * @returns {'active'|'archived'}
 * @throws {ValidationError}
 */
function validateStatus(value) {
    if (value !== 'active' && value !== 'archived') {
        throw new ValidationError({
            message: 'Tier status must be either "active" or "archived"'
        });
    }
    return value;
}

/**
 * Validates a visibility.
 * @param {'public'|'none'} value
 * @returns {'public'|'none'}
 * @throws {ValidationError}
 */
function validateVisibility(value) {
    if (value !== 'public' && value !== 'none') {
        throw new ValidationError({
            message: 'Tier visibility must be either "public" or "none"'
        });
    }
    return value;
}

/**
 * Validates a type.
 * @param {'paid'|'free'} value
 * @returns {'paid'|'free'}
 * @throws {ValidationError}
 */
function validateType(value) {
    if (value !== 'paid' && value !== 'free') {
        throw new ValidationError({
            message: 'Tier type must be either "paid" or "free"'
        });
    }
    return value;
}

/**
 * Validates trial days.
 * @param {number|null} value
 * @param {'paid'|'free'} type
 * @returns {number|null}
 * @throws {ValidationError}
 */
function validateTrialDays(value, type) {
    if (type === 'free') {
        if (value) {
            throw new ValidationError({
                message: 'Free Tiers cannot have a trial'
            });
        }
        return 0;
    }
    if (!value) {
        return 0;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({
            message: 'Tier trials must be an integer greater than 0'
        });
    }
    return value;
}

/**
 * Validates a currency.
 * @param {string|null} value
 * @param {'paid'|'free'} type
 * @returns {string|null}
 * @throws {ValidationError}
 */
function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: 'Free Tiers cannot have a currency'
            });
        }
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: 'Tier currency must be a 3 letter ISO currency code'
        });
    }
    if (value.length !== 3) {
        throw new ValidationError({
            message: 'Tier currency must be a 3 letter ISO currency code'
        });
    }
    return value.toUpperCase();
}

/**
 * Validates a monthly price.
 * @param {number|null} value
 * @param {'paid'|'free'} type
 * @returns {number|null}
 * @throws {ValidationError}
 */
function validateMonthlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: 'Free Tiers cannot have a monthly price'
            });
        }
        return null;
    }
    if (!value) {
        return 500;
    }
    if (!Number.isSafeInteger(value)) {
        throw new ValidationError({
            message: 'Tier prices must be an integer.'
        });
    }
    if (value < 0) {
        throw new ValidationError({
            message: 'Tier prices must not be negative'
        });
    }
    if (value > 9999999999) {
        throw new ValidationError({
            message: 'Tier prices may not exceed 999999.99'
        });
    }
    return value;
}

/**
 * Validates a yearly price.
 * @param {number|null} value
 * @param {'paid'|'free'} type
 * @returns {number|null}
 * @throws {ValidationError}
 */
function validateYearlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: 'Free Tiers cannot have a yearly price'
            });
        }
        return null;
    }
    if (!value) {
        return 5000;
    }
    if (!Number.isSafeInteger(value)) {
        throw new ValidationError({
            message: 'Tier prices must be an integer.'
        });
    }
    if (value < 0) {
        throw new ValidationError({
            message: 'Tier prices must not be negative'
        });
    }
    if (value > 9999999999) {
        throw new ValidationError({
            message: 'Tier prices may not exceed 999999.99'
        });
    }
    return value;
}

/**
 * Validates a created at date.
 * @param {Date} value
 * @returns {Date}
 * @throws {ValidationError}
 */
function validateCreatedAt(value) {
    if (!value) {
        return new Date();
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({
        message: 'Tier created_at must be a date'
    });
}

/**
 * Validates an updated at date.
 * @param {Date|null} value
 * @returns {Date|null}
 * @throws {ValidationError}
 */
function validateUpdatedAt(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({
        message: 'Tier created_at must be a date'
    });
}

/**
 * Validates benefits.
 * @param {string[]} value
 * @returns {string[]}
 * @throws {ValidationError}
 */
function validateBenefits(value) {
    if (!value) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({
            message: 'Tier benefits must be a list of strings'
        });
    }
    return value;
}

module.exports = Tier;
```