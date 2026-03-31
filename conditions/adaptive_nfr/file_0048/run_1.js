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
    yearlyPrice: {min: 0, max: 9999999999, default: 5000},
    benefits: {required: false}
};

const ENUM_VALUES = {
    status: new Set(['active', 'archived']),
    visibility: new Set(['public', 'none']),
    type: new Set(['paid', 'free'])
};

const EVENT_MAP = {
    active: TierActivatedEvent,
    archived: TierArchivedEvent
};

class Validator {
    static validateString(value, {maxLength, required = true} = {}) {
        if (!required && !value) {
            return null;
        }
        if (typeof value !== 'string') {
            throw new ValidationError({message: 'Value must be a string'});
        }
        if (maxLength && value.length > maxLength) {
            throw new ValidationError({message: `Value must not exceed ${maxLength} characters`});
        }
        return value;
    }

    static validateEnum(value, enumSet, fieldName) {
        if (!enumSet.has(value)) {
            throw new ValidationError({message: `${fieldName} must be one of: ${Array.from(enumSet).join(', ')}`});
        }
        return value;
    }

    static validateInteger(value, {min = 0, max, required = false, defaultValue = null} = {}) {
        if (!required && !value) {
            return defaultValue;
        }
        if (!Number.isSafeInteger(value)) {
            throw new ValidationError({message: 'Value must be an integer'});
        }
        if (value < min) {
            throw new ValidationError({message: `Value must be at least ${min}`});
        }
        if (max !== undefined && value > max) {
            throw new ValidationError({message: `Value must not exceed ${max}`});
        }
        return value;
    }

    static validateDate(value, {required = false} = {}) {
        if (!required && !value) {
            return null;
        }
        if (!(value instanceof Date)) {
            throw new ValidationError({message: 'Value must be a date'});
        }
        return value;
    }

    static validateArray(value, {itemType = 'string', required = false} = {}) {
        if (!required && !value) {
            return [];
        }
        if (!Array.isArray(value) || !value.every(item => typeof item === itemType)) {
            throw new ValidationError({message: `Value must be an array of ${itemType}s`});
        }
        return value;
    }
}

class TierPropertyManager {
    constructor(tier) {
        this.tier = tier;
    }

    setWithEvent(property, newValue, oldValue, EventClass) {
        if (newValue === oldValue) {
            return;
        }
        this.tier[property] = newValue;
        this.tier.events.push(EventClass.create({tier: this.tier}));
    }

