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
    currency: {length: 3, type: 'string', dependsOn: 'type', dependsOnValue: 'paid'},
    trialDays: {type: 'integer', min: 0, dependsOn: 'type', dependsOnValue: 'paid'},
    monthlyPrice: {type: 'integer', min: 0, max: 9999999999, default: 500, dependsOn: 'type', dependsOnValue: 'paid'},
    yearlyPrice: {type: 'integer', min: 0, max: 9999999999, default: 5000, dependsOn: 'type', dependsOnValue: 'paid'}
};

const ENUM_VALIDATORS = {
    status: (value) => ['active', 'archived'].includes(value),
    visibility: (value) => ['public', 'none'].includes(value),
    type: (value) => ['paid', 'free'].includes(value)
};

const EVENT_CREATORS = {
    status: {
        active: TierActivatedEvent,
        archived: TierArchivedEvent
    }
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
        const newName = validateString(value, 'Tier name', 191);
        if (newName === this.#name) {
            return;
        }
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
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
        this.#description = validateOptionalString(value, 'Tier description', 191);
    }

    get welcomePageURL() {
        return this.#welcomePageURL;
    }

    set welcomePageURL(value) {
        this.#welcomePageURL = validateOptionalString(value, 'Tier Welcome Page URL');
    }

    get status() {
        return this.#status;
    }

    set status(value) {
        const newStatus = validateEnum(value, 'status');
        if (newStatus === this.#status) {
            return;
        }
        const EventClass = EVENT_CREATORS.status[newStatus];
        this.events.push(EventClass.create({tier: this}));
        this.#status = newStatus;
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
        this.#monthlyPrice = validatePrice(value, this.#type, 500);
    }

    get yearlyPrice() {
        return this.#yearlyPrice;
    }

    set yearlyPrice(value) {
        this.#yearlyPrice = validatePrice(value, this.#type, 5000);
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
        const isNew = !data.id;

        const validatedData = {
            id,
            slug: validateString(data.slug, 'Tier slug', 191),
            name: validateString(data.name, 'Tier name', 191),
            description: validateOptionalString(data.description, 'Tier description', 191),
            welcome_page_url: validateOptionalString(data.welcomePageURL, 'Tier Welcome Page URL'),
            status: validateEnum(data.status || 'active', 'status'),
            visibility: validateEnum(data.visibility || 'public', 'visibility'),
            type: validateEnum(data.type || 'paid', 'type'),
            trial_days: validateTrialDays(data.trialDays || 0, data.type || 'paid'),
            currency: validateCurrency(data.currency || null, data.type || 'paid'),
            monthly_price: validatePrice(data.monthlyPrice || null, data.type || 'paid', 500),
            yearly_price: validatePrice(data.yearlyPrice || null, data.type || 'paid', 5000),
            created_at: validateDate(data.createdAt, true),
            updated_at: validateDate(data.updatedAt, false),
            benefits: validateBenefits(data.benefits)
        };

        const tier = new Tier(validatedData);

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
}

// Utility validators
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

function validateString(value, fieldName, maxLength) {
    if (typeof value !== 'string') {
        throw new ValidationError({message: `${fieldName} must be a string`});
    }
    if (value.length === 0 || value.length > maxLength) {
        throw new ValidationError({message: `${fieldName} must be between 1 and ${maxLength} characters`});
    }
    return value;
}

function validateOptionalString(value, fieldName, maxLength = null) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: `${fieldName} must be a string`});
    }
    if (maxLength && value.length > maxLength) {
        throw new ValidationError({message: `${fieldName} must not exceed ${maxLength} characters`});
    }
    return value;
}

function validateEnum(value, fieldName) {
    if (!ENUM_VALIDATORS[fieldName](value)) {
        const rule = VALIDATION_RULES[fieldName];
        throw new ValidationError({message: `Tier ${fieldName} must be one of: ${rule.enum.join(', ')}`});
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

function validatePrice(value, type, defaultValue) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: 'Free Tiers cannot have a price'});
        }
        return null;
    }
    if (!value) {
        return defaultValue;
    }
    if (!Number.isSafeInteger(value) || value < 0 || value > 9999999999) {
        throw new ValidationError({message: 'Tier prices must be a non-negative integer not exceeding 999999.99'});
    }
    return value;
}

function validateDate(value, isRequired) {
    if (!value) {
        return isRequired ? new Date() : null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier date must be a valid Date object'});
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