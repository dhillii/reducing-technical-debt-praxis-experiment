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

// Lazy-loads and caches keypair for members
const getMembersKey = doBlock(() => {
    let UNO_KEYPAIRINO;
    return function getKey(type) {
        if (!UNO_KEYPAIRINO) {
            UNO_KEYPAIRINO = keypair({bits: 1024});
        }
        return UNO_KEYPAIRINO[type];
    };
});

// Lazy-loads and caches keypair for ghost
const getGhostKey = doBlock(() => {
    let UNO_KEYPAIRINO;
    return function getKey(type) {
        if (!UNO_KEYPAIRINO) {
            UNO_KEYPAIRINO = keypair({bits: 1024});
        }
        return UNO_KEYPAIRINO[type];
    };
});

// Generates dynamic default values for settings that require runtime computation
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

// Attaches group and key metadata to a setting object
function enrichSettingWithMetadata(setting, settingName, categoryName) {
    setting.group = categoryName;
    setting.key = settingName;
}

// Creates a function that retrieves the default value for a setting
function createGetDefaultValueFunction(setting, dynamicDefaults) {
    return function getDefaultValue() {
        const getDynamicDefault = dynamicDefaults[setting.key];
        if (getDynamicDefault) {
            return getDynamicDefault();
        }
        return setting.defaultValue;
    };
}

// Flattens categorized default settings into a single-level object
function flattenDefaultSettings(defaultSettingsInCategories, dynamicDefaults) {
    const defaultSettingsFlattened = {};

    _.each(defaultSettingsInCategories, function each(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            enrichSettingWithMetadata(setting, settingName, categoryName);
            setting.getDefaultValue = createGetDefaultValueFunction(setting, dynamicDefaults);
            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

// Parses and caches default settings from schema
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const dynamicDefaults = createDynamicDefaults();
    return flattenDefaultSettings(defaultSettingsInCategories, dynamicDefaults);
}

// Retrieves cached default settings, parsing them if necessary
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

// Converts string values to appropriate boolean representation
function normalizeBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    if (_.isBoolean(value)) {
        return value.toString();
    }
    return value;
}

// List of setting keys that contain URL values requiring transformation
const URL_SETTING_KEYS = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

// Checks if a setting key represents a URL field
function isUrlSetting(key) {
    return URL_SETTING_KEYS.includes(key);
}

// Formats attributes for boolean type settings
function formatBooleanAttribute(attrs) {
    if (attrs.type === 'boolean') {
        attrs.value = normalizeBooleanValue(attrs.value);
    }
    return attrs;
}

// Formats attributes for URL settings
function formatUrlAttribute(attrs) {
    if (attrs.value && isUrlSetting(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
    return attrs;
}

// Parses boolean values from database format
function parseBooleanAttribute(attrs) {
    if (attrs.type === 'boolean') {
        if (attrs.value === '0' || attrs.value === '1') {
            attrs.value = !!+attrs.value;
        } else if (attrs.value === 'false' || attrs.value === 'true') {
            attrs.value = JSON.parse(attrs.value);
        }
    }
    return attrs;
}

// Parses URL values from database format
function parseUrlAttribute(attrs) {
    if (isUrlSetting(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
    return attrs;
}

// Validates that a setting item has a non-empty key
function validateSettingKey(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }
    return Promise.resolve();
}

// Stringifies object values for storage
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
    return item;
}

// Normalizes item to JSON object if needed
function normalizeItemToJson(item) {
    if (item.toJSON) {
        return item.toJSON();
    }
    return item;
}

// Updates a setting model with new values
function updateSettingModel(setting, item, options) {
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

    return setting;
}

// Processes a single setting edit request
function processSingleSettingEdit(item, options, self) {
    return validateSettingKey(item)
        .then(() => {
            item = stringifyObjectValue(item);
            item = self.filterData(item);
            return Settings.forge({key: item.key}).fetch(options);
        })
        .then(function then(setting) {
            if (setting) {
                return updateSettingModel(setting, item, options);
            }
            return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
        });
}

// Collects missing settings that need to be inserted
function collectMissingSettings(allSettings, usedKeys) {
    const settingsToInsert = [];

    _.each(getDefaultSettings(), function forEachDefault(defaultSetting, defaultSettingKey) {
        const isMissingFromDB = usedKeys.indexOf(defaultSettingKey) === -1;
        if (isMissingFromDB) {
            defaultSetting.value = defaultSetting.getDefaultValue();
            settingsToInsert.push(defaultSetting);
        }
    });

    return settingsToInsert;
}

// Creates setting data objects ready for batch insertion
function createSettingDataForInsertion(settingsToInsert, date) {
    return settingsToInsert.map((setting) => {
        return {
            ...setting,
            id: ObjectID().toHexString(),
            created_at: date,
            updated_at: date
        };
    });
}

// Filters setting data to only include columns that exist in the database
function filterSettingsByColumns(settingData, columns) {
    return settingData.map((setting) => _.pick(setting, columns));
}

// Validates stripe secret key format
function validateStripeSecretKeyFormat(value) {
    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!secretKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_secret_key did not match ${secretKeyRegex}`
        });
    }
}

// Validates stripe publishable key format
function validateStripePublishableKeyFormat(value) {
    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!publishableKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_publishable_key did not match ${publishableKeyRegex}`
        });
    }
}

