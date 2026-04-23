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

// Attach metadata and default value getter to a setting
function enrichSettingWithMetadata(setting, settingName, categoryName, dynamicDefaults) {
    setting.group = categoryName;
    setting.key = settingName;

    setting.getDefaultValue = function getDefaultValue() {
        const getDynamicDefault = dynamicDefaults[setting.key];
        if (getDynamicDefault) {
            return getDynamicDefault();
        }
        return setting.defaultValue;
    };
}

// Flatten categorized default settings into a single-level object
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};
    const dynamicDefaults = createDynamicDefaults();

    _.each(defaultSettingsInCategories, function each(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            enrichSettingWithMetadata(setting, settingName, categoryName, dynamicDefaults);
            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }

    return defaultSettings;
}

// Determine if a setting key requires URL transformation
function isUrlTransformableKey(key) {
    const urlKeys = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];
    return urlKeys.includes(key);
}

// Convert boolean string representations to actual boolean values
function normalizeBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

// Convert boolean value to string representation
function stringifyBooleanValue(value) {
    if (_.isBoolean(value)) {
        return value.toString();
    }
    return value;
}

// Format attributes for database write operations
function formatAttributesForWrite(attrs) {
    if (attrs.value && isUrlTransformableKey(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
    return attrs;
}

// Parse attributes from database, applying type conversions
function parseAttributesFromDatabase(attrs) {
    const settingType = attrs.type;

    if (settingType === 'boolean') {
        attrs.value = normalizeBooleanValue(attrs.value);
    }

    if (isUrlTransformableKey(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }

    return attrs;
}

// Format attributes for model output, applying type conversions
function formatAttributesForOutput(attrs) {
    const settingType = attrs.type;

    if (settingType === 'boolean') {
        attrs.value = normalizeBooleanValue(attrs.value);
        attrs.value = stringifyBooleanValue(attrs.value);
    }

    return attrs;
}

// Emit change event for a setting
function emitSettingChangeEvent(model, event, options) {
    const eventToTrigger = 'settings.' + event;
    ghostBookshelf.Model.prototype.emitChange.bind(model)(model, eventToTrigger, options);
}

// Emit deletion-related events
function handleSettingDeletion(model, options) {
    ghostBookshelf.Model.prototype.onDestroyed.apply(this, arguments);
    emitSettingChangeEvent(model, 'deleted', options);
    emitSettingChangeEvent(model, model._previousAttributes.key + '.deleted', options);
}

// Emit creation-related events
function handleSettingCreation(model, options) {
    ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);
    emitSettingChangeEvent(model, 'added', options);
    emitSettingChangeEvent(model, model.attributes.key + '.added', options);
}

// Emit update-related events
function handleSettingUpdate(model, options) {
    ghostBookshelf.Model.prototype.onUpdated.apply(this, arguments);
    emitSettingChangeEvent(model, 'edited', options);
    emitSettingChangeEvent(model, model.attributes.key + '.edited', options);
}

// Validate setting value against default setting constraints
async function validateSettingValue(model, options) {
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

// Validate labs feature flags
async function validateLabsFlags(model) {
    const flags = JSON.parse(model.get('value'));

    for (const flag in flags) {
        if (!WRITABLE_KEYS_ALLOWLIST.includes(flag)) {
            throw new errors.ValidationError({
                message: `Settings lab value cannot have value other then ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
            });
        }
    }
}

// Validate stripe plan configuration
async function validateStripePlans(model, options) {
    const plans = JSON.parse(model.get('value'));
    for (const plan of plans) {
        if (!options.importing) {
            if (plan.amount < 100 && plan.name !== 'Complimentary') {
                throw new errors.ValidationError({
                    message: 'Plans cannot have an amount less than 1'
                });
            }
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
}

// Validate stripe secret key format
async function validateStripeSecretKey(model) {
    const value = model.get('value');
    if (value === null) {
        return;
    }

    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;

    if (!secretKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_secret_key did not match ${secretKeyRegex}`
        });
    }
}

// Validate stripe publishable key format
async function validateStripePublishableKey(model) {
    const value = model.get('value');
    if (value === null) {
        return;
    }

    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;

    if (!publishableKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_publishable_key did not match ${publishableKeyRegex}`
        });
    }
}

// Validate stripe connect secret key format
async function validateStripeConnectSecretKey(model) {
    const value = model.get('value');
    if (value === null) {
        return;
    }

    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;

    if (!secretKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_secret_key did not match ${secretKeyRegex}`
        });
    }
}

// Validate stripe connect publishable key format
async function validateStripeConnectPublishableKey(model) {
    const value = model.get('value');
    if (value === null) {
        return;
    }

    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;

    if (!publishableKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_publishable_key did not match ${publishableKeyRegex}`
        });
    }
}

// Process a single setting item for editing
async function processSingleSettingEdit(item, options, self) {
    if (item.toJSON) {
        item = item.toJSON();
    }

    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }

    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }

    item = self.filterData(item);

    return Settings.forge({key: item.key}).fetch(options).then(function then(setting) {
        if (setting) {
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

        return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
    });
}

// Prepare setting data for batch insertion
function prepareBatchInsertData(settingsToInsert, columns, date) {
    return settingsToInsert.map((setting) => {
        const settingValues = {
            ...setting,
            id: ObjectID().toHexString(),
            created_at: date,
            updated_at: date
        };

        return _.pick(settingValues, columns);
    });
}

// Identify missing settings and prepare them for insertion
function identifyMissingSettings(allSettings, settingsToInsert) {
    const usedKeys = allSettings.models.map(function mapper(setting) {
        return setting.get('key');
    });

    _.each(getDefaultSettings(), function forEachDefault(defaultSetting, defaultSettingKey) {
        const isMissingFromDB = usedKeys.indexOf(defaultSettingKey) === -1;
        if (isMissingFromDB) {
            defaultSetting.value = defaultSetting.getDefaultValue();
            settingsToInsert.push(defaultSetting);
        }
    });
}

// Each setting is saved as a separate row in the database,
// but the overlying API treats them as a single key:value mapping
Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    emitChange: function emitChange(event, options) {
        emitSettingChangeEvent(this, event, options);
    },

    onDestroyed: function onDestroyed(model, options) {
        handleSettingDeletion.call(this, model, options);
    },

    onCreated: function onCreated(model, options) {
        handleSettingCreation.call(this, model, options);
    },

    onUpdated: function onUpdated(model, options) {
        handleSettingUpdate.call(this, model, options);
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
        return formatAttributesForOutput(attrs);
    },

    formatOnWrite(attrs) {
        return formatAttributesForWrite(attrs);
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        return parseAttributesFromDatabase(attrs);
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
        const settingsToInsert = [];

        identifyMissingSettings(allSettings, settingsToInsert);

        if (settingsToInsert.length > 0) {
            const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
            const columns = Object.keys(columnInfo);
            const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settingsDataToInsert = prepareBatchInsertData(settingsToInsert, columns, date);

            await ghostBookshelf.knex
                .batchInsert('settings', settingsDataToInsert);

            return self.findAll(options);
        }

        return allSettings;
    },

    validators: {
        async all(model, options) {
            await validateSettingValue(model, options);
        },
        async labs(model) {
            await validateLabsFlags(model);
        },
        async stripe_plans(model, options) {
            await validateStripePlans(model, options);
        },
        async stripe_secret_key(model) {
            await validateStripeSecretKey(model);
        },
        async stripe_publishable_key(model) {
            await validateStripePublishableKey(model);
        },
        async stripe_connect_secret_key(model) {
            await validateStripeConnectSecretKey(model);
        },
        async stripe_connect_publishable_key(model) {
            await validateStripeConnectPublishableKey(model);
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};