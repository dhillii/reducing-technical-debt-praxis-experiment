Here's the refactored code with reduced complexity through abstraction of repeated patterns:

```javascript
const moment = require('moment');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Spam Config ─────────────────────────────────────────────────────────────

let spamConfig = loadSpamConfig();

function loadSpamConfig() {
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
}

// ─── Store Management ────────────────────────────────────────────────────────

let store = null;
let memoryStore = null;

function getKnexStore() {
    if (!store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        store = new BruteKnex({ tablename: 'brute', createTable: false, knex: db.knex });
    }
    return store;
}

function getMemoryStore() {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

// ─── Error Handling ──────────────────────────────────────────────────────────

const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ?? err
    });

    // express-brute does not always forward a callback
    // reset is used as a synchronous call, so we log the error if it occurs
    // see https://github.com/AdamPflug/express-brute/issues/45
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

// ─── Brute Instance Factory ──────────────────────────────────────────────────

/**
 * Creates or returns a cached ExpressBrute instance.
 *
 * @param {object|null} cachedInstance - Existing instance reference (or null)
 * @param {object} spamConfigEntry     - Spam config section to pick keys from
 * @param {object} bruteOptions        - ExpressBrute-specific options (attachResetToRequest, failCallback)
 * @param {Function} [storeFactory]    - Function returning the store to use (defaults to knex store)
 * @returns {object} ExpressBrute instance
 */
function createBruteInstance(cachedInstance, spamConfigEntry, bruteOptions, storeFactory = getKnexStore) {
    if (cachedInstance) {
        return cachedInstance;
    }

    const ExpressBrute = require('express-brute');
    const instanceStore = storeFactory();

    return new ExpressBrute(instanceStore, {
        handleStoreError,
        ...bruteOptions,
        ...pick(spamConfigEntry, SPAM_CONFIG_KEYS)
    });
}

// ─── Fail Callback Helpers ───────────────────────────────────────────────────

const tooManyAttemptsCallback = (req, res, next) =>
    next(new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) }));

function retryAfterCallback(message) {
    return (req, res, next, nextValidRequestDate) =>
        next(new errors.TooManyRequestsError({
            message: `${message} ${moment(nextValidRequestDate).fromNow(true)}`
        }));
}

function retryAfterWithContextCallback(message, contextMessage, helpMessage) {
    return (req, res, next, nextValidRequestDate) =>
        next(new errors.TooManyRequestsError({
            message: `${message} ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(contextMessage),
            help: tpl(helpMessage ?? contextMessage)
        }));
}

