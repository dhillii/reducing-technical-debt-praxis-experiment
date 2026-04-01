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

const getMembersKey = doBlock(() => {
    let UNO_KEYPAIRINO;
    return function getKey(type) {
        if (!UNO_KEYPAIRINO) {
            UNO_KEYPAIRINO = keypair({bits: 1024});
        }
        return UNO_KEYPAIRINO[type];
    };
});

const getGhostKey = doBlock(() => {
    let UNO_KEYPAIRINO;
    return function getKey(type) {
        if (!UNO_KEYPAIRINO) {
            UNO_KEYPAIRINO = keypair({bits: 1024});
        }
        return UNO_KEYPAIRINO[type];
    };
});

/**
 * Dynamic default value generators for settings
 */
const dynamicDefaultGenerators = {
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

/**
 * URL-related setting keys that require transformation
 */
const urlTransformKeys = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

/**
 * Checks if a value is a string representation of a boolean
 * @param {string} value - The value to check
 * @returns {boolean} True if value is '0', '1', 'true', or 'false'
 */
function isBooleanString(value) {
    return value === '0' || value === '1' || value === 'false' || value === 'true';
}

/**
 * Converts string boolean representation to actual boolean
 * @param {string} value - The string value to convert
 * @returns {boolean} The converted boolean value
 */
function convertStringToBoolean(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    return JSON.parse(value);
}

/**
 * Processes boolean type attributes for format/parse operations
 * @param {object} attrs - The attributes object
 * @param {string} direction - 'format' or 'parse' direction
 * @returns {object} The processed attributes
 */
function processBooleanType(attrs, direction) {
    const settingType = attrs.type;
    
    if (settingType !== 'boolean') {
        return attrs;
    }

    if (isBooleanString(attrs.value)) {
        attrs.value = convertStringToBoolean(attrs.value);
    }

    if (direction === 'format' && _.isBoolean(attrs.value)) {
        attrs.value = attrs.value.toString();
    }

    return attrs;
}

/**
 * Processes URL transformation for specific setting keys
 * @param {object} attrs - The attributes object
 * @param {string} direction - 'toTransform' or 'toAbsolute' direction
 * @returns {object} The processed attributes
 */
function processUrlTransformation(attrs, direction) {
    if (!attrs.value || !urlTransformKeys.includes(attrs.key)) {
        return attrs;
    }

    if (direction === 'toTransform') {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    } else if (direction === 'toAbsolute') {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }

    return attrs;
}

// For neatness, the defaults file is split into categories.
// It's much easier for us to work with it as a single level
// instead of iterating those categories every time
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};

    _.each(defaultSettingsInCategories, function each(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            setting.group = categoryName;
            setting.key = settingName;

            setting.getDefaultValue = function getDefaultValue() {
                const getDynamicDefault = dynamicDefaultGenerators[setting.key];
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

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }

    return defaultSettings;
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
        return processBooleanType(attrs, 'format');
    },

    formatOnWrite(attrs) {
        return processUrlTransformation(attrs, 'toTransform');
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        processBooleanType(attrs, 'parse');
        return processUrlTransformation(attrs, 'toAbsolute');
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
            if (!(_.isString(item.key) && item.key.length > 0)) {
                return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
            }

            // Ensure that object keys are stringified
            if (_.isObject(item.value)) {
                item.value = JSON.stringify(item.value);
            }

            item = self.filterData(item);

            return Settings.forge({key: item.key}).fetch(options).then(function then(setting) {
                if (setting) {
                    return self._handleSettingUpdate(setting, item, options);
                }

                return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
            });
        });
        return Promise.all(promises);
    },

    /**
     * Handles the update logic for a setting based on options
     * @param {object} setting - The setting model
     * @param {object} item - The item data
     * @param {object} options - The options object
     * @returns {Promise} The save promise or the setting
     */
    _handleSettingUpdate: function(setting, item, options) {
        // it's allowed to edit all attributes in case of importing/migrating
        if (options.importing) {
            return setting.save(item, options);
        }

        // If we have a value, set it.
        if (Object.prototype.hasOwnProperty.call(item, 'value')) {
            setting.set('value', item.value);
        }
        // Internal context can overwrite type (for fixture migrations)
        if (options.context && options.context.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
            setting.set('type', item.type);
        }

        // If anything has changed, save the updated model
        if (setting.hasChanged()) {
            return setting.save(null, options);
        }

        return setting;
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
                const settingValues = {
                    ...setting,
                    id: ObjectID().toHexString(),
                    created_at: date,
                    updated_at: date
                };

                return _.pick(settingValues, columns);
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
                // Stripe plans used to be allowed (and defaulted to!) 0 amount plans
                // this causes issues to people importing from older versions of Ghost
                // even if they don't use Members/Stripe
                // issue: https://github.com/TryGhost/Ghost/issues/12049
                if (!options.importing) {
                    // We check 100, not 1, because amounts are in fractional units
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
        },
        async stripe_secret_key(model) {
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
        },
        async stripe_publishable_key(model) {
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
        },
        async stripe_connect_secret_key(model) {
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
        },
        async stripe_connect_publishable_key(model) {
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
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};
```