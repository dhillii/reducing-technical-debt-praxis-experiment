```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

// --- Validation Helpers ---

function validateEnum(value, allowed, message) {
    if (!allowed.includes(value)) {
        throw new ValidationError({message});
    }
    return value;
}

function validateString(value, {maxLength = 191, message, allowNull = false} = {}) {
    if (allowNull && !value) return null;
    if (typeof value !== 'string') throw new ValidationError({message});
    if (maxLength && value.length > maxLength) throw new ValidationError({message});
    return value;
}

function validatePrice(value, type, {defaultValue, fieldName}) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: `Free Tiers cannot have a ${fieldName}`});
        return null;
    }
    if (!value) return defaultValue;
    if (!Number.isSafeInteger(value)) throw new ValidationError({message: 'Tier prices must be an integer.'});
    if (value < 0) throw new ValidationError({message: 'Tier prices must not be negative'});
    if (value > 9999999999) throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    return value;
}

function validateSlug(value) {
    return validateString(value, {message: 'Tier slug must be a string with a maximum of 191 characters'});
}

function validateName(value) {
    return validateString(value, {message: 'Tier name must be a string with a maximum of 191 characters'});
}

function validateDescription(value) {
    if (!value) return null;
    return validateString(value, {message: 'Tier description must be a string with a maximum of 191 characters'});
}

function validateWelcomePageURL(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
}

function validateStatus(value) {
    return validateEnum(value, ['active', 'archived'], 'Tier status must be either "active" or "archived"');
}

function validateVisibility(value) {
    return validateEnum(value, ['public', 'none'], 'Tier visibility must be either "public" or "none"');
}

function validateType(value) {
    return validateEnum(value, ['paid', 'free'], 'Tier type must be either "paid" or "free"');
}

function validateTrialDays(value, type) {
    if (type === 'free') {
        if (value) throw new ValidationError({message: 'Free Tiers cannot have a trial'});
        return 0;
    }
    if (!value) return 0;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: 'Tier trials must be an integer greater than 0'});
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: 'Free Tiers cannot have a currency'});
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, {defaultValue: 500, fieldName: 'monthly price'});
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, {defaultValue: 5000, fieldName: 'yearly price'});
}

function validateCreatedAt(value) {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateUpdatedAt(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateBenefits(value) {
    if (!value) return [];
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be a list of strings'});
    }
    return value;
}

function resolveId(data) {
    if (!data.id) return {id: new ObjectID(), isNew: true};
    if (typeof data.id === 'string') return {id: ObjectID.createFromHexString(data.id), isNew: false};
    if (data.id instanceof ObjectID) return {id: data.id, isNew: false};
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

// --- Tier Class ---

module.exports = class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    #id; #slug; #name; #benefits; #description; #welcomePageURL;
    #status; #visibility; #type; #trialDays; #currency;
    #monthlyPrice; #yearlyPrice; #createdAt; #updatedAt;

    get id() { return this.#id; }
    get slug() { return this.#slug; }
    get benefits() { return this.#benefits; }
    get description() { return this.#description; }
    get welcomePageURL() { return this.#welcomePageURL; }
    get visibility() { return this.#visibility; }
    get type() { return this.#type; }
    get trialDays() { return this.#trialDays; }
    get currency() { return this.#currency; }
    get monthlyPrice() { return this.#monthlyPrice; }
    get yearlyPrice() { return this.#yearlyPrice; }
    get createdAt() { return this.#createdAt; }
    get updatedAt() { return this.#updatedAt; }

    get name() { return this.#name; }
    set name(value) {
        const newName = validateName(value);
        if (newName === this.#name) return;
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    set benefits(value) { this.#benefits = validateBenefits(value); }
    set description(value) { this.#description = validateDescription(value); }
    set welcomePageURL(value) { this.#welcomePageURL = validateWelcomePageURL(value); }
    set visibility(value) { this.#visibility = validateVisibility(value); }
    set trialDays(value) { this.#trialDays = validateTrialDays(value, this.#type); }
    set currency(value) { this.#currency = validateCurrency(value, this.#type); }
    set monthlyPrice(value) { this.#monthlyPrice = validateMonthlyPrice(value, this.#type); }
    set yearlyPrice(value) { this.#yearlyPrice = validateYearlyPrice(value, this.#type); }

    get status() { return this.#status; }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) return;
        const event = newStatus === 'active'
            ? TierActivatedEvent.create({tier: this})
            : TierArchivedEvent.create({tier: this});
        this.events.push(event);
        this.#status = newStatus;
    }

    getPrice(cadence) {
        const priceMap = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (cadence in priceMap) return priceMap[cadence];
        throw new ValidationError({message: 'Invalid cadence'});
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

    /** @private */
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
        const {id, isNew} = resolveId(data);
        const type = validateType(data.type || 'paid');

        const tierData = {
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcome_page_url: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type,
            trial_days: validateTrialDays(data.trialDays || 0, type),
            currency: validateCurrency(data.currency || null, type),
            monthly_price: validateMonthlyPrice(data.monthlyPrice || null, type),
            yearly_price: validateYearlyPrice(data.yearlyPrice || null, type),
            created_at: validateCreatedAt(data.createdAt),
            updated_at: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        };

        const tier = new Tier(tierData);
        if (isNew) tier.events.push(TierCreatedEvent.create({tier}));
        return tier;
    }
};
```