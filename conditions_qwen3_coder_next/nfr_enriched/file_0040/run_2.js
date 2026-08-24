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
 * Flatten default settings from categories into a single-level object.
 * Each setting is augmented with group and key properties for internal use.
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

            setting.getDefaultValue = function getDefaultValue() {
                const getDynamicDefault = dynamicDefault[setting.key];
                if (getDynamicDefault) {
                    return getDynamicDefault();
                } else {
                    return setting.defaultValue;
                }
            };

            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

/**
 * Retrieve and memoize the parsed default settings.
 */
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }

    return defaultSettings;
}

/**
 * Converts value to boolean when appropriate for persistence.
 * Handles string representations ("0", "1", "true", "false").
 */
function normalizeBooleanValue(attrs) {
    const settingType = attrs.type;
    if (settingType !== 'boolean') {
        return attrs;
    }

    if (attrs.value === '0' || attrs.value === '1') {
        attrs.value = !!+attrs.value;
    }

    if (attrs.value === 'false' || attrs.value === 'true') {
        attrs.value = JSON.parse(attrs.value);
    }

    if (_.isBoolean(attrs.value)) {
        attrs.value = attrs.value.toString();
    }

    return attrs;
}

/**
 * Prepares attributes for write operations (e.g., URL transformations).
 */
function prepareAttributesForWrite(attrs) {
    if (attrs.value && ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'].includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }

    return attrs;
}

/**
 * Parses persisted attributes, reversing transformations applied during format/write.
 */
function parseAttributes(attrs) {
    const settingType = attrs.type;

    if (settingType === 'boolean') {
        if (attrs.value === '0' || attrs.value === '1') {
            attrs.value = !!+attrs.value;
        }

        if (attrs.value === 'false' || attrs.value === 'true') {
            attrs.value = JSON.parse(attrs.value);
        }
    }

    if (['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'].includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }

    return attrs;
}

/**
 * Formats model attributes before persistence.
 */
function formatModelAttributes(attrs) {
    return normalizeBooleanValue(prepareAttributesForWrite(attrs));
}

/**
 * Validates a setting value against default validations.
 */
async function validateSettingValues(model, settingDefault) {
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
 * Validates LABS setting value: ensures only allowed flag keys exist.
 */
async function validateLabsSetting(model) {
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
 * Validates Stripe plans: enforces non-zero amounts and required fields.
 */
async function validateStripePlans(model, options) {
    const plans = JSON.parse(model.get('value'));
    for (const plan of plans) {
        if (!options.importing && plan.amount < 100 && plan.name !== 'Complimentary') {
            throw new errors.ValidationError({
                message: 'Plans cannot have an amount less than 1'
            });
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

/**
 * Validates Stripe secret key format.
 */
async function validateStripeSecretKey(model, keyField) {
    const value = model.get('value');
    if (value === null) {
        return;
    }

    const regex = new RegExp(`^${keyField}_(?:test|live)_[\\da-zA-Z]{1,247}$`);
    if (!regex.test(value)) {
        throw new errors.ValidationError({
            message: `${keyField} did not match ${regex.source}`
        });
    }
}

// Update models and handlers
Settings = ghostBookshelf.Model.extend({
    tableName: 'settings',
    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    emitChange(event, options) {
        const eventToTrigger = 'settings' + '.' + event;
        ghostBookshelf.Model.prototype.emitChange.bind(this)(this, eventToTrigger, options);
    },

    onDestroyed(model, options) {
        ghostBookshelf.Model.prototype.onDestroyed.apply(this, arguments);
        model.emitChange('deleted', options);
        model.emitChange(model._previousAttributes.key + '.' + 'deleted', options);
    },

    onCreated(model, options) {
        ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);
        model.emitChange('added', options);
        model.emitChange(model.attributes.key + '.' + 'added', options);
    },

    onUpdated(model, options) {
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
        return formatModelAttributes(attrs);
    },

    formatOnWrite(attrs) {
        return prepareAttributesForWrite(attrs);
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        return parseAttributes(attrs);
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

    // eslint-disable-next-line complexity
    edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        const self = this;

        if (!Array.isArray(data)) {
            data = [data];
        }

        const promises = data.map((item) => {
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

            return Settings.forge({key: item.key}).fetch(options).then((setting) => {
                if (!setting) {
                    return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})}));
                }

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
            });
        });

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

        const usedKeys = allSettings.models.map(setting => setting.get('key'));
        const settingsToInsert = [];

        _.each(getDefaultSettings(), (defaultSetting, defaultSettingKey) => {
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
        async all(model, options) {
            const settingName = model.get('key');
            const settingDefault = getDefaultSettings()[settingName];

            if (!settingDefault) {
                return;
            }

            await validateSettingValues(model, settingDefault);
        },

        async labs(model, options) {
            await validateLabsSetting(model, options);
        },

        async stripe_plans(model, options) {
            await validateStripePlans(model, options);
        },

        async stripe_secret_key(model, options) {
            await validateStripeSecretKey(model, 'sk');
        },

        async stripe_publishable_key(model, options) {
            await validateStripeSecretKey(model, 'pk');
        },

        async stripe_connect_secret_key(model, options) {
            await validateStripeSecretKey(model, 'sk');
        },

        async stripe_connect_publishable_key(model, options) {
            await validateStripeSecretKey(model, 'pk');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};