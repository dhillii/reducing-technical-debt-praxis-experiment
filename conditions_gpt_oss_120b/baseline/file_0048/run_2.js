```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

const MAX_LENGTH = 191;
const MAX_PRICE = 9_999_999_999;
const DEFAULT_MONTHLY_PRICE = 500;
const DEFAULT_YEARLY_PRICE = 5_000;

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
    set name(v) {
        const n = validateName(v);
        if (n !== this.#name) {
            this.events.push(TierNameChangeEvent.create({tier: this}));
            this.#name = n;
        }
    }

    /** @type {string[]} */
    #benefits;
    get benefits() { return this.#benefits; }
    set benefits(v) { this.#benefits = validateBenefits(v); }

    /** @type {string} */
    #description;
    get description() { return this.#description; }
    set description(v) { this.#description = validateDescription(v); }

    /** @type {string} */
    #welcomePageURL;
    get welcomePageURL() { return this.#welcomePageURL; }
    set welcomePageURL(v) { this.#welcomePageURL = validateWelcomePageURL(v); }

    /** @type {'active'|'archived'} */
    #status;
    get status() { return this.#status; }
    set status(v) {
        const s = validateStatus(v);
        if (s !== this.#status) {
            this.events.push(
                s === 'active'
                    ? TierActivatedEvent.create({tier: this})
                    : TierArchivedEvent.create({tier: this})
            );
            this.#status = s;
        }
    }

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() { return this.#visibility; }
    set visibility(v) { this.#visibility = validateVisibility(v); }

    /** @type {'paid'|'free'} */
    #type;
    get type() { return this.#type; }

    /** @type {number|null} */
    #trialDays;
    get trialDays() { return this.#trialDays; }
    set trialDays(v) { this.#trialDays = validateTrialDays(v, this.#type); }

    /** @type {string|null} */
    #currency;
    get currency() { return this.#currency; }
    set currency(v) { this.#currency = validateCurrency(v, this.#type); }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() { return this.#monthlyPrice; }
    set monthlyPrice(v) { this.#monthlyPrice = validateMonthlyPrice(v, this.#type); }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() { return this.#yearlyPrice; }
    set yearlyPrice(v) { this.#yearlyPrice = validateYearlyPrice(v, this.#type); }

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

        const c = validateCurrency(currency, this.#type);
        const m = validateMonthlyPrice(monthlyPrice, this.#type);
        const y = validateYearlyPrice(yearlyPrice, this.#type);

        if (c === this.#currency && m === this.#monthlyPrice && y === this.#yearlyPrice) return;

        this.#currency = c;
        this.#monthlyPrice = m;
        this.#yearlyPrice = y;
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
        const id = resolveId(data.id);
        const isNew = !data.id;

        const type = validateType(data.type ?? 'paid');

        const tier = new Tier({
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcome_page_url: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status ?? 'active'),
            visibility: validateVisibility(data.visibility ?? 'public'),
            type,
            trial_days: validateTrialDays(data.trialDays ?? 0, type),
            currency: validateCurrency(data.currency ?? null, type),
            monthly_price: validateMonthlyPrice(data.monthlyPrice ?? null, type),
            yearly_price: validateYearlyPrice(data.yearlyPrice ?? null, type),
            created_at: validateCreatedAt(data.createdAt),
            updated_at: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        });

        if (isNew) tier.events.push(TierCreatedEvent.create({tier}));
        return tier;
    }
}

/* ---------- Validation Helpers ---------- */

function resolveId(id) {
    if (!id) return new ObjectID();
    if (typeof id === 'string') return ObjectID.createFromHexString(id);
    if (id instanceof ObjectID) return id;
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

function validateString(value, name) {
    if (typeof value !== 'string') {
        throw new ValidationError({message: `${name} must be a string`});
    }
    if (value.length > MAX_LENGTH) {
        throw new ValidationError({message: `${name} must be at most ${MAX_LENGTH} characters`});
    }
    return value;
}

function validateSlug(v) {
    if (!v || typeof v !== 'string' || v.length > MAX_LENGTH) {
        throw new ValidationError({message: 'Tier slug must be a string with a maximum of 191 characters'});
    }
    return v;
}

function validateName(v) { return validateString(v, 'Tier name'); }

function validateDescription(v) {
    if (!v) return null;
    return validateString(v, 'Tier description');
}

function validateWelcomePageURL(v) {
    if (!v) return null;
    if (typeof v !== 'string') {
        throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
    }
    return v;
}

function validateStatus(v) {
    if (v !== 'active' && v !== 'archived') {
        throw new ValidationError({message: 'Tier status must be either "active" or "archived"'});
    }
    return v;
}

function validateVisibility(v) {
    if (v !== 'public' && v !== 'none') {
        throw new ValidationError({message: 'Tier visibility must be either "public" or "none"'});
    }
    return v;
}

function validateType(v) {
    if (v !== 'paid' && v !== 'free') {
        throw new ValidationError({message: 'Tier type must be either "paid" or "free"'});
    }
    return v;
}

function validateTrialDays(v, type) {
    if (type === 'free') {
        if (v) throw new ValidationError({message: 'Free Tiers cannot have a trial'});
        return 0;
    }
    if (!v) return 0;
    if (!Number.isSafeInteger(v) || v < 0) {
        throw new ValidationError({message: 'Tier trials must be an integer greater than 0'});
    }
    return v;
}

function validateCurrency(v, type) {
    if (type === 'free') {
        if (v !== null) throw new ValidationError({message: 'Free Tiers cannot have a currency'});
        return null;
    }
    if (typeof v !== 'string' || v.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return v.toUpperCase();
}

function validatePrice(v, type, defaultValue) {
    if (type === 'free') {
        if (v !== null) throw new ValidationError({message: `Free Tiers cannot have a ${defaultValue === DEFAULT_MONTHLY_PRICE ? 'monthly' : 'yearly'} price`});
        return null;
    }
    if (!v) return defaultValue;
    if (!Number.isSafeInteger(v)) {
        throw new ValidationError({message: 'Tier prices must be an integer.'});
    }
    if (v < 0) {
        throw new ValidationError({message: 'Tier prices must not be negative'});
    }
    if (v > MAX_PRICE) {
        throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    }
    return v;
}

function validateMonthlyPrice(v, type) { return validatePrice(v, type, DEFAULT_MONTHLY_PRICE); }
function validateYearlyPrice(v, type) { return validatePrice(v, type, DEFAULT_YEARLY_PRICE); }

function validateCreatedAt(v) {
    if (!v) return new Date();
    if (v instanceof Date) return v;
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateUpdatedAt(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    throw new ValidationError({message: 'Tier updated_at must be a date'});
}

function validateBenefits(v) {
    if (!v) return [];
    if (!Array.isArray(v) || !v.every(i => typeof i === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be a list of strings'});
    }
    return v;
}

module.exports = Tier;
```