```typescript
const ObjectID = require('bson-objectid').default;
const { ValidationError } = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

const MAX_STRING_LENGTH = 191;
const MAX_PRICE = 9999999999;
const DEFAULT_MONTHLY_PRICE = 500;
const DEFAULT_YEARLY_PRICE = 5000;

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
        if (newStatus === this.#status) {
            return;
        }
        if (newStatus === 'active') {
            this.events.push(TierActivatedEvent.create({ tier: this }));
        } else {
            this.events.push(TierArchivedEvent.create({ tier: this }));
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

    getPrice(cadence) {
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
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
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

        this.events.push(TierPriceChangeEvent.create({
            tier: this
        }));
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
        const id = await validateId(data.id);
        const name = validateName(data.name);
        const slug = validateSlug(data.slug);
        const description = validateDescription(data.description);
        const welcomePageURL = validateWelcomePageURL(data.welcomePageURL);
        const status = validateStatus(data.status || 'active');
        const visibility = validateVisibility(data.visibility || 'public');
        const type = validateType(data.type || 'paid');
        const currency = validateCurrency(data.currency || null, type);
        const trialDays = validateTrialDays(data.trialDays || 0, type);
        const monthlyPrice = validateMonthlyPrice(data.monthlyPrice || null, type);
        const yearlyPrice = validateYearlyPrice(data.yearlyPrice || null, type);
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

        if (id instanceof ObjectID) {
            tier.events.push(TierCreatedEvent.create({ tier }));
        }

        return tier;
    }
};

function validateId(value) {
    if (!value) {
        return new ObjectID();
    }
    if (typeof value === 'string') {
        return ObjectID.createFromHexString(value);
    }
    if (value instanceof ObjectID) {
        return value;
    }
    throw new ValidationError({
        message: 'Invalid ID provided for Tier'
    });
}

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > MAX_STRING_LENGTH) {
        throw new ValidationError({
            message: 'Tier slug must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateName(value) {
    if (typeof value !== 'string' || value.length > MAX_STRING_LENGTH) {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateDescription(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string' || value.length > MAX_STRING_LENGTH) {
        throw new ValidationError({
            message: 'Tier description must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: 'Tier Welcome Page URL must be a string'
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
        return DEFAULT_MONTHLY_PRICE;
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
    if (value > MAX_PRICE) {
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
        return DEFAULT_YEARLY_PRICE;
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
    if (value > MAX_PRICE) {
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
```