    setWithStatusEvent(newStatus, oldStatus) {
        if (newStatus === oldStatus) {
            return;
        }
        this.tier.#status = newStatus;
        const EventClass = EVENT_MAP[newStatus];
        this.tier.events.push(EventClass.create({tier: this.tier}));
    }
}

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
        const newName = Validator.validateString(value, VALIDATION_RULES.name);
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
        this.#benefits = Validator.validateArray(value, {itemType: 'string'});
    }

    /** @type {string} */
    #description;
    get description() {
        return this.#description;
    }
    set description(value) {
        this.#description = Validator.validateString(value, VALIDATION_RULES.description);
    }

    /** @type {string} */
    #welcomePageURL;
    get welcomePageURL() {
        return this.#welcomePageURL;
    }
    set welcomePageURL(value) {
        this.#welcomePageURL = Validator.validateString(value, VALIDATION_RULES.welcomePageURL);
    }

    /** @type {'active'|'archived'} */
    #status;
    get status() {
        return this.#status;
    }
    set status(value) {
        const newStatus = Validator.validateEnum(value, ENUM_VALUES.status, 'Status');
        if (newStatus === this.#status) {
            return;
        }
        this.#status = newStatus;
        const EventClass = EVENT_MAP[newStatus];
        this.events.push(EventClass.create({tier: this}));
    }

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() {
        return this.#visibility;
    }
    set visibility(value) {
        this.#visibility = Validator.validateEnum(value, ENUM_VALUES.visibility, 'Visibility');
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
        this.#trialDays = this.#validatePricingField(value, 'trialDays');
    }

    /** @type {string|null} */
    #currency;
    get currency() {
        return this.#currency;
    }
    set currency(value) {
        this.#currency = this.#validatePricingField(value, 'currency');
    }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.#monthlyPrice = this.#validatePricingField(value, 'monthlyPrice');
    }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.#yearlyPrice = this.#validatePricingField(value, 'yearlyPrice');
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

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = this.#validatePricingField(currency, 'currency');
        const newMonthlyPrice = this.#validatePricingField(monthlyPrice, 'monthlyPrice');
        const newYearlyPrice = this.#validatePricingField(yearlyPrice, 'yearlyPrice');

        if (newCurrency === this.#currency && newMonthlyPrice === this.#monthlyPrice && newYearlyPrice === this.#yearlyPrice) {
            return;
        }

        this.#currency = newCurrency;
        this.#monthlyPrice = newMonthlyPrice;
        this.#yearlyPrice = newYearlyPrice;
        this.events.push(TierPriceChangeEvent.create({tier: this}));
    }

    #validatePricingField(value, fieldName) {
        if (this.#type === 'free') {
            if (value !== null && value !== undefined && value !== '') {
                throw new ValidationError({message: `Free Tiers cannot have a ${fieldName}`});
            }
            return null;
        }

        const rules = VALIDATION_RULES[fieldName];
        if (fieldName === 'currency') {
            if (!value) return null;
            if (typeof value !== 'string' || value.length !== 3) {
                throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
            }
            return value.toUpperCase();
        }

        if (fieldName === 'trialDays') {
            return Validator.validateInteger(value, {min: 0, required: false, defaultValue: 0});
        }

        if (fieldName === 'monthlyPrice') {
            return Validator.validateInteger(value, {min: 0, max: 9999999999, required: false, defaultValue: 500});
        }

        if (fieldName === 'yearlyPrice') {
            return Validator.validateInteger(value, {min: 0, max: 9999999999, required: false, defaultValue: 5000});
        }

        return value;
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
        const isNew = !data.id;

        const validatedData = {
            id,
            slug: Validator.validateString(data.slug, VALIDATION_RULES.slug),
            name: Validator.validateString(data.name, VALIDATION_RULES.name),
            description: Validator.validateString(data.description, VALIDATION_RULES.description),
            welcome_page_url: Validator.validateString(data.welcomePageURL, VALIDATION_RULES.welcomePageURL),
            status: Validator.validateEnum(data.status || 'active', ENUM_VALUES.status, 'Status'),
            visibility: Validator.validateEnum(data.visibility || 'public', ENUM_VALUES.visibility, 'Visibility'),
            type: Validator.validateEnum(data.type || 'paid', ENUM_VALUES.type, 'Type'),
            currency: null,
            trial_days: 0,
            monthly_price: 500,
            yearly_price: 5000,
            created_at: Validator.validateDate(data.createdAt, {required: false}) || new Date(),
            updated_at: Validator.validateDate(data.updatedAt, {required: false}),
            benefits: Validator.validateArray(data.benefits, {itemType: 'string'})
        };

        // Validate pricing fields based on type
        if (validatedData.type === 'paid') {
            validatedData.currency = data.currency ? Validator.validateString(data.currency, {required: true}).toUpperCase() : null;
            validatedData.trial_days = Validator.validateInteger(data.trialDays || 0, {min: 0});
            validatedData.monthly_price = Validator.validateInteger(data.monthlyPrice || 500, {min: 0, max: 9999999999});
            validatedData.yearly_price = Validator.validateInteger(data.yearlyPrice || 5000, {min: 0, max: 9999999999});
        }

        const tier = new Tier(validatedData);

        if (isNew) {
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
        throw new ValidationError({message: 'Invalid ID provided for Tier'});
    }
};
```