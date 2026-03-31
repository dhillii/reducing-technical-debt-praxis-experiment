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
const IMAGE_KEYS = ['cover_image', 'logo', 'icon', 'portal_button_icon', 'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'];

let Settings;
let defaultSettings;

// Lazy-load keypairs with memoization
const createKeyPairLoader = () => {
    let cached;
    return (type) => {
        if (!cached) {
            cached = keypair({bits: 1024});
        }
        return cached[type];
    };
};

const getMembersKey = createKeyPairLoader();
const getGhostKey = createKeyPairLoader();

const createDynamicDefaults = () => ({
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
});

const flattenDefaultSettings = (categorizedSettings) => {
    const flattened = {};
    const dynamicDefaults = createDynamicDefaults();

    _.each(categorizedSettings, (settings, categoryName) => {
        _.each(settings, (setting, settingName) => {
            setting.group = categoryName;
            setting.key = settingName;
            setting.getDefaultValue = () => {
                const getDynamic = dynamicDefaults[setting.key];
                return getDynamic ? getDynamic() : setting.defaultValue;
            };
            flattened[settingName] = setting;
        });
    });

    return flattened;
};

const parseDefaultSettings = () => {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;
    return flattenDefaultSettings(defaultSettingsInCategories);
};

const getDefaultSettings = () => {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
};

const convertBooleanValue = (value) => {
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
};

const shouldTransformUrl = (key) => IMAGE_KEYS.includes(key);

const createStripeValidator = (regex, fieldName) => {
    return async (model) => {
        const value = model.get('value');
        if (value === null) {
            return;
        }
        if (!regex.test(value)) {
            throw new errors.ValidationError({
                message: `${fieldName} did not match ${regex}`
            });
        }
    };
};

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
            attrs.value = convertBooleanValue(attrs.value);
        }
        return attrs;
    },

    formatOnWrite(attrs) {
        if (attrs.value && shouldTransformUrl(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);

        if (attrs.type === 'boolean') {
            attrs.value = convertBooleanValue(attrs.value);
        }

        if (shouldTransformUrl(attrs.key)) {
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

        const promises = data.map(async (item) => {
            if (item.toJSON) {
                item = item.toJSON();
            }

            if (!(_.isString(item.key) && item.key.length > 0)) {
                throw new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)});
            }

            if (_.isObject(item.value)) {
                item.value = JSON.stringify(item.value);
            }

            item = self.filterData(item);

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

            if (options.context?.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
                setting.set('type', item.type);
            }

            if (setting.hasChanged()) {
                return setting.save(null, options);
            }

            return setting;
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
        },

        stripe_secret_key: createStripeValidator(
            /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/,
            'stripe_secret_key'
        ),

        stripe_publishable_key: createStripeValidator(
            /pk_(?:test|live)_[\da-zA-Z]{1,247}$/,
            'stripe_publishable_key'
        ),

        stripe_connect_secret_key: createStripeValidator(
            /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/,
            'stripe_secret_key'
        ),

        stripe_connect_publishable_key: createStripeValidator(
            /pk_(?:test|live)_[\da-zA-Z]{1,247}$/,
            'stripe_publishable_key'
        )
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid: getOrGenerateSiteUuid
};
```