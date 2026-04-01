```javascript
const _ = require('lodash');
const crypto = require('crypto');
const keypair = require('keypair');
const ObjectID = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const validator = require('@tryghost/validator');
const urlUtils = require('../../shared/url-utils');
const {WRITABLE_KEYS_ALLOWLIST} = require('../../shared/labs');
const {getOrGenerateSiteUuid} = require('../services/settings/settings-utils');

const messages = {
    valueCannotBeBlank: 'Value in [settings.key] cannot be blank.',
    unableToFindSetting: 'Unable to find setting to update: {key}',
    notEnoughPermission: 'You do not have permission to perform this action'
};

const internalContext = {context: {internal: true}};
let Settings;
let defaultSettings;

const doBlock = fn => fn();

// Lazy-load and cache keypair for members
const getMembersKey = doBlock(() => {
    let cachedKeypair;
    return function getKey(type) {
        if (!cachedKeypair) {
            cachedKeypair = keypair({bits: 1024});
        }
        return cachedKeypair[type];
    };
});

// Lazy-load and cache keypair for ghost
const getGhostKey = doBlock(() => {
    let cachedKeypair;
    return function getKey(type) {
        if (!cachedKeypair) {
            cachedKeypair = keypair({bits: 1024});
        }
        return cachedKeypair[type];
    };
});

// Dynamic default value generators
const dynamicDefaults = {
    db_hash: () => crypto.randomUUID(),
    public_hash: () => crypto.randomBytes(15).toString('hex'),
    admin_session_secret: () => crypto.randomBytes(32).toString('hex'),
    theme_session_secret: () => crypto.randomBytes(32).toString('hex'),
    members_public_key: () => getMembersKey('public'),
    members_private_key: () => getMembersKey('private'),
    members_email_auth_secret: () => crypto.randomBytes(64).toString('hex'),
    members_otc_secret: () => crypto.randomBytes(64).toString('hex'),
    ghost_public_key: () => getGhostKey('public'),
    ghost_private_key: () => getGhostKey('private'),
    site_uuid: () => getOrGenerateSiteUuid(),
    indexnow_api_key: () => crypto.randomBytes(16).toString('hex')
};

// Image URL keys that require transformation
const imageUrlKeys = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

/**
 * Attach group and key metadata to a setting, and add getDefaultValue method
 */
function enrichSettingWithMetadata(setting, settingName, categoryName) {
    setting.group = categoryName;
    setting.key = settingName;

    setting.getDefaultValue = function getDefaultValue() {
        const getDynamicDefault = dynamicDefaults[setting.key];
        return getDynamicDefault ? getDynamicDefault() : setting.defaultValue;
    };
}

/**
 * Parse default settings from schema and flatten category structure
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};

    _.each(defaultSettingsInCategories, function each(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            enrichSettingWithMetadata(setting, settingName, categoryName);
            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

/**
 * Get cached default settings, parsing them if necessary
 */
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/**
 * Convert string boolean values to actual booleans
 */
function parseBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

/**
 * Convert boolean values to strings for storage
 */
function stringifyBooleanValue(value) {
    return _.isBoolean(value) ? value.toString() : value;
}

/**
 * Handle boolean type formatting for database storage
 */
function formatBooleanAttribute(attrs) {
    const settingType = attrs.type;
    if (settingType === 'boolean') {
        attrs.value = parseBooleanValue(attrs.value);
        attrs.value = stringifyBooleanValue(attrs.value);
    }
    return attrs;
}

/**
 * Handle image URL transformation for write operations
 */
function formatImageUrlsForWrite(attrs) {
    if (attrs.value && imageUrlKeys.includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
    return attrs;
}

/**
 * Handle boolean type parsing from database
 */
function parseBooleanAttribute(attrs) {
    const settingType = attrs.type;
    if (settingType === 'boolean') {
        attrs.value = parseBooleanValue(attrs.value);
    }
    return attrs;
}

/**
 * Handle image URL transformation for read operations
 */
function parseImageUrls(attrs) {
    if (imageUrlKeys.includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
    return attrs;
}

/**
 * Validate setting key is present and non-empty
 */
function validateSettingKey(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }
    return Promise.resolve();
}

/**
 * Stringify object values for storage
 */
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
    return item;
}

/**
 * Update setting with new value, respecting import mode
 */
function updateSettingValue(setting, item, options) {
    if (options.importing) {
        return setting.save(item, options);
    }

    if (Object.prototype.hasOwnProperty.call(item, 'value')) {
        setting.set('value', item.value);
    }

    if (options.context && options.context.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
        setting.set('type', item.type);
    }

    if (setting.hasChanged()) {
        return setting.save(null, options);
    }

    return Promise.resolve(setting);
}

/**
 * Process a single setting edit operation
 */
function processSingleSettingEdit(item, options, self) {
    return validateSettingKey(item)
        .then(() => {
            item = stringifyObjectValue(item);
            item = self.filterData(item);
            return Settings.forge({key: item.key}).fetch(options);
        })
        .then(function then(setting) {
            if (setting) {
                return updateSettingValue(setting, item, options);
            }
            return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
        });
}

/**
 * Normalize setting data to array format
 */
function normalizeSettingData(data) {
    if (!Array.isArray(data)) {
        return [data];
    }
    return data;
}

/**
 * Convert setting model to plain object if needed
 */
function extractSettingObject(item) {
    return item.toJSON ? item.toJSON() : item;
}

/**
 * Build setting data for batch insert with metadata
 */
function buildSettingInsertData(setting, date) {
    return {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: date,
        updated_at: date
    };
}

/**
 * Filter setting data to only include available columns
 */
function filterSettingToColumns(settingData, columns) {
    return _.pick(settingData, columns);
}

/**
 * Identify missing settings that need to be inserted
 */
function findMissingSettings(usedKeys) {
    const settingsToInsert = [];

    _.each(getDefaultSettings(), function forEachDefault(defaultSetting, defaultSettingKey) {
        if (usedKeys.indexOf(defaultSettingKey) === -1) {
            defaultSetting.value = defaultSetting.getDefaultValue();
            settingsToInsert.push(defaultSetting);
        }
    });

    return settingsToInsert;
}

/**
 * Prepare settings for batch insertion
 */
function prepareSettingsForInsertion(settingsToInsert, columnInfo, date) {
    const columns = Object.keys(columnInfo);

    return settingsToInsert.map((setting) => {
        const settingValues = buildSettingInsertData(setting, date);
        return filterSettingToColumns(settingValues, columns);
    });
}

/**
 * Validate stripe key format
 */
function validateStripeSecretKeyFormat(value) {
    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!secretKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_secret_key did not match ${secretKeyRegex}`
        });
    }
}

