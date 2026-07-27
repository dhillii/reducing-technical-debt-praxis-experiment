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

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/**
 * Validate that the item has a non‑empty key.
 */
function validateItemKey(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }
    return Promise.resolve(item);
}

/**
 * Convert object values to JSON strings.
 */
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
    return item;
}

/**
 * Apply model‑specific filtering.
 */
function filterItemData(item) {
    return Settings.filterData(item);
}

/**
 * Save or update a setting based on the provided item.
 */
function fetchAndUpdateSetting(item, options) {
    return Settings.forge({key: item.key}).fetch(options).then(setting => {
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
}

/**
 * Process a single edit item.
 */
function processEditItem(item, self, options) {
    if (item.toJSON) {
        item = item.toJSON();
    }
    return validateItemKey(item)
        .then(stringifyObjectValue)
        .then(filterItemData)
        .then(item => fetchAndUpdateSetting(item, options));
}

/**
 * Build an array of promises for editing settings.
 */
function buildEditPromises(data, self, options) {
    return data.map(item => processEditItem(item, self, options));
}

/**
 * Prepare setting values for bulk insert using spread syntax.
 */
function buildSettingInsertValues(setting, columns, date) {
    const settingValues = {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: date,
        updated_at: date
    };
    return _.pick(settingValues, columns);
}

/**
 * Insert missing default settings into the database.
 */
async function insertMissingDefaults(settingsToInsert, columns, date, options) {
    const settingsDataToInsert = settingsToInsert.map(setting => buildSettingInsertValues(setting, columns, date));
    await ghostBookshelf.knex.batchInsert('settings', settingsDataToInsert);
    return Settings.findAll(options);
}

/**
 * Populate default settings if they are missing.
 */
async function populateDefaultsInternal(unfilteredOptions) {
    const options = Settings.filterOptions(unfilteredOptions, 'populateDefaults');
    if (!options.context) {
        options.context = internalContext.context;
    }

    await ghostBookshelf.knex.destroy();
    await ghostBookshelf.knex.initialize();

    const allSettings = await Settings.findAll(options);
    const usedKeys = allSettings.models.map(setting => setting.get('key'));

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

    return insertMissingDefaults(settingsToInsert, columns, date, options);
}

/**
 * Validate labs flags against allowlist.
 */
async function validateLabsFlags(model) {
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
 * Validate Stripe plan objects.
 */
async function validateStripePlans(model, options) {
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
}

/**
 * Generic regex validator for Stripe keys.
 */
function validateStripeKey(value, regex, keyName) {
    if (value === null) {
        return;
    }
    if (!regex.test(value)) {
        throw new errors.ValidationError({message: `${keyName} did not match ${regex}`});
    }
}

/**
 * Validate a Stripe secret key.
 */
async function validateStripeSecretKey(model) {
    const value = model.get('value');
    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    validateStripeKey(value, secretKeyRegex, 'stripe_secret_key');
}

/**
 * Validate a Stripe publishable key.
 */
async function validateStripePublishableKey(model) {
    const value = model.get('value');
    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
    validateStripeKey(value, publishableKeyRegex, 'stripe_publishable_key');
}

/**
 * Validate a Stripe connect secret key.
 */
async function validateStripeConnectSecretKey(model) {
    const value = model.get('value');
    const secretKeyRegex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    validateStripeKey(value, secretKeyRegex, 'stripe_secret_key');
}

/**
 * Validate a Stripe connect publishable key.
 */
async function validateStripeConnectPublishableKey(model) {
    const value = model.get('value');
    const publishableKeyRegex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
    validateStripeKey(value, publishableKeyRegex, 'stripe_publishable_key');
}

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
        if (attrs.type === 'boolean') {
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
        if (attrs.type === 'boolean' && (attrs.value === '0' || attrs.value === '1')) {
            attrs.value = !!+attrs.value;
        }
        if (attrs.type === 'boolean' && (attrs.value === 'false' || attrs.value === 'true')) {
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

    edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        if (!Array.isArray(data)) {
            data = [data];
        }
        const promises = buildEditPromises(data, this, options);
        return Promise.all(promises);
    },

    async populateDefaults(unfilteredOptions) {
        return populateDefaultsInternal(unfilteredOptions);
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
            await validateLabsFlags(model);
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