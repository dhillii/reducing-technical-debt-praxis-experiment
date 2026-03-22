Here's the refactored code with reduced complexity:

```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

// ─── Validation Helpers ───────────────────────────────────────────────────────

function validateString(value, fieldName, {maxLength = 191, required = true} = {}) {
    if (!required && !value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: `${fieldName} must be a string with a maximum of ${maxLength} characters`});
    }
    if (value.length > maxLength) {
        throw new ValidationError({message: `${fieldName} must be a string with a maximum of ${maxLength} characters`});
    }
    return value;
}

function validateEnum(value, allowed, fieldName) {
    if (!allowed.includes(value)) {
        throw new ValidationError({message: `${fieldName} must be one of: ${allowed.join(', ')}`});
    }
    return value;
}

function validateFreeOnly(value, type, fieldName) {
    if (type === 'free' && value !== null) {
        throw new ValidationError({message: `Free Tiers cannot have a ${fieldName}`});
    }
}

function validatePrice(value, type, defaultValue, fieldName) {
    validateFreeOnly(value, type, fieldName);
    if (type === 'free') {
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

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({message: 'Tier slug must be a string with a maximum of 191 characters'});
    }
    return value;
}

function validateName(value) {
    return validateString(value, 'Tier name');
}

function validateDescription(value) {
    return validateString(value, 'Tier description', {required: false});
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
    }
    return value;
}

function validateStatus(value) {
    return validateEnum(value, ['active', 'archived'], 'Tier status');
}

function validateVisibility(value) {
    return validateEnum(value, ['public', 'none'], 'Tier visibility');
}

function validateType(value) {
    return validateEnum(value, ['paid', 'free'], 'Tier type');
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
    validateFreeOnly(value, type, 'currency');
    if (type === 'free') {
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 500, 'monthly price');
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 5000, 'yearly price');
}

function validateDate(value, fieldName, {required = true} = {}) {
    if (!value) {
        return required ? new Date() : null;
    }
    if (value instanceof Date) {
        return value;
    }
    throw new ValidationError({message: `Tier ${fieldName} must be a date`});
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

// ─── ID Parsing ───────────────────────────────────────────────────────────────

function parseId(rawId) {
    if (!rawId) {
        return {id: new ObjectID(), isNew: true};
    }
    if (typeof rawId === 'string') {
        return {id: ObjectID.createFromHexString(rawId), isNew: false};
    }
    if (rawId instanceof ObjectID) {
        return {id: rawId, isNew: false};
    }
    throw new ValidationError({message: 'Invalid ID provided for Tier'});
}

// ─── Tier Class ───────────────────────────────────────────────────────────────

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

    // ─── Getters ───────────────────────────────────────────────────────────────

    get id() { return this.#id; }
    get slug() { return this.#slug; }
    get type() { return this.#type; }
    get createdAt() { return this.#createdAt; }
    get updatedAt() { return this.#updatedAt; }
    get benefits() { return this.#benefits; }
    get description() { return this.#description; }
    get welcomePageURL() { return this.#welcomePageURL; }
    get visibility() { return this.#visibility; }
    get trialDays() { return this.#trialDays; }
    get currency() { return this.#currency; }
    get monthlyPrice() { return this.#monthlyPrice; }
    get yearlyPrice() { return this.#yearlyPrice; }

    get name() { return this.#name; }
    set name(value) {
        const newName = validateName(value);
        if (newName === this.#name) {
            return;
        }
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    get status() { return this.#status; }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        const Event = newStatus === 'active' ? TierActivatedEvent : TierArchivedEvent;
        this.events.push(Event.create({tier: this}));
        this.#status = newStatus;
    }

    set benefits(value) { this.#benefits = validateBenefits(value); }
    set description(value) { this.#description = validateDescription(value); }
    set welcomePageURL(value) { this.#welcomePageURL = validateWelcomePageURL(value); }
    set visibility(value) { this.#visibility = validateVisibility(value); }
    set trialDays(value) { this.#trialDays = validateTrialDays(value, this.#type); }
    set currency(value) { this.#currency = validateCurrency(value, this.#type); }
    set monthlyPrice(value) { this.#monthlyPrice = validateMonthlyPrice(value, this.#type); }
    set yearlyPrice(value) { this.#yearlyPrice = validateYearlyPrice(value, this.#type); }

    // ─── Methods ───────────────────────────────────────────────────────────────

    /**
     * @param {'month'|'year'} cadence
     */
    getPrice(cadence) {
        const priceMap = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (cadence in priceMap) {
            return priceMap[cadence];
        }
        throw new ValidationError({message: 'Invalid cadence'});
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        const hasChanged =
            newCurrency !== this.#currency ||
            newMonthlyPrice !== this.#monthlyPrice ||
            newYearlyPrice !== this.#yearlyPrice;

        if (!hasChanged) {
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

    // ─── Constructor ──────────────────────────────────────────────────────────

    /** @private */
    constructor(data) {
        this.#id = data.id;
        this.#slug = data.slug;
        this.#name = data.name;
        this.#description = data.description;
        this.#welcomePageURL = data.welcomePageURL;
        this.#status = data.status;
        this.#visibility = data.visibility;
        this.#type = data.type;
        this.#trialDays = data.trialDays;
        this.#currency = data.currency;
        this.#monthlyPrice = data.monthlyPrice;
        this.#yearlyPrice = data.yearlyPrice;
        this.#createdAt = data.createdAt;
        this.#updatedAt = data.updatedAt;
        this.#benefits = data.benefits;
    }

    // ─── Factory ──────────────────────────────────────────────────────────────

    /**
     * @param {any} data
     * @returns {Promise<Tier>}
     */
    static async create(data) {
        const {id, isNew} = parseId(data.id);
        const type = validateType(data.type || 'paid');

        const tierData = {
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type,
            trialDays: validateTrialDays(data.trialDays || 0, type),
            currency: validateCurrency(data.currency || null, type),
            monthlyPrice: validateMonthlyPrice(data.monthlyPrice || null, type),
            yearlyPrice: validateYearlyPrice(data.yearlyPrice || null, type),
            createdAt: validateDate(data.createdAt, 'created_at'),
            updatedAt: validateDate(data.updatedAt, 'updated_at', {required: false}),
            benefits: validateBenefits(data.benefits)
        };

        const tier = new Tier(tierData);

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
};
```

Key refactoring improvements:

1. **Extracted shared validation logic** into reusable helpers (`validateString`, `validateEnum`, `validateFreeOnly`, `validatePrice`, `validateDate`), eliminating duplicated error-throwing patterns across `validateMonthlyPrice`/`validateYearlyPrice`, `validateName`/`validateDescription`, and `validateStatus`/`validateVisibility`/`validateType`.

2. **Extracted `parseId`** into a standalone function, removing the branching logic from `create()` and making it independently testable.

3. **Simplified `status` setter** by replacing the `if/else` with a ternary lookup for the event type.

4. **Simplified `getPrice`** by replacing chained `if` statements with a map lookup.

5. **Simplified `updatePricing`** by extracting the change-detection condition into a named `hasChanged` variable for clarity.

6. **Normalised constructor** to use consistent camelCase keys, removing the snake_case mapping that existed between `create()` and the constructor.

7. **Consolidated getter/setter declarations** to reduce visual noise while keeping the same public API.