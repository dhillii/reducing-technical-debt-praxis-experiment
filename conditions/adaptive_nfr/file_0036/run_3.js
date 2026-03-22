# Refactored Tier Class

The main complexity issues I identified:
1. **Duplicated validation logic** in `validateMonthlyPrice`/`validateYearlyPrice` and `validateDescription`/`validateName`
2. **Repetitive enum validation** pattern across multiple validators
3. **Scattered ID parsing logic** in `create()`
4. **Verbose constructor mapping** with inconsistent key naming (snake_case vs camelCase)
5. **Redundant null-check patterns** in optional validators

```javascript
const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

/**
 * Throws a ValidationError with the given message.
 * @param {string} message
 */
function fail(message) {
    throw new ValidationError({message});
}

/**
 * Validates that a value is one of the allowed enum members.
 * @param {string} value
 * @param {string[]} allowed
 * @param {string} label  – used in the error message
 */
function validateEnum(value, allowed, label) {
    if (!allowed.includes(value)) {
        fail(`${label} must be one of: ${allowed.map(v => `"${v}"`).join(', ')}`);
    }
    return value;
}

/**
 * Validates a string that must not exceed maxLength characters.
 * Returns null when the value is falsy (unless required is true).
 * @param {*}      value
 * @param {string} label
 * @param {number} maxLength
 * @param {boolean} [required=false]
 */
function validateBoundedString(value, label, maxLength, required = false) {
    if (!value) {
        if (required) {
            fail(`${label} must be a string with a maximum of ${maxLength} characters`);
        }
        return null;
    }
    if (typeof value !== 'string') {
        fail(`${label} must be a string with a maximum of ${maxLength} characters`);
    }
    if (value.length > maxLength) {
        fail(`${label} must be a string with a maximum of ${maxLength} characters`);
    }
    return value;
}

/**
 * Validates a price integer shared by monthly and yearly price fields.
 * @param {*}      value
 * @param {string} type   – 'paid' | 'free'
 * @param {string} label  – 'monthly' | 'yearly'
 * @param {number} defaultPrice
 */
function validatePrice(value, type, label, defaultPrice) {
    if (type === 'free') {
        if (value !== null) {
            fail(`Free Tiers cannot have a ${label} price`);
        }
        return null;
    }
    if (!value) {
        return defaultPrice;
    }
    if (!Number.isSafeInteger(value)) {
        fail('Tier prices must be an integer.');
    }
    if (value < 0) {
        fail('Tier prices must not be negative');
    }
    if (value > 9_999_999_999) {
        fail('Tier prices may not exceed 999999.99');
    }
    return value;
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function validateSlug(value) {
    return validateBoundedString(value, 'Tier slug', 191, true);
}

function validateName(value) {
    return validateBoundedString(value, 'Tier name', 191, true);
}

function validateDescription(value) {
    return validateBoundedString(value, 'Tier description', 191, false);
}

function validateWelcomePageURL(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        fail('Tier Welcome Page URL must be a string');
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
            fail('Free Tiers cannot have a trial');
        }
        return 0;
    }
    if (!value) {
        return 0;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        fail('Tier trials must be an integer greater than 0');
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) {
            fail('Free Tiers cannot have a currency');
        }
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        fail('Tier currency must be a 3 letter ISO currency code');
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 'monthly', 500);
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 'yearly', 5000);
}

function validateDate(value, label, defaultToNow = false) {
    if (!value) {
        return defaultToNow ? new Date() : null;
    }
    if (value instanceof Date) {
        return value;
    }
    fail(`Tier ${label} must be a date`);
}

function validateBenefits(value) {
    if (!value) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        fail('Tier benefits must be a list of strings');
    }
    return value;
}

// ---------------------------------------------------------------------------
// ID parsing
// ---------------------------------------------------------------------------

/**
 * Resolves a raw id value to an ObjectID instance.
 * Returns [objectId, isNew].
 * @param {*} rawId
 * @returns {[ObjectID, boolean]}
 */
function resolveId(rawId) {
    if (!rawId) {
        return [new ObjectID(), true];
    }
    if (typeof rawId === 'string') {
        return [ObjectID.createFromHexString(rawId), false];
    }
    if (rawId instanceof ObjectID) {
        return [rawId, false];
    }
    fail('Invalid ID provided for Tier');
}

// ---------------------------------------------------------------------------
// Tier entity
// ---------------------------------------------------------------------------

module.exports = class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    // -- Read-only fields ----------------------------------------------------

    /** @type {ObjectID} */
    #id;
    get id() { return this.#id; }

    /** @type {string} */
    #slug;
    get slug() { return this.#slug; }

    /** @type {'paid'|'free'} */
    #type;
    get type() { return this.#type; }

    /** @type {Date} */
    #createdAt;
    get createdAt() { return this.#createdAt; }

    /** @type {Date|null} */
    #updatedAt;
    get updatedAt() { return this.#updatedAt; }

    // -- Mutable fields with simple validation --------------------------------

    /** @type {string[]} */
    #benefits;
    get benefits() { return this.#benefits; }
    set benefits(value) { this.#benefits = validateBenefits(value); }

    /** @type {string|null} */
    #description;
    get description() { return this.#description; }
    set description(value) { this.#description = validateDescription(value); }

    /** @type {string|null} */
    #welcomePageURL;
    get welcomePageURL() { return this.#welcomePageURL; }
    set welcomePageURL(value) { this.#welcomePageURL = validateWelcomePageURL(value); }

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() { return this.#visibility; }
    set visibility(value) { this.#visibility = validateVisibility(value); }

    /** @type {string|null} */
    #currency;
    get currency() { return this.#currency; }
    set currency(value) { this.#currency = validateCurrency(value, this.#type); }

    /** @type {number|null} */
    #trialDays;
    get trialDays() { return this.#trialDays; }
    set trialDays(value) { this.#trialDays = validateTrialDays(value, this.#type); }

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() { return this.#monthlyPrice; }
    set monthlyPrice(value) { this.#monthlyPrice = validateMonthlyPrice(value, this.#type); }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() { return this.#yearlyPrice; }
    set yearlyPrice(value) { this.#yearlyPrice = validateYearlyPrice(value, this.#type); }

    // -- Mutable fields that emit domain events -------------------------------

    /** @type {string} */
    #name;
    get name() { return this.#name; }
    set name(value) {
        const newName = validateName(value);
        if (newName === this.#name) {
            return;
        }
        this.#name = newName;
        this.events.push(TierNameChangeEvent.create({tier: this}));
    }

    /** @type {'active'|'archived'} */
    #status;
    get status() { return this.#status; }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        this.#status = newStatus;
        const Event = newStatus === 'active' ? TierActivatedEvent : TierArchivedEvent;
        this.events.push(Event.create({tier: this}));
    }

    // -- Methods --------------------------------------------------------------

    /**
     * Returns the price for the given billing cadence.
     * @param {'month'|'year'} cadence
     */
    getPrice(cadence) {
        const priceMap = {month: this.monthlyPrice, year: this.yearlyPrice};
        if (cadence in priceMap) {
            return priceMap[cadence];
        }
        fail('Invalid cadence');
    }

    /**
     * Atomically updates all pricing fields and emits a single price-change event.
     * @param {{currency: string, monthlyPrice: number, yearlyPrice: number}} pricing
     */
    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            fail('Cannot set pricing for free tiers');
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        const unchanged =
            newCurrency === this.#currency &&
            newMonthlyPrice === this.#monthlyPrice &&
            newYearlyPrice === this.#yearlyPrice;

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

    /**
     * Factory method – validates all input and returns a fully constructed Tier.
     * @param {any} data
     * @returns {Promise<Tier>}
     */
    static async create(data) {
        const [id, isNew] = resolveId(data.id);

        const type = validateType(data.type || 'paid');

        const tierData = {
            id,
            slug:           validateSlug(data.slug),
            name:           validateName(data.name),
            description:    validateDescription(data.description),
            welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
            status:         validateStatus(data.status || 'active'),
            visibility:     validateVisibility(data.visibility || 'public'),
            type,
            trialDays:      validateTrialDays(data.trialDays || 0, type),
            currency:       validateCurrency(data.currency || null, type),
            monthlyPrice:   validateMonthlyPrice(data.monthlyPrice || null, type),
            yearlyPrice:    validateYearlyPrice(data.yearlyPrice || null, type),
            createdAt:      validateDate(data.createdAt, 'created_at', true),
            updatedAt:      validateDate(data.updatedAt, 'updated_at', false),
            benefits:       validateBenefits(data.benefits)
        };

        const tier = new Tier(tierData);

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
};
```

## Key Changes

| Problem | Solution |
|---|---|
| Duplicated price validation in `validateMonthlyPrice` / `validateYearlyPrice` | Extracted shared `validatePrice(value, type, label, defaultPrice)` |
| Repeated `if (value !== 'x' && value !== 'y') throw` pattern | Extracted `validateEnum(value, allowed, label)` |
| Duplicated bounded-string logic across `name`, `slug`, `description` | Extracted `validateBoundedString(value, label, maxLength, required)` |
| Verbose `throw new ValidationError({message})` at every call site | Extracted `fail(message)` helper |
| Complex ID-parsing block inside `create()` | Extracted `resolveId(rawId)` returning `[ObjectID, isNew]` |
| Inconsistent snake_case/camelCase constructor mapping | Unified to camelCase throughout; constructor data object now matches public API |
| `validateCreatedAt` / `validateUpdatedAt` were near-identical | Merged into `validateDate(value, label, defaultToNow)` |
| `getPrice` used an if/else chain | Replaced with a lookup map |