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
 * Build flattened default settings object for easy lookup
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};

    const dynamicDefaults = getDynamicDefaults();

    _.each(defaultSettingsInCategories, function each(settings, categoryName) {
        _.each(settings, function eachSetting(setting, settingName) {
            setting.group = categoryName;
            setting.key = settingName;
            setting.getDefaultValue = createGetDefaultValueFunction(dynamicDefaults, setting.key);
            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

/**
 * Create getDefaultValue function for a given setting key
 */
function createGetDefaultValueFunction(dynamicDefaults, key) {
    return function getDefaultValue() {
        const getDynamicDefault = dynamicDefaults[key];
        return getDynamicDefault ? getDynamicDefault() : this.defaultValue;
    };
}

/**
 * Return dynamic default value generators
 */
function getDynamicDefaults() {
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

/**
 * Get or initialize default settings cache
 */
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
        ghostBookshelf.Model.prototype.emitChange.call(this, this, 'settings.' + event, options);
    },

    onDestroyed: function onDestroyed(model, options) {
        ghostBookshelf.Model.prototype.onDestroyed.apply(this, arguments);
        model.emitChange('deleted', options);
        model.emitChange(model._previousAttributes.key + '.deleted', options);
    },

    onCreated: function onCreated(model, options) {
        ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);
        model.emitChange('added', options);
        model.emitChange(model.attributes.key + '.added', options);
    },

    onUpdated: function onUpdated(model, options) {
        ghostBookshelf.Model.prototype.onUpdated.apply(this, arguments);
        model.emitChange('edited', options);
        model.emitChange(model.attributes.key + '.edited', options);
    },

    async onValidate(model, attr, options) {
        await ghostBookshelf.Model.prototype.onValidate.call(this, model, attr, options);
        await Settings.validators.all(model, options);

        const customValidator = Settings.validators[model.get('key')];
        if (typeof customValidator === 'function') {
            await customValidator(model, options);
        }
    },

    format: function format() {
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

    formatOnWrite: function formatOnWrite(attrs) {
        if (attrs.value && isUrlSettingKey(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    parse: function parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);
        const settingType = attrs.type;

        if (settingType === 'boolean' && (attrs.value === '0' || attrs.value === '1')) {
            attrs.value = !!+attrs.value;
        }

        if (settingType === 'boolean' && (attrs.value === 'false' || attrs.value === 'true')) {
            attrs.value = JSON.parse(attrs.value);
        }

        if (isUrlSettingKey(attrs.key)) {
            attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
        }

        return attrs;
    }
}, {
    findOne: function (data, options) {
        if (_.isEmpty(data)) {
            options = data;
            data = {};
        }

        if (!_.isObject(data)) {
            data = {key: data};
        }

        return Promise.resolve(ghostBookshelf.Model.findOne.call(this, data, options));
    },

    edit: function (data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');

        if (!Array.isArray(data)) {
            data = [data];
        }

        return Promise.all(data.map(item => this.editSingleSetting(item, options)));
    },

    /**
     * Edit a single setting item
     */
    async editSingleSetting(item, options) {
        if (item.toJSON) {
            item = item.toJSON();
        }

        if (!(_.isString(item.key) && item.key.length > 0)) {
            throw new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)});
        }

        if (_.isObject(item.value)) {
            item.value = JSON.stringify(item.value);
        }

        const settingModel = Settings.filterData(item);

        const existingSetting = await Settings.forge({key: item.key}).fetch(options);

        if (!existingSetting) {
            throw new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})});
        }

        if (options.importing) {
            return existingSetting.save(item, options);
        }

        if (Object.prototype.hasOwnProperty.call(item, 'value')) {
            existingSetting.set('value', item.value);
        }

        if (options.context && options.context.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
            existingSetting.set('type', item.type);
        }

        if (existingSetting.hasChanged()) {
            return existingSetting.save(null, options);
        }

        return existingSetting;
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
        const settingsToInsert = this.collectMissingSettings(usedKeys);

        if (settingsToInsert.length === 0) {
            return allSettings;
        }

        return this.insertMissingSettings(settingsToInsert, options).then(() => self.findAll(options));
    },

    /**
     * Collect settings that are missing from the database
     */
    collectMissingSettings(usedKeys) {
        const defaultSettings = getDefaultSettings();
        const settingsToInsert = [];

        _.each(defaultSettings, function (defaultSetting, key) {
            if (usedKeys.indexOf(key) === -1) {
                defaultSetting.value = defaultSetting.getDefaultValue();
                settingsToInsert.push(defaultSetting);
            }
        });

        return settingsToInsert;
    },

    /**
     * Insert missing settings into database
     */
    async insertMissingSettings(settingsToInsert, options) {
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
                if (!options.importing && plan.amount < 100 && plan.name !== 'Complimentary') {
                    throw new errors.ValidationError({message: 'Plans cannot have an amount less than 1'});
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
        },

        async stripe_secret_key(model) {
            await this.validateStripeKey(model.get('value'), 'stripe_secret_key');
        },

        async stripe_publishable_key(model) {
            await this.validateStripeKey(model.get('value'), 'stripe_publishable_key');
        },

        async stripe_connect_secret_key(model) {
            await this.validateStripeKey(model.get('value'), 'stripe_connect_secret_key');
        },

        async stripe_connect_publishable_key(model) {
            await this.validateStripeKey(model.get('value'), 'stripe_connect_publishable_key');
        },

        async validateStripeKey(value, settingName) {
            if (value === null) {
                return;
            }

            const expectedRegex = /(?:sk|rk|pk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            const regex = new RegExp(expectedRegex);

            if (!regex.test(value)) {
                throw new errors.ValidationError({
                    message: `${settingName} did not match ${expectedRegex}`
                });
            }
        }
    }
});

/**
 * Check if key is a URL-type setting
 */
function isUrlSettingKey(key) {
    return ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'].includes(key);
}

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};