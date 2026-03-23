# Refactored Settings Model

## Key Issues Identified
1. **Duplicate keypair factory functions** (`getMembersKey`/`getGhostKey` are identical)
2. **Duplicate Stripe key validators** (secret/publishable patterns repeated for connect variants)
3. **Repeated boolean parsing logic** in `format`/`parse`
4. **Repeated URL fields array** defined in two places
5. **Verbose `edit` method** with nested callbacks
6. **Magic strings** scattered throughout

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

// ─── Constants ───────────────────────────────────────────────────────────────

const messages = {
    valueCannotBeBlank: 'Value in [settings.key] cannot be blank.',
    unableToFindSetting: 'Unable to find setting to update: {key}',
    notEnoughPermission: 'You do not have permission to perform this action'
};

const URL_TRANSFORM_KEYS = [
    'cover_image', 'logo', 'icon', 'portal_button_icon',
    'og_image', 'twitter_image', 'pintura_js_url', 'pintura_css_url'
];

const STRIPE_SECRET_KEY_REGEX = /(?:sk|rk)_(?:test|live)_[\da-zA-Z]{1,247}$/;
const STRIPE_PUBLISHABLE_KEY_REGEX = /pk_(?:test|live)_[\da-zA-Z]{1,247}$/;
const VALID_PLAN_INTERVALS = ['year', 'month', 'week', 'day'];

const internalContext = {context: {internal: true}};

// ─── Keypair Factory ─────────────────────────────────────────────────────────

/**
 * Creates a lazy-initialized keypair accessor.
 * The keypair is generated once on first access and cached thereafter.
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

// ─── Default Settings ────────────────────────────────────────────────────────

const DYNAMIC_DEFAULTS = {
    db_hash:                () => crypto.randomUUID(),
    public_hash:            () => crypto.randomBytes(15).toString('hex'),
    admin_session_secret:   () => crypto.randomBytes(32).toString('hex'),
    theme_session_secret:   () => crypto.randomBytes(32).toString('hex'),
    members_public_key:     () => getMembersKey('public'),
    members_private_key:    () => getMembersKey('private'),
    members_email_auth_secret: () => crypto.randomBytes(64).toString('hex'),
    members_otc_secret:     () => crypto.randomBytes(64).toString('hex'),
    ghost_public_key:       () => getGhostKey('public'),
    ghost_private_key:      () => getGhostKey('private'),
    site_uuid:              () => getOrGenerateSiteUuid(),
    indexnow_api_key:       () => crypto.randomBytes(16).toString('hex')
};

let defaultSettings;

/**
 * Flattens the categorised default settings into a single-level map,
 * attaching group/key metadata and a getDefaultValue helper to each entry.
 */
