const _ = require('lodash');
const crypto = require('crypto');
const keypair = require('keypair');
const ObjectID = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const validator = require('@ghost/validator');
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
 * Flattens default settings from categorized structure into a single-level object.
 * @returns {Object} Flattened default settings with key as property name.
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};

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

    _.each(defaultSettingsInCategories, (settings, categoryName) => {
        _.each(settings, (setting, settingName) => {
            setting.group = categoryName;
            setting.key = settingName;

            setting.getDefaultValue = function getDefaultValue() {
                const getDynamicDefault = dynamicDefaults[setting.key];
                return getDynamicDefault ? getDynamicDefault() : setting.defaultValue;
            };

            defaultSettingsFlattened[settingName] = setting;
        });
    });

    return defaultSettingsFlattened;
}

/**
 * Returns the flattened default settings object, caching it on first access.
 * @returns {Object} Default settings object.
 */
function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/**
 * Creates a new settings model instance with proper event emission and formatting.
 */
Settings = ghostBookshelf.Model.extend({
    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    /**
     * Emits change events for settings.
     * @param {string} event - Event name.
     * @param {Object} options - Options object.
     */
    emitChange(event, options) {
        const eventToTrigger = 'settings.' + event;
        ghostBookshelf.Model.prototype.emitChange.call(this, this, eventToTrigger, options);
    },

    /**
     * Handles post-deletion logic.
     * @param {Object} model - Deleted model instance.
     * @param {Object} options - Options object.
     */
    onDestroyed(model, options) {
        ghostBookshelf.Model.prototype.onDestroyed.apply(this, arguments);
        model.emitChange('deleted', options);
        model.emitChange(model._previousAttributes.key + '.deleted', options);
    },

    /**
     * Handles post-creation logic.
     * @param {Object} model - Created model instance.
     * @param {Object} options - Options object.
     */
    onCreated(model, options) {
        ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);
        model.emitChange('added', options);
        model.emitChange(model.attributes.key + '.added', options);
    },

    /**
     * Handles post-update logic.
     * @param {Object} model - Updated model instance.
     * @param {Object} options - Options object.
     */
    onUpdated(model, options) {
        ghostBookshelf.Model.prototype.onUpdated.apply(this, arguments);
        model.emitChange('edited', options);
        model.emitChange(model.attributes.key + '.edited', options);
    },

    /**
     * Validates model before saving.
     * @param {Object} model - Model instance.
     * @param {string} attr - Attribute name.
     * @param {Object} options - Options object.
     * @returns {Promise}
     */
    async onValidate(model, attr, options) {
        await ghostBookshelf.Model.prototype.onValidate.call(this, model, attr, options);
        await Settings.validators.all(model, options);

        if (typeof Settings.validators[model.get('key')] === 'function') {
            await Settings.validators[model.get('key')](model, options);
        }
    },

    /**
     * Formats model attributes for output.
     * @returns {Object} Formatted attributes.
     */
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

    /**
     * Formats attributes before writing to database.
     * @param {Object} attrs - Attributes object.
     * @returns {Object} Formatted attributes.
     */
    formatOnWrite(attrs) {
        if (attrs.value && ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'].includes(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    /**
     * Parses raw database values into model attributes.
     * @returns {Object} Parsed attributes.
     */
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
    /**
     * Finds a single setting by key or attributes.
     * @param {Object|string} data - Key string or filter object.
     * @param {Object} options - Options object.
     * @returns {Promise}
     */
    findOne(data, options) {
        if (_.isEmpty(data)) {
            options = data;
        }
        if (!_.isObject(data)) {
            data = {key: data};
        }
        return Promise.resolve(ghostBookshelf.Model.findOne.call(this, data, options));
    },

    /**
     * Edits one or more settings.
     * @param {Array|Object} data - Setting(s) to edit.
     * @param {Object} unfilteredOptions - Raw options object.
     * @returns {Promise}
     */
    edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        if (!Array.isArray(data)) {
            data = [data];
        }

        return Promise.all(data.map(item => this._editSingleSetting(item, options)));
    },

    /**
     * Edits a single setting with validation and permission checks.
     * @param {Object} item - Setting item to edit.
     * @param {Object} options - Options object.
     * @returns {Promise}
     */
    async _editSingleSetting(item, options) {
        if (item.toJSON) {
            item = item.toJSON();
        }
        if (!(_.isString(item.key) && item.key.length > 0)) {
            throw new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)});
        }

        if (_.isObject(item.value)) {
            item.value = JSON.stringify(item.value);
        }

        item = this.filterData(item);

        const setting = await Settings.forge({key: item.key}).fetch(options);
        if (!setting) {
            throw new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})});
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
    },

    /**
     * Ensures default settings exist in the database.
     * @param {Object} unfilteredOptions - Raw options object.
     * @returns {Promise}
     */
    async populateDefaults(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
        if (!options.context) {
            options.context = internalContext.context;
        }

        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = allSettings.models.map(setting => setting.get('key'));
        const settingsToInsert = this._collectMissingDefaults(usedKeys);

        if (settingsToInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const settingsDataToInsert = settingsToInsert.map((setting) => ({
            ...setting,
            id: ObjectID().toHexString(),
            created_at: date,
            updated_at: date
        })).map(settingValues => _.pick(settingValues, columns));

        await ghostBookshelf.knex.batchInsert('settings', settingsDataToInsert);
        return this.findAll(options);
    },

    /**
     * Collects default settings that are missing from the database.
     * @param {Array<string>} usedKeys - Array of existing setting keys.
     * @returns {Array} Array of missing default settings.
     */
    _collectMissingDefaults(usedKeys) {
        const defaults = getDefaultSettings();
        const settingsToInsert = [];

        _.each(defaults, (defaultSetting, defaultSettingKey) => {
            if (usedKeys.indexOf(defaultSettingKey) === -1) {
                defaultSetting.value = defaultSetting.getDefaultValue();
                settingsToInsert.push(defaultSetting);
            }
        });

        return settingsToInsert;
    },

    validators: {
        /**
         * Validates all settings against their defined validation rules.
         * @param {Object} model - Model instance.
         * @param {Object} options - Options object.
         * @returns {Promise}
         */
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

        /**
         * Validates labs settings against allowlist.
         * @param {Object} model - Model instance.
         * @param {Object} options - Options object.
         * @returns {Promise}
         */
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

        /**
         * Validates Stripe plans structure and values.
         * @param {Object} model - Model instance.
         * @param {Object} options - Options object.
         * @returns {Promise}
         */
        async stripe_plans(model, options) {
            const plans = JSON.parse(model.get('value'));

            for (const plan of plans) {
                if (!options.importing && plan.amount < 100 && plan.name !== 'Complimentary') {
                    throw new errors.ValidationError({
                        message: 'Plans cannot have an amount less than 1'
                    });
                }

                if (typeof plan.name !== 'string') {
                    throw new errors.ValidationError({message: 'Plan must have a name'});
                }

                if (typeof plan.currency !== 'string') {
                    throw new errors.ValidationError({message: 'Plan must have a currency'});
                }

                if (!['year', 'month', 'week', 'day'].includes(plan.interval)) {
                    throw new errors.ValidationError({
                        message: 'Plan interval must be one of: year, month, week or day'
                    });
                }
            }
        },

        /**
         * Validates Stripe secret key format.
         * @param {Object} model - Model instance.
         * @returns {Promise}
         */
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

        /**
         * Validates Stripe publishable key format.
         * @param {Object} model - Model instance.
         * @returns {Promise}
         */
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

        /**
         * Validates Stripe Connect secret key format.
         * @param {Object} model - Model instance.
         * @returns {Promise}
         */
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

        /**
         * Validates Stripe Connect publishable key format.
         * @param {Object} model - Model instance.
         * @returns {Promise}
         */
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