function retryAfterWithTemplatedContextCallback(message, errorTemplate, contextMessage, templateVars) {
    return (req, res, next, nextValidRequestDate) =>
        next(new errors.TooManyRequestsError({
            message: `${message} ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(errorTemplate, templateVars()),
            help: tpl(contextMessage)
        }));
}

// ─── Spam Protection Instances ───────────────────────────────────────────────

const instances = {};

/**
 * Locks a single endpoint based on excessive requests from an IP.
 * Defaults: 50 attempts per hour, locks for an hour.
 */
const globalBlock = () => {
    instances.globalBlock = createBruteInstance(
        instances.globalBlock,
        spamConfig.globalBlock,
        {
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamConfig.globalBlock.freeRetries + 1 || 5,
                        rfp: spamConfig.globalBlock.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            }
        }
    );
    return instances.globalBlock;
};

const globalReset = () => {
    instances.globalReset = createBruteInstance(
        instances.globalReset,
        spamConfig.globalReset,
        {
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamConfig.globalReset.freeRetries + 1 || 5,
                        rfp: spamConfig.globalReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            }
        }
    );
    return instances.globalReset;
};

const webmentionsBlock = () => {
    instances.webmentionsBlock = createBruteInstance(
        instances.webmentionsBlock,
        spamConfig.webmentionsBlock,
        {
            attachResetToRequest: false,
            failCallback: (req, res, next) =>
                next(new errors.TooManyRequestsError({ message: messages.webmentionsBlock }))
        }
    );
    return instances.webmentionsBlock;
};

const emailPreviewBlock = () => {
    instances.emailPreviewBlock = createBruteInstance(
        instances.emailPreviewBlock,
        spamConfig.emailPreviewBlock,
        {
            attachResetToRequest: false,
            failCallback: (req, res, next) =>
                next(new errors.TooManyRequestsError({ message: messages.emailPreviewBlock }))
        }
    );
    return instances.emailPreviewBlock;
};

const membersAuth = () => {
    instances.membersAuth = createBruteInstance(
        instances.membersAuth,
        spamConfig.userLogin,
        {
            attachResetToRequest: true,
            failCallback: retryAfterWithContextCallback(
                'Too many sign-in attempts try again in',
                messages.tooManySigninAttempts.context
            )
        }
    );
    return instances.membersAuth;
};

/**
 * Higher limits because it checks across all email addresses.
 */
const membersAuthEnumeration = () => {
    instances.membersAuthEnumeration = createBruteInstance(
        instances.membersAuthEnumeration,
        spamConfig.memberLogin,
        {
            attachResetToRequest: true,
            failCallback: retryAfterWithContextCallback(
                'Too many different sign-in attempts, try again in',
                messages.tooManySigninAttempts.context
            )
        }
    );
    return instances.membersAuthEnumeration;
};

const otcVerificationEnumeration = () => {
    instances.otcVerificationEnumeration = createBruteInstance(
        instances.otcVerificationEnumeration,
        spamConfig.otcVerificationEnumeration,
        {
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            }
        }
    );
    return instances.otcVerificationEnumeration;
};

const otcVerification = () => {
    instances.otcVerification = createBruteInstance(
        instances.otcVerification,
        spamConfig.otcVerification,
        {
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            }
        }
    );
    return instances.otcVerification;
};

/**
 * Stops login attempts for a user+IP pair with an increasing time period.
 * Defaults: 5 attempts per user+IP pair, resets on successful login.
 */
const userLogin = () => {
    instances.userLogin = createBruteInstance(
        instances.userLogin,
        spamConfig.userLogin,
        {
            attachResetToRequest: true,
            failCallback: retryAfterWithContextCallback(
                'Too many login attempts. Please wait',
                messages.tooManySigninAttempts.context
            )
        }
    );
    return instances.userLogin;
};

/**
 * Stops password reset requests: defaults to 5 attempts per hour per user+IP pair.
 */
const userReset = () => {
    instances.userReset = createBruteInstance(
        instances.userReset,
        spamConfig.userReset,
        {
            attachResetToRequest: true,
            failCallback: retryAfterWithTemplatedContextCallback(
                'Too many password reset attempts try again in',
                messages.forgottenPasswordEmail.error,
                messages.forgottenPasswordEmail.context,
                () => ({
                    rfa: spamConfig.userReset.freeRetries + 1 || 5,
                    rfp: spamConfig.userReset.lifetime || 60 * 60
                })
            )
        }
    );
    return instances.userReset;
};

const userVerification = () => {
    instances.userVerification = createBruteInstance(
        instances.userVerification,
        spamConfig.userVerification,
        {
            attachResetToRequest: true,
            failCallback: tooManyAttemptsCallback
        }
    );
    return instances.userVerification;
};

const sendVerificationCode = () => {
    instances.sendVerificationCode = createBruteInstance(
        instances.sendVerificationCode,
        spamConfig.sendVerificationCode,
        {
            attachResetToRequest: true,
            failCallback: tooManyAttemptsCallback
        }
    );
    return instances.sendVerificationCode;
};

/**
 * Protects a private blog from spam. Defaults: 10 attempts per IP per hour, locks for an hour.
 */
const privateBlog = () => {
    instances.privateBlog = createBruteInstance(
        instances.privateBlog,
        spamConfig.privateBlock,
        {
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: spamConfig.privateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamConfig.privateBlock.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            }
        }
    );
    return instances.privateBlog;
};

const contentApiKey = () => {
    instances.contentApiKey = createBruteInstance(
        instances.contentApiKey,
        spamConfig.contentApiKey,
        {
            attachResetToRequest: true,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) });
                logging.error(err);
                return next(err);
            }
        },
        getMemoryStore
    );
    return instances.contentApiKey;
};

// ─── Reset ───────────────────────────────────────────────────────────────────

const reset = () => {
    store = null;
    memoryStore = null;
    Object.keys(instances).forEach(key => delete instances[key]);
    spamConfig = loadSpamConfig();
};

// ─── Exports ─────────────────────────────────────────────────────────────────

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

### Key Refactoring Changes

1. **`createBruteInstance` factory** — Eliminated ~15 near-identical blocks of store setup + `new ExpressBrute(...)` by centralising instance creation into a single factory function.

2. **`loadSpamConfig()`** — Extracted spam config loading into a reusable function, removing duplication between initialisation and `reset()`.

3. **`instances` object** — Replaced 15 individual `let` instance variables with a single `instances` map, making `reset()` a simple `Object.keys` loop.

4. **Store factories (`getKnexStore`, `getMemoryStore`)** — Removed repeated inline store initialisation from every function.

5. **Fail callback helpers** — Extracted `tooManyAttemptsCallback`, `retryAfterWithContextCallback`, and `retryAfterWithTemplatedContextCallback` to eliminate repeated error-construction patterns.

6. **Spread instead of `extend`** — Replaced `lodash/extend` with native object spread (`...`), removing a dependency.

7. **Nullish coalescing (`??`)** — Used `??` instead of ternary in `handleStoreError` for clarity.