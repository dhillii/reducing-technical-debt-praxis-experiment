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
    status: ['active', 'archived'],
    visibility: ['public', 'none'],
    type: ['paid', 'free']
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

    static validateEnum(value, enumValues, fieldName) {
        if (!enumValues.includes(value)) {
            throw new ValidationError({
                message: `${fieldName} must be one of: ${enumValues.join(', ')}`
            });
        }
        return value;
    }

    static validateInteger(value, {min = null, max = null, required = true, defaultValue = null} = {}) {
        if (!required && !value) {
            return defaultValue;
        }
        if (!Number.isSafeInteger(value)) {
            throw new ValidationError({message: 'Value must be an integer'});
        }
        if (min !== null && value < min) {
            throw new ValidationError({message: `Value must be at least ${min}`});
        }
        if (max !== null && value > max) {
            throw new ValidationError({message: `Value must not exceed ${max}`});
        }
        return value;
    }

    static validateDate(value, {required = true} = {}) {
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
        if (!Array.isArray(value)) {
            throw new ValidationError({message: 'Value must be an array'});
        }
        if (itemType === 'string' && !value.every(item => typeof item === 'string')) {
            throw new ValidationError({message: 'All items must be strings'});
        }
        return value;
    }
}

class PricingValidator {
    static validateForType(type, currency, monthlyPrice, yearlyPrice) {
        if (type === 'free') {
            if (currency !== null || monthlyPrice !== null || yearlyPrice !== null) {
                throw new ValidationError({
                    message: 'Free tiers cannot have pricing information'
                });
            }
            return {currency: null, monthlyPrice: null, yearlyPrice: null};
        }

        return {
            currency: this.validateCurrency(currency, type),
            monthlyPrice: this.validatePrice(monthlyPrice, 'monthly', 500),
            yearlyPrice: this.validatePrice(yearlyPrice, 'yearly', 5000)
        };
    }

    static validateCurrency(value, type) {
        if (type === 'free') {
            return null;
        }
        if (typeof value !== 'string' || value.length !== 3) {
            throw new ValidationError({
                message: 'Currency must be a 3 letter ISO code'
            });
        }
        return value.toUpperCase();
    }

    static validatePrice(value, cadence, defaultValue) {
        if (!value) {
            return defaultValue;
        }
        return Validator.validateInteger(value, {
            min: 0,
            max: 9999999999
        });
    }

    static validateTrialDays(value, type) {
        if (type === 'free') {
            if (value) {
                throw new ValidationError({
                    message: 'Free tiers cannot have a trial'
                });
            }
            return 0;
        }
        return Validator.validateInteger(value || 0, {min: 0, required: false, defaultValue: 0});
    }
}

module.exports = class Tier {
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
        const newName = Validator.validateString(value, {maxLength: 191});
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
        this.#benefits = Validator.validateArray(value, {itemType: 'string'});
    }

    get description() {
        return this.#description;
    }

    set description(value) {
        this.#description = Validator.validateString(value, {maxLength: 191, required: false});
    }

    get welcomePageURL() {
        return this.#welcomePageURL;
    }

    set welcomePageURL(value) {
        this.#welcomePageURL = Validator.validateString(value, {required: false});
    }

    get status() {
        return this.#status;
    }

    set status(value) {
        const newStatus = Validator.validateEnum(value, ENUM_VALUES.status, 'Status');
        if (newStatus === this.#status) {
            return;
        }
        const EventClass = EVENT_MAP[newStatus];
        this.events.push(EventClass.create({tier: this}));
        this.#status = newStatus;
    }

    get visibility() {
        return this.#visibility;
    }

    set visibility(value) {
        this.#visibility = Validator.validateEnum(value, ENUM_VALUES.visibility, 'Visibility');
    }

    get type() {
        return this.#type;
    }

    get trialDays() {
        return this.#trialDays;
    }

    set trialDays(value) {
        this.#trialDays = PricingValidator.validateTrialDays(value, this.#type);
    }

    get currency() {
        return this.#currency;
    }

    set currency(value) {
        this.#currency = PricingValidator.validateCurrency(value, this.#type);
    }

    get monthlyPrice() {
        return this.#monthlyPrice;
    }

    set monthlyPrice(value) {
        this.#monthlyPrice = PricingValidator.validatePrice(value, 'monthly', 500);
    }

    get yearlyPrice() {
        return this.#yearlyPrice;
    }

    set yearlyPrice(value) {
        this.#yearlyPrice = PricingValidator.validatePrice(value, 'yearly', 5000);
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
        const pricing = PricingValidator.validateForType(
            this.#type,
            currency,
            monthlyPrice,
            yearlyPrice
        );

        if (pricing.currency === this.#currency &&
            pricing.monthlyPrice === this.#monthlyPrice &&
            pricing.yearlyPrice === this.#yearlyPrice) {
            return;
        }

        this.#currency = pricing.currency;
        this.#monthlyPrice = pricing.monthlyPrice;
        this.#yearlyPrice = pricing.yearlyPrice;
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
        const id = this.#parseId(data.id);
        const type = Validator.validateEnum(data.type || 'paid', ENUM_VALUES.type, 'Type');

        const validatedData = {
            id,
            slug: Validator.validateString(data.slug, {maxLength: 191}),
            name: Validator.validateString(data.name, {maxLength: 191}),
            description: Validator.validateString(data.description, {maxLength: 191, required: false}),
            welcome_page_url: Validator.validateString(data.welcomePageURL, {required: false}),
            status: Validator.validateEnum(data.status || 'active', ENUM_VALUES.status, 'Status'),
            visibility: Validator.validateEnum(data.visibility || 'public', ENUM_VALUES.visibility, 'Visibility'),
            type,
            trial_days: PricingValidator.validateTrialDays(data.trialDays || 0, type),
            benefits: Validator.validateArray(data.benefits, {itemType: 'string'})
        };

        const pricing = PricingValidator.validateForType(
            type,
            data.currency || null,
            data.monthlyPrice || null,
            data.yearlyPrice || null
        );

        Object.assign(validatedData, {
            currency: pricing.currency,
            monthly_price: pricing.monthlyPrice,
            yearly_price: pricing.yearlyPrice,
            created_at: Validator.validateDate(data.createdAt, {required: false}) || new Date(),
            updated_at: Validator.validateDate(data.updatedAt, {required: false})
        });

        const tier = new Tier(validatedData);
        const isNew = !data.id;

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