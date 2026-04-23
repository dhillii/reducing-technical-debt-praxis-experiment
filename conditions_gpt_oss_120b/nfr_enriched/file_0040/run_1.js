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
    let keypairCache;
    return function getKey(type) {
        if (!keypairCache) {
            keypairCache = keypair({bits: 1024});
        }
        return keypairCache[type];
    };
});

const getGhostKey = doBlock(() => {
    let keypairCache;
    return function getKey(type) {
        if (!keypairCache) {
            keypairCache = keypair({bits: 1024});
        }
        return keypairCache[type];
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
 * Validate that the item has a non‑empty string key.
 */
function ensureValidKey(item) {
    if (!(_.isString(item.key) && item.key.length > 0)) {
        throw new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)});
    }
}

/**
 * Convert object values to JSON strings.
 */
function stringifyObjectValue(item) {
    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }
}

/**
 * Prepare raw item data for saving.
 */
function prepareItem(item, self, options) {
    ensureValidKey(item);
    stringifyObjectValue(item);
    return self.filterData(item);
}

/**
 * Persist a single setting, handling import and normal edit flows.
 */
function persistSetting(item, options) {
    return Settings.forge({key: item.key}).fetch(options).then(setting => {
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

        return setting.hasChanged() ? setting.save(null, options) : setting;
    });
}

/**
 * Insert missing default settings into the database.
 */
async function insertMissingDefaults(missingDefaults, columns, date) {
    const settingsData = missingDefaults.map(setting => {
        const settingValues = {
            ...setting,
            id: ObjectID().toHexString(),
            created_at: date,
            updated_at: date
        };
        return _.pick(settingValues, columns);
    });

    await ghostBookshelf.knex.batchInsert('settings', settingsData);
}

/**
 * Determine which default settings are absent from the DB.
 */
function findMissingDefaults(allSettings, defaults) {
    const usedKeys = allSettings.models.map(s => s.get('key'));
    return _.filter(defaults, (def, key) => usedKeys.indexOf(key) === -1);
}

/**
 * Validate a single Stripe plan.
 */
function validateStripePlan(plan, importing) {
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

/**
 * Validate labs flags against the allowlist.
 */
function validateLabsFlags(flags) {
    for (const flag in flags) {
        if (!WRITABLE_KEYS_ALLOWLIST.includes(flag)) {
            throw new errors.ValidationError({
                message: `Settings lab value cannot have value other then ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
            });
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

        const promises = data.map(item => {
            if (item.toJSON) {
                item = item.toJSON();
            }
            const filtered = prepareItem(item, this, options);
            return persistSetting(filtered, options);
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
        const missingDefaults = findMissingDefaults(allSettings, getDefaultSettings());

        if (missingDefaults.length === 0) {
            return allSettings;
        }

        missingDefaults.forEach(def => {
            def.value = def.getDefaultValue();
        });

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        await insertMissingDefaults(missingDefaults, columns, date);
        return this.findAll(options);
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
            validateLabsFlags(flags);
        },

        async stripe_plans(model, options) {
            const plans = JSON.parse(model.get('value'));
            for (const plan of plans) {
                validateStripePlan(plan, options.importing);
            }
        },

        async stripe_secret_key(model) {
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(model.get('value'), regex, 'stripe_secret_key');
        },

        async stripe_publishable_key(model) {
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(model.get('value'), regex, 'stripe_publishable_key');
        },

        async stripe_connect_secret_key(model) {
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(model.get('value'), regex, 'stripe_secret_key');
        },

        async stripe_connect_publishable_key(model) {
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateStripeKey(model.get('value'), regex, 'stripe_publishable_key');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};