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
        const priceMap = {
            month: this.monthlyPrice,
            year: this.yearlyPrice
        };
        const price = priceMap[cadence];
        if (price === undefined) {
            throw new ValidationError({message: 'Invalid cadence'});
        }
        return price;
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
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
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

        this.events.push(TierPriceChangeEvent.create({tier: this}));
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
     * @private
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
     * @param {any} data
     * @returns {Promise<Tier>}
     */
    static async create(data) {
        const id = resolveId(data.id);
        const type = resolveWithDefault(data.type, validateType, 'paid');
        const status = resolveWithDefault(data.status, validateStatus, 'active');
        const visibility = resolveWithDefault(data.visibility, validateVisibility, 'public');

        const name = resolveRequired(data.name, validateName);
        const slug = resolveRequired(data.slug, validateSlug);
        const description = resolveOptional(data.description, validateDescription);
        const welcomePageURL = resolveOptional(data.welcomePageURL, validateWelcomePageURL);
        const currency = resolveOptional(data.currency, v => validateCurrency(v, type));
        const trialDays = resolveOptional(data.trialDays, v => validateTrialDays(v, type));
        const monthlyPrice = resolveOptional(data.monthlyPrice, v => validateMonthlyPrice(v, type));
        const yearlyPrice = resolveOptional(data.yearlyPrice, v => validateYearlyPrice(v, type));
        const createdAt = resolveOptional(data.createdAt, validateCreatedAt);
        const updatedAt = resolveOptional(data.updatedAt, validateUpdatedAt);
        const benefits = resolveOptional(data.benefits, validateBenefits);

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

        if (!data.id) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
};

/**
 * Resolve an ID value, handling string, ObjectID, or generating a new one.
 * @param {any} id
 * @returns {ObjectID}
 * @throws {ValidationError}
 */
function resolveId(id) {
    if (!id) {
        return new ObjectID();
    }
    if (typeof id === 'string') {
        return ObjectID.createFromHexString(id);
    }
    if (id instanceof ObjectID) {
        return id;
    }
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

/**
 * Resolve a required field using a validator.
 * @param {any} value
 * @param {(v:any)=>any} validator
 * @returns {any}
 * @throws {ValidationError}
 */
function resolveRequired(value, validator) {
    if (value === undefined || value === null) {
        throw new ValidationError({message: 'Missing required field'});
    }
    return validator(value);
}

/**
 * Resolve an optional field, applying a validator if defined.
 * @param {any} value
 * @param {(v:any)=>any} validator
 * @returns {any}
 */
function resolveOptional(value, validator) {
    if (value === undefined) {
        return validator(undefined);
    }
    return validator(value);
}

/**
 * Resolve a field with a default fallback.
 * @param {any} value
 * @param {(v:any)=>any} validator
 * @param {any} defaultValue
 * @returns {any}
 */
function resolveWithDefault(value, validator, defaultValue) {
    if (value === undefined) {
        return defaultValue;
    }
    return validator(value);
}

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({message: 'Tier slug must be a string with a maximum of 191 characters'});
    }
    return value;
}

function validateName(value) {
    if (typeof value !== 'string') {
        throw new ValidationError({message: 'Tier name must be a string with a maximum of 191 characters'});
    }
    if (value.length > 191) {
        throw new ValidationError({message: 'Tier name must be a string with a maximum of 191 characters'});
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
    throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
}

function validateDescription(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: 'Tier description must be a string with a maximum of 191 characters'});
    }
    if (value.length > 191) {
        throw new ValidationError({message: 'Tier description must be a string with a maximum of 191 characters'});
    }
    return value;
}

function validateStatus(value) {
    if (value !== 'active' && value !== 'archived') {
        throw new ValidationError({message: 'Tier status must be either "active" or "archived"'});
    }
    return value;
}

function validateVisibility(value) {
    if (value !== 'public' && value !== 'none') {
        throw new ValidationError({message: 'Tier visibility must be either "public" or "none"'});
    }
    return value;
}

function validateType(value) {
    if (value !== 'paid' && value !== 'free') {
        throw new ValidationError({message: 'Tier type must be either "paid" or "free"'});
    }
    return value;
}

function validateTrialDays(value, type) {
    if (type === 'free') {
        if (value) {
            throw new ValidationError({message: 'Free Tiers cannot have a trial'});
        }
        return 0;
    }
    if (!value) {
        return 0;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: 'Tier trials must be an integer greater than 0'});
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: 'Free Tiers cannot have a currency'});
        }
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    if (value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: 'Free Tiers cannot have a monthly price'});
        }
        return null;
    }
    if (!value) {
        return 500;
    }
    if (!Number.isSafeInteger(value)) {
        throw new ValidationError({message: 'Tier prices must be an integer.'});
    }
    if (value < 0) {
        throw new ValidationError({message: 'Tier prices must not be negative'});
    }
    if (value > 9999999999) {
        throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    }
    return value;
}

function validateYearlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: 'Free Tiers cannot have a yearly price'});
        }
        return null;
    }
    if (!value) {
        return 5000;
    }
    if (!Number.isSafeInteger(value)) {
        throw new ValidationError({message: 'Tier prices must be an integer.'});
    }
    if (value < 0) {
        throw new ValidationError({message: 'Tier prices must not be negative'});
    }
    if (value > 9999999999) {
        throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
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
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateUpdatedAt(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateBenefits(value) {
    if (!value) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be a list of strings'});
    }
    return value;
}