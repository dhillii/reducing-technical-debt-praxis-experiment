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
        throw new ValidationError({message: `Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`});
    }
    if (value.length > maxLength) {
        throw new ValidationError({message: `Tier ${fieldName} must be a string with a maximum of ${maxLength} characters`});
    }
    return value;
}

function validateEnum(value, fieldName, allowedValues) {
    if (!allowedValues.includes(value)) {
        throw new ValidationError({
            message: `Tier ${fieldName} must be either ${allowedValues.map(v => `"${v}"`).join(' or ')}`
        });
    }
    return value;
}

function validateFreeOnly(value, fieldName, type) {
    if (type === 'free' && value !== null) {
        throw new ValidationError({message: `Free Tiers cannot have a ${fieldName}`});
    }
}

function validatePrice(value, type, defaultValue) {
    if (type === 'free') {
        validateFreeOnly(value, 'price', type);
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
        throw new ValidationError({
            message: 'Tier slug must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateName(value) {
    return validateString(value, 'name');
}

function validateDescription(value) {
    return validateString(value, 'description', {required: false});
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
    return validateEnum(value, 'status', ['active', 'archived']);
}

function validateVisibility(value) {
    return validateEnum(value, 'visibility', ['public', 'none']);
}

function validateType(value) {
    return validateEnum(value, 'type', ['paid', 'free']);
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
        validateFreeOnly(value, 'currency', type);
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    return validatePrice(value, type, 500);
}

function validateYearlyPrice(value, type) {
    return validatePrice(value, type, 5000);
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

function validateCreatedAt(value) {
    return validateDate(value, 'created_at');
}

function validateUpdatedAt(value) {
    return validateDate(value, 'updated_at', {required: false});
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

function parseId(data) {
    if (!data.id) {
        return {id: new ObjectID(), isNew: true};
    }
    if (typeof data.id === 'string') {
        return {id: ObjectID.createFromHexString(data.id), isNew: false};
    }
    if (data.id instanceof ObjectID) {
        return {id: data.id, isNew: false};
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
        const StatusEvent = newStatus === 'active' ? TierActivatedEvent : TierArchivedEvent;
        this.events.push(StatusEvent.create({tier: this}));
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
        throw new ValidationError({message: 'Invalid cadence'});
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }

        const newCurrency = validateCurrency(currency, this.#type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this.#type);

        const hasChanged = newCurrency !== this.#currency
            || newMonthlyPrice !== this.#monthlyPrice
            || newYearlyPrice !== this.#yearlyPrice;

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
        const {id, isNew} = parseId(data);

        const type = validateType(data.type || 'paid');

        const tierData = {
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

1. **Extracted shared validation logic** into generic helpers (`validateString`, `validateEnum`, `validatePrice`, `validateDate`, `validateFreeOnly`), eliminating duplicated error-throwing patterns across `validateName`/`validateDescription`, `validateStatus`/`validateVisibility`/`validateType`, and `validateMonthlyPrice`/`validateYearlyPrice`.

2. **Extracted `parseId`** into a standalone function, removing the branching logic from `create()` and making it independently testable.

3. **Simplified `status` setter** by replacing the `if/else` branch with a ternary lookup for the event type.

4. **Simplified `getPrice`** by replacing chained `if` statements with a map lookup.

5. **Simplified `updatePricing`** by inverting the change-detection condition (`hasChanged`) for improved readability.

6. **Consolidated getter/setter declarations** by grouping simple single-line setters together, reducing visual noise while preserving the same behaviour.

7. **Grouped `tierData` object construction** in `create()` into a single object literal, making the factory method easier to scan.