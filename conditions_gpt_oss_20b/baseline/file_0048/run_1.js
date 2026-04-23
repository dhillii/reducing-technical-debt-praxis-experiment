const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

function ensure(condition, message) {
    if (!condition) {
        throw new ValidationError({message});
    }
}

function validateString(value, field, maxLength = 191) {
    ensure(typeof value === 'string', `${field} must be a string`);
    ensure(value.length <= maxLength, `${field} must be at most ${maxLength} characters`);
    return value;
}

function validateOptionalString(value, field) {
    if (value === null || value === undefined) return null;
    return validateString(value, field);
}

function validateISO3Currency(value) {
    ensure(typeof value === 'string', 'Tier currency must be a 3 letter ISO currency code');
    ensure(value.length === 3, 'Tier currency must be a 3 letter ISO currency code');
    return value.toUpperCase();
}

function validatePositiveInteger(value, field) {
    ensure(Number.isSafeInteger(value) && value > 0, `${field} must be a positive integer`);
    return value;
}

function validateNonNegativeInteger(value, field) {
    ensure(Number.isSafeInteger(value) && value >= 0, `${field} must be a non-negative integer`);
    return value;
}

function validateIntegerInRange(value, min, max, field) {
    ensure(Number.isSafeInteger(value) && value >= min && value <= max, `${field} must be between ${min} and ${max}`);
    return value;
}

function validateDate(value, field) {
    ensure(value instanceof Date, `${field} must be a date`);
    return value;
}

function validateArrayOfStrings(value, field) {
    if (!Array.isArray(value)) {
        throw new ValidationError({message: `${field} must be an array`});
    }
    for (const item of value) {
        ensure(typeof item === 'string', `${field} must contain only strings`);
    }
    return value;
}

function validateEnum(value, allowed, field) {
    ensure(allowed.includes(value), `${field} must be one of ${allowed.join(', ')}`);
    return value;
}

function validateSlug(value) {
    return validateString(value, 'Tier slug');
}

function validateName(value) {
    return validateString(value, 'Tier name');
}

function validateWelcomePageURL(value) {
    if (value === null || value === undefined) return null;
    ensure(typeof value === 'string', 'Tier Welcome Page URL must be a string');
    return value;
}

function validateDescription(value) {
    if (value === null || value === undefined) return null;
    return validateString(value, 'Tier description');
}

function validateStatus(value) {
    return validateEnum(value, ['active', 'archived'], 'Tier status');
}

function validateVisibility(value) {
    return validateEnum(value, ['public', 'none'], 'Tier visibility');
}

function validateType(value) {
    return validateEnum(value, ['paid', 'free'], 'Tier type');
}

function validateTrialDays(value, type) {
    if (type === 'free') {
        ensure(!value, 'Free Tiers cannot have a trial');
        return 0;
    }
    if (!value) return 0;
    return validateNonNegativeInteger(value, 'Tier trials');
}

function validateCurrency(value, type) {
    if (type === 'free') {
        ensure(value === null, 'Free Tiers cannot have a currency');
        return null;
    }
    return validateISO3Currency(value);
}

function validatePrice(value, type, defaultValue) {
    if (type === 'free') {
        ensure(value === null, 'Free Tiers cannot have a price');
        return null;
    }
    if (!value) return defaultValue;
    ensure(Number.isSafeInteger(value), 'Tier prices must be an integer');
    ensure(value >= 0, 'Tier prices must not be negative');
    ensure(value <= 9999999999, 'Tier prices may not exceed 999999.99');
    return value;
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 500);
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 5000);
}

function validateCreatedAt(value) {
    return value ? validateDate(value, 'Tier created_at') : new Date();
}

function validateUpdatedAt(value) {
    return value ? validateDate(value, 'Tier updated_at') : null;
}

function validateBenefits(value) {
    if (!value) return [];
    return validateArrayOfStrings(value, 'Tier benefits');
}

module.exports = class Tier {
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
        if (newName === this.#name) return;
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
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
        if (newStatus === this.#status) return;
        this.events.push(
            newStatus === 'active'
                ? TierActivatedEvent.create({tier: this})
                : TierArchivedEvent.create({tier: this})
        );
        this.#status = newStatus;
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

        if (
            newCurrency === this.#currency &&
            newMonthly === this.#monthlyPrice &&
            newYearly === this.#yearlyPrice
        ) {
            return;
        }

        this.#currency = newCurrency;
        this.#monthlyPrice = newMonthly;
        this.#yearlyPrice = newYearly;

        this.events.push(TierPriceChangeEvent.create({tier: this}));
    }

    /** @type {Date} */
    #createdAt;
    get createdAt() { return this.#createdAt; }

    /** @type {Date|null} */
    #updatedAt;
    get updatedAt() { return this.#updatedAt; }

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
            throw new ValidationError({message: 'Invalid ID provided for Tier'});
        }

        const name = validateName(data.name);
        const slug = validateSlug(data.slug);
        const description = validateDescription(data.description);
        const welcomePageURL = validateWelcomePageURL(data.welcomePageURL);
        const status = validateStatus(data.status ?? 'active');
        const visibility = validateVisibility(data.visibility ?? 'public');
        const type = validateType(data.type ?? 'paid');
        const currency = validateCurrency(data.currency ?? null, type);
        const trialDays = validateTrialDays(data.trialDays ?? 0, type);
        const monthlyPrice = validateMonthlyPrice(data.monthlyPrice ?? null, type);
        const yearlyPrice = validateYearlyPrice(data.yearlyPrice ?? null, type);
        const createdAt = validateCreatedAt(data.createdAt);
        const updatedAt = validateUpdatedAt(data.updatedAt);
        const benefits = validateBenefits(data.benefits);

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
};