// Validates stripe plan amount
function validateStripePlanAmount(plan, isImporting) {
    if (!isImporting && plan.amount < 100 && plan.name !== 'Complimentary') {
        throw new errors.ValidationError({
            message: 'Plans cannot have an amount less than 1'
        });
    }
}

// Validates stripe plan name
function validateStripePlanName(plan) {
    if (typeof plan.name !== 'string') {
        throw new errors.ValidationError({
            message: 'Plan must have a name'
        });
    }
}

// Validates stripe plan currency
function validateStripePlanCurrency(plan) {
    if (typeof plan.currency !== 'string') {
        throw new errors.ValidationError({
            message: 'Plan must have a currency'
        });
    }
}

// Validates stripe plan interval
function validateStripePlanInterval(plan) {
    if (!['year', 'month', 'week', 'day'].includes(plan.interval)) {
        throw new errors.ValidationError({
            message: 'Plan interval must be one of: year, month, week or day'
        });
    }
}

// Validates a single stripe plan object
function validateSingleStripePlan(plan, isImporting) {
    validateStripePlanAmount(plan, isImporting);
    validateStripePlanName(plan);
    validateStripePlanCurrency(plan);
    validateStripePlanInterval(plan);
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

        await Settings.validators.all(model, options);

        if (typeof Settings.validators[model.get('key')] === 'function') {
            await Settings.validators[model.get('key')](model, options);
        }
    },

    format() {
        let attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        attrs = formatBooleanAttribute(attrs);
        return attrs;
    },

    formatOnWrite(attrs) {
        attrs = formatUrlAttribute(attrs);
        return attrs;
    },

    parse() {
        let attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        attrs = parseBooleanAttribute(attrs);
        attrs = parseUrlAttribute(attrs);
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
            item = normalizeItemToJson(item);
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

        const settingsToInsert = collectMissingSettings(allSettings, usedKeys);

        if (settingsToInsert.length > 0) {
            const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
            const columns = Object.keys(columnInfo);

            const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settingsDataToInsert = createSettingDataForInsertion(settingsToInsert, date);
            const filteredSettingsData = filterSettingsByColumns(settingsDataToInsert, columns);

            await ghostBookshelf.knex.batchInsert('settings', filteredSettingsData);

            return self.findAll(options);
        }

        return allSettings;
    },

    validators: {
        async all(model) {
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
        },
        async labs(model) {
            const flags = JSON.parse(model.get('value'));

            for (const flag in flags) {
                if (!WRITABLE_KEYS_ALLOWLIST.includes(flag)) {
                    throw new errors.ValidationError({
                        message: `Settings lab value cannot have value other then ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
                    });
                }
            }
        },
        async stripe_plans(model, options) {
            const plans = JSON.parse(model.get('value'));
            for (const plan of plans) {
                validateSingleStripePlan(plan, options.importing);
            }
        },
        async stripe_secret_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }

            validateStripeSecretKeyFormat(value);
        },
        async stripe_publishable_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }

            validateStripePublishableKeyFormat(value);
        },
        async stripe_connect_secret_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }

            validateStripeSecretKeyFormat(value);
        },
        async stripe_connect_publishable_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }

            validateStripePublishableKeyFormat(value);
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};