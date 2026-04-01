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

// Lazy-load keypair for members authentication
const getMembersKey = doBlock(() => {
    let UNO_KEYPAIRINO;
    return function getKey(type) {
        if (!UNO_KEYPAIRINO) {
            UNO_KEYPAIRINO = keypair({bits: 1024});
        }
        return UNO_KEYPAIRINO[type];
    };
});

// Lazy-load keypair for ghost authentication
const getGhostKey = doBlock(() => {
    let UNO_KEYPAIRINO;
    return function getKey(type) {
        if (!UNO_KEYPAIRINO) {
            UNO_KEYPAIRINO = keypair({bits: 1024});
        }
        return UNO_KEYPAIRINO[type];
    };
});

// Generate dynamic default values for settings
function createDynamicDefaults() {
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

// Attach default value getter to a setting
function attachDefaultValueGetter(setting, dynamicDefaults) {
    setting.getDefaultValue = function getDefaultValue() {
        const getDynamicDefault = dynamicDefaults[setting.key];
        if (getDynamicDefault) {
            return getDynamicDefault();
        }
        return setting.defaultValue;
    };
}

// Flatten categorized settings into a single-level object
function flattenSettingsByCategory(settingsByCategory, dynamicDefaults) {
    const flattened = {};

    _.each(settingsByCategory, function eachCategory(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            setting.group = categoryName;
            setting.key = settingName;
            attachDefaultValueGetter(setting, dynamicDefaults);
            flattened[settingName] = setting;
        });
    });

    return flattened;
}

// Parse and flatten default settings from schema
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const dynamicDefaults = createDynamicDefaults();
    return flattenSettingsByCategory(defaultSettingsInCategories, dynamicDefaults);
}

// Retrieve cached default settings or parse them
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

// Check if a setting key requires URL transformation
function isUrlTransformableKey(key) {
    const urlKeys = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];
    return urlKeys.includes(key);
}

// Convert boolean string representations to actual booleans
function normalizeBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

// Convert boolean to string representation
function stringifyBooleanValue(value) {
    if (_.isBoolean(value)) {
        return value.toString();
    }
    return value;
}

// Format setting attributes for output
function formatBooleanSetting(attrs) {
    if (attrs.type !== 'boolean') {
        return attrs;
    }

    attrs.value = normalizeBooleanValue(attrs.value);
    attrs.value = stringifyBooleanValue(attrs.value);
    return attrs;
}

// Parse setting attributes from database
function parseBooleanSetting(attrs) {
    if (attrs.type !== 'boolean') {
        return attrs;
    }
    attrs.value = normalizeBooleanValue(attrs.value);
    return attrs;
}

