```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

const VALIDATION_RULES = {
    slug: {maxLength: 191, type: 'string', required: true},
    name: {maxLength: 191, type: 'string', required: true},
    description: {maxLength: 191, type: 'string', required: false},
    welcomePageURL: {type: 'string', required: false},
    status: {enum: ['active', 'archived'], default: 'active'},
    visibility: {enum: ['public', 'none'], default: 'public'},
    type: {enum: ['paid', 'free'], default: 'paid'},
    currency: {length: 3, type: 'string', required: false},
    trialDays: {type: 'integer', min: 0, required: false},
    monthlyPrice: {type: 'integer', min: 0, max: 9999999999, default: 500},
    yearlyPrice: {type: 'integer', min: 0, max: 9999999999, default: 5000}
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
        const newName = validateName(value);
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
        this.#emitStatusChangeEvent(newStatus);
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
        const priceMap = {
            'month': this.monthlyPrice,
            'year': this.yearlyPrice
        };
        
        if (!(cadence in priceMap)) {
            throw new ValidationError({
                message: 'Invalid cadence'
            });
        }
        
        return priceMap[cadence];
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

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        if (this.#hasPricingChanged(newCurrency, newMonthlyPrice, newYearlyPrice)) {
            this.#currency = newCurrency;
            this.#monthlyPrice = newMonthlyPrice;
            this.#yearlyPrice = newYearlyPrice;
            this.events.push(TierPriceChangeEvent.create({tier: this}));
        }
    }

    #hasPricingChanged(newCurrency, newMonthlyPrice, newYearlyPrice) {
        return newCurrency !== this.#currency || 
               newMonthlyPrice !== this.#monthlyPrice || 
               newYearlyPrice !== this.#yearlyPrice;
    }

    #emitStatusChangeEvent(newStatus) {
        const EventClass = newStatus === 'active' ? TierActivatedEvent : TierArchivedEvent;
        this.events.push(EventClass.create({tier: this}));
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
        const id = this.#parseId(data.id);
        const validatedData = this.#validateAllData(data);
        
        const tier = new Tier({
            id,
            slug: validatedData.slug,
            name: validatedData.name,
            description: validatedData.description,
            welcome_page_url: validatedData.welcomePageURL,
            status: validatedData.status,
            visibility: validatedData.visibility,
            type: validatedData.type,
            trial_days: validatedData.trialDays,
            currency: validatedData.currency,
            monthly_price: validatedData.monthlyPrice,
            yearly_price: validatedData.yearlyPrice,
            created_at: validatedData.createdAt,
            updated_at: validatedData.updatedAt,
            benefits: validatedData.benefits
        });

        if (!data.id) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }

    static #parseId(id) {
        if (!id) {
            return new ObjectID();
        }
        if (typeof id === 'string') {
            return ObjectID.createFromHexString(id);
        }
        if (id instanceof ObjectID) {
            return id;
        }
        throw new ValidationError({
            message: 'Invalid ID provided for Tier'
        });
    }

    static #validateAllData(data) {
        return {
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type: validateType(data.type || 'paid'),
            currency: validateCurrency(data.currency || null, data.type || 'paid'),
            trialDays: validateTrialDays(data.trialDays || 0, data.type || 'paid'),
            monthlyPrice: validateMonthlyPrice(data.monthlyPrice || null, data.type || 'paid'),
            yearlyPrice: validateYearlyPrice(data.yearlyPrice || null, data.type || 'paid'),
            createdAt: validateCreatedAt(data.createdAt),
            updatedAt: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        };
    }
}

module.exports = Tier;

// Validation Functions
function validateStringField(value, fieldName, maxLength = null) {
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string${maxLength ? ` with a maximum of ${maxLength} characters` : ''}`
        });
    }
    if (maxLength && value.length > maxLength) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`
        });
    }
    return value;
}

function validateEnumField(value, fieldName, allowedValues) {
    if (!allowedValues.includes(value)) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be either "${allowedValues.join('" or "')}"`
        });
    }
    return value;
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
    return validateStringField(value, 'name', 191);
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (value === null || typeof value === 'string') {
        return value;
    }
    throw new ValidationError({
        message: 'Tier Welcome Page URL must be a string'
    });
}

function validateDescription(value) {
    if (!value) {
        return null;
    }
    return validateStringField(value, 'description', 191);
}

function validateStatus(value) {
    return validateEnumField(value, 'status', ['active', 'archived']);
}

function validateVisibility(value) {
    return validateEnumField(value, 'visibility', ['public', 'none']);
}

function validateType(value) {
    return validateEnumField(value, 'type', ['paid', 'free']);
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

function validatePrice(value, type, fieldName, defaultValue) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: `Free Tiers cannot have a ${fieldName}`
            });
        }
        return null;
    }
    if (!value) {
        return defaultValue;
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
    if (value > 9999999999) {
        throw new ValidationError({
            message: 'Tier prices may not exceed 999999.99'
        });
    }
    return value;
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 'monthly price', 500);
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 'yearly price', 5000);
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