const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

module.exports = class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    /** @type {ObjectID} */
    #id;
    get id() {
        return this.#id;
    }

    /** @type {string} */
    #slug;
    get slug() {
        return this.#slug;
    }

    /** @type {string} */
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

    /** @type {string[]} */
    #benefits;
    get benefits() {
        return this.#benefits;
    }
    set benefits(value) {
        this.#benefits = validateBenefits(value);
    }

    /** @type {string} */
    #description;
    get description() {
        return this.#description;
    }
    set description(value) {
        this.#description = validateDescription(value);
    }

    /** @type {string} */
    #welcomePageURL;
    get welcomePageURL() {
        return this.#welcomePageURL;
    }
    set welcomePageURL(value) {
        this.#welcomePageURL = validateWelcomePageURL(value);
    }

    /** @type {'active'|'archived'} */
    #status;
    get status() {
        return this.#status;
    }
    set status(value) {
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

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() {
        return this.#visibility;
    }
    set visibility(value) {
        this.#visibility = validateVisibility(value);
    }

    /** @type {'paid'|'free'} */
    #type;
    get type() {
        return this.#type;
    }

    /** @type {number|null} */
    #trialDays;
    get trialDays() {
        return this.#trialDays;
    }
    set trialDays(value) {
        this.#trialDays = validateTrialDays(value, this.#type);
    }

    /** @type {string|null} */
    #currency;
    get currency() {
        return this.#currency;
    }
    set currency(value) {
        this.#currency = validateCurrency(value, this.#type);
    }

    /**
     * @param {'month'|'year'} cadence
     */
    getPrice(cadence) {
        return this.getPriceForCadence(cadence);
    }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.#monthlyPrice = validateMonthlyPrice(value, this.#type);
    }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.#yearlyPrice = validateYearlyPrice(value, this.#type);
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        this.handleUpdatePricing({currency, monthlyPrice, yearlyPrice});
    }

    /** @type {Date} */
    #createdAt;
    get createdAt() {
        return this.#createdAt;
    }

    /** @type {Date|null} */
    #updatedAt;
    get updatedAt() {
        return this.#updatedAt;
    }

    toJSON() {
        return this.serialize();
    }

    /**
     * @private
     */
    constructor(data) {
        this.initializeProperties(data);
    }

    /**
     * @param {any} data
     * @returns {Promise<Tier>}
     */
    static async create(data) {
        return await this.createTier(data);
    }

    // Private methods for encapsulation and reduced complexity
    
    /**
     * Handles price retrieval based on cadence
     * @param {'month'|'year'} cadence 
     * @returns {number|null}
     */
    getPriceForCadence(cadence) {
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
     * Processes pricing updates with validation
     * @param {Object} pricingData 
     */
    handleUpdatePricing(pricingData) {
        const {currency, monthlyPrice, yearlyPrice} = pricingData;
        
        if (this.shouldRejectPaidPricingForFreeTier(currency, monthlyPrice, yearlyPrice)) {
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        if (this.hasNoPricingChanges(newCurrency, newMonthlyPrice, newYearlyPrice)) {
            return;
        }

        this.applyPricingUpdates(newCurrency, newMonthlyPrice, newYearlyPrice);
    }

    /**
     * Checks if pricing changes should be rejected for free tier
     * @param {string|null} currency 
     * @param {number|null} monthlyPrice 
     * @param {number|null} yearlyPrice 
     * @returns {boolean}
     */
    shouldRejectPaidPricingForFreeTier(currency, monthlyPrice, yearlyPrice) {
        return this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice);
    }

    /**
     * Determines if there are no actual pricing changes
     * @param {string|null} newCurrency 
     * @param {number|null} newMonthlyPrice 
     * @param {number|null} newYearlyPrice 
     * @returns {boolean}
     */
    hasNoPricingChanges(newCurrency, newMonthlyPrice, newYearlyPrice) {
        return newCurrency === this.#currency && 
               newMonthlyPrice === this.#monthlyPrice && 
               newYearlyPrice === this.#yearlyPrice;
    }

    /**
     * Applies validated pricing updates
     * @param {string|null} newCurrency 
     * @param {number|null} newMonthlyPrice 
     * @param {number|null} newYearlyPrice 
     */
    applyPricingUpdates(newCurrency, newMonthlyPrice, newYearlyPrice) {
        this.#currency = newCurrency;
        this.#monthlyPrice = newMonthlyPrice;
        this.#yearlyPrice = newYearlyPrice;

        this.events.push(TierPriceChangeEvent.create({
            tier: this
        }));
    }

    /**
     * Serializes tier data for JSON output
     * @returns {Object}
     */
    serialize() {
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
     * Initializes tier properties from data object
     * @param {Object} data 
     */
    initializeProperties(data) {
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
     * Creates a new tier instance with validation
     * @param {Object} data 
     * @returns {Promise<Tier>}
     */
    static async createTier(data) {
        const id = this.processId(data);
        const isNew = !data.id;
        
        const validatedData = {
            name: validateName(data.name),
            slug: validateSlug(data.slug),
            description: validateDescription(data.description),
            welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type: validateType(data.type || 'paid'),
            createdAt: validateCreatedAt(data.createdAt),
            updatedAt: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        };

        // Handle conditional validations based on tier type
        this.applyTypeSpecificValidations(validatedData, data);

        const tier = new Tier({
            id,
            slug: validatedData.slug,
            name: validatedData.name,
            description: validatedData.description,
            welcome_page_url: validatedData.welcomePageURL,
            status: validatedData.status,
            visibility: validatedData.visibility,
            type: validatedData.type,
            trial_days: validatedData.trialDays,
            currency: validatedData.currency,
            monthly_price: validatedData.monthlyPrice,
            yearly_price: validatedData.yearlyPrice,
            created_at: validatedData.createdAt,
            updated_at: validatedData.updatedAt,
            benefits: validatedData.benefits
        });

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }

    /**
     * Processes ID creation or validation
     * @param {Object} data 
     * @returns {ObjectID}
     */
    static processId(data) {
        if (!data.id) {
            return new ObjectID();
        }
        if (typeof data.id === 'string') {
            return ObjectID.createFromHexString(data.id);
        }
        if (data.id instanceof ObjectID) {
            return data.id;
        }
        throw new ValidationError({
            message: 'Invalid ID provided for Tier'
        });
    }

    /**
     * Applies validations specific to tier type
     * @param {Object} validatedData 
     * @param {Object} inputData 
     */
    static applyTypeSpecificValidations(validatedData, inputData) {
        if (validatedData.type === 'free') {
            validatedData.trialDays = validateTrialDays(inputData.trialDays || 0, validatedData.type);
            validatedData.currency = null;
            validatedData.monthlyPrice = null;
            validatedData.yearlyPrice = null;
        } else {
            validatedData.trialDays = validateTrialDays(inputData.trialDays || 0, validatedData.type);
            validatedData.currency = validateCurrency(inputData.currency || null, validatedData.type);
            validatedData.monthlyPrice = validateMonthlyPrice(inputData.monthlyPrice || null, validatedData.type);
            validatedData.yearlyPrice = validateYearlyPrice(inputData.yearlyPrice || null, validatedData.type);
        }
    }
};

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({
            message: 'Tier slug must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

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

function validateStatus(value) {
    if (value !== 'active' && value !== 'archived') {
        throw new ValidationError({
            message: 'Tier status must be either "active" or "archived"'
        });
    }
    return value;
}

function validateVisibility(value) {
    if (value !== 'public' && value !== 'none') {
        throw new ValidationError({
            message: 'Tier visibility must be either "public" or "none"'
        });
    }
    return value;
}

function validateType(value) {
    if (value !== 'paid' && value !== 'free') {
        throw new ValidationError({
            message: 'Tier type must be either "paid" or "free"'
        });
    }
    return value;
}

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