// Parse URL settings from database
function parseUrlSetting(attrs) {
    if (isUrlTransformableKey(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
    return attrs;
}

// Format URL settings for write
function formatUrlSetting(attrs) {
    if (attrs.value && isUrlTransformableKey(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
    return attrs;
}

// Validate stripe secret key format
function validateStripeSecretKey(value) {
    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!secretKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_secret_key did not match ${secretKeyRegex}`
        });
    }
}

// Validate stripe publishable key format
function validateStripePublishableKey(value) {
    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!publishableKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_publishable_key did not match ${publishableKeyRegex}`
        });
    }
}

// Validate stripe plan amount
function validateStripePlanAmount(plan, isImporting) {
    if (!isImporting && plan.amount < 100 && plan.name !== 'Complimentary') {
        throw new errors.ValidationError({
            message: 'Plans cannot have an amount less than 1'
        });
    }
}

// Validate stripe plan name
function validateStripePlanName(plan) {
    if (typeof plan.name !== 'string') {
        throw new errors.ValidationError({
            message: 'Plan must have a name'
        });
    }
}

// Validate stripe plan currency
function validateStripePlanCurrency(plan) {
    if (typeof plan.currency !== 'string') {
        throw new errors.ValidationError({
            message: 'Plan must have a currency'
        });
    }
}

// Validate stripe plan interval
function validateStripePlanInterval(plan) {
    if (!['year', 'month', 'week', 'day'].includes(plan.interval)) {
        throw new errors.ValidationError({
            message: 'Plan interval must be one of: year, month, week or day'
        });
    }
}

// Validate a single stripe plan
function validateSingleStripePlan(plan, isImporting) {
    validateStripePlanAmount(plan, isImporting);
    validateStripePlanName(plan);
    validateStripePlanCurrency(plan);
    validateStripePlanInterval(plan);
}

// Emit change event for a setting
function emitSettingChange(model, event, options) {
    const eventToTrigger = 'settings.' + event;
    ghostBookshelf.Model.prototype.emitChange.bind(model)(model, eventToTrigger, options);
}

// Handle setting deletion event
function handleSettingDeleted(model, options) {
    ghostBookshelf.Model.prototype.onDestroyed.apply(model, arguments);
    emitSettingChange(model, 'deleted', options);
    emitSettingChange(model, model._previousAttributes.key + '.deleted', options);
}

// Handle setting creation event
function handleSettingCreated(model, options) {
    ghostBookshelf.Model.prototype.onCreated.apply(model, arguments);
    emitSettingChange(model, 'added', options);
    emitSettingChange(model, model.attributes.key + '.added', options);
}

// Handle setting update event
function handleSettingUpdated(model, options) {
    ghostBookshelf.Model.prototype.onUpdated.apply(model, arguments);
    emitSettingChange(model, 'edited', options);
    emitSettingChange(model, model.attributes.key + '.edited', options);
}

// Check if item has a valid key
function hasValidKey(item) {
    return _.isString(item.key) && item.key.length > 0;
}

// Stringify object values
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
    return item;
}

// Update setting with new value
function updateSettingValue(setting, item) {
    if (Object.prototype.hasOwnProperty.call(item, 'value')) {
        setting.set('value', item.value);
    }
}

// Update setting type for internal context
function updateSettingType(setting, item, options) {
    if (options.context && options.context.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
        setting.set('type', item.type);
    }
}

// Process a single setting edit
function processSingleSettingEdit(item, options, self) {
    if (!hasValidKey(item)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }

    stringifyObjectValue(item);
    item = self.filterData(item);

    return Settings.forge({key: item.key}).fetch(options).then(function then(setting) {
        if (!setting) {
            return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
        }

        if (options.importing) {
            return setting.save(item, options);
        }

        updateSettingValue(setting, item);
        updateSettingType(setting, item, options);

        if (setting.hasChanged()) {
            return setting.save(null, options);
        }

        return setting;
    });
}

// Build setting data for insertion
function buildSettingDataForInsert(setting, date) {
    return {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: date,
        updated_at: date
    };
}

// Filter setting data to available columns
function filterSettingToColumns(settingData, columns) {
    return _.pick(settingData, columns);
}

// Each setting is saved as a separate row in the database,
// but the overlying API treats them as a single key:value mapping
Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    emitChange: function emitChange(event, options) {
        emitSettingChange(this, event, options);
    },

    onDestroyed: function onDestroyed(model, options) {
        handleSettingDeleted(model, options);
    },

    onCreated: function onCreated(model, options) {
        handleSettingCreated(model, options);
    },

    onUpdated: function onUpdated(model, options) {
        handleSettingUpdated(model, options);
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
        return formatBooleanSetting(attrs);
    },

    formatOnWrite(attrs) {
        return formatUrlSetting(attrs);
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        parseBooleanSetting(attrs);
        parseUrlSetting(attrs);
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

        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = allSettings.models.map(function mapper(setting) {
            return setting.get('key');
        });

        const settingsToInsert = [];

        _.each(getDefaultSettings(), function forEachDefault(defaultSetting, defaultSettingKey) {
            if (usedKeys.indexOf(defaultSettingKey) === -1) {
                defaultSetting.value = defaultSetting.getDefaultValue();
                settingsToInsert.push(defaultSetting);
            }
        });

        if (settingsToInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const settingsDataToInsert = settingsToInsert.map((setting) => {
            const settingData = buildSettingDataForInsert(setting, date);
            return filterSettingToColumns(settingData, columns);
        });

        await ghostBookshelf.knex.batchInsert('settings', settingsDataToInsert);
        return self.findAll(options);
    },

    validators: {