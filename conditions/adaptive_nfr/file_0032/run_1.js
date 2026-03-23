# Refactored Settings Model

## Key Issues Identified
1. **Duplicated keypair factory** (`getMembersKey`/`getGhostKey` are identical)
2. **Duplicated Stripe key validators** (secret/publishable patterns repeated for regular and connect keys)
3. **Duplicated boolean parsing logic** in `format`/`parse`
4. **Magic arrays** for URL-transformed keys repeated in two places
5. **Verbose `edit` method** with nested callbacks
6. **Inconsistent string concatenation** for event names

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

// ---------------------------------------------------------------------------
// Constants & messages
// ---------------------------------------------------------------------------

const messages = {
    valueCannotBeBlank: 'Value in [settings.key] cannot be blank.',
    unableToFindSetting: 'Unable to find setting to update: {key}',
    notEnoughPermission: 'You do not have permission to perform this action'
};

const internalContext = {context: {internal: true}};

/** Keys whose values are stored/retrieved as transform-ready URLs */
const URL_TRANSFORM_KEYS = [
    'cover_image', 'logo', 'icon', 'portal_button_icon',
    'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'
];

const STRIPE_SECRET_KEY_REGEX = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
const STRIPE_PUBLISHABLE_KEY_REGEX = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;

const VALID_PLAN_INTERVALS = ['year', 'month', 'week', 'day'];

let Settings;
let defaultSettings;

// ---------------------------------------------------------------------------
// Keypair factory
// ---------------------------------------------------------------------------

/**
 * Creates a lazy-initialised keypair accessor.
 * The keypair is generated once on first access and cached for the lifetime
 * of the process.
 */
function createKeypairAccessor() {
    let cachedKeypair;
    return function getKey(type) {
        if (!cachedKeypair) {
            cachedKeypair = keypair({bits: 1024});
        }
        return cachedKeypair[type];
    };
}

const getMembersKey = createKeypairAccessor();
const getGhostKey = createKeypairAccessor();

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

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

/**
 * Flattens the categorised default-settings schema into a single map,
 * attaching `group`, `key`, and a `getDefaultValue` helper to each entry.
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;

    return _.reduce(defaultSettingsInCategories, (flat, settings, categoryName) => {
        _.each(settings, (setting, settingName) => {
            flat[settingName] = Object.assign({}, setting, {
                group: categoryName,
                key: settingName,
                getDefaultValue() {
                    const getDynamic = dynamicDefaults[settingName];
                    return getDynamic ? getDynamic() : setting.defaultValue;
                }
            });
        });
        return flat;
    }, {});
}

function getDefaultSettings() {
    if (!defaultSettings) {
        defaultSettings = parseDefaultSettings();
    }
    return defaultSettings;
}

// ---------------------------------------------------------------------------
// Boolean coercion helpers
// ---------------------------------------------------------------------------

/**
 * Converts stored boolean string representations to a native boolean.
 * Accepts: '0'/'1', 'false'/'true', and native booleans.
 */
