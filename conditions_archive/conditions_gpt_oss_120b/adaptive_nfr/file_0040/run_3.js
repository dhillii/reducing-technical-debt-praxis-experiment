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
    let pair;
    return type => {
        if (!pair) pair = keypair({bits: 1024});
        return pair[type];
    };
});

const getGhostKey = doBlock(() => {
    let pair;
    return type => {
        if (!pair) pair = keypair({bits: 1024});
        return pair[type];
    };
});

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

/* ---------- Helper predicates ---------- */

/**
 * @param {*} value
 * @returns {boolean}
 */
function isBooleanNumericString(value) {
    return value === '0' || value === '1';
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isBooleanLiteralString(value) {
    return value === 'false' || value === 'true';
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isUrlKey(key) {
    return urlKeys.includes(key);
}

/* ---------- Default settings parsing ---------- */

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

    for (const [categoryName, settings] of Object.entries(defaultSettingsInCategories)) {
        for (const [settingName, setting] of Object.entries(settings)) {
            setting.group = categoryName;
            setting.key = settingName;
            setting.getDefaultValue = () => {
                const dyn = dynamicDefault[setting.key];
                return dyn ? dyn() : setting.defaultValue;
            };
            flattened[settingName] = setting;
        }
    }

    return flattened;
}

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

/* ---------- Model definition ---------- */

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
        const specific = Settings.validators[model.get('key')];
        if (typeof specific === 'function') {
            await specific(model, options);
        }
    },

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);
        if (attrs.type !== 'boolean') {
            return attrs;
        }

        if (isBooleanNumericString(attrs.value)) {
            attrs.value = !!+attrs.value;
        } else if (isBooleanLiteralString(attrs.value)) {
            attrs.value = JSON.parse(attrs.value);
        }

        if (_.isBoolean(attrs.value)) {
            attrs.value = attrs.value.toString();
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
        const type = attrs.type;

        if (type === 'boolean') {
            if (isBooleanNumericString(attrs.value)) {
                attrs.value = !!+attrs.value;
            } else if (isBooleanLiteralString(attrs.value)) {
                attrs.value = JSON.parse(attrs.value);
            }
        }

        if (isUrlKey(attrs.key)) {
            attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
        }

        return attrs;
    }
}, {

    /* ---------- Static helpers ---------- */

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

        const items = Array.isArray(data) ? data : [data];

        const promises = items.map(item => {
            if (item.toJSON) item = item.toJSON();

            if (!(_.isString(item.key) && item.key.length > 0)) {
                return Promise.reject(new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)}));
            }

            if (_.isObject(item.value)) {
                item.value = JSON.stringify(item.value);
            }

            item = self.filterData(item);

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

                if (options.context?.internal && Object.prototype.hasOwnProperty.call(item, 'type')) {
                    setting.set('type', item.type);
                }

                return setting.hasChanged() ? setting.save(null, options) : setting;
            });
        });

        return Promise.all(promises);
    },

    async populateDefaults(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'populateDefaults');
        if (!options.context) options.context = internalContext.context;

        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = new Set(allSettings.models.map(s => s.get('key')));
        const toInsert = [];

        for (const [key, def] of Object.entries(getDefaultSettings())) {
            if (!usedKeys.has(key)) {
                def.value = def.getDefaultValue();
                toInsert.push(def);
            }
        }

        if (toInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const now = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const rows = toInsert.map(setting => {
            const base = {
                id: ObjectID().toHexString(),
                created_at: now,
                updated_at: now
            };
            const merged = {...setting, ...base};
            return _.pick(merged, columns);
        });

        await ghostBookshelf.knex.batchInsert('settings', rows);
        return this.findAll(options);
    },

    /* ---------- Validators ---------- */

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
            const flags = JSON.parse(model.get('value'));
            for (const flag of Object.keys(flags)) {
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
            const value = model.get('value');
            if (value === null) return;
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            if (!regex.test(value)) {
                throw new errors.ValidationError({message: `stripe_secret_key did not match ${regex}`});
            }
        },

        async stripe_publishable_key(model) {
            const value = model.get('value');
            if (value === null) return;
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            if (!regex.test(value)) {
                throw new errors.ValidationError({message: `stripe_publishable_key did not match ${regex}`});
            }
        },

        async stripe_connect_secret_key(model) {
            const value = model.get('value');
            if (value === null) return;
            const regex = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
            if (!regex.test(value)) {
                throw new errors.ValidationError({message: `stripe_secret_key did not match ${regex}`});
            }
        },

        async stripe_connect_publishable_key(model) {
            const value = model.get('value');
            if (value === null) return;
            const regex = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
            if (!regex.test(value)) {
                throw new errors.ValidationError({message: `stripe_publishable_key did not match ${regex}`});
            }
        }
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};
```