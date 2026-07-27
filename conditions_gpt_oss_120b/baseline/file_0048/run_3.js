const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

const MAX_STRING_LENGTH = 191;
const MAX_PRICE = 9_999_999_999; // corresponds to $999,999.99 in cents

/** Helper to validate enum values */
function validateEnum(value, allowed, field) {
    if (!allowed.includes(value)) {
        throw new ValidationError({message: `${field} must be one of ${allowed.map(v => `"${v}"`).join(', ')}`});
    }
    return value;
}

/** Helper to validate optional string with length limit */
function validateOptionalString(value, field, allowNull = true) {
    if (value == null) {
        return allowNull ? null : '';
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: `${field} must be a string`});
    }
    if (value.length > MAX_STRING_LENGTH) {
        throw new ValidationError({message: `${field} must be at most ${MAX_STRING_LENGTH} characters`});
    }
    return value;
}

/** Helper to validate required string with length limit */
function validateString(value, field) {
    if (typeof value !== 'string') {
        throw new ValidationError({message: `${field} must be a string`});
    }
    if (value.length > MAX_STRING_LENGTH) {
        throw new ValidationError({message: `${field} must be at most ${MAX_STRING_LENGTH} characters`});
    }
    return value;
}

/** Helper to validate price values */
function validatePrice(value, type, defaultValue) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: `Free Tiers cannot have a ${defaultValue === 500 ? 'monthly' : 'yearly'} price`});
        }
        return null;
    }
    if (value == null) {
        return defaultValue;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: 'Tier prices must be a non‑negative integer'});
    }
    if (value > MAX_PRICE) {
        throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    }
    return value;
}

/** Helper to validate trial days */
function validateTrialDays(value, type) {
    if (type === 'free') {
        if (value) {
            throw new ValidationError({message: 'Free Tiers cannot have a trial'});
        }
        return 0;
    }
    if (value == null) {
        return 0;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: 'Tier trials must be a non‑negative integer'});
    }
    return value;
}

/** Helper to validate currency */
function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: 'Free Tiers cannot have a currency'});
        }
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3‑letter ISO code'});
    }
    return value.toUpperCase();
}

/** Helper to validate benefits array */
function validateBenefits(value) {
    if (!value) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be an array of strings'});
    }
    return value;
}

/** Helper to validate dates */
function validateDate(value, allowNull = false) {
    if (!value) {
        return allowNull ? null : new Date();
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: `Tier ${allowNull ? 'updated_at' : 'created_at'} must be a Date`});
}

/** Helper to parse or generate ObjectID */
function parseId(id) {
    if (!id) {
        return {id: new ObjectID(), isNew: true};
    }
    if (typeof id === 'string') {
        return {id: ObjectID.createFromHexString(id), isNew: false};
    }
    if (id instanceof ObjectID) {
        return {id, isNew: false};
    }
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

module.exports = class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    #id;
    get id() { return this.#id; }

    #slug;
    get slug() { return this.#slug; }

    #name;
    get name() { return this.#name; }
    set name(value) {
        const newName = validateString(value, 'Tier name');
        if (newName !== this.#name) {
            this.events.push(TierNameChangeEvent.create({tier: this}));
            this.#name = newName;
        }
    }

    #benefits;
    get benefits() { return this.#benefits; }
    set benefits(value) { this.#benefits = validateBenefits(value); }

    #description;
    get description() { return this.#description; }
    set description(value) { this.#description = validateOptionalString(value, 'Tier description'); }

    #welcomePageURL;
    get welcomePageURL() { return this.#welcomePageURL; }
    set welcomePageURL(value) { this.#welcomePageURL = validateOptionalString(value, 'Tier Welcome Page URL'); }

    #status;
    get status() { return this.#status; }
    set status(value) {
        const newStatus = validateEnum(value, ['active', 'archived'], 'Tier status');
        if (newStatus !== this.#status) {
            this.events.push(
                newStatus === 'active'
                    ? TierActivatedEvent.create({tier: this})
                    : TierArchivedEvent.create({tier: this})
            );
            this.#status = newStatus;
        }
    }

    #visibility;
    get visibility() { return this.#visibility; }
    set visibility(value) { this.#visibility = validateEnum(value, ['public', 'none'], 'Tier visibility'); }

    #type;
    get type() { return this.#type; }

    #trialDays;
    get trialDays() { return this.#trialDays; }
    set trialDays(value) { this.#trialDays = validateTrialDays(value, this.#type); }

    #currency;
    get currency() { return this.#currency; }
    set currency(value) { this.#currency = validateCurrency(value, this.#type); }

    #monthlyPrice;
    get monthlyPrice() { return this.#monthlyPrice; }
    set monthlyPrice(value) { this.#monthlyPrice = validatePrice(value, this.#type, 500); }

    #yearlyPrice;
    get yearlyPrice() { return this.#yearlyPrice; }
    set yearlyPrice(value) { this.#yearlyPrice = validatePrice(value, this.#type, 5000); }

    /** @param {'month'|'year'} cadence */
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
        const newMonthly = validatePrice(monthlyPrice, this.#type, 500);
        const newYearly = validatePrice(yearlyPrice, this.#type, 5000);

        if (newCurrency === this.#currency && newMonthly === this.#monthlyPrice && newYearly === this.#yearlyPrice) {
            return;
        }

        this.#currency = newCurrency;
        this.#monthlyPrice = newMonthly;
        this.#yearlyPrice = newYearly;
        this.events.push(TierPriceChangeEvent.create({tier: this}));
    }

    #createdAt;
    get createdAt() { return this.#createdAt; }

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

    /** @param {any} data @returns {Promise<Tier>} */
    static async create(data) {
        const {id, isNew} = parseId(data.id);

        const slug = validateString(data.slug, 'Tier slug');
        const name = validateString(data.name, 'Tier name');
        const description = validateOptionalString(data.description, 'Tier description');
        const welcomePageURL = validateOptionalString(data.welcomePageURL, 'Tier Welcome Page URL');
        const status = validateEnum(data.status ?? 'active', ['active', 'archived'], 'Tier status');
        const visibility = validateEnum(data.visibility ?? 'public', ['public', 'none'], 'Tier visibility');
        const type = validateEnum(data.type ?? 'paid', ['paid', 'free'], 'Tier type');

        const currency = validateCurrency(data.currency ?? null, type);
        const trialDays = validateTrialDays(data.trialDays ?? 0, type);
        const monthlyPrice = validatePrice(data.monthlyPrice ?? null, type, 500);
        const yearlyPrice = validatePrice(data.yearlyPrice ?? null, type, 5000);
        const createdAt = validateDate(data.createdAt);
        const updatedAt = validateDate(data.updatedAt, true);
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