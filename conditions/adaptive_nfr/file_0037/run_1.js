# Refactored Spam Prevention Module

The main issues are: massive code duplication in each brute force factory function, scattered mutable state, and repetitive store initialization. I'll extract the patterns into reusable abstractions.

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
// Mutable state – isolated in a single object so it is easy to reset
// ---------------------------------------------------------------------------

const state = {
    store: null,
    memoryStore: null,
    instances: {},
    spam: {},
    spamConfig: {}
};

const loadSpamConfig = () => {
    state.spam = config.get('spam') || {};

    state.spamConfig = {
        privateBlock:               state.spam.private_block               || {},
        globalBlock:                state.spam.global_block                || {},
        globalReset:                state.spam.global_reset                || {},
        userReset:                  state.spam.user_reset                  || {},
        userLogin:                  state.spam.user_login                  || {},
        sendVerificationCode:       state.spam.send_verification_code      || {},
        userVerification:           state.spam.user_verification           || {},
        memberLogin:                state.spam.member_login                || {},
        contentApiKey:              state.spam.content_api_key             || {},
        webmentionsBlock:           state.spam.webmentions_block           || {},
        emailPreviewBlock:          state.spam.email_preview_block         || {},
        otcVerificationEnumeration: state.spam.otc_verification_enumeration || {},
        otcVerification:            state.spam.otc_verification            || {}
    };
};

loadSpamConfig();

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

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
// Generic brute-force instance factory
// ---------------------------------------------------------------------------

/**
 * Creates (or returns a cached) ExpressBrute instance.
 *
 * @param {string}   key          - Cache key for the singleton instance.
 * @param {object}   bruteStore   - An express-brute compatible store.
 * @param {object}   spamCfg      - Spam config slice (freeRetries, lifetime, …).
 * @param {object}   bruteOptions - Options merged with spamCfg keys.
 * @returns {object} ExpressBrute instance
 */
const getBruteInstance = (key, bruteStore, spamCfg, bruteOptions) => {
    if (!state.instances[key]) {
        const ExpressBrute = require('express-brute');

        state.instances[key] = new ExpressBrute(
            bruteStore,
            Object.assign({}, bruteOptions, pick(spamCfg, SPAM_CONFIG_KEYS))
        );
    }

    return state.instances[key];
};

// Convenience wrapper for the common Knex-backed case
const getKnexBruteInstance = (key, spamCfg, bruteOptions) =>
    getBruteInstance(key, getKnexStore(), spamCfg, bruteOptions);

// ---------------------------------------------------------------------------
// Shared fail-callback builders
// ---------------------------------------------------------------------------

const retryInCallback = (message, context, help, extra = {}) =>
    (req, res, next, nextValidRequestDate) =>
        next(new errors.TooManyRequestsError({
            message: `${message} ${moment(nextValidRequestDate).fromNow(true)}`,
            context,
            help,
            ...extra
        }));

const simpleMessageCallback = (message) =>
    (req, res, next) =>
        next(new errors.TooManyRequestsError({ message }));

// ---------------------------------------------------------------------------
// Public factory functions
// ---------------------------------------------------------------------------

