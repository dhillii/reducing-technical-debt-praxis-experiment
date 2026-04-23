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

// Image URL fields that require transformation
const imageUrlFields = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

/**
 * Enriches a setting with group, key, and default value getter
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
 * Flattens categorized default settings into a single-level object
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
 * Retrieves cached default settings or parses them if not yet cached
 */
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/**
 * Converts string boolean values to actual booleans
 */
function normalizeBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

/**
 * Converts boolean values to string representation
 */
function stringifyBooleanValue(value) {
    return _.isBoolean(value) ? value.toString() : value;
}

/**
 * Handles boolean type formatting for database storage
 */
function formatBooleanAttribute(attrs) {
    const settingType = attrs.type;
    if (settingType === 'boolean') {
        attrs.value = normalizeBooleanValue(attrs.value);
        attrs.value = stringifyBooleanValue(attrs.value);
    }
    return attrs;
}

/**
 * Handles boolean type parsing from database
 */
function parseBooleanAttribute(attrs) {
    const settingType = attrs.type;
    if (settingType === 'boolean') {
        attrs.value = normalizeBooleanValue(attrs.value);
    }
    return attrs;
}

/**
 * Transforms image URLs to transform-ready format for storage
 */
function formatImageUrls(attrs) {
    if (attrs.value && imageUrlFields.includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
    return attrs;
}

/**
 * Transforms image URLs from transform-ready to absolute format
 */
function parseImageUrls(attrs) {
    if (imageUrlFields.includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
    return attrs;
}

/**
 * Validates that a setting key is a non-empty string
 */
function validateSettingKey(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }
    return Promise.resolve();
}

/**
 * Stringifies object values for storage
 */
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
}

/**
 * Updates a setting with new values, respecting import mode and internal context
 */
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

/**
 * Processes a single setting edit operation
 */
function processSingleSettingEdit(item, options, self) {
    return validateSettingKey(item)
        .then(() => {
            stringifyObjectValue(item);
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

/**
 * Builds setting data for batch insertion with metadata
 */
function buildSettingInsertData(setting, date, columns) {
    const settingValues = {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: date,
        updated_at: date
    };
    return _.pick(settingValues, columns);
}

/**
 * Filters settings to insert by checking against existing keys
 */
function filterSettingsToInsert(usedKeys) {
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
 * Validates stripe key format
 */
function validateStripeKeyFormat(value, regex, keyName) {
    if (value === null) {
        return;
    }
    if (!regex.test(value)) {
        throw new errors.ValidationError({
            message: `${keyName} did not match ${regex}`
        });
    }
}

/**
 * Validates stripe plan amount
 */
function validateStripePlanAmount(plan, isImporting) {
    if (!isImporting && plan.amount < 100 && plan.name !== 'Complimentary') {
        throw new errors.ValidationError({
            message: 'Plans cannot have an amount less than 1'
        });
    }
}

/**
 * Validates stripe plan required fields
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
 * Validates a single stripe plan
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
        return formatImageUrls(attrs);
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        parseBooleanAttribute(attrs);
        parseImageUrls(attrs);
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

        // this is required for sqlite to pick up the columns after db init
        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);

        const usedKeys = allSettings.models.map(function mapper(setting) {
            return setting.get('key');
        });

        const settingsToInsert = filterSettingsToInsert(usedKeys);

        if (settingsToInsert.length > 0) {
            // fetch available columns to avoid populating columns not yet created by migrations
            const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
            const columns = Object.keys(columnInfo);

            // fetch other data that is used when inserting new settings
            const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settingsDataToInsert = settingsToInsert.map((setting) => {
                return buildSettingInsertData(setting, date, columns);
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
            const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyFormat(value, secretKeyRegex, 'stripe_secret_key');
        },
        async stripe_publishable_key(model) {
            const value = model.get('value');
            const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyFormat(value, publishableKeyRegex, 'stripe_publishable_key');
        },
        async stripe_connect_secret_key(model) {
            const value = model.get('value');
            const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyFormat(value, secretKeyRegex, 'stripe_secret_key');
        },
        async stripe_connect_publishable_key(model) {
            const value = model.get('value');
            const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyFormat(value, publishableKeyRegex, 'stripe_publishable_key');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};
```