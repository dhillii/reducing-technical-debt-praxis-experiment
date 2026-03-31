```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

// --- Validation Helpers ---

function createValidationError(message) {
    return new ValidationError({message});
}

function validateEnum(value, allowed, fieldName) {
    if (!allowed.includes(value)) {
        throw createValidationError(`Tier ${fieldName} must be either ${allowed.map(v => `"${v}"`).join(' or ')}`);
    }
    return value;
}

function validateStringWithMaxLength(value, maxLength, fieldName, allowNull = false) {
    if (allowNull && !value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw createValidationError(`Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`);
    }
    if (value.length > maxLength) {
        throw createValidationError(`Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`);
    }
    return value;
}

function validatePrice(value, type, cadence) {
    const defaults = {month: 500, year: 5000};
    if (type === 'free') {
        if (value !== null) {
            throw createValidationError(`Free Tiers cannot have a ${cadence} price`);
        }
        return null;
    }
    if (!value) {
        return defaults[cadence];
    }
    if (!Number.isSafeInteger(value)) {
        throw createValidationError('Tier prices must be an integer.');
    }
    if (value < 0) {
        throw createValidationError('Tier prices must not be negative');
    }
    if (value > 9999999999) {
        throw createValidationError('Tier prices may not exceed 999999.99');
    }
    return value;
}

function validateSlug(value) {
    return validateStringWithMaxLength(value, 191, 'slug');
}

function validateName(value) {
    return validateStringWithMaxLength(value, 191, 'name');
}

function validateDescription(value) {
    return validateStringWithMaxLength(value, 191, 'description', true);
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return value;
    }
    throw createValidationError('Tier Welcome Page URL must be a string');
}

function validateStatus(value) {
    return validateEnum(value, ['active', 'archived'], 'status');
}

function validateVisibility(value) {
    return validateEnum(value, ['public', 'none'], 'visibility');
}

function validateType(value) {
    return validateEnum(value, ['paid', 'free'], 'type');
}

function validateTrialDays(value, type) {
    if (type === 'free') {
        if (value) {
            throw createValidationError('Free Tiers cannot have a trial');
        }
        return 0;
    }
    if (!value) {
        return 0;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        throw createValidationError('Tier trials must be an integer greater than 0');
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw createValidationError('Free Tiers cannot have a currency');
        }
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw createValidationError('Tier currency must be a 3 letter ISO currency code');
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 'month');
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 'year');
}

function validateDate(value, fieldName, defaultValue = null) {
    if (!value) {
        return defaultValue;
    }
    if (value instanceof Date) {
        return value;
    }
    throw createValidationError(`Tier ${fieldName} must be a date`);
}

function validateCreatedAt(value) {
    return validateDate(value, 'created_at', new Date());
}

function validateUpdatedAt(value) {
    return validateDate(value, 'updated_at', null);
}

function validateBenefits(value) {
    if (!value) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw createValidationError('Tier benefits must be a list of strings');
    }
    return value;
}

function resolveObjectID(id) {
    if (!id) {
        return {id: new ObjectID(), isNew: true};
    }
    if (typeof id === 'string') {
        return {id: ObjectID.createFromHexString(id), isNew: false};
    }
    if (id instanceof ObjectID) {
        return {id, isNew: false};
    }
    throw createValidationError('Invalid ID provided for Tier');
}

// --- Tier Class ---

module.exports = class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    #id;
    #slug;
    #name;
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
    #benefits;

    get id() { return this.#id; }
    get slug() { return this.#slug; }
    get description() { return this.#description; }
    get welcomePageURL() { return this.#welcomePageURL; }
    get visibility() { return this.#visibility; }
    get type() { return this.#type; }
    get currency() { return this.#currency; }
    get monthlyPrice() { return this.#monthlyPrice; }
    get yearlyPrice() { return this.#yearlyPrice; }
    get createdAt() { return this.#createdAt; }
    get updatedAt() { return this.#updatedAt; }
    get benefits() { return this.#benefits; }
    get trialDays() { return this.#trialDays; }

    get name() { return this.#name; }
    set name(value) {
        const newName = validateName(value);
        if (newName === this.#name) {
            return;
        }
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    set benefits(value) { this.#benefits = validateBenefits(value); }
    set description(value) { this.#description = validateDescription(value); }
    set welcomePageURL(value) { this.#welcomePageURL = validateWelcomePageURL(value); }
    set visibility(value) { this.#visibility = validateVisibility(value); }
    set trialDays(value) { this.#trialDays = validateTrialDays(value, this.#type); }
    set currency(value) { this.#currency = validateCurrency(value, this.#type); }
    set monthlyPrice(value) { this.#monthlyPrice = validateMonthlyPrice(value, this.#type); }
    set yearlyPrice(value) { this.#yearlyPrice = validateYearlyPrice(value, this.#type); }

    get status() { return this.#status; }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        const event = newStatus === 'active'
            ? TierActivatedEvent.create({tier: this})
            : TierArchivedEvent.create({tier: this});
        this.events.push(event);
        this.#status = newStatus;
    }

    /**
     * @param {'month'|'year'} cadence
     */
    getPrice(cadence) {
        const priceMap = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (cadence in priceMap) {
            return priceMap[cadence];
        }
        throw createValidationError('Invalid cadence');
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw createValidationError('Cannot set pricing for free tiers');
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        const unchanged = newCurrency === this.#currency
            && newMonthlyPrice === this.#monthlyPrice
            && newYearlyPrice === this.#yearlyPrice;

        if (unchanged) {
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

    /** @private */
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
        const {id, isNew} = resolveObjectID(data.id);
        const type = validateType(data.type || 'paid');

        const tier = new Tier({
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcome_page_url: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type,
            trial_days: validateTrialDays(data.trialDays || 0, type),
            currency: validateCurrency(data.currency || null, type),
            monthly_price: validateMonthlyPrice(data.monthlyPrice || null, type),
            yearly_price: validateYearlyPrice(data.yearlyPrice || null, type),
            created_at: validateCreatedAt(data.createdAt),
            updated_at: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        });

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
};
```