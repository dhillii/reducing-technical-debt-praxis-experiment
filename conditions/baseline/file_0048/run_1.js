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
    /** @type {string} */
    #slug;
    /** @type {string} */
    #name;
    /** @type {string[]} */
    #benefits;
    /** @type {string} */
    #description;
    /** @type {string} */
    #welcomePageURL;
    /** @type {'active'|'archived'} */
    #status;
    /** @type {'public'|'none'} */
    #visibility;
    /** @type {'paid'|'free'} */
    #type;
    /** @type {number|null} */
    #trialDays;
    /** @type {string|null} */
    #currency;
    /** @type {number|null} */
    #monthlyPrice;
    /** @type {number|null} */
    #yearlyPrice;
    /** @type {Date} */
    #createdAt;
    /** @type {Date|null} */
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
        const newName = validateName(value);
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
        this.#description = validateDescription(value);
    }

    get welcomePageURL() {
        return this.#welcomePageURL;
    }

    set welcomePageURL(value) {
        this.#welcomePageURL = validateWelcomePageURL(value);
    }

    get status() {
        return this.#status;
    }

    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        const EventClass = STATUS_EVENTS[newStatus];
        this.events.push(EventClass.create({tier: this}));
        this.#status = newStatus;
    }

    get visibility() {
        return this.#visibility;
    }

    set visibility(value) {
        this.#visibility = validateVisibility(value);
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
        this.#monthlyPrice = validateMonthlyPrice(value, this.#type);
    }

    get yearlyPrice() {
        return this.#yearlyPrice;
    }

    set yearlyPrice(value) {
        this.#yearlyPrice = validateYearlyPrice(value, this.#type);
    }

    get createdAt() {
        return this.#createdAt;
    }

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
        const validatedData = {
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcome_page_url: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type: validateType(data.type || 'paid'),
            trial_days: null,
            currency: null,
            monthly_price: null,
            yearly_price: null,
            created_at: validateCreatedAt(data.createdAt),
            updated_at: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        };

        validatedData.type = validatedData.type || 'paid';
        validatedData.currency = validateCurrency(data.currency || null, validatedData.type);
        validatedData.trial_days = validateTrialDays(data.trialDays || 0, validatedData.type);
        validatedData.monthly_price = validateMonthlyPrice(data.monthlyPrice || null, validatedData.type);
        validatedData.yearly_price = validateYearlyPrice(data.yearlyPrice || null, validatedData.type);

        const tier = new Tier(validatedData);

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

function validateStringField(value, maxLength, fieldName, required = true) {
    if (!value && required) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`
        });
    }
    if (value && typeof value !== 'string') {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`
        });
    }
    if (value && value.length > maxLength) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`
        });
    }
    return value || null;
}

function validateEnumField(value, allowedValues, fieldName) {
    if (!allowedValues.includes(value)) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be either "${allowedValues.join('" or "')}"`
        });
    }
    return value;
}

function validateSlug(value) {
    return validateStringField(value, 191, 'slug', true);
}

function validateName(value) {
    return validateStringField(value, 191, 'name', true);
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return value;
    }
    throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
}

function validateDescription(value) {
    return validateStringField(value, 191, 'description', false);
}

function validateStatus(value) {
    return validateEnumField(value, ['active', 'archived'], 'status');
}

function validateVisibility(value) {
    return validateEnumField(value, ['public', 'none'], 'visibility');
}

function validateType(value) {
    return validateEnumField(value, ['paid', 'free'], 'type');
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
            throw new ValidationError({message: `Free Tiers cannot have a price`});
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

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 500);
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 5000);
}

function validateCreatedAt(value) {
    if (!value) {
        return new Date();
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateUpdatedAt(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: 'Tier created_at must be a date'});
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