/**
 * Validate stripe publishable key format
 */
function validateStripePublishableKeyFormat(value) {
    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!publishableKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_publishable_key did not match ${publishableKeyRegex}`
        });
    }
}

/**
 * Validate stripe plan amount
 */
function validateStripePlanAmount(plan, isImporting) {
    if (!isImporting && plan.amount < 100 && plan.name !== 'Complimentary') {
        throw new errors.ValidationError({
            message: 'Plans cannot have an amount less than 1'
        });
    }
}

/**
 * Validate stripe plan has required fields
 */
function validateStripePlanFields(plan) {
    if (typeof plan.name !== 'string') {
        throw new errors.ValidationError({
            message: 'Plan must have a name'
        });
    }

    if (typeof plan.currency !== 'string') {
        throw new errors.ValidationError({
            message: 'Plan must have a currency'
        });
    }

    if (!['year', 'month', 'week', 'day'].includes(plan.interval)) {
        throw new errors.ValidationError({
            message: 'Plan interval must be one of: year, month, week or day'
        });
    }
}

/**
 * Validate a single stripe plan
 */
function validateSingleStripePlan(plan, isImporting) {
    validateStripePlanAmount(plan, isImporting);
    validateStripePlanFields(plan);
}

// Each setting is saved as a separate row in the database,
// but the overlying API treats them as a single key:value mapping
Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    emitChange: function emitChange(event, options) {
        const eventToTrigger = 'settings' + '.' + event;
        ghostBookshelf.Model.prototype.emitChange.bind(this)(this, eventToTrigger, options);
    },

    onDestroyed: function onDestroyed(model, options) {
        ghostBookshelf.Model.prototype.onDestroyed.apply(this, arguments);

        model.emitChange('deleted', options);
        model.emitChange(model._previousAttributes.key + '.' + 'deleted', options);
    },

    onCreated: function onCreated(model, options) {
        ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);

        model.emitChange('added', options);
        model.emitChange(model.attributes.key + '.' + 'added', options);
    },

    onUpdated: function onUpdated(model, options) {
        ghostBookshelf.Model.prototype.onUpdated.apply(this, arguments);

        model.emitChange('edited', options);
        model.emitChange(model.attributes.key + '.' + 'edited', options);
    },

    async onValidate(model, attr, options) {
        await ghostBookshelf.Model.prototype.onValidate.call(this, model, attr, options);

        await Settings.validators.all(model, options);

        if (typeof Settings.validators[model.get('key')] === 'function') {
            await Settings.validators[model.get('key')](model, options);
        }
    },

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        return formatBooleanAttribute(attrs);
    },

    formatOnWrite(attrs) {
        return formatImageUrlsForWrite(attrs);
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        attrs = parseBooleanAttribute(attrs);
        attrs = parseImageUrls(attrs);
        return attrs;
    }
}, {
    findOne: function (data, options) {
        if (_.isEmpty(data)) {
            options = data;
        }

        // Allow for just passing the key instead of attributes
        if (!_.isObject(data)) {
            data = {key: data};
        }

        return Promise.resolve(ghostBookshelf.Model.findOne.call(this, data, options));
    },

    edit: function (data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        const self = this;

        data = normalizeSettingData(data);

        const promises = data.map(function (item) {
            item = extractSettingObject(item);
            return processSingleSettingEdit(item, options, self);
        });

        return Promise.all(promises);
    },

    populateDefaults: async function populateDefaults(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
        const self = this;

        if (!options.context) {
            options.context = internalContext.context;
        }

        // this is required for sqlite to pick up the columns after db init
        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);

        const usedKeys = allSettings.models.map(function mapper(setting) {
            return setting.get('key');
        });

        const settingsToInsert = findMissingSettings(usedKeys);

        if (settingsToInsert.length > 0) {
            // fetch available columns to avoid populating columns not yet created by migrations
            const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();

            // fetch other data that is used when inserting new settings
            const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settings