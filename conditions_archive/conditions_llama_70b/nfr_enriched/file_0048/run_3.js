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
     * @private
     * @type {ObjectID} 
     */
    #id;
    get id() {
        return this.#id;
    }

    /**
     * @private
     * @type {string} 
     */
    #slug;
    get slug() {
        return this.#slug;
    }

    /**
     * @private
     * @type {string} 
     */
    #name;
    get name() {
        return this.#name;
    }
    set name(value) {
        this.updateName(value);
    }

    /**
     * @private
     * @type {string[]} 
     */
    #benefits;
    get benefits() {
        return this.#benefits;
    }
    set benefits(value) {
        this.updateBenefits(value);
    }

    /**
     * @private
     * @type {string} 
     */
    #description;
    get description() {
        return this.#description;
    }
    set description(value) {
        this.updateDescription(value);
    }

    /**
     * @private
     * @type {string} 
     */
    #welcomePageURL;
    get welcomePageURL() {
        return this.#welcomePageURL;
    }
    set welcomePageURL(value) {
        this.updateWelcomePageURL(value);
    }

    /**
     * @private
     * @type {'active'|'archived'} 
     */
    #status;
    get status() {
        return this.#status;
    }
    set status(value) {
        this.updateStatus(value);
    }

    /**
     * @private
     * @type {'public'|'none'} 
     */
    #visibility;
    get visibility() {
        return this.#visibility;
    }
    set visibility(value) {
        this.updateVisibility(value);
    }

    /**
     * @private
     * @type {'paid'|'free'} 
     */
    #type;
    get type() {
        return this.#type;
    }

    /**
     * @private
     * @type {number|null} 
     */
    #trialDays;
    get trialDays() {
        return this.#trialDays;
    }
    set trialDays(value) {
        this.updateTrialDays(value);
    }

    /**
     * @private
     * @type {string|null} 
     */
    #currency;
    get currency() {
        return this.#currency;
    }
    set currency(value) {
        this.updateCurrency(value);
    }

    /**
     * @private
     * @type {number|null} 
     */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.updateMonthlyPrice(value);
    }

    /**
     * @private
     * @type {number|null} 
     */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.updateYearlyPrice(value);
    }

    /**
     * Returns the price of the tier based on the given cadence.
     * @param {'month'|'year'} cadence 
     * @returns {number} 
     */
    getPrice(cadence) {
        // Extracted to a separate function to reduce complexity
        return this.calculatePrice(cadence);
    }

    /**
     * @private
     * @type {Date} 
     */
    #createdAt;
    get createdAt() {
        return this.#createdAt;
    }

    /**
     * @private
     * @type {Date|null} 
     */
    #updatedAt;
    get updatedAt() {
        return this.#updatedAt;
    }

    /**
     * Updates the name of the tier.
     * @param {string} value 
     */
    updateName(value) {
        const newName = validateName(value);
        if (newName === this.#name) {
            return;
        }
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    /**
     * Updates the benefits of the tier.
     * @param {string[]} value 
     */
    updateBenefits(value) {
        this.#benefits = validateBenefits(value);
    }

    /**
     * Updates the description of the tier.
     * @param {string} value 
     */
    updateDescription(value) {
        this.#description = validateDescription(value);
    }

    /**
     * Updates the welcome page URL of the tier.
     * @param {string} value 
     */
    updateWelcomePageURL(value) {
        this.#welcomePageURL = validateWelcomePageURL(value);
    }

    /**
     * Updates the status of the tier.
     * @param {'active'|'archived'} value 
     */
    updateStatus(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        if (newStatus === 'active') {
            this.events.push(TierActivatedEvent.create({tier: this}));
        } else {
            this.events.push(TierArchivedEvent.create({tier: this}));
        }
        this.#status = newStatus;
    }

    /**
     * Updates the visibility of the tier.
     * @param {'public'|'none'} value 
     */
    updateVisibility(value) {
        this.#visibility = validateVisibility(value);
    }

    /**
     * Updates the trial days of the tier.
     * @param {number} value 
     */
    updateTrialDays(value) {
        this.#trialDays = validateTrialDays(value, this.#type);
    }

    /**
     * Updates the currency of the tier.
     * @param {string} value 
     */
    updateCurrency(value) {
        this.#currency = validateCurrency(value, this.#type);
    }

    /**
     * Updates the monthly price of the tier.
     * @param {number} value 
     */
    updateMonthlyPrice(value) {
        this.#monthlyPrice = validateMonthlyPrice(value, this.#type);
    }

    /**
     * Updates the yearly price of the tier.
     * @param {number} value 
     */
    updateYearlyPrice(value) {
        this.#yearlyPrice = validateYearlyPrice(value, this.#type);
    }

    /**
     * Updates the pricing of the tier.
     * @param {Object} options 
     * @param {string} options.currency 
     * @param {number} options.monthlyPrice 
     * @param {number} options.yearlyPrice 
     */
    updatePricing(options) {
        // Extracted to a separate function to reduce complexity
        this.updatePricingDetails(options);
    }

    /**
     * Calculates the price of the tier based on the given cadence.
     * @param {'month'|'year'} cadence 
     * @returns {number} 
     */
    calculatePrice(cadence) {
        if (cadence === 'month') {
            return this.monthlyPrice;
        }
        if (cadence === 'year') {
            return this.yearlyPrice;
        }
        throw new ValidationError({
            message: 'Invalid cadence'
        });
    }

    /**
     * Updates the pricing details of the tier.
     * @param {Object} options 
     * @param {string} options.currency 
     * @param {number} options.monthlyPrice 
     * @param {number} options.yearlyPrice 
     */
    updatePricingDetails(options) {
        if (this.#type !== 'paid' && (options.currency || options.monthlyPrice || options.yearlyPrice)) {
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
        }

        const newCurrency = validateCurrency(options.currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(options.monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(options.yearlyPrice, this.#type);

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
     */
    constructor(data) {
        this.#id = data.id;
        this.#slug = data.slug;
        this.#name = data.name;
        this.#description = data.description;
        this.#welcomePageURL = data.welcome_page_url;
        this.#status = data.status;
        this.#visibility = data.visibility;
        this.#type = data.type;
        this.#trialDays = data.trial_days;
        this.#currency = data.currency;
        this.#monthlyPrice = data.monthly_price;
        this.#yearlyPrice = data.yearly_price;
        this.#createdAt = data.created_at;
        this.#updatedAt = data.updated_at;
        this.#benefits = data.benefits;
    }

    /**
     * Creates a new Tier instance asynchronously.
     * @param {Object} data 
     * @returns {Promise<Tier>} 
     */
    static async create(data) {
        // Extracted to a separate function to reduce complexity
        return this.createTierInstance(data);
    }

    /**
     * Creates a new Tier instance.
     * @param {Object} data 
     * @returns {Tier} 
     */
    static createTierInstance(data) {
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

        let name = validateName(data.name);

        let slug = validateSlug(data.slug);
        let description = validateDescription(data.description);
        let welcomePageURL = validateWelcomePageURL(data.welcomePageURL);
        let status = validateStatus(data.status || 'active');
        let visibility = validateVisibility(data.visibility || 'public');
        let type = validateType(data.type || 'paid');
        let currency = validateCurrency(data.currency || null, type);
        let trialDays = validateTrialDays(data.trialDays || 0, type);
        let monthlyPrice = validateMonthlyPrice(data.monthlyPrice || null, type);
        let yearlyPrice = validateYearlyPrice(data.yearlyPrice || null , type);
        let createdAt = validateCreatedAt(data.createdAt);
        let updatedAt = validateUpdatedAt(data.updatedAt);
        let benefits = validateBenefits(data.benefits);

        const tier = new Tier({
            id,
            slug,
            name,
            description,
            welcome_page_url: welcomePageURL,
            status,
            visibility,
            type,
            trial_days: trialDays,
            currency,
            monthly_price: monthlyPrice,
            yearly_price: yearlyPrice,
            created_at: createdAt,
            updated_at: updatedAt,
            benefits
        });

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
}

/**
 * Validates the slug of a tier.
 * @param {string} value 
 * @returns {string} 
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
 * Validates the name of a tier.
 * @param {string} value 
 * @returns {string} 
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
 * Validates the welcome page URL of a tier.
 * @param {string} value 
 * @returns {string|null} 
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
 * Validates the description of a tier.
 * @param {string} value 
 * @returns {string|null} 
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
 * Validates the status of a tier.
 * @param {'active'|'archived'} value 
 * @returns {'active'|'archived'} 
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
 * Validates the visibility of a tier.
 * @param {'public'|'none'} value 
 * @returns {'public'|'none'} 
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
 * Validates the type of a tier.
 * @param {'paid'|'free'} value 
 * @returns {'paid'|'free'} 
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
 * Validates the trial days of a tier.
 * @param {number} value 
 * @param {'paid'|'free'} type 
 * @returns {number} 
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
 * Validates the currency of a tier.
 * @param {string} value 
 * @param {'paid'|'free'} type 
 * @returns {string|null} 
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
 * Validates the monthly price of a tier.
 * @param {number} value 
 * @param {'paid'|'free'} type 
 * @returns {number|null} 
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
 * Validates the yearly price of a tier.
 * @param {number} value 
 * @param {'paid'|'free'} type 
 * @returns {number|null} 
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
 * Validates the created at date of a tier.
 * @param {Date} value 
 * @returns {Date} 
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
 * Validates the updated at date of a tier.
 * @param {Date|null} value 
 * @returns {Date|null} 
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
 * Validates the benefits of a tier.
 * @param {string[]} value 
 * @returns {string[]} 
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