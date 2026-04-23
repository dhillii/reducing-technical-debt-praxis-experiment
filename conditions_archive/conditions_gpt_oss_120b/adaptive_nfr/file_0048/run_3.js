```javascript
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
        this.events.push(
            newStatus === 'active'
                ? TierActivatedEvent.create({tier: this})
                : TierArchivedEvent.create({tier: this})
        );
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
        this.#trialDays = TierValidator.validateTrialDays(value, this.#type);
    }

    /** @type {string|null} */
    #currency;
    get currency() {
        return this.#currency;
    }
    set currency(value) {
        this.#currency = TierValidator.validateCurrency(value, this.#type);
    }

    /**
     * @param {'month'|'year'} cadence
     */
    getPrice(cadence) {
        if (cadence === 'month') {
            return this.monthlyPrice;
        }
        if (cadence === 'year') {
            return this.yearlyPrice;
        }
        throw new ValidationError({message: 'Invalid cadence'});
    }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.#monthlyPrice = TierValidator.validateMonthlyPrice(value, this.#type);
    }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.#yearlyPrice = TierValidator.validateYearlyPrice(value, this.#type);
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = TierValidator.validateCurrency(currency, this.#type);
        const newMonthlyPrice = TierValidator.validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = TierValidator.validateYearlyPrice(yearlyPrice, this.#type);

        if (
            newCurrency === this.#currency &&
            newMonthlyPrice === this.#monthlyPrice &&
            newYearlyPrice === this.#yearlyPrice
        ) {
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
        const {id, isNew} = parseId(data);
        const validated = validateAllFields(data);
        const tier = new Tier({
            id,
            slug: validated.slug,
            name: validated.name,
            description: validated.description,
            welcome_page_url: validated.welcomePageURL,
            status: validated.status,
            visibility: validated.visibility,
            type: validated.type,
            trial_days: validated.trialDays,
            currency: validated.currency,
            monthly_price: validated.monthlyPrice,
            yearly_price: validated.yearlyPrice,
            created_at: validated.createdAt,
            updated_at: validated.updatedAt,
            benefits: validated.benefits
        });

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
};

/**
 * Parse and validate the Tier ID.
 * @param {any} data
 * @returns {{id: ObjectID, isNew: boolean}}
 */
function parseId(data) {
    if (!data.id) {
        return {id: new ObjectID(), isNew: true};
    }
    if (typeof data.id === 'string') {
        return {id: ObjectID.createFromHexString(data.id), isNew: false};
    }
    if (data.id instanceof ObjectID) {
        return {id: data.id, isNew: false};
    }
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

/**
 * Validate all fields required for Tier creation.
 * @param {any} data
 * @returns {object}
 */
function validateAllFields(data) {
    const type = validateType(data.type || 'paid');
    return {
        slug: validateSlug(data.slug),
        name: validateName(data.name),
        description: validateDescription(data.description),
        welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
        status: validateStatus(data.status || 'active'),
        visibility: validateVisibility(data.visibility || 'public'),
        type,
        trialDays: TierValidator.validateTrialDays(data.trialDays || 0, type),
        currency: TierValidator.validateCurrency(data.currency || null, type),
        monthlyPrice: TierValidator.validateMonthlyPrice(data.monthlyPrice || null, type),
        yearlyPrice: TierValidator.validateYearlyPrice(data.yearlyPrice || null, type),
        createdAt: validateCreatedAt(data.createdAt),
        updatedAt: validateUpdatedAt(data.updatedAt),
        benefits: validateBenefits(data.benefits)
    };
}

/* ---------- Validation Helpers ---------- */

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({message: 'Tier slug must be a string with a maximum of 191 characters'});
    }
    return value;
}

function validateName(value) {
    if (typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({message: 'Tier name must be a string with a maximum of 191 characters'});
    }
    return value;
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return value;
    }
    throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
}

function validateDescription(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string' || value.length > 191) {
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

/* ---------- Polymorphic Validators ---------- */

class TierValidator {
    /**
     * @param {any} value
     * @param {'paid'|'free'} type
     * @returns {number}
     */
    static validateTrialDays(value, type) {
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

    /**
     * @param {any} value
     * @param {'paid'|'free'} type
     * @returns {string|null}
     */
    static validateCurrency(value, type) {
        if (type === 'free') {
            if (value !== null) {
                throw new ValidationError({message: 'Free Tiers cannot have a currency'});
            }
            return null;
        }
        if (typeof value !== 'string' || value.length !== 3) {
            throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
        }
        return value.toUpperCase();
    }

    /**
     * @param {any} value
     * @param {'paid'|'free'} type
     * @returns {number|null}
     */
    static validateMonthlyPrice(value, type) {
        if (type === 'free') {
            if (value !== null) {
                throw new ValidationError({message: 'Free Tiers cannot have a monthly price'});
            }
            return null;
        }
        if (!value) {
            return 500;
        }
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new ValidationError({message: 'Tier prices must be a non‑negative integer'});
        }
        if (value > 9999999999) {
            throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
        }
        return value;
    }

    /**
     * @param {any} value
     * @param {'paid'|'free'} type
     * @returns {number|null}
     */
    static validateYearlyPrice(value, type) {
        if (type === 'free') {
            if (value !== null) {
                throw new ValidationError({message: 'Free Tiers cannot have a yearly price'});
            }
            return null;
        }
        if (!value) {
            return 5000;
        }
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new ValidationError({message: 'Tier prices must be a non‑negative integer'});
        }
        if (value > 9999999999) {
            throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
        }
        return value;
    }
}

/* ---------- Date & Benefits Validators ---------- */

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
```