```javascript
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

/**
 * Parse default settings and flatten categories.
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
 * Convert boolean string values to proper boolean/string representation.
 * @param {Object} attrs
 */
function normalizeBoolean(attrs) {
    if (attrs.type !== 'boolean') {
        return;
    }

    if (['0', '1'].includes(attrs.value)) {
        attrs.value = !!+attrs.value;
    }

    if (['false', 'true'].includes(attrs.value)) {
        attrs.value = JSON.parse(attrs.value);
    }

    if (_.isBoolean(attrs.value)) {
        attrs.value = attrs.value.toString();
    }
}

/**
 * Transform URL values for specific keys.
 * @param {Object} attrs
 */
function transformUrlOnWrite(attrs) {
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
    if (attrs.value && urlKeys.includes(attrs.key)) {
        attrs.value = urlUtils.toTransformReady(attrs.value);
    }
}

/**
 * Transform stored URLs back to absolute form.
 * @param {Object} attrs
 */
function transformUrlOnRead(attrs) {
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
    if (urlKeys.includes(attrs.key)) {
        attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
    }
}

/**
 * Validate and process a single edit item.
 * @param {Object} item
 * @param {Object} options
 * @returns {Promise}
 */
function processEditItem(item, options) {
    if (item.toJSON) {
        item = item.toJSON();
    }

    if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
    }

    if (_.isObject(item.value)) {
        item.value = JSON.stringify(item.value);
    }

    const filtered = Settings.filterData(item);

    return Settings.forge({key: filtered.key}).fetch(options).then(setting => {
        if (!setting) {
            return Promise.reject(new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: filtered.key})}));
        }

        if (options.importing) {
            return setting.save(filtered, options);
        }

        if (Object.prototype.hasOwnProperty.call(filtered, 'value')) {
            setting.set('value', filtered.value);
        }

        if (options.context?.internal && Object.prototype.hasOwnProperty.call(filtered, 'type')) {
            setting.set('type', filtered.type);
        }

        return setting.hasChanged() ? setting.save(null, options) : setting;
    });
}

/**
 * Validate a Stripe plan.
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
 * Validate a regex pattern against a value.
 * @param {string} value
 * @param {RegExp} regex
 * @param {string} errorMessage
 */
function validateRegex(value, regex, errorMessage) {
    if (value === null) {
        return;
    }
    if (!regex.test(value)) {
        throw new errors.ValidationError({message: errorMessage});
    }
}

/**
 * Settings Model
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
        const validatorFn = Settings.validators[model.get('key')];
        if (typeof validatorFn === 'function') {
            await validatorFn(model, options);
        }
    },

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        normalizeBoolean(attrs);
        return attrs;
    },

    formatOnWrite(attrs) {
        transformUrlOnWrite(attrs);
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

    edit(data, unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'edit');
        const items = Array.isArray(data) ? data : [data];
        const promises = items.map(item => processEditItem(item, options));
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

        const settingsToInsert = [];
        _.each(getDefaultSettings(), (def, key) => {
            if (!usedKeys.includes(key)) {
                def.value = def.getDefaultValue();
                settingsToInsert.push(def);
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
        return this.findAll(options);
    },

    validators: {
        async all(model) {
            const settingName = model.get('key');
            const settingDefault = getDefaultSettings()[settingName];
            if (!settingDefault) {
                return;
            }
            const errorsList = validator.validate(
                model.get('value'),
                model.get('key'),
                settingDefault.validations,
                'settings'
            );
            if (errorsList.length) {
                throw new errors.ValidationError({message: errorsList.join('\n')});
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
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(model.get('value'), regex, `stripe_secret_key did not match ${regex}`);
        },

        async stripe_publishable_key(model) {
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(model.get('value'), regex, `stripe_publishable_key did not match ${regex}`);
        },

        async stripe_connect_secret_key(model) {
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(model.get('value'), regex, `stripe_secret_key did not match ${regex}`);
        },

        async stripe_connect_publishable_key(model) {
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            validateRegex(model.get('value'), regex, `stripe_publishable_key did not match ${regex}`);
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};
```