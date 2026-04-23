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

// Emit change event for a setting
function emitSettingChange(model, event, options) {
    const eventToTrigger = 'settings' + '.' + event;
    ghostBookshelf.Model.prototype.emitChange.bind(model)(model, eventToTrigger, options);
}

// Handle boolean value formatting for storage
function formatBooleanValue(attrs) {
    if (attrs.type === 'boolean') {
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

// List of image/URL settings that need transformation
const URL_TRANSFORM_KEYS = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

// Transform URLs to storage format
function formatUrlsForWrite(attrs) {
    if (attrs.value && URL_TRANSFORM_KEYS.includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }

    return attrs;
}

// Parse boolean values from storage
function parseBooleanValue(attrs) {
    const settingType = attrs.type;
    if (settingType === 'boolean' && (attrs.value === '0' || attrs.value === '1')) {
        attrs.value = !!+attrs.value;
    }

    if (settingType === 'boolean' && (attrs.value === 'false' || attrs.value === 'true')) {
        attrs.value = JSON.parse(attrs.value);
    }

    return attrs;
}

// Transform URLs from storage format to absolute
function parseUrlsForRead(attrs) {
    if (URL_TRANSFORM_KEYS.includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }

    return attrs;
}

// Validate setting key is present and non-empty
function validateSettingKey(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }
    return Promise.resolve();
}

// Stringify object values for storage
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
}

// Update existing setting with new values
function updateExistingSetting(setting, item, options) {
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

// Process a single setting edit operation
function processSingleSettingEdit(item, options, self) {
    return validateSettingKey(item).then(() => {
        stringifyObjectValue(item);
        item = self.filterData(item);

        return Settings.forge({key: item.key}).fetch(options).then(function then(setting) {
            if (setting) {
                return updateExistingSetting(setting, item, options);
            }

            return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
        });
    });
}

// Convert item to JSON if it's a model
function normalizeSettingItem(item) {
    if (item.toJSON) {
        return item.toJSON();
    }
    return item;
}

// Build setting data for insertion with metadata
function buildSettingInsertData(setting, date) {
    return {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: date,
        updated_at: date
    };
}

// Filter setting data to only include available columns
function filterSettingsByColumns(settingData, columns) {
    return _.pick(settingData, columns);
}

// Validate stripe secret key format
function validateStripeSecretKeyFormat(value) {
    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!secretKeyRegex.test(value)) {
        throw new errors.ValidationError({
            message: `stripe_secret_key did not match ${secretKeyRegex}`
        });
    }
}

// Validate stripe publishable key format
function validateStripePublishableKeyFormat(value) {
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
        return formatBooleanValue(attrs);
    },

    formatOnWrite(attrs) {
        return formatUrlsForWrite(attrs);
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        parseBooleanValue(attrs);
        parseUrlsForRead(attrs);
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

        if (!Array.isArray(data)) {
            data = [data];
        }

        // Accept an array of models as input
        const promises = data.map(function (item) {
            item = normalizeSettingItem(item);
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

        const settingsToInsert = [];

        _.each(getDefaultSettings(), function forEachDefault(defaultSetting, defaultSettingKey) {
            const isMissingFromDB = usedKeys.indexOf(defaultSettingKey) === -1;
            if (isMissingFromDB) {
                defaultSetting.value = defaultSetting.getDefaultValue();
                settingsToInsert.push(defaultSetting);
            }
        });

        if (settingsToInsert.length > 0) {
            // fetch available columns to avoid populating columns not yet created by migrations
            const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
            const columns = Object.keys(columnInfo);

            // fetch other data that is used when inserting new settings
            const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settingsDataToInsert = settingsToInsert.map((setting) => {
                const settingValues = buildSettingInsertData(setting, date);
                return filterSettingsByColumns(settingValues, columns);
            });

            await ghostBookshelf.knex
                .batchInsert('settings', settingsDataToInsert);

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

            // Basic validations from default-settings.json
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