function parseDefaultSettings() {
    const defaultSettingsInCategories = require('../data/schema/').defaultSettings;

    return Object.entries(defaultSettingsInCategories).reduce((flat, [categoryName, settings]) => {
        Object.entries(settings).forEach(([settingName, setting]) => {
            flat[settingName] = {
                ...setting,
                group: categoryName,
                key: settingName,
                getDefaultValue() {
                    return DYNAMIC_DEFAULTS[settingName]?.() ?? setting.defaultValue;
                }
            };
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

// ─── Boolean Helpers ─────────────────────────────────────────────────────────

/**
 * Normalises a raw boolean-ish value to a proper JS boolean.
 * Handles '0'/'1' strings and 'true'/'false' strings.
 */
function parseBooleanValue(value) {
    if (value === '0' || value === '1') {
        return !!+value;
    }
    if (value === 'false' || value === 'true') {
        return JSON.parse(value);
    }
    return value;
}

// ─── Stripe Validator Factory ─────────────────────────────────────────────────

/**
 * Returns an async validator that checks a model's value against the given regex.
 * A null value is considered valid (key not yet configured).
 */
function createStripeKeyValidator(regex, fieldName) {
    return async function validateStripeKey(model) {
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
}

// ─── Settings Model ───────────────────────────────────────────────────────────

let Settings;

Settings = ghostBookshelf.Model.extend({

    tableName: 'settings',

    actionsCollectCRUD: true,
    actionsResourceType: 'setting',
    actionsExtraContext: ['key', 'group'],

    // ── Change Events ──────────────────────────────────────────────────────

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

    // ── Validation ─────────────────────────────────────────────────────────

    async onValidate(model, attr, options) {
        await ghostBookshelf.Model.prototype.onValidate.call(this, model, attr, options);
        await Settings.validators.all(model, options);

        const keyValidator = Settings.validators[model.get('key')];
        if (typeof keyValidator === 'function') {
            await keyValidator(model, options);
        }
    },

    // ── Serialisation ──────────────────────────────────────────────────────

    /**
     * Converts boolean values to their string representation for DB storage.
     */
    format() {
        const attrs = ghostBookshelf.Model.prototype.format.apply(this, arguments);

        if (attrs.type === 'boolean') {
            const parsed = parseBooleanValue(attrs.value);
            attrs.value = _.isBoolean(parsed) ? parsed.toString() : parsed;
        }

        return attrs;
    },

    /**
     * Transforms URL-type settings to a transport-ready format before writing.
     */
    formatOnWrite(attrs) {
        if (attrs.value && URL_TRANSFORM_KEYS.includes(attrs.key)) {
            attrs.value = urlUtils.toTransformReady(attrs.value);
        }
        return attrs;
    },

    /**
     * Converts stored boolean strings back to JS booleans, and resolves
     * stored URL placeholders to absolute URLs.
     */
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

    // ── Static Methods ─────────────────────────────────────────────────────

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

        const items = (Array.isArray(data) ? data : [data]).map(item =>
            item.toJSON ? item.toJSON() : item
        );

        const promises = items.map(item => this._editSingleSetting(item, options));
        return Promise.all(promises);
    },

    /**
     * Persists a single setting item, creating a validation error when the
     * key is missing or the setting cannot be found in the database.
     */
    async _editSingleSetting(rawItem, options) {
        if (!(_.isString(rawItem.key) && rawItem.key.length > 0)) {
            return Promise.reject(
                new errors.ValidationError({message: tpl(messages.valueCannotBeBlank)})
            );
        }

        // Stringify object values before filtering
        const item = this.filterData(
            _.isObject(rawItem.value)
                ? {...rawItem, value: JSON.stringify(rawItem.value)}
                : rawItem
        );

        const setting = await Settings.forge({key: item.key}).fetch(options);

        if (!setting) {
            return Promise.reject(
                new errors.NotFoundError({
                    message: tpl(messages.unableToFindSetting, {key: item.key})
                })
            );
        }

        if (options.importing) {
            return setting.save(item, options);
        }

        if (Object.prototype.hasOwnProperty.call(item, 'value')) {
            setting.set('value', item.value);
        }

        const isInternalContext = options.context?.internal;
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

        // Required for SQLite to pick up columns after DB init
        await ghostBookshelf.knex.destroy();
        await ghostBookshelf.knex.initialize();

        const allSettings = await this.findAll(options);
        const usedKeys = new Set(allSettings.models.map(s => s.get('key')));

        const settingsToInsert = Object.values(getDefaultSettings())
            .filter(s => !usedKeys.has(s.key))
            .map(s => ({...s, value: s.getDefaultValue()}));

        if (settingsToInsert.length === 0) {
            return allSettings;
        }

        const columnInfo = await ghostBookshelf.knex.table('settings').columnInfo();
        const columns = Object.keys(columnInfo);
        const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

        const rows = settingsToInsert.map(setting =>
            _.pick(
                {...setting, id: ObjectID().toHexString(), created_at: date, updated_at: date},
                columns
            )
        );

        await ghostBookshelf.knex.batchInsert('settings', rows);
        return this.findAll(options);
    },

    // ── Validators ─────────────────────────────────────────────────────────

    validators: {
        async all(model) {
            const settingName = model.get('key');
            const settingDefault = getDefaultSettings()[settingName];

            if (!settingDefault) {
                return;
            }

            const validationErrors = validator.validate(
                model.get('value'),
                settingName,
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

        stripe_secret_key: createStripeKeyValidator(
            STRIPE_SECRET_KEY_REGEX, 'stripe_secret_key'
        ),
        stripe_publishable_key: createStripeKeyValidator(
            STRIPE_PUBLISHABLE_KEY_REGEX, 'stripe_publishable_key'
        ),
        stripe_connect_secret_key: createStripeKeyValidator(
            STRIPE_SECRET_KEY_REGEX, 'stripe_secret_key'
        ),
        stripe_connect_publishable_key: createStripeKeyValidator(
            STRIPE_PUBLISHABLE_KEY_REGEX, 'stripe_publishable_key'
        )
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
| **Keypair factories** | Two identical IIFE closures | Single `createKeypairAccessor()` factory |
| **Boolean parsing** | Duplicated `if` chains in `format` and `parse` | Extracted `parseBooleanValue()` helper |
| **URL keys array** | Defined twice (in `formatOnWrite` and `parse`) | Single `URL_TRANSFORM_KEYS` constant |
| **Stripe validators** | Four near-identical async functions | `createStripeKeyValidator()` factory + two regex constants |
| **`edit` method** | Nested callbacks, mixed concerns | Extracted `_editSingleSetting()`, flattened with `async/await` |
| **`parseDefaultSettings`** | Nested `_.each` loops with mutation | `Object.entries().reduce()` with spread, no mutation |
| **`populateDefaults`** | `indexOf` check, manual map | `Set` for O(1) lookup, functional pipeline |
| **`labs` validator** | Iterated with `for...in` throwing inside loop | Collect invalid flags first, single throw |
| **Magic strings** | Inline regex and interval strings | Named constants (`STRIPE_SECRET_KEY_REGEX`, `VALID_PLAN_INTERVALS`) |