function coerceBooleanValue(value) {
    if (value === '0' || value === '1') {
        return Boolean(+value);
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Stripe key validator factory
// ---------------------------------------------------------------------------

/**
 * Returns an async validator that checks a Stripe key field against `regex`.
 * A `null` value is treated as "not configured" and passes validation.
 */
function createStripeKeyValidator(regex) {
    return async function (model) {
        const value = model.get('value');
        if (value === null) {
            return;
        }
        if (!regex.test(value)) {
            throw new errors.ValidationError({
                message: `${model.get('key')} did not match ${regex}`
            });
        }
    };
}

// ---------------------------------------------------------------------------
// Model definition
// ---------------------------------------------------------------------------

Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    // -------------------------------------------------------------------------
    // Event helpers
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    async onValidate(model, attr, options) {
        await ghostBookshelf.Model.prototype.onValidate.call(this, model, attr, options);
        await Settings.validators.all(model, options);

        const keyValidator = Settings.validators[model.get('key')];
        if (typeof keyValidator === 'function') {
            await keyValidator(model, options);
        }
    },

    // -------------------------------------------------------------------------
    // Serialisation
    // -------------------------------------------------------------------------

    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);

        if (attrs.type === 'boolean') {
            const coerced = coerceBooleanValue(attrs.value);
            // Store booleans as strings in the DB
            attrs.value = _.isBoolean(coerced) ? coerced.toString() : coerced;
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
            attrs.value = coerceBooleanValue(attrs.value);
        }

        if (URL_TRANSFORM_KEYS.includes(attrs.key)) {
            attrs.value = urlUtils.transformReadyToAbsolute(attrs.value);
        }

        return attrs;
    }

}, {
    // -------------------------------------------------------------------------
    // Static methods
    // -------------------------------------------------------------------------

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

        const promises = items.map(item => this._editSingleSetting(item, options));
        return Promise.all(promises);
    },

    /**
     * Persists a single setting item, creating a validation error when the key
     * is missing or the setting cannot be found in the database.
     */
    async _editSingleSetting(item, options) {
        if (item.toJSON) {
            item = item.toJSON();
        }

        if (!(_.isString(item.key) && item.key.length > 0)) {
            return Promise.reject(
                new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)})
            );
        }

        if (_.isObject(item.value)) {
            item.value = JSON.stringify(item.value);
        }

        item = this.filterData(item);

        const setting = await Settings.forge({key: item.key}).fetch(options);

        if (!setting) {
            return Promise.reject(
                new errors.NotFoundError({message: tpl(messages.unableToFindSetting, {key: item.key})})
            );
        }

        if (options.importing) {
            return setting.save(item, options);
        }

        if (Object.prototype.hasOwnProperty.call(item, 'value')) {
            setting.set('value', item.value);
        }

        const isInternalContext = options.context && options.context.internal;
        if (isInternalContext && Object.prototype.hasOwnProperty.call(item, 'type')) {
            setting.set('type', item.type);
        }

        return setting.hasChanged() ? setting.save(null, options) : setting;
    },

    async populateDefaults(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'populateDefaults');

        if (!options.context) {
            options.context = internalContext.context;
        }

        // Required for SQLite to pick up columns after DB initialisation
        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = new Set(allSettings.models.map(s => s.get('key')));

        const settingsToInsert = Object.values(getDefaultSettings())
            .filter(s => !usedKeys.has(s.key))
            .map(s => Object.assign({}, s, {value: s.getDefaultValue()}));

        if (settingsToInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const rows = settingsToInsert.map(setting =>
            _.pick(
                Object.assign({}, setting, {
                    id: ObjectID().toHexString(),
                    created_at: date,
                    updated_at: date
                }),
                columns
            )
        );

        await ghostBookshelf.knex.batchInsert('settings', rows);
        return this.findAll(options);
    },

    // -------------------------------------------------------------------------
    // Validators
    // -------------------------------------------------------------------------

    validators: {
        async all(model) {
            const settingDefault = getDefaultSettings()[model.get('key')];
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
            const invalidFlags = Object.keys(flags).filter(f => !WRITABLE_KEYS_ALLOWLIST.includes(f));

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
                if (!VALID_PLAN_INTERVALS.includes(plan.interval)) {
                    throw new errors.ValidationError({
                        message: `Plan interval must be one of: ${VALID_PLAN_INTERVALS.join(', ')}`
                    });
                }
            }
        },

        stripe_secret_key: createStripeKeyValidator(STRIPE_SECRET_KEY_REGEX),
        stripe_publishable_key: createStripeKeyValidator(STRIPE_PUBLISHABLE_KEY_REGEX),
        stripe_connect_secret_key: createStripeKeyValidator(STRIPE_SECRET_KEY_REGEX),
        stripe_connect_publishable_key: createStripeKeyValidator(STRIPE_PUBLISHABLE_KEY_REGEX)
    }
});

module.exports = {
    Settings: ghostBookshelf.model('Settings', Settings),
    getOrGenerateSiteUuid
};
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Keypair factory** | Two identical IIFE closures (`getMembersKey`, `getGhostKey`) | Single `createKeypairAccessor()` factory called twice |
| **Boolean coercion** | Duplicated `if` chains in both `format` and `parse` | Extracted `coerceBooleanValue()` helper |
| **URL key list** | Repeated inline array in `formatOnWrite` and `parse` | Single `URL_TRANSFORM_KEYS` constant |
| **Stripe validators** | Four near-identical async functions | `createStripeKeyValidator(regex)` factory; four one-liners |
| **`edit` method** | Deep callback nesting with `then` chains | Extracted `_editSingleSetting` async method |
| **`populateDefaults`** | Manual `indexOf` + `_.each` loop | `Set` lookup + `filter`/`map` pipeline |
| **String concatenation** | `'settings' + '.' + event` | Template literals throughout |
| **`parseDefaultSettings`** | Mutates original schema objects | Uses `Object.assign` to avoid side-effects |