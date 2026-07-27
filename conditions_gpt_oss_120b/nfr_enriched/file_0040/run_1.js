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
                return getDynamicDefault ? getDynamicDefault() : setting.defaultValue;
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
 * Validate a single edit payload item.
 * @param {Object} item
 * @returns {Promise<void>}
 */
function validateEditItem(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }

    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }

    return Promise.resolve();
}

/**
 * Prepare an item for saving (filter data, etc.).
 * @param {Object} item
 * @param {Object} self
 * @returns {Object}
 */
function prepareEditItem(item, self) {
    return self.filterData(item);
}

/**
 * Save or update a setting based on the provided item.
 * @param {Object} item
 * @param {Object} options
 * @param {Object} self
 * @returns {Promise<Object>}
 */
async function saveOrUpdateSetting(item, options, self) {
    const setting = await Settings.forge({key: item.key}).fetch(options);

    if (!setting) {
        throw new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})});
    }

    // Importing flag allows full overwrite
    if (options.importing) {
        return setting.save(item, options);
    }

    // Update mutable fields
    if (Object.prototype.hasOwnProperty.call(item, 'value')) {
        setting.set('value', item.value);
    }

    if (options.context && options.context.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
        setting.set('type', item.type);
    }

    // Persist only if something changed
    if (setting.hasChanged()) {
        return setting.save(null, options);
    }

    return setting;
}

/**
 * Build insert rows for missing default settings.
 * @param {Array} settingsToInsert
 * @param {Array} columns
 * @param {*} date
 * @returns {Array}
 */
function buildSettingsInsertRows(settingsToInsert, columns, date) {
    return settingsToInsert.map(setting => {
        const settingValues = {
            ...setting,
            id: ObjectID().toHexString(),
            created_at: date,
            updated_at: date
        };
        return _.pick(settingValues, columns);
    });
}

/**
 * Populate missing default settings.
 * @param {Object} unfilteredOptions
 * @returns {Promise<Object>}
 */
async function populateDefaults(unfilteredOptions) {
    const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
    const self = this;

    if (!options.context) {
        options.context = internalContext.context;
    }

    // Ensure SQLite schema is up‑to‑date
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

    const rows = buildSettingsInsertRows(settingsToInsert, columns, date);

    await ghostBookshelf.knex.batchInsert('settings', rows);
    return self.findAll(options);
}

/**
 * Validate Stripe plan objects.
 * @param {Object} plan
 * @param {Object} options
 */
function validateStripePlan(plan, options) {
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

/**
 * Validate a Stripe secret key.
 * @param {string} value
 * @param {RegExp} regex
 * @param {string} name
 */
function validateStripeKey(value, regex, name) {
    if (value === null) {
        return;
    }
    if (!regex.test(value)) {
        throw new errors.ValidationError({message: `${name} did not match ${regex}`});
    }
}

/**
 * Settings model definition.
 */
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

        const promises = data.map(async item => {
            if (item.toJSON) {
                item = item.toJSON();
            }

            await validateEditItem(item);
            item = prepareEditItem(item, self);
            return saveOrUpdateSetting(item, options, self);
        });

        return Promise.all(promises);
    },

    populateDefaults,

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
                validateStripePlan(plan, options);
            }
        },

        async stripe_secret_key(model) {
            const value = model.get('value');
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(value, regex, 'stripe_secret_key');
        },

        async stripe_publishable_key(model) {
            const value = model.get('value');
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(value, regex, 'stripe_publishable_key');
        },

        async stripe_connect_secret_key(model) {
            const value = model.get('value');
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(value, regex, 'stripe_secret_key');
        },

        async stripe_connect_publishable_key(model) {
            const value = model.get('value');
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(value, regex, 'stripe_publishable_key');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};