const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

class Tier {
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
    events = [];

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
        this.updateName(value);
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
        this.updateStatus(value);
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

    getPrice(cadence) {
        if (cadence === 'month') {
            return this.monthlyPrice;
        }
        if (cadence === 'year') {
            return this.yearlyPrice;
        }
        throw new ValidationError({
            message: 'Invalid cadence'
        });
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

        this.events.push(TierPriceChangeEvent.create({
            tier: this
        }));
    }

    get createdAt() {
        return this.#createdAt;
    }

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

    updateName(value) {
        const newName = validateName(value);
        if (newName === this.#name) {
            return;
        }
        this.events.push(TierNameChangeEvent.create({tier: this}));
        this.#name = newName;
    }

    updateStatus(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this.#status) {
            return;
        }
        if (newStatus === 'active') {
            this.events.push(TierActivatedEvent.create({tier: this}));
        } else {
            this.events.push(TierArchivedEvent.create({tier: this}));
        }
        this.#status = newStatus;
    }

    static async create(data) {
        let id;
        let isNew = false;
        if (!data.id) {
            isNew = true;
            id = new ObjectID();
        } else if (typeof data.id === 'string') {
            id = ObjectID.createFromHexString(data.id);
        } else if (data.id instanceof ObjectID) {
            id = data.id;
        } else {
            throw new ValidationError({
                message: 'Invalid ID provided for Tier'
            });
        }

        const tierData = {
            id,
            slug: validateSlug(data.slug),
            name: validateName(data.name),
            description: validateDescription(data.description),
            welcomePageURL: validateWelcomePageURL(data.welcomePageURL),
            status: validateStatus(data.status || 'active'),
            visibility: validateVisibility(data.visibility || 'public'),
            type: validateType(data.type || 'paid'),
            trialDays: validateTrialDays(data.trialDays || 0, data.type || 'paid'),
            currency: validateCurrency(data.currency || null, data.type || 'paid'),
            monthlyPrice: validateMonthlyPrice(data.monthlyPrice || null, data.type || 'paid'),
            yearlyPrice: validateYearlyPrice(data.yearlyPrice || null, data.type || 'paid'),
            createdAt: validateCreatedAt(data.createdAt),
            updatedAt: validateUpdatedAt(data.updatedAt),
            benefits: validateBenefits(data.benefits)
        };

        const tier = new Tier(tierData);

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }
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
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }

    if (value.length > 191) {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }

    return value;
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
    if (typeof value !== 'string') {
        throw new ValidationError({
            message: 'Tier description must be a string with a maximum of 191 characters'
        });
    }
    if (value.length > 191) {
        throw new ValidationError({
            message: 'Tier description must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateStatus(value) {
    if (value !== 'active' && value !== 'archived') {
        throw new ValidationError({
            message: 'Tier status must be either "active" or "archived"'
        });
    }
    return value;
}

function validateVisibility(value) {
    if (value !== 'public' && value !== 'none') {
        throw new ValidationError({
            message: 'Tier visibility must be either "public" or "none"'
        });
    }
    return value;
}

function validateType(value) {
    if (value !== 'paid' && value !== 'free') {
        throw new ValidationError({
            message: 'Tier type must be either "paid" or "free"'
        });
    }
    return value;
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

function validateMonthlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: 'Free Tiers cannot have a monthly price'
            });
        }
        return null;
    }
    if (!value) {
        return 500;
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

function validateYearlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) {
            throw new ValidationError({
                message: 'Free Tiers cannot have a yearly price'
            });
        }
        return null;
    }
    if (!value) {
        return 5000;
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

module.exports = Tier;