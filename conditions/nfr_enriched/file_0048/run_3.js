```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

// Validation schemas and rules
const VALIDATION_RULES = {
    slug: {maxLength: 191, required: true, type: 'string'},
    name: {maxLength: 191, required: true, type: 'string'},
    description: {maxLength: 191, required: false, type: 'string'},
    welcomePageURL: {required: false, type: 'string'},
    status: {enum: ['active', 'archived'], default: 'active'},
    visibility: {enum: ['public', 'none'], default: 'public'},
    type: {enum: ['paid', 'free'], default: 'paid'},
    currency: {length: 3, required: false, type: 'string'},
    trialDays: {required: false, type: 'integer', min: 0},
    monthlyPrice: {required: false, type: 'integer', min: 0, max: 9999999999, default: 500},
    yearlyPrice: {required: false, type: 'integer', min: 0, max: 9999999999, default: 5000},
    benefits: {required: false, type: 'array'}
};

const ENUM_VALUES = {
    status: ['active', 'archived'],
    visibility: ['public', 'none'],
    type: ['paid', 'free']
};

const EVENT_HANDLERS = {
    name: (tier) => TierNameChangeEvent.create({tier}),
    status: (tier) => tier.status === 'active' 
        ? TierActivatedEvent.create({tier})
        : TierArchivedEvent.create({tier})
};

class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    #id;
    #slug;
    #name;
    #benefits;
    #description;
    #welcomePageURL;
    #status;
    #visibility;
    #type;
    #trialDays;
    #currency;
    #monthlyPrice;
    #yearlyPrice;
    #createdAt;
    #updatedAt;

    get id() {
        return this.#id;
    }

    get slug() {
        return this.#slug;
    }

    get name() {
        return this.#name;
    }

    set name(value) {
        const newName = validateString(value, 'name');
        if (newName !== this.#name) {
            this.events.push(EVENT_HANDLERS.name(this));
            this.#name = newName;
        }
    }

    get benefits() {
        return this.#benefits;
    }

    set benefits(value) {
        this.#benefits = validateBenefits(value);
    }

    get description() {
        return this.#description;
    }

    set description(value) {
        this.#description = validateOptionalString(value, 'description');
    }

    get welcomePageURL() {
        return this.#welcomePageURL;
    }

    set welcomePageURL(value) {
        this.#welcomePageURL = validateOptionalString(value, 'welcomePageURL');
    }

    get status() {
        return this.#status;
    }

    set status(value) {
        const newStatus = validateEnum(value, 'status');
        if (newStatus !== this.#status) {
            this.events.push(EVENT_HANDLERS.status(this));
            this.#status = newStatus;
        }
    }

    get visibility() {
        return this.#visibility;
    }

    set visibility(value) {
        this.#visibility = validateEnum(value, 'visibility');
    }

    get type() {
        return this.#type;
    }

    get trialDays() {
        return this.#trialDays;
    }

    set trialDays(value) {
        this.#trialDays = validateTrialDays(value, this.#type);
    }

    get currency() {
        return this.#currency;
    }

    set currency(value) {
        this.#currency = validateCurrency(value, this.#type);
    }

    get monthlyPrice() {
        return this.#monthlyPrice;
    }

    set monthlyPrice(value) {
        this.#monthlyPrice = validatePrice(value, this.#type, 'monthlyPrice');
    }

    get yearlyPrice() {
        return this.#yearlyPrice;
    }

    set yearlyPrice(value) {
        this.#yearlyPrice = validatePrice(value, this.#type, 'yearlyPrice');
    }

    get createdAt() {
        return this.#createdAt;
    }

    get updatedAt() {
        return this.#updatedAt;
    }

    getPrice(cadence) {
        const priceMap = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (!(cadence in priceMap)) {
            throw new ValidationError({message: 'Invalid cadence'});
        }
        return priceMap[cadence];
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validatePrice(monthlyPrice, this.#type, 'monthlyPrice');
        const newYearlyPrice = validatePrice(yearlyPrice, this.#type, 'yearlyPrice');

        if (newCurrency !== this.#currency || newMonthlyPrice !== this.#monthlyPrice || newYearlyPrice !== this.#yearlyPrice) {
            this.#currency = newCurrency;
            this.#monthlyPrice = newMonthlyPrice;
            this.#yearlyPrice = newYearlyPrice;
            this.events.push(TierPriceChangeEvent.create({tier: this}));
        }
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

    static async create(data) {
        const id = parseId(data.id);
        const validatedData = {
            slug: validateString(data.slug, 'slug'),
            name: validateString(data.name, 'name'),
            description: validateOptionalString(data.description, 'description'),
            welcome_page_url: validateOptionalString(data.welcomePageURL, 'welcomePageURL'),
            status: validateEnum(data.status || 'active', 'status'),
            visibility: validateEnum(data.visibility || 'public', 'visibility'),
            type: validateEnum(data.type || 'paid', 'type'),
            trial_days: null,
            currency: null,
            monthly_price: null,
            yearly_price: null,
            created_at: validateDate(data.createdAt, false),
            updated_at: validateDate(data.updatedAt, true),
            benefits: validateBenefits(data.benefits)
        };

        validatedData.currency = validateCurrency(data.currency || null, validatedData.type);
        validatedData.trial_days = validateTrialDays(data.trialDays || 0, validatedData.type);
        validatedData.monthly_price = validatePrice(data.monthlyPrice || null, validatedData.type, 'monthlyPrice');
        validatedData.yearly_price = validatePrice(data.yearlyPrice || null, validatedData.type, 'yearlyPrice');

        const tier = new Tier({id, ...validatedData});

        if (!data.id) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
}

// Validation helper functions
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

function validateString(value, fieldName) {
    if (typeof value !== 'string') {
        throw new ValidationError({message: `Tier ${fieldName} must be a string`});
    }
    const rule = VALIDATION_RULES[fieldName];
    if (rule.maxLength && value.length > rule.maxLength) {
        throw new ValidationError({message: `Tier ${fieldName} must not exceed ${rule.maxLength} characters`});
    }
    return value;
}

function validateOptionalString(value, fieldName) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: `Tier ${fieldName} must be a string`});
    }
    const rule = VALIDATION_RULES[fieldName];
    if (rule.maxLength && value.length > rule.maxLength) {
        throw new ValidationError({message: `Tier ${fieldName} must not exceed ${rule.maxLength} characters`});
    }
    return value;
}

function validateEnum(value, fieldName) {
    const validValues = ENUM_VALUES[fieldName];
    if (!validValues.includes(value)) {
        throw new ValidationError({message: `Tier ${fieldName} must be one of: ${validValues.join(', ')}`});
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
        throw new ValidationError({message: 'Tier trial days must be a non-negative integer'});
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
    if (!value) {
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validatePrice(value, type, fieldName) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: `Free Tiers cannot have a ${fieldName}`});
        }
        return null;
    }
    if (!value) {
        return fieldName === 'monthlyPrice' ? 500 : 5000;
    }
    if (!Number.isSafeInteger(value)) {
        throw new ValidationError({message: 'Tier prices must be an integer'});
    }
    if (value < 0) {
        throw new ValidationError({message: 'Tier prices must not be negative'});
    }
    if (value > 9999999999) {
        throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    }
    return value;
}

function validateDate(value, nullable) {
    if (!value) {
        return nullable ? null : new Date();
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier date must be a Date instance'});
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