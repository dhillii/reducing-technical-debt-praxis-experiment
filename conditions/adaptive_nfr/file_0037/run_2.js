# Refactored Spam Prevention Module

The main issues are: massive code duplication in each brute-force factory function, scattered mutable state, and repetitive store initialization. I'll extract the common patterns into reusable abstractions.

```javascript
const moment = require('moment');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

// ---------------------------------------------------------------------------
// Constants & messages
// ---------------------------------------------------------------------------

const SPAM_CONFIG_KEYS = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

const messages = {
    forgottenPasswordEmail: {
        error: 'Only {rfa} forgotten password attempts per email every {rfp} seconds.',
        context: 'Forgotten password reset attempt failed'
    },
    forgottenPasswordIp: {
        error: 'Only {rfa} tries per IP address every {rfp} seconds.',
        context: 'Forgotten password reset attempt failed'
    },
    tooManySigninAttempts: {
        error: 'Only {rateSigninAttempts} tries per IP address every {rateSigninPeriod} seconds.',
        context: 'Too many login attempts.'
    },
    tooManyAttempts: 'Too many attempts.',
    tooManyOTCVerificationAttempts: {
        error: 'Too many attempts for this verification code.',
        context: 'Too many verification code attempts.'
    },
    webmentionsBlock: 'Too many mention attempts',
    emailPreviewBlock: 'Only 10 test emails can be sent per hour'
};

// ---------------------------------------------------------------------------
// Mutable state – isolated in a single object for easy reset
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SpamConfig
 * @property {Object} private_block
 * @property {Object} global_block
 * @property {Object} global_reset
 * @property {Object} user_reset
 * @property {Object} user_login
 * @property {Object} send_verification_code
 * @property {Object} user_verification
 * @property {Object} member_login
 * @property {Object} content_api_key
 * @property {Object} webmentions_block
 * @property {Object} email_preview_block
 * @property {Object} otc_verification_enumeration
 * @property {Object} otc_verification
 */

const state = {
    store: null,
    memoryStore: null,
    instances: {},
    spam: {},

    /** Reload spam config from the live config object */
    reloadSpamConfig() {
        this.spam = config.get('spam') || {};
    },

    /** Return a named spam sub-config, falling back to an empty object */
    spamConfig(key) {
        return this.spam[key] || {};
    }
};

state.reloadSpamConfig();

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

/**
 * Lazily create and cache the Knex-backed brute store.
 * @returns {import('brute-knex')}
 */
const getKnexStore = () => {
    if (!state.store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');

        state.store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }

    return state.store;
};

/**
 * Lazily create and cache the in-memory brute store.
 * @returns {import('express-brute').MemoryStore}
 */
const getMemoryStore = () => {
    if (!state.memoryStore) {
        const ExpressBrute = require('express-brute');
        state.memoryStore = new ExpressBrute.MemoryStore();
    }

    return state.memoryStore;
};

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ?? err
    });

    // express-brute does not always forward a callback
    // https://github.com/AdamPflug/express-brute/issues/45
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

// ---------------------------------------------------------------------------
// Fail-callback factories
// ---------------------------------------------------------------------------

/**
 * Build a standard rate-limit error with a "try again in X" message.
 * @param {string} message
 * @param {string} [context]
 * @param {string} [help]
 * @param {string} [code]
 */
const buildTimedError = (message, { context, help, code } = {}) =>
    (req, res, next, nextValidRequestDate) =>
        next(new errors.TooManyRequestsError({
            message: `${message} ${moment(nextValidRequestDate).fromNow(true)}`,
            ...(context && { context }),
            ...(help && { help }),
            ...(code && { code })
        }));

/**
 * Build a simple rate-limit error with a fixed message (no timestamp).
 * @param {string|Object} messageOrError  Plain string or a TooManyRequestsError options object.
 * @param {boolean} [shouldLog=false]
 */
const buildSimpleError = (messageOrError, shouldLog = false) =>
    (req, res, next) => {
        const err = new errors.TooManyRequestsError(
            typeof messageOrError === 'string'
                ? { message: messageOrError }
                : messageOrError
        );

        if (shouldLog) {
            logging.error(err);
        }

        return next(err);
    };

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

/**
 * Create (or return a cached) ExpressBrute instance.
 *
 * @param {string}   instanceKey   - Cache key inside `state.instances`
 * @param {Function} getStore      - Returns the backing store to use
 * @param {string}   spamConfigKey - Key into `state.spam` for rate-limit config
 * @param {Object}   bruteOptions  - Options merged with the spam config
 * @returns {import('express-brute')}
 */
const createBruteInstance = (instanceKey, getStore, spamConfigKey, bruteOptions) => {
    if (state.instances[instanceKey]) {
        return state.instances[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const spamCfg = state.spamConfig(spamConfigKey);

    state.instances[instanceKey] = new ExpressBrute(
        getStore(),
        {
            handleStoreError,
            ...bruteOptions,
            ...pick(spamCfg, SPAM_CONFIG_KEYS)
        }
    );

    return state.instances[instanceKey];
};

/** Shorthand for the common Knex-backed case */
const knexBrute = (instanceKey, spamConfigKey, bruteOptions) =>
    createBruteInstance(instanceKey, getKnexStore, spamConfigKey, bruteOptions);

// ---------------------------------------------------------------------------
// Public rate-limiter factories
// ---------------------------------------------------------------------------

/**
 * Locks a single endpoint based on excessive requests from an IP.
 * Defaults: 50 attempts per hour; endpoint locked for an hour.
 */
const globalBlock = () => knexBrute('globalBlock', 'global_block', {
    attachResetToRequest: false,
    failCallback: buildTimedError('Too many attempts try again in', {
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: state.spamConfig('global_block').freeRetries + 1 || 5,
            rfp: state.spamConfig('global_block').lifetime || 3600
        }),
        help: tpl(messages.tooManyAttempts)
    })
});

const globalReset = () => knexBrute('globalReset', 'global_reset', {
    attachResetToRequest: false,
    failCallback: buildTimedError('Too many attempts try again in', {
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: state.spamConfig('global_reset').freeRetries + 1 || 5,
            rfp: state.spamConfig('global_reset').lifetime || 3600
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    })
});

const webmentionsBlock = () => knexBrute('webmentionsBlock', 'webmentions_block', {
    attachResetToRequest: false,
    failCallback: buildSimpleError(messages.webmentionsBlock)
});

const emailPreviewBlock = () => knexBrute('emailPreviewBlock', 'email_preview_block', {
    attachResetToRequest: false,
    failCallback: buildSimpleError(messages.emailPreviewBlock)
});

/**
 * Rate-limits member sign-in attempts per IP.
 * Reset on successful login.
 */
const membersAuth = () => knexBrute('membersAuth', 'user_login', {
    attachResetToRequest: true,
    failCallback: buildTimedError('Too many sign-in attempts try again in', {
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    })
});

/**
 * Higher limits than membersAuth because it checks across all email addresses.
 */
const membersAuthEnumeration = () => knexBrute('membersAuthEnumeration', 'member_login', {
    attachResetToRequest: true,
    failCallback: buildTimedError('Too many different sign-in attempts, try again in', {
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    })
});

const otcVerificationEnumeration = () => knexBrute('otcVerificationEnumeration', 'otc_verification_enumeration', {
    attachResetToRequest: false,
    failCallback: buildTimedError('Too many verification attempts across multiple codes, try again in', {
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    })
});

const otcVerification = () => knexBrute('otcVerification', 'otc_verification', {
    attachResetToRequest: false,
    failCallback: buildTimedError('Too many attempts for this verification code, try again in', {
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    })
});

/**
 * Stops login attempts for a user+IP pair with an increasing back-off period.
 * Defaults: 5 attempts; reset on successful login.
 */
const userLogin = () => knexBrute('userLogin', 'user_login', {
    attachResetToRequest: true,
    failCallback: buildTimedError(
        'Too many login attempts. Please wait',
        {
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }
    )
});

/**
 * Stops password-reset requests: defaults to 5 attempts per hour per user+IP.
 */
const userReset = () => knexBrute('userReset', 'user_reset', {
    attachResetToRequest: true,
    failCallback: buildTimedError('Too many password reset attempts try again in', {
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: state.spamConfig('user_reset').freeRetries + 1 || 5,
            rfp: state.spamConfig('user_reset').lifetime || 3600
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    })
});

const userVerification = () => knexBrute('userVerification', 'user_verification', {
    attachResetToRequest: true,
    failCallback: buildSimpleError(tpl(messages.tooManyAttempts))
});

const sendVerificationCode = () => knexBrute('sendVerificationCode', 'send_verification_code', {
    attachResetToRequest: true,
    failCallback: buildSimpleError(tpl(messages.tooManyAttempts))
});

/**
 * Protects a private blog from spam.
 * Defaults: 10 attempts per IP per hour; locked for an hour.
 */
const privateBlog = () => knexBrute('privateBlog', 'private_block', {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: state.spamConfig('private_block').freeRetries + 1 || 5,
                rateSigninPeriod: state.spamConfig('private_block').lifetime || 3600
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
});

const contentApiKey = () => createBruteInstance(
    'contentApiKey',
    getMemoryStore,
    'content_api_key',
    {
        attachResetToRequest: true,
        failCallback: buildSimpleError(tpl(messages.tooManyAttempts), true)
    }
);

// ---------------------------------------------------------------------------
// Reset – clears all cached state (useful in tests)
// ---------------------------------------------------------------------------

const reset = () => {
    state.store = null;
    state.memoryStore = null;
    state.instances = {};
    state.reloadSpamConfig();
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    globalBlock,
    globalReset,
    userLogin,
    sendVerificationCode,
    userVerification,
    membersAuth,
    membersAuthEnumeration,
    otcVerification,
    otcVerificationEnumeration,
    userReset,
    privateBlog,
    contentApiKey,
    webmentionsBlock,
    emailPreviewBlock,
    reset
};
```

## Key Changes

| Problem | Solution |
|---|---|
| **Store initialization duplicated** in every function | `getKnexStore()` / `getMemoryStore()` lazy singletons |
| **`ExpressBrute` + `BruteKnex` + `db` required in every function** | Moved inside the store helpers, required once |
| **Instance caching via 14 separate `let` variables** | Single `state.instances` map keyed by name |
| **Spam config spread across 12 separate `let` variables** | `state.spam` + `state.spamConfig(key)` accessor |
| **`reset()` had to null 14 variables and re-assign 12 config vars** | Now just clears `state.instances`, two stores, and calls `reloadSpamConfig()` |
| **`extend({...}, pick(...))` pattern repeated everywhere** | `createBruteInstance` merges options + spam config in one place |
| **Fail-callback logic duplicated** | `buildTimedError` / `buildSimpleError` factories cover all variants |
| **`knexBrute` shorthand** | Removes the `getKnexStore` argument from every call site |