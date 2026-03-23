# Refactored Settings Model

Here's the refactored code with reduced complexity, eliminated duplication, and improved readability:

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

// -------------------------
// Constants & Configuration
// -------------------------

const messages = {
    valueCannotBeBlank: 'Value in [settings.key] cannot be blank.',
    unableToFindSetting: 'Unable to find setting to update: {key}',
    notEnoughPermission: 'You do not have permission to perform this action'
};

const internalContext = {context: {internal: true}};

const URL_TRANSFORM_KEYS = [
    'cover_image', 'logo', 'icon', 'portal_button_icon',
    'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'
];

const STRIPE_KEY_PATTERNS = {
    secret: /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/,
    publishable: /pk_(?:test|live)_[\da-zA-Z]{1,247}$/
};

const VALID_PLAN_INTERVALS = ['year', 'month', 'week', 'day'];

let Settings;
let defaultSettings;

// -------------------------
// Key Pair Generation
// -------------------------

/**
 * Creates a lazy-initialized keypair getter for a given key type.
 * Generates the keypair once and caches it.
 */
function createKeypairGetter() {
    let cachedKeypair;
    return function getKey(type) {
        if (!cachedKeypair) {
            cachedKeypair = keypair({bits: 1024});
        }
        return cachedKeypair[type];
    };
}

const getMembersKey = createKeypairGetter();
const getGhostKey = createKeypairGetter();

// -------------------------
// Default Settings
// -------------------------

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

    return Object.entries(defaultSettingsInCategories).reduce((flattened, [categoryName, settings]) => {
        Object.entries(settings).forEach(([settingName, setting]) => {
            flattened[settingName] = {
                ...setting,
                group: categoryName,
                key: settingName,
                getDefaultValue() {
                    return dynamicDefaults[settingName]?.() ?? setting.defaultValue;
                }
            };
        });
        return flattened;
    }, {});
}

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

// -------------------------
// Validators
// -------------------------

/**
 * Creates a Stripe key validator for a given key type and regex pattern.
 */
function createStripeKeyValidator(keyName, pattern) {
    return async function (model) {
        const value = model.get('value');
        if (value === null) {
            return;
        }
        if (!pattern.test(value)) {
            throw new errors.ValidationError({
                message: `${keyName} did not match ${pattern}`
            });
        }
    };
}

const validators = {
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
        const invalidFlags = Object.keys(flags).filter(flag => !WRITABLE_KEYS_ALLOWLIST.includes(flag));

        if (invalidFlags.length) {
            throw new errors.ValidationError({
                message: `Settings lab value cannot have value other than ${WRITABLE_KEYS_ALLOWLIST.join(', ')}`
            });
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
            if (!VALID_PLAN_INTERVALS.includes(plan.interval)) {
                throw new errors.ValidationError({
                    message: `Plan interval must be one of: ${VALID_PLAN_INTERVALS.join(', ')}`
                });
            }
        }
    },

    stripe_secret_key: createStripeKeyValidator('stripe_secret_key', STRIPE_KEY_PATTERNS.secret),
    stripe_publishable_key: createStripeKeyValidator('stripe_publishable_key', STRIPE_KEY_PATTERNS.publishable),
    stripe_connect_secret_key: createStripeKeyValidator('stripe_connect_secret_key', STRIPE_KEY_PATTERNS.secret),
    stripe_connect_publishable_key: createStripeKeyValidator('stripe_connect_publishable_key', STRIPE_KEY_PATTERNS.publishable)
};

// -------------------------
// Boolean Formatting Helpers
// -------------------------

function parseBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

function formatBooleanForStorage(value) {
    const parsed = parseBooleanValue(value);
    return _.isBoolean(parsed) ? parsed.toString() : parsed;
}

// -------------------------
// Settings Model
// -------------------------

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
            attrs.value = formatBooleanForStorage(attrs.value);
        }

        return attrs;
    },

    formatOnWrite(attrs) {
        if (attrs.value && URL_TRANSFORM_KEYS.includes(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);

        if (attrs.type === 'boolean') {
            attrs.value = parseBooleanValue(attrs.value);
        }

        if (URL_TRANSFORM_KEYS.includes(attrs.key)) {
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

        const items = (Array.isArray(data) ? data : [data]).map(item => item.toJSON ? item.toJSON() : item);

        const promises = items.map((item) => {
            if (!(_.isString(item.key) && item.key.length > 0)) {
                return Promise.reject(new errors.ValidationError({
                    message: tpl(messages.valueCannotBeBlank)
                }));
            }

            if (_.isObject(item.value)) {
                item.value = JSON.stringify(item.value);
            }

            item = self.filterData(item);

            return Settings.forge({key: item.key}).fetch(options).then((setting) => {
                if (!setting) {
                    return Promise.reject(new errors.NotFoundError({
                        message: tpl(messages.unableToFindSetting, {key: item.key})
                    }));
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

        if (!options.context) {
            options.context = internalContext.context;
        }

        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = new Set(allSettings.models.map(s => s.get('key')));

        const settingsToInsert = Object.entries(getDefaultSettings())
            .filter(([key]) => !usedKeys.has(key))
            .map(([, setting]) => ({...setting, value: setting.getDefaultValue()}));

        if (settingsToInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const settingsDataToInsert = settingsToInsert.map(setting =>
            _.pick(
                {...setting, id: ObjectID().toHexString(), created_at: date, updated_at: date},
                columns
            )
        );

        await ghostBookshelf.knex.batchInsert('settings', settingsDataToInsert);

        return this.findAll(options);
    },

    validators
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};
```

## Key Refactoring Changes

### 1. **Eliminated Duplicate `keypair` Logic**
- Replaced two identical IIFE-based keypair getters with a single `createKeypairGetter()` factory function.

### 2. **Eliminated Duplicate Stripe Validators**
- Replaced four nearly identical Stripe key validators with a `createStripeKeyValidator(keyName, pattern)` factory, reducing ~40 lines to 4.

### 3. **Extracted Constants**
- `URL_TRANSFORM_KEYS`, `STRIPE_KEY_PATTERNS`, and `VALID_PLAN_INTERVALS` are now named constants, removing magic arrays/values scattered throughout the code.

### 4. **Extracted Boolean Helpers**
- `parseBooleanValue()` and `formatBooleanForStorage()` consolidate the repeated boolean conversion logic used in both `format()` and `parse()`.

### 5. **Simplified `parseDefaultSettings`**
- Replaced nested `_.each` loops with `Object.entries().reduce()` and spread syntax for cleaner, more idiomatic code.

### 6. **Simplified `populateDefaults`**
- Used a `Set` for O(1) key lookups instead of `indexOf`.
- Replaced `_.each` with `Object.entries().filter().map()` for a more functional pipeline.

### 7. **Simplified `edit`**
- Normalized `data` to array and extracted `toJSON` mapping upfront.
- Used optional chaining (`options.context?.internal`) to reduce verbosity.
- Flattened the nested `if/else` in the fetch callback using early returns.

### 8. **Removed `doBlock` Helper**
- The `doBlock` utility was only used to create IIFEs — replaced by the named factory function.