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

const urlKeySet = new Set([
    'cover_image',
    'logo',
    'icon',
    'portal_button_icon',
    'og_image',
    'twitter_image',
    'pintura_js_url',
    'pintura_css_url'
]);

/**
 * Normalizes boolean values coming from the DB or API.
 * @param {any} value
 * @returns {boolean|string}
 */
function normalizeBoolean(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

/**
 * Returns true if the attribute object represents a boolean setting.
 * @param {Object} attrs
 * @returns {boolean}
 */
function isBooleanSetting(attrs) {
    return attrs.type === 'boolean';
}

/**
 * Returns true if the key is one of the URL related settings.
 * @param {string} key
 * @returns {boolean}
 */
function isUrlKey(key) {
    return urlKeySet.has(key);
}

/**
 * Validates a value against a regex and throws a ValidationError if it fails.
 * @param {string} value
 * @param {RegExp} regex
 * @param {string} message
 */
function validateRegex(value, regex, message) {
    if (!regex.test(value)) {
        throw new errors.ValidationError({message});
    }
}

/**
 * Checks if a stripe plan amount is valid.
 * @param {Object} plan
 * @param {Object} options
 * @returns {boolean}
 */
function isPlanAmountValid(plan, options) {
    if (options.importing) {
        return true;
    }
    // amounts are in fractional units, check against 100 (i.e., 1.00)
    return !(plan.amount < 100 && plan.name !== 'Complimentary');
}

/**
 * Checks if a stripe plan has a valid name.
 * @param {Object} plan
 * @returns {boolean}
 */
function isPlanNameValid(plan) {
    return typeof plan.name === 'string';
}

/**
 * Checks if a stripe plan has a valid currency.
 * @param {Object} plan
 * @returns {boolean}
 */
function isPlanCurrencyValid(plan) {
    return typeof plan.currency === 'string';
}

/**
 * Checks if a stripe plan interval is allowed.
 * @param {Object} plan
 * @returns {boolean}
 */
function isPlanIntervalValid(plan) {
    return ['year', 'month', 'week', 'day'].includes(plan.interval);
}

/**
 * Extracts and validates a default setting's value.
 * @param {Object} defaultSetting
 */
function assignDefaultValue(defaultSetting) {
    defaultSetting.value = defaultSetting.getDefaultValue();
}

/**
 * Prepares a setting item for saving.
 * @param {Object} item
 * @param {Object} options
 * @returns {Object}
 */
function prepareItem(item, options) {
    if (item.toJSON) {
        item = item.toJSON();
    }
    if (!(_.isString(item.key) && item.key.length > 0)) {
        throw new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)});
    }
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
    return Settings.filterData(item);
}

/**
 * Handles saving of an existing setting.
 * @param {Object} setting
 * @param {Object} item
 * @param {Object} options
 * @returns {Promise}
 */
function handleExistingSetting(setting, item, options) {
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
 * Parses default settings and flattens them.
 * @returns {Object}
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
                const dyn = dynamicDefault[setting.key];
                return dyn ? dyn() : setting.defaultValue;
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

Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    emitChange(event, options) {
        const eventToTrigger = `settings.${event}`;
        ghostBookshelf.Model.prototype.emitChange.bind(this)(this, eventToTrigger, options);
    },

    onDestroyed(model, options) {
        ghostBookshelf.Model.prototype.onDestroyed.apply(this, arguments);
        model.emitChange('deleted', options);
        model.emitChange(`${model._previousAttributes.key}.deleted`, options);
    },

    onCreated(model, options) {
        ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);
        model.emitChange('added', options);
        model.emitChange(`${model.attributes.key}.added`, options);
    },

    onUpdated(model, options) {
        ghostBookshelf.Model.prototype.onUpdated.apply(this, arguments);
        model.emitChange('edited', options);
        model.emitChange(`${model.attributes.key}.edited`, options);
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
        if (isBooleanSetting(attrs)) {
            attrs.value = normalizeBoolean(attrs.value);
            if (_.isBoolean(attrs.value)) {
                attrs.value = attrs.value.toString();
            }
        }
        return attrs;
    },

    formatOnWrite(attrs) {
        if (attrs.value && isUrlKey(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        if (isBooleanSetting(attrs)) {
            attrs.value = normalizeBoolean(attrs.value);
        }
        if (isUrlKey(attrs.key)) {
            attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
        }
        return attrs;
    }
}, {
    findOne(data, options) {
        if (_.isEmpty(data)) {
            options = data;
        }
        if (!_.isObject(data)) {
            data = {key: data};
        }
        return Promise.resolve(ghostBookshelf.Model.findOne.call(this, data, options));
    },

    edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        if (!Array.isArray(data)) {
            data = [data];
        }

        const promises = data.map(item => {
            try {
                item = prepareItem(item, options);
            } catch (err) {
                return Promise.reject(err);
            }

            return Settings.forge({key: item.key}).fetch(options).then(setting => {
                if (setting) {
                    return handleExistingSetting(setting, item, options);
                }
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.unableToFindSetting, {key: item.key})
                }));
            });
        });

        return Promise.all(promises);
    },

    async populateDefaults(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
        if (!options.context) {
            options.context = internalContext.context;
        }

        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = allSettings.models.map(setting => setting.get('key'));

        const settingsToInsert = [];

        _.each(getDefaultSettings(), (defaultSetting, defaultSettingKey) => {
            if (!usedKeys.includes(defaultSettingKey)) {
                assignDefaultValue(defaultSetting);
                settingsToInsert.push(defaultSetting);
            }
        });

        if (settingsToInsert.length) {
            const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
            const columns = Object.keys(columnInfo);
            const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settingsDataToInsert = settingsToInsert.map(setting => {
                const settingValues = {
                    ...setting,
                    id: ObjectID().toHexString(),
                    created_at: date,
                    updated_at: date
                };
                return _.pick(settingValues, columns);
            });

            await ghostBookshelf.knex.batchInsert('settings', settingsDataToInsert);
            return this.findAll(options);
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
                if (!isPlanAmountValid(plan, options)) {
                    throw new errors.ValidationError({message: 'Plans cannot have an amount less than 1'});
                }
                if (!isPlanNameValid(plan)) {
                    throw new errors.ValidationError({message: 'Plan must have a name'});
                }
                if (!isPlanCurrencyValid(plan)) {
                    throw new errors.ValidationError({message: 'Plan must have a currency'});
                }
                if (!isPlanIntervalValid(plan)) {
                    throw new errors.ValidationError({message: 'Plan interval must be one of: year, month, week or day'});
                }
            }
        },

        async stripe_secret_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(value, regex, `stripe_secret_key did not match ${regex}`);
        },

        async stripe_publishable_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(value, regex, `stripe_publishable_key did not match ${regex}`);
        },

        async stripe_connect_secret_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(value, regex, `stripe_secret_key did not match ${regex}`);
        },

        async stripe_connect_publishable_key(model) {
            const value = model.get('value');
            if (value === null) {
                return;
            }
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(value, regex, `stripe_publishable_key did not match ${regex}`);
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};