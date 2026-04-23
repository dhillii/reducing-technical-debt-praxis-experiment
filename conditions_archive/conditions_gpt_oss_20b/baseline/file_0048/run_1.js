const ObjectID = require('bson-objectid').default;
const { ValidationError } = require('@tryghost/errors');

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
        if (newName === this.#name) return;
        this.events.push(TierNameChangeEvent.create({ tier: this }));
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
        if (newStatus === this.#status) return;
        this.events.push(
            newStatus === 'active'
                ? TierActivatedEvent.create({ tier: this })
                : TierArchivedEvent.create({ tier: this })
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
        const prices = { month: this.monthlyPrice, year: this.yearlyPrice };
        if (cadence in prices) return prices[cadence];
        throw new ValidationError({ message: 'Invalid cadence' });
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

    updatePricing({ currency, monthlyPrice, yearlyPrice }) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({ message: 'Cannot set pricing for free tiers' });
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

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

        this.events.push(TierPriceChangeEvent.create({ tier: this }));
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
        const {
            id,
            slug,
            name,
            description,
            welcome_page_url,
            status,
            visibility,
            type,
            trial_days,
            currency,
            monthly_price,
            yearly_price,
            created_at,
            updated_at,
            benefits
        } = data;

        this.#id = id;
        this.#slug = slug;
        this.#name = name;
        this.#description = description;
        this.#welcomePageURL = welcome_page_url;
        this.#status = status;
        this.#visibility = visibility;
        this.#type = type;
        this.#trialDays = trial_days;
        this.#currency = currency;
        this.#monthlyPrice = monthly_price;
        this.#yearlyPrice = yearly_price;
        this.#createdAt = created_at;
        this.#updatedAt = updated_at;
        this.#benefits = benefits;
    }

    /**
     * @param {any} data
     * @returns {Promise<Tier>}
     */
    static async create(data) {
        const id = parseId(data.id);
        const isNew = !data.id;

        const defaults = { status: 'active', visibility: 'public', type: 'paid' };
        const type = validateType(data.type ?? defaults.type);

        const tier = new Tier({
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcome_page_url: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status ?? defaults.status),
            visibility: validateVisibility(data.visibility ?? defaults.visibility),
            type,
            trial_days: validateTrialDays(data.trialDays ?? 0, type),
            currency: validateCurrency(data.currency ?? null, type),
            monthly_price: validateMonthlyPrice(data.monthlyPrice ?? null, type),
            yearly_price: validateYearlyPrice(data.yearlyPrice ?? null, type),
            created_at: validateCreatedAt(data.createdAt),
            updated_at: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        });

        if (isNew) tier.events.push(TierCreatedEvent.create({ tier }));
        return tier;
    }
};

function parseId(id) {
    if (!id) return new ObjectID();
    if (typeof id === 'string') return ObjectID.createFromHexString(id);
    if (id instanceof ObjectID) return id;
    throw new ValidationError({ message: 'Invalid ID provided for Tier' });
}

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({
            message: 'Tier slug must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateName(value) {
    if (typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateWelcomePageURL(value) {
    if (value == null) return null;
    if (typeof value !== 'string') {
        throw new ValidationError({ message: 'Tier Welcome Page URL must be a string' });
    }
    return value;
}

function validateDescription(value) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > 191) {
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
        if (value) throw new ValidationError({ message: 'Free Tiers cannot have a trial' });
        return 0;
    }
    if (!value) return 0;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({ message: 'Tier trials must be an integer greater than 0' });
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({ message: 'Free Tiers cannot have a currency' });
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({ message: 'Tier currency must be a 3 letter ISO currency code' });
    }
    return value.toUpperCase();
}

function validatePrice(value, type, defaultValue) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({ message: 'Free Tiers cannot have a price' });
        return null;
    }
    if (!value) return defaultValue;
    if (!Number.isSafeInteger(value)) {
        throw new ValidationError({ message: 'Tier prices must be an integer.' });
    }
    if (value < 0) {
        throw new ValidationError({ message: 'Tier prices must not be negative' });
    }
    if (value > 9999999999) {
        throw new ValidationError({ message: 'Tier prices may not exceed 999999.99' });
    }
    return value;
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 500);
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 5000);
}

function validateCreatedAt(value) {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    throw new ValidationError({ message: 'Tier created_at must be a date' });
}

function validateUpdatedAt(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    throw new ValidationError({ message: 'Tier updated_at must be a date' });
}

function validateBenefits(value) {
    if (!value) return [];
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({ message: 'Tier benefits must be a list of strings' });
    }
    return value;
}