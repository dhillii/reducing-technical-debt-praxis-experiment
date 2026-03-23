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
 * @param {object|null} cachedInstance - Existing instance or null
 * @param {object} bruteStore - The brute store to use
 * @param {object} spamConfigSection - Spam config section for this instance
 * @param {object} options - ExpressBrute options (must include failCallback)
 * @returns {object} ExpressBrute instance
 */
function createBruteInstance(cachedInstance, bruteStore, spamConfigSection, options) {
    if (cachedInstance) {
        return cachedInstance;
    }

    const ExpressBrute = require('express-brute');
    return new ExpressBrute(
        bruteStore,
        Object.assign({ handleStoreError }, options, pick(spamConfigSection, SPAM_CONFIG_KEYS))
    );
}

// ─── Fail Callback Factories ─────────────────────────────────────────────────

const makeTimedFailCallback = (getMessage) => (req, res, next, nextValidRequestDate) =>
    next(new errors.TooManyRequestsError(getMessage(nextValidRequestDate)));

const makeSimpleFailCallback = (getMessage) => (req, res, next) =>
    next(new errors.TooManyRequestsError(getMessage()));

const makeLoggingFailCallback = (getMessage) => (req, res, next, nextValidRequestDate) => {
    const err = new errors.TooManyRequestsError(getMessage(nextValidRequestDate));
    logging.error(err);
    return next(err);
};

// ─── Instance Cache ──────────────────────────────────────────────────────────

const instances = {};

// ─── Public API ──────────────────────────────────────────────────────────────

const globalBlock = () => {
    instances.globalBlock = createBruteInstance(
        instances.globalBlock,
        getKnexStore(),
        spamConfig.globalBlock,
        {
            attachResetToRequest: false,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.globalBlock.freeRetries + 1 || 5,
                    rfp: spamConfig.globalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }))
        }
    );
    return instances.globalBlock;
};

const globalReset = () => {
    instances.globalReset = createBruteInstance(
        instances.globalReset,
        getKnexStore(),
        spamConfig.globalReset,
        {
            attachResetToRequest: false,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.globalReset.freeRetries + 1 || 5,
                    rfp: spamConfig.globalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }))
        }
    );
    return instances.globalReset;
};

const webmentionsBlock = () => {
    instances.webmentionsBlock = createBruteInstance(
        instances.webmentionsBlock,
        getKnexStore(),
        spamConfig.webmentionsBlock,
        {
            attachResetToRequest: false,
            failCallback: makeSimpleFailCallback(() => ({
                message: messages.webmentionsBlock
            }))
        }
    );
    return instances.webmentionsBlock;
};

const emailPreviewBlock = () => {
    instances.emailPreviewBlock = createBruteInstance(
        instances.emailPreviewBlock,
        getKnexStore(),
        spamConfig.emailPreviewBlock,
        {
            attachResetToRequest: false,
            failCallback: makeSimpleFailCallback(() => ({
                message: messages.emailPreviewBlock
            }))
        }
    );
    return instances.emailPreviewBlock;
};

const membersAuth = () => {
    instances.membersAuth = createBruteInstance(
        instances.membersAuth,
        getKnexStore(),
        spamConfig.userLogin,
        {
            attachResetToRequest: true,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }))
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
        getKnexStore(),
        spamConfig.memberLogin,
        {
            attachResetToRequest: true,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }))
        }
    );
    return instances.membersAuthEnumeration;
};

const otcVerificationEnumeration = () => {
    instances.otcVerificationEnumeration = createBruteInstance(
        instances.otcVerificationEnumeration,
        getKnexStore(),
        spamConfig.otcVerificationEnumeration,
        {
            attachResetToRequest: false,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }))
        }
    );
    return instances.otcVerificationEnumeration;
};

const otcVerification = () => {
    instances.otcVerification = createBruteInstance(
        instances.otcVerification,
        getKnexStore(),
        spamConfig.otcVerification,
        {
            attachResetToRequest: false,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }))
        }
    );
    return instances.otcVerification;
};

/**
 * Stops login attempts for a user+IP pair with an increasing time period.
 * Resets on successful login. Default: 5 attempts per user+IP pair.
 */
const userLogin = () => {
    instances.userLogin = createBruteInstance(
        instances.userLogin,
        getKnexStore(),
        spamConfig.userLogin,
        {
            attachResetToRequest: true,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }))
        }
    );
    return instances.userLogin;
};

/**
 * Stops password reset requests: (freeRetries + 1) per lifetime per email.
 * Default: 5 attempts per hour per user+IP pair, locked for an hour.
 */
const userReset = () => {
    instances.userReset = createBruteInstance(
        instances.userReset,
        getKnexStore(),
        spamConfig.userReset,
        {
            attachResetToRequest: true,
            failCallback: makeTimedFailCallback(nextValidRequestDate => ({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamConfig.userReset.freeRetries + 1 || 5,
                    rfp: spamConfig.userReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }))
        }
    );
    return instances.userReset;
};

const userVerification = () => {
    instances.userVerification = createBruteInstance(
        instances.userVerification,
        getKnexStore(),
        spamConfig.userVerification,
        {
            attachResetToRequest: true,
            failCallback: makeSimpleFailCallback(() => ({
                message: tpl(messages.tooManyAttempts)
            }))
        }
    );
    return instances.userVerification;
};

const sendVerificationCode = () => {
    instances.sendVerificationCode = createBruteInstance(
        instances.sendVerificationCode,
        getKnexStore(),
        spamConfig.sendVerificationCode,
        {
            attachResetToRequest: true,
            failCallback: makeSimpleFailCallback(() => ({
                message: tpl(messages.tooManyAttempts)
            }))
        }
    );
    return instances.sendVerificationCode;
};

/**
 * Protects a private blog from spam. Default: 10 attempts per IP per hour,
 * locked for an hour.
 */
const privateBlog = () => {
    instances.privateBlog = createBruteInstance(
        instances.privateBlog,
        getKnexStore(),
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
        getMemoryStore(),
        spamConfig.contentApiKey,
        {
            attachResetToRequest: true,
            failCallback: makeLoggingFailCallback(() => ({
                message: tpl(messages.tooManyAttempts)
            }))
        }
    );
    return instances.contentApiKey;
};

// ─── Reset ───────────────────────────────────────────────────────────────────

const reset = () => {
    Object.keys(instances).forEach(key => delete instances[key]);
    store = null;
    memoryStore = null;
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

1. **`createBruteInstance` factory**: Eliminated ~15 near-identical blocks of `ExpressBrute` instantiation code into a single reusable function.

2. **`getKnexStore` / `getMemoryStore`**: Extracted lazy store initialization into dedicated functions, removing duplicated store setup from every public function.

3. **`loadSpamConfig`**: Centralized spam config loading into one function, called on init and during `reset`, eliminating ~26 lines of duplicated variable declarations.

4. **`instances` object**: Replaced ~15 individual `let xyzInstance` variables with a single `instances` map, simplifying the `reset` function to a single loop.

5. **Fail callback factories** (`makeTimedFailCallback`, `makeSimpleFailCallback`, `makeLoggingFailCallback`): Abstracted the three recurring callback patterns, reducing boilerplate in each public function.

6. **Removed `lodash/extend`**: Replaced with native `Object.assign`, removing an unnecessary dependency.

7. **Nullish coalescing (`??`)**: Used in `handleStoreError` for cleaner null checks.