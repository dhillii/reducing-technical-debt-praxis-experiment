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
 * Converts string boolean representations to actual booleans
 * @param {string} value - The value to convert
 * @returns {boolean} The converted boolean value
 */
function convertStringToBoolean(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

/**
 * Checks if a value is a string boolean representation
 * @param {*} value - The value to check
 * @returns {boolean} True if value is a string boolean
 */
function isStringBoolean(value) {
    return value === '0' || value === '1' || value === 'false' || value === 'true';
}

/**
 * Processes boolean type attributes for formatting
 * @param {object} attrs - The attributes object
 */
function processBooleanFormat(attrs) {
    if (isStringBoolean(attrs.value)) {
        attrs.value = convertStringToBoolean(attrs.value);
    }

    if (_.isBoolean(attrs.value)) {
        attrs.value = attrs.value.toString();
    }
}

/**
 * Processes boolean type attributes for parsing
 * @param {object} attrs - The attributes object
 */
function processBooleanParse(attrs) {
    if (isStringBoolean(attrs.value)) {
        attrs.value = convertStringToBoolean(attrs.value);
    }
}

/**
 * Processes URL transformation for write operations
 * @param {object} attrs - The attributes object
 */
function processUrlFormatOnWrite(attrs) {
    if (attrs.value && urlTransformKeys.includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
}

/**
 * Processes URL transformation for read operations
 * @param {object} attrs - The attributes object
 */
function processUrlParse(attrs) {
    if (urlTransformKeys.includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
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
        const settingType = attrs.type;

        if (settingType === 'boolean') {
            processBooleanFormat(attrs);
        }

        return attrs;
    },

    formatOnWrite(attrs) {
        processUrlFormatOnWrite(attrs);
        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        const settingType = attrs.type;

        if (settingType === 'boolean') {
            processBooleanParse(attrs);
        }

        processUrlParse(attrs);

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

    /**
     * Applies edit-specific filtering to setting data
     * @param {object} item - The setting item to process
     * @param {object} setting - The existing setting model
     * @param {object} options - Edit options
     * @returns {object} The processed setting
     */
    _applyEditLogic(item, setting, options) {
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
                    return self._applyEditLogic(item, setting, options);
                }

                return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
            });
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
        // @TODO: Maybe move some of the logic into the members service, exporting an isValidStripeKey
        // method which can be called here, cleaning up the duplication, but not removing control
        async stripe_secret_key(model) {
            const value = model.get('value');
            if (value === null) {