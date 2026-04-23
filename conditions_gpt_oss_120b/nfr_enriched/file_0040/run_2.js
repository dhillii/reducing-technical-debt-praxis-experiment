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
 * Flattens default settings schema and attaches dynamic default generators.
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const flattened = {};

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
            flattened[settingName] = setting;
        });
    });

    return flattened;
}

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/**
 * Determines if a value is a string representation of a boolean.
 */
function isBooleanString(value) {
    return value === '0' || value === '1' || value === 'true' || value === 'false';
}

/**
 * Normalizes boolean string values to proper boolean types.
 */
function normalizeBoolean(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'true' || value === 'false') {
        return JSON.parse(value);
    }
    return value;
}

/**
 * Checks if a setting key refers to an image or URL field.
 */
function isUrlKey(key) {
    const urlKeys = [
        'cover_image', 'logo', 'icon', 'portal_button_icon',
        'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'
    ];
    return urlKeys.includes(key);
}

/**
 * Prepares a setting object for insertion, adding required columns.
 */
function prepareInsertData(setting, columns, timestamp) {
    const base = {
        ...setting,
        id: ObjectID().toHexString(),
        created_at: timestamp,
        updated_at: timestamp
    };
    return _.pick(base, columns);
}

/**
 * Filters and validates incoming setting data.
 */
function filterAndValidateItem(item, options) {
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
 * Updates or creates a single setting record.
 */
async function upsertSetting(item, options) {
    const existing = await Settings.forge({key: item.key}).fetch(options);
    if (!existing) {
        throw new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})});
    }

    if (options.importing) {
        return existing.save(item, options);
    }

    if (Object.prototype.hasOwnProperty.call(item, 'value')) {
        existing.set('value', item.value);
    }
    if (options.context?.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
        existing.set('type', item.type);
    }

    return existing.hasChanged() ? existing.save(null, options) : existing;
}

/**
 * Validates lab flags against the allowlist.
 */
function validateLabFlags(value) {
    const flags = JSON.parse(value);
    for (const flag in flags) {
        if (!WRITABLE_KEYS_ALLOWLIST.includes(flag)) {
            throw new errors.ValidationError({
                message: `Settings lab value cannot have value other then ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
            });
        }
    }
}

/**
 * Validates Stripe plan objects.
 */
function validateStripePlans(plans, importing) {
    for (const plan of plans) {
        if (!importing && plan.amount < 100 && plan.name !== 'Complimentary') {
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
 * Validates a Stripe secret key format.
 */
function validateStripeSecretKey(value, fieldName) {
    if (value === null) return;
    const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!regex.test(value)) {
        throw new errors.ValidationError({message: `${fieldName} did not match ${regex}`});
    }
}

/**
 * Validates a Stripe publishable key format.
 */
function validateStripePublishableKey(value, fieldName) {
    if (value === null) return;
    const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
    if (!regex.test(value)) {
        throw new errors.ValidationError({message: `${fieldName} did not match ${regex}`});
    }
}

// Model definition
Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',
    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    emitChange(event, options) {
        const trigger = `settings.${event}`;
        ghostBookshelf.Model.prototype.emitChange.bind(this)(this, trigger, options);
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
        if (attrs.type === 'boolean' && isBooleanString(attrs.value)) {
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
        if (attrs.type === 'boolean' && isBooleanString(attrs.value)) {
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

    async edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        const items = Array.isArray(data) ? data : [data];
        const promises = items.map(async (rawItem) => {
            const item = filterAndValidateItem(rawItem, options);
            return upsertSetting(item, options);
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
        const usedKeys = allSettings.models.map(s => s.get('key'));
        const toInsert = [];

        _.each(getDefaultSettings(), (def, key) => {
            if (!usedKeys.includes(key)) {
                def.value = def.getDefaultValue();
                toInsert.push(def);
            }
        });

        if (toInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const timestamp = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const insertData = toInsert.map(setting => prepareInsertData(setting, columns, timestamp));

        await ghostBookshelf.knex.batchInsert('settings', insertData);
        return this.findAll(options);
    },

    validators: {
        async all(model) {
            const name = model.get('key');
            const def = getDefaultSettings()[name];
            if (!def) return;

            const errorsList = validator.validate(
                model.get('value'),
                model.get('key'),
                def.validations,
                'settings'
            );

            if (errorsList.length) {
                throw new errors.ValidationError({message: errorsList.join('\n')});
            }
        },

        async labs(model) {
            validateLabFlags(model.get('value'));
        },

        async stripe_plans(model, options) {
            const plans = JSON.parse(model.get('value'));
            validateStripePlans(plans, options.importing);
        },

        async stripe_secret_key(model) {
            validateStripeSecretKey(model.get('value'), 'stripe_secret_key');
        },

        async stripe_publishable_key(model) {
            validateStripePublishableKey(model.get('value'), 'stripe_publishable_key');
        },

        async stripe_connect_secret_key(model) {
            validateStripeSecretKey(model.get('value'), 'stripe_secret_key');
        },

        async stripe_connect_publishable_key(model) {
            validateStripePublishableKey(model.get('value'), 'stripe_publishable_key');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};