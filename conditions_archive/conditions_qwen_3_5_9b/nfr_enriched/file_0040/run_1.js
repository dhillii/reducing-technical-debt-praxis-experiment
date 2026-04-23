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
 * Parse default settings from schema and flatten into a single object.
 * Handles dynamic defaults and category grouping.
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};

    const dynamicDefault = {
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
 * Get default settings, initializing if not already loaded.
 */
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }

    return defaultSettings;
}

/**
 * Validate a Stripe plan configuration.
 * Ensures plan meets minimum requirements and has valid fields.
 */
function validateStripePlan(plan, options) {
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

/**
 * Validate a Stripe key against its expected format.
 */
function validateStripeKey(value, keyType) {
    if (value === null) {
        return;
    }

    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;

    if (keyType === 'secret') {
        if (!secretKeyRegex.test(value)) {
            throw new errors.ValidationError({
                message: `stripe_secret_key did not match ${secretKeyRegex}`
            });
        }
    } else if (keyType === 'publishable') {
        if (!publishableKeyRegex.test(value)) {
            throw new errors.ValidationError({
                message: `stripe_publishable_key did not match ${publishableKeyRegex}`
            });
        }
    }
}

/**
 * Validate edit data before processing.
 */
function validateEditData(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }

    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }

    return item;
}

/**
 * Find a setting by key and return it or reject if not found.
 */
function findSetting(settingKey, options) {
    return Settings.forge({key: settingKey}).fetch(options).then(function then(setting) {
        if (setting) {
            return setting;
        }

        return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: settingKey})}));
    });
}

/**
 * Update a setting with new values.
 */
function updateSetting(setting, item, options) {
    if (options.importing) {
        return setting.save(item, options);
    } else {
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
}

/**
 * Process a single edit item through validation and update pipeline.
 */
function processEditItem(item, options) {
    return validateEditData(item).then(function validatedItem(item) {
        return findSetting(item.key, options).then(function foundSetting(setting) {
            return updateSetting(setting, item, options);
        });
    });
}

/**
 * Edit multiple settings in a single operation.
 */
function edit(data, unfilteredOptions) {
    const options = this.filterOptions(unfilteredOptions, 'edit');
    const self = this;

    if (!Array.isArray(data)) {
        data = [data];
    }

    const promises = data.map(function (item) {
        if (item.toJSON) {
            item = item.toJSON();
        }

        return processEditItem(item, options);
    });

    return Promise.all(promises);
}

/**
 * Populate database with default settings that are missing.
 */
function populateDefaults(unfilteredOptions) {
    const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
    const self = this;

    if (!options.context) {
        options.context = internalContext.context;
    }

    return ghostBookshelf.knex.destroy().then(function () {
        return ghostBookshelf.knex.initialize();
    }).then(function () {
        return self.findAll(options);
    }).then(function allSettings(allSettings) {
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
            return ghostBookshelf.knex.table('settings').columnInfo().then(function columnInfo(columnInfo) {
                const columns = Object.keys(columnInfo);
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

                return ghostBookshelf.knex
                    .batchInsert('settings', settingsDataToInsert)
                    .then(function () {
                        return self.findAll(options);
                    });
            });
        }

        return allSettings;
    });
}

/**
 * Validate all settings against their default configurations.
 */
function validateSettings(model) {
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
 * Validate labs settings against allowlist.
 */
function validateLabs(model) {
    const flags = JSON.parse(model.get('value'));

    for (const flag in flags) {
        if (!WRITABLE_KEYS_ALLOWLIST.includes(flag)) {
            throw new errors.ValidationError({
                message: `Settings lab value cannot have value other then ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
            });
        }
    }
}

/**
 * Validate Stripe plans configuration.
 */
function validateStripePlans(model, options) {
    const plans = JSON.parse(model.get('value'));
    for (const plan of plans) {
        validateStripePlan(plan, options);
    }
}

/**
 * Validate Stripe secret key format.
 */
function validateStripeSecretKey(model) {
    validateStripeKey(model.get('value'), 'secret');
}

/**
 * Validate Stripe publishable key format.
 */
function validateStripePublishableKey(model) {
    validateStripeKey(model.get('value'), 'publishable');
}

/**
 * Validate Stripe Connect secret key format.
 */
function validateStripeConnectSecretKey(model) {
    validateStripeKey(model.get('value'), 'secret');
}

/**
 * Validate Stripe Connect publishable key format.
 */
function validateStripeConnectPublishableKey(model) {
    validateStripeKey(model.get('value'), 'publishable');
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

        const settingType = attrs.type;
        if (settingType === 'boolean' && (attrs.value === '0' || attrs.value === '1')) {
            attrs.value = !!+attrs.value;
        }

        if (settingType === 'boolean' && (attrs.value === 'false' || attrs.value === 'true')) {
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
        return edit.call(this, data, unfilteredOptions);
    },

    populateDefaults: async function populateDefaults(unfilteredOptions) {
        return populateDefaults.call(this, unfilteredOptions);
    },

    validators: {
        async all(model, options) {
            await validateSettings(model);
        },
        async labs(model) {
            await validateLabs(model);
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