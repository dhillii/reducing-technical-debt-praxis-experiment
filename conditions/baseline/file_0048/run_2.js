```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

const VALIDATION_RULES = {
    slug: {maxLength: 191, required: true},
    name: {maxLength: 191, required: true},
    description: {maxLength: 191, required: false},
    welcomePageURL: {required: false},
    status: {enum: ['active', 'archived'], default: 'active'},
    visibility: {enum: ['public', 'none'], default: 'public'},
    type: {enum: ['paid', 'free'], default: 'paid'},
    currency: {length: 3, required: false},
    trialDays: {min: 0, required: false},
    monthlyPrice: {min: 0, max: 9999999999, default: 500},
    yearlyPrice: {min: 0, max: 9999999999, default: 5000}
};

const STATUS_EVENTS = {
    active: TierActivatedEvent,
    archived: TierArchivedEvent
};

class Tier {
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
        const newName = validateStringField(value, 'name');
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
        this.#description = validateStringField(value, 'description', false);
    }

    /** @type {string} */
    #welcomePageURL;
    get welcomePageURL() {
        return this.#welcomePageURL;
    }
    set welcomePageURL(value) {
        this.#welcomePageURL = validateOptionalString(value);
    }

    /** @type {'active'|'archived'} */
    #status;
    get status() {
        return this.#status;
    }
    set status(value) {
        const newStatus = validateEnum(value, ['active', 'archived'], 'status');
        if (newStatus === this.#status) {
            return;
        }
        const EventClass = STATUS_EVENTS[newStatus];
        this.events.push(EventClass.create({tier: this}));
        this.#status = newStatus;
    }

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() {
        return this.#visibility;
    }
    set visibility(value) {
        this.#visibility = validateEnum(value, ['public', 'none'], 'visibility');
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
        const priceMap = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (!(cadence in priceMap)) {
            throw new ValidationError({message: 'Invalid cadence'});
        }
        return priceMap[cadence];
    }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.#monthlyPrice = validatePrice(value, this.#type, 500);
    }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.#yearlyPrice = validatePrice(value, this.#type, 5000);
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validatePrice(monthlyPrice, this.#type, 500);
        const newYearlyPrice = validatePrice(yearlyPrice, this.#type, 5000);

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
        const id = parseId(data.id);
        const type = validateEnum(data.type || 'paid', ['paid', 'free'], 'type');

        const tier = new Tier({
            id,
            slug: validateStringField(data.slug, 'slug'),
            name: validateStringField(data.name, 'name'),
            description: validateStringField(data.description, 'description', false),
            welcome_page_url: validateOptionalString(data.welcomePageURL),
            status: validateEnum(data.status || 'active', ['active', 'archived'], 'status'),
            visibility: validateEnum(data.visibility || 'public', ['public', 'none'], 'visibility'),
            type,
            trial_days: validateTrialDays(data.trialDays || 0, type),
            currency: validateCurrency(data.currency || null, type),
            monthly_price: validatePrice(data.monthlyPrice || null, type, 500),
            yearly_price: validatePrice(data.yearlyPrice || null, type, 5000),
            created_at: validateDate(data.createdAt, true),
            updated_at: validateDate(data.updatedAt, false),
            benefits: validateBenefits(data.benefits)
        });

        if (!data.id) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
}

function parseId(id) {
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

function validateStringField(value, fieldName, required = true) {
    if (!value && !required) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string with a maximum of 191 characters`
        });
    }
    if (value.length > 191) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string with a maximum of 191 characters`
        });
    }
    return value;
}

function validateOptionalString(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
    }
    return value;
}

function validateEnum(value, allowedValues, fieldName) {
    if (!allowedValues.includes(value)) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be one of: ${allowedValues.join(', ')}`
        });
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

function validatePrice(value, type, defaultValue) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: `Free Tiers cannot have a ${value === defaultValue ? 'monthly' : 'yearly'} price`
            });
        }
        return null;
    }
    if (!value) {
        return defaultValue;
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

function validateDate(value, required = false) {
    if (!value) {
        return required ? new Date() : null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier date must be a date'});
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

module.exports = Tier;
```