const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    /** @type {ObjectID} */
    #id;
    get id() { return this.#id; }

    /** @type {string} */
    #slug;
    get slug() { return this.#slug; }

    /** @type {string} */
    #name;
    get name() { return this.#name; }
    set name(value) {
        const newName = validateName(value);
        if (newName !== this.#name) {
            this.events.push(TierNameChangeEvent.create({tier: this}));
            this.#name = newName;
        }
    }

    /** @type {string[]} */
    #benefits;
    get benefits() { return this.#benefits; }
    set benefits(value) { this.#benefits = validateBenefits(value); }

    /** @type {string} */
    #description;
    get description() { return this.#description; }
    set description(value) { this.#description = validateDescription(value); }

    /** @type {string} */
    #welcomePageURL;
    get welcomePageURL() { return this.#welcomePageURL; }
    set welcomePageURL(value) { this.#welcomePageURL = validateWelcomePageURL(value); }

    /** @type {'active'|'archived'} */
    #status;
    get status() { return this.#status; }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus !== this.#status) {
            this.events.push(
                newStatus === 'active'
                    ? TierActivatedEvent.create({tier: this})
                    : TierArchivedEvent.create({tier: this})
            );
            this.#status = newStatus;
        }
    }

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() { return this.#visibility; }
    set visibility(value) { this.#visibility = validateVisibility(value); }

    /** @type {'paid'|'free'} */
    #type;
    get type() { return this.#type; }

    /** @type {number|null} */
    #trialDays;
    get trialDays() { return this.#trialDays; }
    set trialDays(value) { this.#trialDays = validateTrialDays(value, this.#type); }

    /** @type {string|null} */
    #currency;
    get currency() { return this.#currency; }
    set currency(value) { this.#currency = validateCurrency(value, this.#type); }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() { return this.#monthlyPrice; }
    set monthlyPrice(value) { this.#monthlyPrice = validateMonthlyPrice(value, this.#type); }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() { return this.#yearlyPrice; }
    set yearlyPrice(value) { this.#yearlyPrice = validateYearlyPrice(value, this.#type); }

    /** @type {Date} */
    #createdAt;
    get createdAt() { return this.#createdAt; }

    /** @type {Date|null} */
    #updatedAt;
    get updatedAt() { return this.#updatedAt; }

    /**
     * @param {'month'|'year'} cadence
     */
    getPrice(cadence) {
        if (cadence === 'month') return this.monthlyPrice;
        if (cadence === 'year') return this.yearlyPrice;
        throw new ValidationError({message: 'Invalid cadence'});
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthly = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearly = validateYearlyPrice(yearlyPrice, this.#type);

        if (newCurrency === this.#currency && newMonthly === this.#monthlyPrice && newYearly === this.#yearlyPrice) {
            return;
        }

        this.#currency = newCurrency;
        this.#monthlyPrice = newMonthly;
        this.#yearlyPrice = newYearly;
        this.events.push(TierPriceChangeEvent.create({tier: this}));
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
        const {
            id,
            slug,
            name,
            description,
            welcomePageURL,
            status = 'active',
            visibility = 'public',
            type = 'paid',
            currency = null,
            trialDays = 0,
            monthlyPrice = null,
            yearlyPrice = null,
            createdAt,
            updatedAt,
            benefits
        } = data;

        const validatedId = resolveId(id);
        const validated = {
            id: validatedId,
            slug: validateSlug(slug),
            name: validateName(name),
            description: validateDescription(description),
            welcome_page_url: validateWelcomePageURL(welcomePageURL),
            status: validateStatus(status),
            visibility: validateVisibility(visibility),
            type: validateType(type),
            trial_days: validateTrialDays(trialDays, type),
            currency: validateCurrency(currency, type),
            monthly_price: validateMonthlyPrice(monthlyPrice, type),
            yearly_price: validateYearlyPrice(yearlyPrice, type),
            created_at: validateCreatedAt(createdAt),
            updated_at: validateUpdatedAt(updatedAt),
            benefits: validateBenefits(benefits)
        };

        const tier = new Tier(validated);
        if (!id) tier.events.push(TierCreatedEvent.create({tier}));
        return tier;
    }
}

/* Helper Functions */

function resolveId(id) {
    if (!id) return new ObjectID();
    if (typeof id === 'string') return ObjectID.createFromHexString(id);
    if (id instanceof ObjectID) return id;
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

function validateString(value, max = 191, field = 'value') {
    if (typeof value !== 'string') {
        throw new ValidationError({message: `Tier ${field} must be a string`});
    }
    if (value.length > max) {
        throw new ValidationError({message: `Tier ${field} must be at most ${max} characters`});
    }
    return value;
}

function validateSlug(value) {
    if (!value) throw new ValidationError({message: 'Tier slug is required'});
    return validateString(value, 191, 'slug');
}

function validateName(value) {
    if (!value) throw new ValidationError({message: 'Tier name is required'});
    return validateString(value, 191, 'name');
}

function validateWelcomePageURL(value) {
    if (value == null) return null;
    if (typeof value !== 'string') {
        throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
    }
    return value;
}

function validateDescription(value) {
    if (value == null) return null;
    return validateString(value, 191, 'description');
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
        if (value) throw new ValidationError({message: 'Free Tiers cannot have a trial'});
        return 0;
    }
    if (!value) return 0;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: 'Tier trials must be a non‑negative integer'});
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: 'Free Tiers cannot have a currency'});
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3‑letter ISO code'});
    }
    return value.toUpperCase();
}

function validatePrice(value, type, defaultVal, field) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: `Free Tiers cannot have a ${field}`});
        return null;
    }
    if (!value) return defaultVal;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: `Tier ${field} must be a non‑negative integer`});
    }
    if (value > 9999999999) {
        throw new ValidationError({message: `Tier ${field} may not exceed 999999.99`});
    }
    return value;
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 500, 'monthly price');
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 5000, 'yearly price');
}

function validateCreatedAt(value) {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateUpdatedAt(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    throw new ValidationError({message: 'Tier updated_at must be a date'});
}

function validateBenefits(value) {
    if (!value) return [];
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be a list of strings'});
    }
    return value;
}

module.exports = Tier;