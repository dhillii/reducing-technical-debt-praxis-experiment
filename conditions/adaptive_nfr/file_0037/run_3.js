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

/** @returns {SpamConfig} */
const loadSpamConfig = () => {
    const spam = config.get('spam') || {};
    return {
        privateBlock: spam.private_block || {},
        globalBlock: spam.global_block || {},
        globalReset: spam.global_reset || {},
        userReset: spam.user_reset || {},
        userLogin: spam.user_login || {},
        sendVerificationCode: spam.send_verification_code || {},
        userVerification: spam.user_verification || {},
        memberLogin: spam.member_login || {},
        contentApiKey: spam.content_api_key || {},
        webmentionsBlock: spam.webmentions_block || {},
        emailPreviewBlock: spam.email_preview_block || {},
        otcVerificationEnumeration: spam.otc_verification_enumeration || {},
        otcVerification: spam.otc_verification || {}
    };
};

// Single mutable state container
const state = {
    spamConfig: loadSpamConfig(),
    /** @type {import('brute-knex')|null} */
    knexStore: null,
    /** @type {import('express-brute').MemoryStore|null} */
    memoryStore: null,
    /** @type {Map<string, import('express-brute')>} */
    instances: new Map()
};

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

const getKnexStore = () => {
    if (!state.knexStore) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        state.knexStore = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return state.knexStore;
};

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
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a TooManyRequestsError and pass it to `next`.
 *
 * @param {Function} next
 * @param {{ message: string, context?: string, help?: string, code?: string }} opts
 */
const rejectWith = (next, { message, context, help, code }) =>
    next(new errors.TooManyRequestsError({ message, context, help, code }));

/**
 * Format a "try again in X" message.
 *
 * @param {string} prefix
 * @param {Date} nextValidRequestDate
 */
const tryAgainIn = (prefix, nextValidRequestDate) =>
    `${prefix} ${moment(nextValidRequestDate).fromNow(true)}`;

/**
 * Create (or return a cached) ExpressBrute instance.
 *
 * @param {string}   key            - Unique cache key for this instance.
 * @param {Object}   store          - BruteKnex or MemoryStore instance.
 * @param {Object}   spamCfg        - Spam config slice (freeRetries, lifetime, …).
 * @param {Object}   bruteOptions   - attachResetToRequest + failCallback.
 * @returns {import('express-brute')}
 */
const createBruteInstance = (key, store, spamCfg, bruteOptions) => {
    if (state.instances.has(key)) {
        return state.instances.get(key);
    }

    const ExpressBrute = require('express-brute');
    const instance = new ExpressBrute(store, {
        handleStoreError,
        ...bruteOptions,
        ...pick(spamCfg, SPAM_CONFIG_KEYS)
    });

    state.instances.set(key, instance);
    return instance;
};

// Convenience wrapper for the common knex-backed case
const createKnexBruteInstance = (key, spamCfg, bruteOptions) =>
    createBruteInstance(key, getKnexStore(), spamCfg, bruteOptions);

// ---------------------------------------------------------------------------
// Public rate-limit factories
// ---------------------------------------------------------------------------

/**
 * Locks a single endpoint based on excessive requests from an IP.
 * Defaults: 50 attempts per hour; locks for an hour.
 */
const globalBlock = () => createKnexBruteInstance(
    'globalBlock',
    state.spamConfig.globalBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many attempts try again in', nextValidRequestDate),
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: state.spamConfig.globalBlock.freeRetries + 1 || 5,
                    rfp: state.spamConfig.globalBlock.lifetime || 3600
                }),
                help: tpl(messages.tooManyAttempts)
            });
        }
    }
);

const globalReset = () => createKnexBruteInstance(
    'globalReset',
    state.spamConfig.globalReset,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many attempts try again in', nextValidRequestDate),
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: state.spamConfig.globalReset.freeRetries + 1 || 5,
                    rfp: state.spamConfig.globalReset.lifetime || 3600
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            });
        }
    }
);

const webmentionsBlock = () => createKnexBruteInstance(
    'webmentionsBlock',
    state.spamConfig.webmentionsBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            rejectWith(next, { message: messages.webmentionsBlock });
        }
    }
);

