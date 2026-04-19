const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

module.exports = class Tier {
    /** @type {BaseEvent[]} */
    events = [];

    constructor(data) {
        this._id = data.id;
        this._slug = data.slug;
        this._name = data.name;
        this._description = data.description;
        this._welcomePageURL = data.welcome_page_url;
        this._status = data.status;
        this._visibility = data.visibility;
        this._type = data.type;
        this._trialDays = data.trial_days;
        this._currency = data.currency;
        this._monthlyPrice = data.monthly_price;
        this._yearlyPrice = data.yearly_price;
        this._createdAt = data.created_at;
        this._updatedAt = data.updated_at;
        this._benefits = data.benefits;
    }

    get id() { return this._id; }
    get slug() { return this._slug; }

    get name() { return this._name; }
    set name(value) { this._setProperty('_name', value, validateName, TierNameChangeEvent.create); }

    get benefits() { return this._benefits; }
    set benefits(value) { this._benefits = validateBenefits(value); }

    get description() { return this._description; }
    set description(value) { this._description = validateDescription(value); }

    get welcomePageURL() { return this._welcomePageURL; }
    set welcomePageURL(value) { this._welcomePageURL = validateWelcomePageURL(value); }

    get status() { return this._status; }
    set status(value) {
        const newStatus = validateStatus(value);
        if (newStatus === this._status) return;
        const eventCreator = newStatus === 'active' ? TierActivatedEvent.create : TierArchivedEvent.create;
        this.events.push(eventCreator({tier: this}));
        this._status = newStatus;
    }

    get visibility() { return this._visibility; }
    set visibility(value) { this._visibility = validateVisibility(value); }

    get type() { return this._type; }

    get trialDays() { return this._trialDays; }
    set trialDays(value) { this._trialDays = validateTrialDays(value, this._type); }

    get currency() { return this._currency; }
    set currency(value) { this._currency = validateCurrency(value, this._type); }

    get monthlyPrice() { return this._monthlyPrice; }
    set monthlyPrice(value) { this._monthlyPrice = validateMonthlyPrice(value, this._type); }

    get yearlyPrice() { return this._yearlyPrice; }
    set yearlyPrice(value) { this._yearlyPrice = validateYearlyPrice(value, this._type); }

    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }

    _setProperty(field, value, validator, eventCreator) {
        const newValue = validator(value);
        if (newValue === this[field]) return;
        if (eventCreator) this.events.push(eventCreator({tier: this}));
        this[field] = newValue;
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this._type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({message: 'Cannot set pricing for free tiers'});
        }
        const newCurrency = validateCurrency(currency, this._type);
        const newMonthlyPrice = validateMonthlyPrice(monthlyPrice, this._type);
        const newYearlyPrice = validateYearlyPrice(yearlyPrice, this._type);
        if (newCurrency === this._currency && newMonthlyPrice === this._monthlyPrice && newYearlyPrice === this._yearlyPrice) return;
        this._currency = newCurrency;
        this._monthlyPrice = newMonthlyPrice;
        this._yearlyPrice = newYearlyPrice;
        this.events.push(TierPriceChangeEvent.create({tier: this}));
    }

    getPrice(cadence) {
        const map = {month: this._monthlyPrice, year: this._yearlyPrice};
        const price = map[cadence];
        if (price === undefined) throw new ValidationError({message: 'Invalid cadence'});
        return price;
    }

    toJSON() {
        return {
            id: this._id.toHexString(),
            slug: this._slug,
            name: this._name,
            description: this._description,
            welcomePageURL: this._welcomePageURL,
            status: this._status,
            visibility: this._visibility,
            type: this._type,
            trialDays: this._trialDays,
            currency: this._currency,
            monthlyPrice: this._monthlyPrice,
            yearlyPrice: this._yearlyPrice,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            benefits: this._benefits
        };
    }

    static async create(data) {
        const id = (() => {
            if (!data.id) return new ObjectID();
            if (typeof data.id === 'string') return ObjectID.createFromHexString(data.id);
            if (data.id instanceof ObjectID) return data.id;
            throw new ValidationError({message: 'Invalid ID provided for Tier'});
        })();

        const name = validateName(data.name);
        const slug = validateSlug(data.slug);
        const description = validateDescription(data.description);
        const welcomePageURL = validateWelcomePageURL(data.welcomePageURL);
        const status = validateStatus(data.status || 'active');
        const visibility = validateVisibility(data.visibility || 'public');
        const type = validateType(data.type || 'paid');
        const currency = validateCurrency(data.currency || null, type);
        const trialDays = validateTrialDays(data.trialDays || 0, type);
        const monthlyPrice = validateMonthlyPrice(data.monthlyPrice || null, type);
        const yearlyPrice = validateYearlyPrice(data.yearlyPrice || null, type);
        const createdAt = validateCreatedAt(data.createdAt);
        const updatedAt = validateUpdatedAt(data.updatedAt);
        const benefits = validateBenefits(data.benefits);

        const tier = new Tier({
            id,
            slug,
            name,
            description,
            welcome_page_url: welcomePageURL,
            status,
            visibility,
            type,
            trial_days: trialDays,
            currency,
            monthly_price: monthlyPrice,
            yearly_price: yearlyPrice,
            created_at: createdAt,
            updated_at: updatedAt,
            benefits
        });

        if (!data.id) tier.events.push(TierCreatedEvent.create({tier}));
        return tier;
    }
};

function validateSlug(value) {
    if (!value || typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({
            message: 'Tier slug must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateName(value) {
    if (typeof value !== 'string' || value.length > 191) {
        throw new ValidationError({
            message: 'Tier name must be a string with a maximum of 191 characters'
        });
    }
    return value;
}

function validateWelcomePageURL(value) {
    if (!value) return null;
    if (value === null || typeof value === 'string') return value;
    throw new ValidationError({message: 'Tier Welcome Page URL must be a string'});
}

function validateDescription(value) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > 191) {
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
        if (value) throw new ValidationError({message: 'Free Tiers cannot have a trial'});
        return 0;
    }
    if (!value) return 0;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ValidationError({message: 'Tier trials must be an integer greater than 0'});
    }
    return value;
}

function validateCurrency(value, type) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: 'Free Tiers cannot have a currency'});
        return null;
    }
    if (typeof value !== 'string' || value.length !== 3) {
        throw new ValidationError({message: 'Tier currency must be a 3 letter ISO currency code'});
    }
    return value.toUpperCase();
}

function validateMonthlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: 'Free Tiers cannot have a monthly price'});
        return null;
    }
    if (!value) return 500;
    if (!Number.isSafeInteger(value)) throw new ValidationError({message: 'Tier prices must be an integer.'});
    if (value < 0) throw new ValidationError({message: 'Tier prices must not be negative'});
    if (value > 9999999999) throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    return value;
}

function validateYearlyPrice(value, type) {
    if (type === 'free') {
        if (value !== null) throw new ValidationError({message: 'Free Tiers cannot have a yearly price'});
        return null;
    }
    if (!value) return 5000;
    if (!Number.isSafeInteger(value)) throw new ValidationError({message: 'Tier prices must be an integer.'});
    if (value < 0) throw new ValidationError({message: 'Tier prices must not be negative'});
    if (value > 9999999999) throw new ValidationError({message: 'Tier prices may not exceed 999999.99'});
    return value;
}

function validateCreatedAt(value) {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateUpdatedAt(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    throw new ValidationError({message: 'Tier created_at must be a date'});
}

function validateBenefits(value) {
    if (!value) return [];
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new ValidationError({message: 'Tier benefits must be a list of strings'});
    }
    return value;
}