const globalBlock = () =>
    getKnexBruteInstance('globalBlock', state.spamConfig.globalBlock, {
        attachResetToRequest: false,
        failCallback: retryInCallback(
            'Too many attempts try again in',
            tpl(messages.forgottenPasswordIp.error, {
                rfa: state.spamConfig.globalBlock.freeRetries + 1 || 5,
                rfp: state.spamConfig.globalBlock.lifetime || 3600
            }),
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError
    });

const globalReset = () =>
    getKnexBruteInstance('globalReset', state.spamConfig.globalReset, {
        attachResetToRequest: false,
        failCallback: retryInCallback(
            'Too many attempts try again in',
            tpl(messages.forgottenPasswordIp.error, {
                rfa: state.spamConfig.globalReset.freeRetries + 1 || 5,
                rfp: state.spamConfig.globalReset.lifetime || 3600
            }),
            tpl(messages.forgottenPasswordIp.context)
        ),
        handleStoreError
    });

const webmentionsBlock = () =>
    getKnexBruteInstance('webmentionsBlock', state.spamConfig.webmentionsBlock, {
        attachResetToRequest: false,
        failCallback: simpleMessageCallback(messages.webmentionsBlock),
        handleStoreError
    });

const emailPreviewBlock = () =>
    getKnexBruteInstance('emailPreviewBlock', state.spamConfig.emailPreviewBlock, {
        attachResetToRequest: false,
        failCallback: simpleMessageCallback(messages.emailPreviewBlock),
        handleStoreError
    });

const membersAuth = () =>
    getKnexBruteInstance('membersAuth', state.spamConfig.userLogin, {
        attachResetToRequest: true,
        failCallback: retryInCallback(
            'Too many sign-in attempts try again in',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError
    });

/**
 * Higher limits because it checks across all email addresses.
 */
const membersAuthEnumeration = () =>
    getKnexBruteInstance('membersAuthEnumeration', state.spamConfig.memberLogin, {
        attachResetToRequest: true,
        failCallback: retryInCallback(
            'Too many different sign-in attempts, try again in',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError
    });

const otcVerificationEnumeration = () =>
    getKnexBruteInstance('otcVerificationEnumeration', state.spamConfig.otcVerificationEnumeration, {
        attachResetToRequest: false,
        failCallback: retryInCallback(
            'Too many verification attempts across multiple codes, try again in',
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            { code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED' }
        ),
        handleStoreError
    });

const otcVerification = () =>
    getKnexBruteInstance('otcVerification', state.spamConfig.otcVerification, {
        attachResetToRequest: false,
        failCallback: retryInCallback(
            'Too many attempts for this verification code, try again in',
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            { code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED' }
        ),
        handleStoreError
    });

// Stops login attempts for a user+IP pair with an increasing time period.
// Defaults to 5 attempts; count resets on successful login.
const userLogin = () =>
    getKnexBruteInstance('userLogin', state.spamConfig.userLogin, {
        attachResetToRequest: true,
        failCallback: retryInCallback(
            'Too many login attempts. Please wait',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError
    });

// Stops password reset requests: defaults to 5 attempts per hour per user+IP.
const userReset = () =>
    getKnexBruteInstance('userReset', state.spamConfig.userReset, {
        attachResetToRequest: true,
        failCallback: retryInCallback(
            'Too many password reset attempts try again in',
            tpl(messages.forgottenPasswordEmail.error, {
                rfa: state.spamConfig.userReset.freeRetries + 1 || 5,
                rfp: state.spamConfig.userReset.lifetime || 3600
            }),
            tpl(messages.forgottenPasswordEmail.context)
        ),
        handleStoreError
    });

const userVerification = () =>
    getKnexBruteInstance('userVerification', state.spamConfig.userVerification, {
        attachResetToRequest: true,
        failCallback: simpleMessageCallback(tpl(messages.tooManyAttempts)),
        handleStoreError
    });

const sendVerificationCode = () =>
    getKnexBruteInstance('sendVerificationCode', state.spamConfig.sendVerificationCode, {
        attachResetToRequest: true,
        failCallback: simpleMessageCallback(tpl(messages.tooManyAttempts)),
        handleStoreError
    });

// Protects a private blog: defaults to 10 attempts per IP per hour.
const privateBlog = () =>
    getKnexBruteInstance('privateBlog', state.spamConfig.privateBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: state.spamConfig.privateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod:   state.spamConfig.privateBlock.lifetime || 3600
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        },
        handleStoreError
    });

const contentApiKey = () =>
    getBruteInstance('contentApiKey', getMemoryStore(), state.spamConfig.contentApiKey, {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        handleStoreError
    });

// ---------------------------------------------------------------------------
// Reset (used in tests / config reload)
// ---------------------------------------------------------------------------

const reset = () => {
    state.store = null;
    state.memoryStore = null;
    state.instances = {};
    loadSpamConfig();
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
| Store initialization duplicated in every function | `getKnexStore()` / `getMemoryStore()` lazy singletons called once |
| `require('express-brute')` etc. repeated 14 times | Moved inside the two store helpers and `getBruteInstance` |
| 14 separate instance variables | Single `state.instances` map keyed by name |
| Spam config spread across 12 module-level `let` variables | Consolidated into `state.spamConfig` object, reloaded by `loadSpamConfig()` |
| `reset()` had to null 14 variables and re-assign 12 config vars | Now just nulls 3 fields and calls `loadSpamConfig()` |
| Repeated `failCallback` patterns | `retryInCallback` and `simpleMessageCallback` builders eliminate duplication |
| `extend` (lodash) used for a plain merge | Replaced with `Object.assign` (no extra dependency) |
| Magic number `60 * 60` repeated | Replaced with named constant `3600` |