const emailPreviewBlock = () => createKnexBruteInstance(
    'emailPreviewBlock',
    state.spamConfig.emailPreviewBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            rejectWith(next, { message: messages.emailPreviewBlock });
        }
    }
);

/**
 * Rate-limits member sign-in attempts per IP.
 * Reset on successful login.
 */
const membersAuth = () => createKnexBruteInstance(
    'membersAuth',
    state.spamConfig.userLogin,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many sign-in attempts try again in', nextValidRequestDate),
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            });
        }
    }
);

/**
 * Higher limits than membersAuth because it checks across all email addresses.
 */
const membersAuthEnumeration = () => createKnexBruteInstance(
    'membersAuthEnumeration',
    state.spamConfig.memberLogin,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many different sign-in attempts, try again in', nextValidRequestDate),
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            });
        }
    }
);

const otcVerificationEnumeration = () => createKnexBruteInstance(
    'otcVerificationEnumeration',
    state.spamConfig.otcVerificationEnumeration,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many verification attempts across multiple codes, try again in', nextValidRequestDate),
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            });
        }
    }
);

const otcVerification = () => createKnexBruteInstance(
    'otcVerification',
    state.spamConfig.otcVerification,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many attempts for this verification code, try again in', nextValidRequestDate),
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            });
        }
    }
);

/**
 * Stops login attempts for a user+IP pair with an increasing back-off period.
 * Defaults: 5 attempts per user+IP pair; reset on successful login.
 */
const userLogin = () => createKnexBruteInstance(
    'userLogin',
    state.spamConfig.userLogin,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            });
        }
    }
);

/**
 * Stops password-reset requests: defaults to 5 attempts per hour per user+IP.
 */
const userReset = () => createKnexBruteInstance(
    'userReset',
    state.spamConfig.userReset,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            rejectWith(next, {
                message: tryAgainIn('Too many password reset attempts try again in', nextValidRequestDate),
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: state.spamConfig.userReset.freeRetries + 1 || 5,
                    rfp: state.spamConfig.userReset.lifetime || 3600
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            });
        }
    }
);

const userVerification = () => createKnexBruteInstance(
    'userVerification',
    state.spamConfig.userVerification,
    {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            rejectWith(next, { message: tpl(messages.tooManyAttempts) });
        }
    }
);

const sendVerificationCode = () => createKnexBruteInstance(
    'sendVerificationCode',
    state.spamConfig.sendVerificationCode,
    {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            rejectWith(next, { message: tpl(messages.tooManyAttempts) });
        }
    }
);

/**
 * Protects a private blog from spam: defaults to 10 attempts per IP per hour.
 */
const privateBlog = () => createKnexBruteInstance(
    'privateBlog',
    state.spamConfig.privateBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: state.spamConfig.privateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: state.spamConfig.privateBlock.lifetime || 3600
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            rejectWith(next, {
                message: tryAgainIn('Too many private sign-in attempts try again in', nextValidRequestDate)
            });
        }
    }
);

const contentApiKey = () => createBruteInstance(
    'contentApiKey',
    getMemoryStore(),
    state.spamConfig.contentApiKey,
    {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        }
    }
);

// ---------------------------------------------------------------------------
// Reset – clears all cached instances and reloads config
// ---------------------------------------------------------------------------

const reset = () => {
    state.knexStore = null;
    state.memoryStore = null;
    state.instances.clear();
    state.spamConfig = loadSpamConfig();
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

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| ~15 near-identical factory functions | `createBruteInstance` / `createKnexBruteInstance` generic factories |
| Store initialization duplicated in every function | `getKnexStore()` / `getMemoryStore()` lazy singletons |
| ~15 separate `let` instance variables | Single `Map` (`state.instances`) keyed by name |
| ~13 separate spam config `let` variables | `loadSpamConfig()` returns a single structured object |
| Scattered mutable state | Consolidated into one `state` object |
| `reset()` had to null 15+ variables | Now just clears the Map and reloads config |
| Repeated `next(new errors.TooManyRequestsError(...))` | `rejectWith(next, opts)` helper |
| Repeated `"try again in " + moment(...)` | `tryAgainIn(prefix, date)` helper |
| Magic number `60 * 60` repeated | Named constant `3600` (self-documenting) |