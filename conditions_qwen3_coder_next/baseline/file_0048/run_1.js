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
        const newName = this.#validateName(value);
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
        this.#benefits = this.#validateBenefits(value);
    }

    /** @type {string} */
    #description;
    get description() {
        return this.#description;
    }
    set description(value) {
        this.#description = this.#validateDescription(value);
    }

    /** @type {string} */
    #welcomePageURL;
    get welcomePageURL() {
        return this.#welcomePageURL;
    }
    set welcomePageURL(value) {
        this.#welcomePageURL = this.#validateWelcomePageURL(value);
    }

    /** @type {'active'|'archived'} */
    #status;
    get status() {
        return this.#status;
    }
    set status(value) {
        const newStatus = this.#validateStatus(value);
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

    /** @type {'public'|'none'} */
    #visibility;
    get visibility() {
        return this.#visibility;
    }
    set visibility(value) {
        this.#visibility = this.#validateVisibility(value);
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
        this.#trialDays = this.#validateTrialDays(value, this.#type);
    }

    /** @type {string|null} */
    #currency;
    get currency() {
        return this.#currency;
    }
    set currency(value) {
        this.#currency = this.#validateCurrency(value, this.#type);
    }

    /**
     * @param {'month'|'year'} cadence
     */
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

    /** @type {number|null} */
    #monthlyPrice;
    get monthlyPrice() {
        return this.#monthlyPrice;
    }
    set monthlyPrice(value) {
        this.#monthlyPrice = this.#validateMonthlyPrice(value, this.#type);
    }

    /** @type {number|null} */
    #yearlyPrice;
    get yearlyPrice() {
        return this.#yearlyPrice;
    }
    set yearlyPrice(value) {
        this.#yearlyPrice = this.#validateYearlyPrice(value, this.#type);
    }

    updatePricing({currency, monthlyPrice, yearlyPrice}) {
        if (this.#type !== 'paid' && (currency || monthlyPrice || yearlyPrice)) {
            throw new ValidationError({
                message: 'Cannot set pricing for free tiers'
            });
        }

        const newCurrency = this.#validateCurrency(currency, this.#type);
        const newMonthlyPrice = this.#validateMonthlyPrice(monthlyPrice, this.#type);
        const newYearlyPrice = this.#validateYearlyPrice(yearlyPrice, this.#type);

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

        const tier = new Tier({
            id,
            slug: Tier.#validateSlug(data.slug),
            name: Tier.#validateName(data.name),
            description: Tier.#validateDescription(data.description),
            welcome_page_url: Tier.#validateWelcomePageURL(data.welcomePageURL),
            status: Tier.#validateStatus(data.status || 'active'),
            visibility: Tier.#validateVisibility(data.visibility || 'public'),
            type: Tier.#validateType(data.type || 'paid'),
            currency: Tier.#validateCurrency(data.currency || null, Tier.#validateType(data.type || 'paid')),
            trial_days: Tier.#validateTrialDays(data.trialDays || 0, Tier.#validateType(data.type || 'paid')),
            monthly_price: Tier.#validateMonthlyPrice(data.monthlyPrice || null, Tier.#validateType(data.type || 'paid')),
            yearly_price: Tier.#validateYearlyPrice(data.yearlyPrice || null, Tier.#validateType(data.type || 'paid')),
            created_at: Tier.#validateCreatedAt(data.createdAt),
            updated_at: Tier.#validateUpdatedAt(data.updatedAt),
            benefits: Tier.#validateBenefits(data.benefits)
        });

        if (isNew) {
            tier.events.push(TierCreatedEvent.create({tier}));
        }

        return tier;
    }

    // Validation methods
    #validateSlug(value) {
        return Tier.#validateSlug(value);
    }

    #validateName(value) {
        return Tier.#validateName(value);
    }

    #validateWelcomePageURL(value) {
        return Tier.#validateWelcomePageURL(value);
    }

    #validateDescription(value) {
        return Tier.#validateDescription(value);
    }

    #validateStatus(value) {
        return Tier.#validateStatus(value);
    }

    #validateVisibility(value) {
        return Tier.#validateVisibility(value);
    }

    #validateType(value) {
        return Tier.#validateType(value);
    }

    #validateTrialDays(value, type) {
        return Tier.#validateTrialDays(value, type);
    }

    #validateCurrency(value, type) {
        return Tier.#validateCurrency(value, type);
    }

    #validateMonthlyPrice(value, type) {
        return Tier.#validateMonthlyPrice(value, type);
    }

    #validateYearlyPrice(value, type) {
        return Tier.#validateYearlyPrice(value, type);
    }

    #validateCreatedAt(value) {
        return Tier.#validateCreatedAt(value);
    }

    #validateUpdatedAt(value) {
        return Tier.#validateUpdatedAt(value);
    }

    #validateBenefits(value) {
        return Tier.#validateBenefits(value);
    }

    // Static validation methods
    static #validateSlug(value) {
        if (!value || typeof value !== 'string' || value.length > 191) {
            throw new ValidationError({
                message: 'Tier slug must be a string with a maximum of 191 characters'
            });
        }
        return value;
    }

    static #validateName(value) {
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

    static #validateWelcomePageURL(value) {
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

    static #validateDescription(value) {
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

    static #validateStatus(value) {
        if (value !== 'active' && value !== 'archived') {
            throw new ValidationError({
                message: 'Tier status must be either "active" or "archived"'
            });
        }
        return value;
    }

    static #validateVisibility(value) {
        if (value !== 'public' && value !== 'none') {
            throw new ValidationError({
                message: 'Tier visibility must be either "public" or "none"'
            });
        }
        return value;
    }

    static #validateType(value) {
        if (value !== 'paid' && value !== 'free') {
            throw new ValidationError({
                message: 'Tier type must be either "paid" or "free"'
            });
        }
        return value;
    }

    static #validateTrialDays(value, type) {
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

    static #validateCurrency(value, type) {
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

    static #validateMonthlyPrice(value, type) {
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

    static #validateYearlyPrice(value, type) {
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

    static #validateCreatedAt(value) {
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

    static #validateUpdatedAt(value) {
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

    static #validateBenefits(value) {
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
};