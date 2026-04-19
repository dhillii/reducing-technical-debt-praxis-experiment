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

/**
 * Generate and cache keypairs for members authentication
 * @returns {Object} Object with public and private key getters
 */
const getMembersKey = doBlock(() => {
    let cachedKeypair = null;
    return function getKey(type) {
        if (!cachedKeypair) {
            cachedKeypair = keypair({bits: 1024});
        }
        return cachedKeypair[type];
    };
});

/**
 * Generate and cache keypairs for Ghost authentication
 * @returns {Object} Object with public and private key getters
 */
const getGhostKey = doBlock(() => {
    let cachedKeypair = null;
    return function getKey(type) {
        if (!cachedKeypair) {
            cachedKeypair = keypair({bits: 1024});
        }
        return cachedKeypair[type];
    };
});

/**
 * Generate dynamic default values for settings
 * @returns {Object} Object mapping setting keys to default value generators
 */
function createDynamicDefaultValues() {
    return {
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
}

/**
 * Parse and flatten default settings from schema
 * @returns {Object} Flattened default settings object
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};
    const dynamicDefault = createDynamicDefaultValues();

    _.each(defaultSettingsInCategories, function each(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            setting.group = categoryName;
            setting.key = settingName;

            setting.getDefaultValue = function getDefaultValue() {
                const getDynamicDefault = dynamicDefault[setting.key];
                if (getDynamicDefault) {
                    return getDynamicDefault();
                }
                return setting.defaultValue;
            };

            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

/**
 * Get default settings, initializing if not already loaded
 * @returns {Object} Default settings object
 */
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/**
 * Transform boolean string values to actual boolean types
 * @param {Object} attrs - Attribute object
 * @returns {Object} Transformed attributes
 */
function transformBooleanValues(attrs) {
    const settingType = attrs.type;

    if (settingType === 'boolean') {
        if (attrs.value === '0' || attrs.value === '1') {
            attrs.value = !!+attrs.value;
        }

        if (attrs.value === 'false' || attrs.value === 'true') {
            attrs.value = JSON.parse(attrs.value);
        }

        if (_.isBoolean(attrs.value)) {
            attrs.value = attrs.value.toString();
        }
    }

    return attrs;
}

/**
 * Transform image URLs to transform-ready format
 * @param {Object} attrs - Attribute object
 * @returns {Object} Transformed attributes
 */
function transformImageUrls(attrs) {
    const imageKeys = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

    if (attrs.value && imageKeys.includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }

    return attrs;
}

/**
 * Transform image URLs from placeholder to absolute URLs
 * @param {Object} attrs - Attribute object
 * @returns {Object} Transformed attributes
 */
function transformImageUrlsToAbsolute(attrs) {
    const imageKeys = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

    if (imageKeys.includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }

    return attrs;
}

/**
 * Validate Stripe plan configuration
 * @param {Object} plan - Stripe plan object
 * @param {Object} options - Validation options
 * @throws {errors.ValidationError} If plan validation fails
 */
function validateStripePlan(plan, options) {
    if (!options.importing && plan.amount < 100 && plan.name !== 'Complimentary') {
        throw new errors.ValidationError({
            message: 'Plans cannot have an amount less than 1'
        });
    }

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
 * Validate Stripe key format
 * @param {string} value - Stripe key value
 * @param {string} keyType - Type of key (secret or publishable)
 * @param {string} keyPrefix - Key prefix (sk/rk or pk)
 * @throws {errors.ValidationError} If key format is invalid
 */
function validateStripeKey(value, keyType, keyPrefix) {
    if (value === null) {
        return;
    }

    const regex = new RegExp(`${keyPrefix}_(?:test|live)_[\\da-zA-Z]{1,247}$`);

    if (!regex.test(value)) {
        throw new errors.ValidationError({
            message: `${keyType} did not match ${regex}`
        });
    }
}

/**
 * Validate labs settings flags
 * @param {Object} flags - Labs flags object
 * @throws {errors.ValidationError} If invalid flag is found
 */
function validateLabsFlags(flags) {
    for (const flag in flags) {
        if (!WRITABLE_KEYS_ALLOWLIST.includes(flag)) {
            throw new errors.ValidationError({
                message: `Settings lab value cannot have value other then ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
            });
    }
}

/**
 * Validate Stripe secret key format
 * @param {Object} model - Model instance
 * @throws {errors.ValidationError} If key format is invalid
 */
function validateStripeSecretKey(model) {
    validateStripeKey(model.get('value'), 'stripe_secret_key', 'sk');
}

/**
 * Validate Stripe publishable key format
 * @param {Object} model - Model instance
 * @throws {errors.ValidationError} If key format is invalid
 */
function validateStripePublishableKey(model) {
    validateStripeKey(model.get('value'), 'stripe_publishable_key', 'pk');
}

/**
 * Validate Stripe connect secret key format
 * @param {Object} model - Model instance
 * @throws {errors.ValidationError} If key format is invalid
 */
function validateStripeConnectSecretKey(model) {
    validateStripeKey(model.get('value'), 'stripe_connect_secret_key', 'sk');
}

/**
 * Validate Stripe connect publishable key format
 * @param {Object} model - Model instance
 * @throws {errors.ValidationError} If key format is invalid
 */
function validateStripeConnectPublishableKey(model) {
    validateStripeKey(model.get('value'), 'stripe_connect_publishable_key', 'pk');
}

/**
 * Validate all settings based on their type
 * @param {Object} model - Model instance
 * @throws {errors.ValidationError} If validation fails
 */
async function validateAllSettings(model) {
    const settingName = model.get('key');
    const settingDefault = getDefaultSettings()[settingName];

    if (!settingDefault) {
        return;
    }

    const validationErrors = validator.validate(
        model.get('value'),
        model.get('key'),
        settingDefault.validations,
        'settings'
    );

    if (validationErrors.length) {
        throw new errors.ValidationError({message: validationErrors.join('\n')});
    }
}

/**
 * Filter and prepare data for setting edit
 * @param {Object} item - Setting data item
 * @param {Object} self - Model instance
 * @returns {Object} Filtered data item
 */
function filterDataForEdit(item, self) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }

    return self.filterData(item);
}

/**
 * Update setting value if changed
 * @param {Object} setting - Setting model instance
 * @param {Object} item - Setting data item
 * @param {Object} options - Save options
 * @returns {Promise<Object>} Updated setting or null
 */
async function updateSettingValue(setting, item, options) {
    if (Object.prototype.hasOwnProperty.call(item, 'value')) {
        setting.set('value', item.value);
    }

    if (options.context && options.context.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
        setting.set('type', item.type);
    }

    if (setting.hasChanged()) {
        return setting.save(null, options);
    }

    return setting;
}

/**
 * Create settings data for database insertion
 * @param {Object} setting - Setting object
 * @param {Array} columns - Available database columns
 * @returns {Object} Formatted setting data for insertion
 */
function createSettingsInsertData(setting, columns) {
    const settingValues = {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: ghostBookshelf.knex.raw('CURRENT_TIMESTAMP'),
        updated_at: ghostBookshelf.knex.raw('CURRENT_TIMESTAMP')
    };

    return _.pick(settingValues, columns);
}

/**
 * Insert missing default settings into database
 * @param {Array} settingsToInsert - Settings to insert
 * @param {Array} columns - Available database columns
 * @returns {Promise<void>}
 */
async function insertMissingSettings(settingsToInsert, columns) {
    const settingsDataToInsert = settingsToInsert.map((setting) => {
        return createSettingsInsertData(setting, columns);
    });

    await ghostBookshelf.knex
        .batchInsert('settings', settingsDataToInsert);
}

/**
 * Find all settings from database
 * @param {Object} options - Query options
 * @returns {Promise<Object>} All settings
 */
async function findAllSettings(options) {
    return Settings.forge().fetch(options);
}

/**
 * Get setting key from model
 * @param {Object} setting - Setting model instance
 * @returns {string} Setting key
 */
function getSettingKey(setting) {
    return setting.get('key');
}

/**
 * Check if setting key exists in database
 * @param {Array} usedKeys - Array of existing setting keys
 * @param {string} defaultSettingKey - Default setting key to check
 * @returns {boolean} True if key is missing from database
 */
function isSettingMissingFromDB(usedKeys, defaultSettingKey) {
    return usedKeys.indexOf(defaultSettingKey) === -1;
}

/**
 * Get all settings and populate missing defaults
 * @param {Object} unfilteredOptions - Raw options object
 * @returns {Promise<Object>} All settings with defaults populated
 */
async function populateDefaults(unfilteredOptions) {
    const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
    const self = this;

    if (!options.context) {
        options.context = internalContext.context;
    }

    await ghostBookshelf.knex.destroy();
    await ghostBookshelf.knex.initialize();

    const allSettings = await findAllSettings(options);
    const usedKeys = allSettings.models.map(getSettingKey);

    const settingsToInsert = [];

    _.each(getDefaultSettings(), function forEachDefault(defaultSetting, defaultSettingKey) {
        if (isSettingMissingFromDB(usedKeys, defaultSettingKey)) {
            defaultSetting.value = defaultSetting.getDefaultValue();
            settingsToInsert.push(defaultSetting);
        }
    });

    if (settingsToInsert.length > 0) {
        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);

        await insertMissingSettings(settingsToInsert, columns);

        return self.findAll(options);
    }

    return allSettings;
}

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
        await validateAllSettings(model);
    },

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        const settingType = attrs.type;

        if (settingType === 'boolean') {
            if (attrs.value === '0' || attrs.value === '1') {
                attrs.value = !!+attrs.value;
            }

            if (attrs.value === 'false' || attrs.value === 'true') {
                attrs.value = JSON.parse(attrs.value);
            }

            if (_.isBoolean(attrs.value)) {
                attrs.value = attrs.value.toString();
            }
        }

        return attrs;
    },

    formatOnWrite(attrs) {
        if (attrs.value && ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'].includes(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }

        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);

        if (attrs.type === 'boolean' && (attrs.value === '0' || attrs.value === '1')) {
            attrs.value = !!+attrs.value;
        }

        if (attrs.type === 'boolean' && (attrs.value === 'false' || attrs.value === 'true')) {
            attrs.value = JSON.parse(attrs.value);
        }

        if (['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'].includes(attrs.key)) {
            attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
        }

        return attrs;
    }
}, {
    findOne: function (data, options) {
        if (_.isEmpty(data)) {
            options = data;
        }

        if (!_.isObject(data)) {
            data = {key: data};
        }

        return Promise.resolve(ghostBookshelf.Model.findOne.call(this, data, options));
    },

    edit: function (data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        const self = this;

        if (!Array.isArray(data)) {
            data = [data];
        }

        const promises = data.map(function (item) {
            if (item.toJSON) {
                item = item.toJSON();
            }

            if (!(_.isString(item.key) && item.key.length > 0)) {
                return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
            }

            const filteredItem = filterDataForEdit(item, self);

            return Settings.forge({key: filteredItem.key}).fetch(options).then(function then(setting) {
                if (setting) {
                    if (options.importing) {
                        return setting.save(filteredItem, options);
                    }

                    return updateSettingValue(setting, filteredItem, options);
                }

                return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: filteredItem.key})}));
            });
        });

        return Promise.all(promises);
    },

    populateDefaults: populateDefaults,

    validators: {
        async all(model) {
            await validateAllSettings(model);
        },
        async labs(model) {
            const flags = JSON.parse(model.get('value'));
            validateLabsFlags(flags);
        },
        async stripe_plans(model, options) {
            const plans = JSON.parse(model.get('value'));
            for (const plan of plans) {
                validateStripePlan(plan, options);
            }
        },
        async stripe_secret_key(model) {
            validateStripeSecretKey(model);
        },
        async stripe_publishable_key(model) {
            validateStripePublishableKey(model);
        },
        async stripe_connect_secret_key(model) {
            validateStripeConnectSecretKey(model);
        },
        async stripe_connect_publishable_key(model) {
            validateStripeConnectPublishableKey(model);
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};
```