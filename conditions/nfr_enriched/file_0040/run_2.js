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

// Constants
const IMAGE_KEYS = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];
const STRIPE_KEY_REGEX = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
const STRIPE_PUBLISHABLE_REGEX = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
const VALID_INTERVALS = ['year', 'month', 'week', 'day'];
const KEYPAIR_BITS = 1024;

let Settings;
let defaultSettings;

// Lazy-load keypairs
const createKeyPairCache = () => {
    let cached;
    return (bits = KEYPAIR_BITS) => {
        if (!cached) {
            cached = keypair({bits});
        }
        return cached;
    };
};

const getMembersKey = (() => {
    const getKeypair = createKeyPairCache();
    return (type) => getKeypair()[type];
})();

const getGhostKey = (() => {
    const getKeypair = createKeyPairCache();
    return (type) => getKeypair()[type];
})();

// Dynamic default value generators
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

function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    const defaultSettingsFlattened = {};

    _.each(defaultSettingsInCategories, (settings, categoryName) => {
        _.each(settings, (setting, settingName) => {
            setting.group = categoryName;
            setting.key = settingName;
            setting.getDefaultValue = () => {
                const generator = dynamicDefaults[setting.key];
                return generator ? generator() : setting.defaultValue;
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

function formatBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    if (_.isBoolean(value)) {
        return value.toString();
    }
    return value;
}

function isImageKey(key) {
    return IMAGE_KEYS.includes(key);
}

function validateStripeKey(value, regex, keyName) {
    if (value === null) {
        return;
    }
    if (!regex.test(value)) {
        throw new errors.ValidationError({
            message: `${keyName} did not match ${regex}`
        });
    }
}

function validateStripePlan(plan, isImporting) {
    if (!isImporting && plan.amount < 100 && plan.name !== 'Complimentary') {
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

    if (!VALID_INTERVALS.includes(plan.interval)) {
        throw new errors.ValidationError({
            message: 'Plan interval must be one of: year, month, week or day'
        });
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

        const keyValidator = Settings.validators[model.get('key')];
        if (typeof keyValidator === 'function') {
            await keyValidator(model, options);
        }
    },

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        if (attrs.type === 'boolean') {
            attrs.value = formatBooleanValue(attrs.value);
        }
        return attrs;
    },

    formatOnWrite(attrs) {
        if (attrs.value && isImageKey(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);

        if (attrs.type === 'boolean') {
            attrs.value = formatBooleanValue(attrs.value);
        }

        if (isImageKey(attrs.key)) {
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

                if (options.context?.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
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
        const usedKeys = allSettings.models.map((setting) => setting.get('key'));

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

        const settingsDataToInsert = settingsToInsert.map((setting) => {
            const settingValues = Object.assign({}, setting, {
                id: ObjectID().toHexString(),
                created_at: date,
                updated_at: date
            });
            return _.pick(settingValues, columns);
        });

        await ghostBookshelf.knex.batchInsert('settings', settingsDataToInsert);
        return self.findAll(options);
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
            plans.forEach((plan) => validateStripePlan(plan, options.importing));
        },

        async stripe_secret_key(model) {
            validateStripeKey(model.get('value'), STRIPE_KEY_REGEX, 'stripe_secret_key');
        },

        async stripe_publishable_key(model) {
            validateStripeKey(model.get('value'), STRIPE_PUBLISHABLE_REGEX, 'stripe_publishable_key');
        },

        async stripe_connect_secret_key(model) {
            validateStripeKey(model.get('value'), STRIPE_KEY_REGEX, 'stripe_secret_key');
        },

        async stripe_connect_publishable_key(model) {
            validateStripeKey(model.get('value'), STRIPE_PUBLISHABLE_REGEX, 'stripe_publishable_key');
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};
```