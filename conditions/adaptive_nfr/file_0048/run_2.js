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

const EVENT_MAP = {
    active: TierActivatedEvent,
    archived: TierArchivedEvent
};

class Validator {
    static validateString(value, {maxLength, required = false} = {}) {
        if (!value && !required) {
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

    static validateEnum(value, enumValues, {default: defaultValue} = {}) {
        if (!value && defaultValue !== undefined) {
            return defaultValue;
        }
        if (!enumValues.includes(value)) {
            throw new ValidationError({message: `Value must be one of: ${enumValues.join(', ')}`});
        }
        return value;
    }

    static validateNumber(value, {min, max, default: defaultValue} = {}) {
        if (!value && defaultValue !== undefined) {
            return defaultValue;
        }
        if (!Number.isSafeInteger(value)) {
            throw new ValidationError({message: 'Value must be an integer'});
        }
        if (min !== undefined && value < min) {
            throw new ValidationError({message: `Value must be at least ${min}`});
        }
        if (max !== undefined && value > max) {
            throw new ValidationError({message: `Value must not exceed ${max}`});
        }
        return value;
    }

    static validateArray(value, itemType = 'string') {
        if (!value) {
            return [];
        }
        if (!Array.isArray(value) || !value.every(item => typeof item === itemType)) {
            throw new ValidationError({message: `Value must be an array of ${itemType}s`});
        }
        return value;
    }

    static validateDate(value, {required = false} = {}) {
        if (!value && !required) {
            return null;
        }
        if (!(value instanceof Date)) {
            throw new ValidationError({message: 'Value must be a date'});
        }
        return value;
    }

    static validateObjectID(value) {
        if (!value) {
            return new ObjectID();
        }
        if (typeof value === 'string') {
            return ObjectID.createFromHexString(value);
        }
        if (value instanceof ObjectID) {
            return value;
        }
        throw new ValidationError({message: 'Invalid ID provided for Tier'});
    }

    static validateCurrency(value, type) {
        if (type === 'free') {
            if (value !== null) {
                throw new ValidationError({message: 'Free Tiers cannot have a currency'});
            }
            return null;
        }
        const validated = this.validateString(value, {required: true});
        if (validated.length !== 3) {
            throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
        }
        return validated.toUpperCase();
    }

    static validatePrice(value, type, priceType) {
        if (type === 'free') {
            if (value !== null) {
                throw new ValidationError({message: `Free Tiers cannot have a ${priceType} price`});
            }
            return null;
        }
        const defaultPrice = priceType === 'monthly' ? 500 : 5000;
        return this.validateNumber(value, {min: 0, max: 9999999999, default: defaultPrice});
    }

    static validateTrialDays(value, type) {
        if (type === 'free') {
            if (value) {
                throw new ValidationError({message: 'Free Tiers cannot have a trial'});
            }
            return 0;
        }
        return this.validateNumber(value, {min: 0, default: 0});
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
        const newName = Validator.validateString(value, {maxLength: 191, required: true});
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
        this.#benefits = Validator.validateArray(value, 'string');
    }

    get description() {
        return this.#description;
    }

    set description(value) {
        this.#description = Validator.validateString(value, {maxLength: 191});
    }

    get welcomePageURL() {
        return this.#welcomePageURL;
    }

    set welcomePageURL(value) {
        this.#welcomePageURL = Validator.validateString(value);
    }

    get status() {
        return this.#status;
    }

    set status(value) {
        const newStatus = Validator.validateEnum(value, ['active', 'archived']);
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
        this.#visibility = Validator.validateEnum(value, ['public', 'none']);
    }

    get type() {
        return this.#type;
    }

    get trialDays() {
        return this.#trialDays;
    }

    set trialDays(value) {
        this.#trialDays = Validator.validateTrialDays(value, this.#type);
    }

    get currency() {
        return this.#currency;
    }

    set currency(value) {
        this.#currency = Validator.validateCurrency(value, this.#type);
    }

    get monthlyPrice() {
        return this.#monthlyPrice;
    }

    set monthlyPrice(value) {
        this.#monthlyPrice = Validator.validatePrice(value, this.#type, 'monthly');
    }

    get yearlyPrice() {
        return this.#yearlyPrice;
    }

    set yearlyPrice(value) {
        this.#yearlyPrice = Validator.validatePrice(value, this.#type, 'yearly');
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

        const newCurrency = Validator.validateCurrency(currency, this.#type);
        const newMonthlyPrice = Validator.validatePrice(monthlyPrice, this.#type, 'monthly');
        const newYearlyPrice = Validator.validatePrice(yearlyPrice, this.#type, 'yearly');

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
        const id = Validator.validateObjectID(data.id);
        const isNew = !data.id;

        const validatedData = {
            id,
            slug: Validator.validateString(data.slug, {maxLength: 191, required: true}),
            name: Validator.validateString(data.name, {maxLength: 191, required: true}),
            description: Validator.validateString(data.description, {maxLength: 191}),
            welcome_page_url: Validator.validateString(data.welcomePageURL),
            status: Validator.validateEnum(data.status || 'active', ['active', 'archived']),
            visibility: Validator.validateEnum(data.visibility || 'public', ['public', 'none']),
            type: Validator.validateEnum(data.type || 'paid', ['paid', 'free']),
            trial_days: Validator.validateTrialDays(data.trialDays || 0, data.type || 'paid'),
            benefits: Validator.validateArray(data.benefits, 'string'),
            created_at: Validator.validateDate(data.createdAt, {required: true}),
            updated_at: Validator.validateDate(data.updatedAt)
        };

        validatedData.currency = Validator.validateCurrency(data.currency || null, validatedData.type);
        validatedData.monthly_price = Validator.validatePrice(data.monthlyPrice || null, validatedData.type, 'monthly');
        validatedData.yearly_price = Validator.validatePrice(data.yearlyPrice || null, validatedData.type, 'yearly');

        const tier = new Tier(validatedData);

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
};
```