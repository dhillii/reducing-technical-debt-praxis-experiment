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
    let keyPairCache;
    return function getKey(type) {
        if (!keyPairCache) {
            keyPairCache = keypair({bits: 1024});
        }
        return keyPairCache[type];
    };
});

const getGhostKey = doBlock(() => {
    let keyPairCache;
    return function getKey(type) {
        if (!keyPairCache) {
            keyPairCache = keypair({bits: 1024});
        }
        return keyPairCache[type];
    };
});

/**
 * Checks if a value is a string representation of a boolean number ('0' or '1')
 * @param {any} value
 * @returns {boolean}
 */
function isBooleanNumericString(value) {
    return value === '0' || value === '1';
}

/**
 * Checks if a value is a string representation of a boolean ('true' or 'false')
 * @param {any} value
 * @returns {boolean}
 */
function isBooleanLiteralString(value) {
    return value === 'true' || value === 'false';
}

/**
 * Determines if a setting key is one of the URL related keys
 * @param {string} key
 * @returns {boolean}
 */
function isUrlKey(key) {
    const urlKeys = [
        'cover_image',
        'logo',
        'icon',
        'portal_button_icon',
        'og_image',
        'twitter_image',
        'pintura_js_url',
        'pintura_css_url'
    ];
    return urlKeys.includes(key);
}

/**
 * Normalizes boolean values for storage
 * @param {any} value
 * @returns {string}
 */
function normalizeBooleanValue(value) {
    if (isBooleanNumericString(value)) {
        return (!!+value).toString();
    }
    if (isBooleanLiteralString(value)) {
        return JSON.parse(value).toString();
    }
    if (_.isBoolean(value)) {
        return value.toString();
    }
    return value;
}

/**
 * Parses boolean values from storage
 * @param {any} value
 * @returns {any}
 */
function parseBooleanValue(value) {
    if (isBooleanNumericString(value)) {
        return !!+value;
    }
    if (isBooleanLiteralString(value)) {
        return JSON.parse(value);
    }
    return value;
}

/**
 * Transforms URL values for write operations
 * @param {object} attrs
 */
function transformUrlOnWrite(attrs) {
    if (attrs.value && isUrlKey(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
}

/**
 * Transforms URL values after reading from DB
 * @param {object} attrs
 */
function transformUrlOnRead(attrs) {
    if (isUrlKey(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
}

/**
 * Generates default settings map
 * @returns {object}
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

    _.each(defaultSettingsInCategories, (settings, categoryName) => {
        _.each(settings, (setting, settingName) => {
            setting.group = categoryName;
            setting.key = settingName;

            setting.getDefaultValue = function () {
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

/**
 * Validates a single item before edit
 * @param {object} item
 * @returns {Promise<void>}
 */
async function validateEditItem(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        throw new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)});
    }
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
}

/**
 * Prepares item data for saving
 * @param {object} item
 * @param {object} self
 * @returns {object}
 */
function prepareItemData(item, self) {
    return self.filterData(item);
}

/**
 * Updates a setting model based on item data
 * @param {object} setting
 * @param {object} item
 * @param {object} options
 * @returns {Promise<object>}
 */
async function updateSetting(setting, item, options) {
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
 * Handles edit operation for a single item
 * @param {object} item
 * @param {object} self
 * @param {object} options
 * @returns {Promise<object>}
 */
async function handleEditItem(item, self, options) {
    if (item.toJSON) {
        item = item.toJSON();
    }

    await validateEditItem(item);
    const preparedItem = prepareItemData(item, self);

    const setting = await Settings.forge({key: preparedItem.key}).fetch(options);
    if (!setting) {
        throw new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: preparedItem.key})});
    }

    return updateSetting(setting, preparedItem, options);
}

/**
 * Checks if a plan is valid according to business rules
 * @param {object} plan
 * @param {object} options
 * @throws {errors.ValidationError}
 */
function validateStripePlan(plan, options) {
    if (!options.importing) {
        if (plan.amount < 100 && plan.name !== 'Complimentary') {
            throw new errors.ValidationError({message: 'Plans cannot have an amount less than 1'});
        }
    }

    if (typeof plan.name !== 'string') {
        throw new errors.ValidationError({message: 'Plan must have a name'});
    }

    if (typeof plan.currency !== 'string') {
        throw new errors.ValidationError({message: 'Plan must have a currency'});
    }

    if (!['year', 'month', 'week', 'day'].includes(plan.interval)) {
        throw new errors.ValidationError({message: 'Plan interval must be one of: year, month, week or day'});
    }
}

/**
 * Validates stripe plans array
 * @param {object} model
 * @param {object} options
 */
async function validateStripePlans(model, options) {
    const plans = JSON.parse(model.get('value'));
    for (const plan of plans) {
        validateStripePlan(plan, options);
    }
}

/**
 * Validates labs flag values
 * @param {object} model
 */
async function validateLabs(model) {
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
 * Generic regex validator for Stripe keys
 * @param {string} value
 * @param {RegExp} regex
 * @param {string} fieldName
 */
function validateStripeKeyRegex(value, regex, fieldName) {
    if (value === null) {
        return;
    }
    if (!regex.test(value)) {
        throw new errors.ValidationError({
            message: `${fieldName} did not match ${regex}`
        });
    }
}

/**
 * Validates a setting against its default definition
 * @param {object} model
 */
async function validateAll(model) {
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
        const specificValidator = Settings.validators[model.get('key')];
        if (typeof specificValidator === 'function') {
            await specificValidator(model, options);
        }
    },

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        if (attrs.type === 'boolean') {
            attrs.value = normalizeBooleanValue(attrs.value);
        }
        return attrs;
    },

    formatOnWrite(attrs) {
        transformUrlOnWrite(attrs);
        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        if (attrs.type === 'boolean') {
            attrs.value = parseBooleanValue(attrs.value);
        }
        transformUrlOnRead(attrs);
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

    async edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        const self = this;

        if (!Array.isArray(data)) {
            data = [data];
        }

        const promises = data.map(item => handleEditItem(item, self, options));
        return Promise.all(promises);
    },

    async populateDefaults(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
        const self = this;

        if (!options.context) {
            options.context = internalContext.context;
        }

        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = allSettings.models.map(s => s.get('key'));

        const settingsToInsert = [];

        _.each(getDefaultSettings(), (defaultSetting, defaultSettingKey) => {
            if (!usedKeys.includes(defaultSettingKey)) {
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
        return self.findAll(options);
    },

    validators: {
        async all(model) {
            await validateAll(model);
        },
        async labs(model) {
            await validateLabs(model);
        },
        async stripe_plans(model, options) {
            await validateStripePlans(model, options);
        },
        async stripe_secret_key(model) {
            const value = model.get('value');
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyRegex(value, regex, 'stripe_secret_key');
        },
        async stripe_publishable_key(model) {
            const value = model.get('value');
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyRegex(value, regex, 'stripe_publishable_key');
        },
        async stripe_connect_secret_key(model) {
            const value = model.get('value');
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyRegex(value, regex, 'stripe_secret_key');
        },
        async stripe_connect_publishable_key(model) {
            const value = model.get('value');
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKeyRegex(value, regex, 'stripe_publishable_key');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};