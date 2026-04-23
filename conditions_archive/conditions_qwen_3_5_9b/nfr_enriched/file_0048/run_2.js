const ObjectID = require('bson-objectid').default;
const {ValidationError} = require('@tryghost/errors');

const TierActivatedEvent = require('./tier-activated-event');
const TierArchivedEvent = require('./tier-archived-event');
const TierCreatedEvent = require('./tier-created-event');
const TierNameChangeEvent = require('./tier-name-change-event');
const TierPriceChangeEvent = require('./tier-price-change-event');

/**
 * @typedef {Object} TierData
 * @property {ObjectID|string|ObjectID} [id]
 * @property {string} [slug]
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [welcomePageURL]
 * @property {'active'|'archived'} [status]
 * @property {'public'|'none'} [visibility]
 * @property {'paid'|'free'} [type]
 * @property {number} [trialDays]
 * @property {string} [currency]
 * @property {number} [monthlyPrice]
 * @property {number} [yearlyPrice]
 * @property {Date} [createdAt]
 * @property {Date} [updatedAt]
 * @property {string[]} [benefits]
 */

/**
 * @typedef {Object} TierUpdatePricingData
 * @property {string} [currency]
 * @property {number} [monthlyPrice]
 * @property {number} [yearlyPrice]
 */

/**
 * @typedef {Object} TierCreateData
 * @property {ObjectID|string|ObjectID} [id]
 * @property {string} [slug]
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [welcomePageURL]
 * @property {'active'|'archived'} [status]
 * @property {'public'|'none'} [visibility]
 * @property {'paid'|'free'} [type]
 * @property {number} [trialDays]
 * @property {string} [currency]
 * @property {number} [monthlyPrice]
 * @property {number} [yearlyPrice]
 * @property {Date} [createdAt]
 * @property {Date} [updatedAt]
 * @property {string[]} [benefits]
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} TierEvent
 * @property {Tier} tier
 */

/**
 * @typedef {Object} TierNameChangeEvent
 * @property {Tier} tier
 */

/**
 * @typedef {Object} TierPriceChangeEvent
 * @property {Tier} tier
 */

/**
 * @typedef {Object} TierActivatedEvent
 * @property {Tier} tier
 */

/**
 * @typedef {Object} TierArchivedEvent
 * @property {Tier} tier
 */

/**
 * @typedef {Object} TierCreatedEvent
 * @property {Tier} tier
 */

/**
 * @typedef {Object} TierBenefits
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} TierSlug
 * @property {string} slug
 */

/**
 * @typedef {Object} TierName
 * @property {string} name
 */

/**
 * @typedef {Object} TierDescription
 * @property {string} description
 */

/**
 * @typedef {Object} TierWelcomePageURL
 * @property {string|null} welcomePageURL
 */

/**
 * @typedef {Object} TierStatus
 * @property {'active'|'archived'} status
 */

/**
 * @typedef {Object} TierVisibility
 * @property {'public'|'none'} visibility
 */

/**
 * @typedef {Object} TierType
 * @property {'paid'|'free'} type
 */

/**
 * @typedef {Object} TierTrialDays
 * @property {number|null} trialDays
 */

/**
 * @typedef {Object} TierCurrency
 * @property {string|null} currency
 */

/**
 * @typedef {Object} TierMonthlyPrice
 * @property {number|null} monthlyPrice
 */

/**
 * @typedef {Object} TierYearlyPrice
 * @property {number|null} yearlyPrice
 */

/**
 * @typedef {Object} TierCreatedAt
 * @property {Date} createdAt
 */

/**
 * @typedef {Object} TierUpdatedAt
 * @property {Date|null} updatedAt
 */

/**
 * @typedef {Object} TierBenefits
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice
 * @property {Date} createdAt
 * @property {Date|null} updatedAt
 * @property {string[]} benefits
 */

/**
 * @typedef {Object} Tier
 * @property {ObjectID} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} welcomePageURL
 * @property {'active'|'archived'} status
 * @property {'public'|'none'} visibility
 * @property {'paid'|'free'} type
 * @property {number|null} trialDays
 * @property {string|null} currency
 * @property {number|null} monthlyPrice
 * @property {number|null} yearlyPrice