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

const VALIDATORS = {
    string: (value, rule) => {
        if (typeof value !== 'string') {
            throw new ValidationError({message: `Must be a string`});
        }
        if (rule.maxLength && value.length > rule.maxLength) {
            throw new ValidationError({message: `Must not exceed ${rule.maxLength} characters`});
        }
        return value;
    },

    enum: (value, rule) => {
        if (!rule.enum.includes(value)) {
            throw new ValidationError({message: `Must be one of: ${rule.enum.join(', ')}`});
        }
        return value;
    },

    integer: (value, rule) => {
        if (!Number.isSafeInteger(value)) {
            throw new ValidationError({message: `Must be an integer`});
        }
        if (rule.min !== undefined && value < rule.min) {
            throw new ValidationError({message: `Must be at least ${rule.min}`});
        }
        if (rule.max !== undefined && value > rule.max) {
            throw new ValidationError({message: `Must not exceed ${rule.max}`});
        }
        return value;
    },

    array: (value, rule) => {
        if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
            throw new ValidationError({message: `Must be an array of strings`});
        }
        return value;
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

    get id() { return this.#id; }
    get slug() { return this.#slug; }
    get name() { return this.#name; }
    get benefits() { return this.#benefits; }
    get description() { return this.#description; }
    get welcomePageURL() { return this.#welcomePageURL; }
    get status() { return this.#status; }
    get visibility() { return this.#visibility; }
    get type() { return this.#type; }
    get trialDays() { return this.#trialDays; }
    get currency() { return this.#currency; }
    get monthlyPrice() { return this.#monthlyPrice; }
    get yearlyPrice() { return this.#yearlyPrice; }
    get createdAt() { return this.#createdAt; }
    get updatedAt() { return this.#updatedAt; }

    set name(value) {
        const newName = validateString(value, VALIDATION_RULES.name);
        if (newName === this.#name) return;
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    set benefits(value) {
        this.#benefits = validateBenefits(value);
    }

    set description(value) {
        this.#description = validateOptionalString(value, VALIDATION_RULES.description);
    }

    set welcomePageURL(value) {
        this.#welcomePageURL = validateOptionalString(value, VALIDATION_RULES.welcomePageURL);
    }

    set status(value) {
        const newStatus = validateEnum(value, VALIDATION_RULES.status);
        if (newStatus === this.#status) return;
        this.events.push(
            newStatus === 'active'
                ? TierActivatedEvent.create({tier: this})
                : TierArchivedEvent.create({tier: this})
        );
        this.#status = newStatus;
    }

    set visibility(value) {
        this.#visibility = validateEnum(value, VALIDATION_RULES.visibility);
    }

    set trialDays(value) {
        this.#trialDays = validateTrialDays(value, this.#type);
    }

    set currency(value) {
        this.#currency = validateCurrency(value, this.#type);
    }

    set monthlyPrice(value) {
        this.#monthlyPrice = validatePrice(value, this.#type, 'monthly');
    }

    set yearlyPrice(value) {
        this.#yearlyPrice = validatePrice(value, this.#type, 'yearly');
    }

    getPrice(cadence) {
        const prices = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (!(cadence in prices)) {
            throw new ValidationError({message: 'Invalid cadence'});
        }
        return prices[cadence];
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validatePrice(monthlyPrice, this.#type, 'monthly');
        const newYearlyPrice = validatePrice(yearlyPrice, this.#type, 'yearly');

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
            slug: validateString(data.slug, VALIDATION_RULES.slug),
            name: validateString(data.name, VALIDATION_RULES.name),
            description: validateOptionalString(data.description, VALIDATION_RULES.description),
            welcome_page_url: validateOptionalString(data.welcomePageURL, VALIDATION_RULES.welcomePageURL),
            status: validateEnum(data.status || 'active', VALIDATION_RULES.status),
            visibility: validateEnum(data.visibility || 'public', VALIDATION_RULES.visibility),
            type: validateEnum(data.type || 'paid', VALIDATION_RULES.type),
            currency: validateCurrency(data.currency || null, data.type || 'paid'),
            trial_days: validateTrialDays(data.trialDays || 0, data.type || 'paid'),
            monthly_price: validatePrice(data.monthlyPrice || null, data.type || 'paid', 'monthly'),
            yearly_price: validatePrice(data.yearlyPrice || null, data.type || 'paid', 'yearly'),
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

function validateString(value, rule) {
    if (!value || typeof value !== 'string') {
        throw new ValidationError({message: `Must be a string`});
    }
    if (rule.maxLength && value.length > rule.maxLength) {
        throw new ValidationError({message: `Must not exceed ${rule.maxLength} characters`});
    }
    return value;
}

function validateOptionalString(value, rule) {
    if (!value) return null;
    if (typeof value !== 'string') {
        throw new ValidationError({message: `Must be a string`});
    }
    if (rule.maxLength && value.length > rule.maxLength) {
        throw new ValidationError({message: `Must not exceed ${rule.maxLength} characters`});
    }
    return value;
}

function validateEnum(value, rule) {
    if (!rule.enum.includes(value)) {
        throw new ValidationError({message: `Must be one of: ${rule.enum.join(', ')}`});
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
    if (!value) return 0;
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
    if (!value) return null;
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validatePrice(value, type, priceType) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({message: `Free Tiers cannot have a ${priceType} price`});
        }
        return null;
    }
    if (!value) {
        return priceType === 'monthly' ? 500 : 5000;
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

function validateDate(value, isRequired) {
    if (!value) {
        return isRequired ? new Date() : null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier date must be a Date instance'});
}

function validateBenefits(value) {
    if (!value) return [];
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be a list of strings'});
    }
    return value;
}

module.exports = Tier;
```