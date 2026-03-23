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
 * Creates and caches an ExpressBrute instance.
 *
 * @param {object}   options
 * @param {object}   options.spamConfigKey  - Spam config section (e.g. spamConfig.userLogin)
 * @param {boolean}  options.attachReset    - Whether to attach reset to request
 * @param {Function} options.failCallback   - Callback invoked on rate-limit breach
 * @param {Function} [options.getStore]     - Store factory (defaults to knex store)
 * @returns {object} ExpressBrute instance
 */
function createBruteInstance({ spamConfigKey, attachReset, failCallback, getStore = getKnexStore }) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(
        getStore(),
        Object.assign(
            { attachResetToRequest: attachReset, failCallback, handleStoreError },
            pick(spamConfigKey, SPAM_CONFIG_KEYS)
        )
    );
}

/**
 * Returns a memoised factory function that creates a single ExpressBrute instance.
 */
function memoised(factory) {
    let instance = null;
    const fn = () => {
        instance = instance ?? factory();
        return instance;
    };
    fn.reset = () => { instance = null; };
    return fn;
}

// ─── Fail Callback Helpers ───────────────────────────────────────────────────

const retryInCallback = (buildMessage) => (req, res, next, nextValidRequestDate) =>
    next(new errors.TooManyRequestsError(buildMessage(nextValidRequestDate)));

const simpleMessageCallback = (message) => (req, res, next) =>
    next(new errors.TooManyRequestsError({ message }));

// ─── Rate-Limited Endpoints ──────────────────────────────────────────────────

const globalBlock = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.globalBlock,
        attachReset: false,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfig.globalBlock.freeRetries + 1 || 5,
                rfp: spamConfig.globalBlock.lifetime || 3600
            }),
            help: tpl(messages.tooManyAttempts)
        }))
    })
);

const globalReset = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.globalReset,
        attachReset: false,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfig.globalReset.freeRetries + 1 || 5,
                rfp: spamConfig.globalReset.lifetime || 3600
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }))
    })
);

const webmentionsBlock = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.webmentionsBlock,
        attachReset: false,
        failCallback: simpleMessageCallback(messages.webmentionsBlock)
    })
);

const emailPreviewBlock = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.emailPreviewBlock,
        attachReset: false,
        failCallback: simpleMessageCallback(messages.emailPreviewBlock)
    })
);

const membersAuth = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.userLogin,
        attachReset: true,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }))
    })
);

const membersAuthEnumeration = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.memberLogin,
        attachReset: true,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }))
    })
);

const otcVerificationEnumeration = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.otcVerificationEnumeration,
        attachReset: false,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }))
    })
);

const otcVerification = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.otcVerification,
        attachReset: false,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }))
    })
);

const userLogin = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.userLogin,
        attachReset: true,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }))
    })
);

const userReset = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.userReset,
        attachReset: true,
        failCallback: retryInCallback(nextValidRequestDate => ({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamConfig.userReset.freeRetries + 1 || 5,
                rfp: spamConfig.userReset.lifetime || 3600
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }))
    })
);

const userVerification = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.userVerification,
        attachReset: true,
        failCallback: simpleMessageCallback(tpl(messages.tooManyAttempts))
    })
);

const sendVerificationCode = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.sendVerificationCode,
        attachReset: true,
        failCallback: simpleMessageCallback(tpl(messages.tooManyAttempts))
    })
);

const privateBlog = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.privateBlock,
        attachReset: false,
        failCallback: retryInCallback(nextValidRequestDate => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamConfig.privateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamConfig.privateBlock.lifetime || 3600
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));
            return {
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            };
        })
    })
);

const contentApiKey = memoised(() =>
    createBruteInstance({
        spamConfigKey: spamConfig.contentApiKey,
        attachReset: true,
        getStore: getMemoryStore,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) });
            logging.error(err);
            return next(err);
        }
    })
);

// ─── Reset ───────────────────────────────────────────────────────────────────

const allInstances = [
    globalBlock, globalReset, webmentionsBlock, emailPreviewBlock,
    membersAuth, membersAuthEnumeration, otcVerificationEnumeration,
    otcVerification, userLogin, userReset, userVerification,
    sendVerificationCode, privateBlog, contentApiKey
];

const reset = () => {
    store = null;
    memoryStore = null;
    allInstances.forEach(instance => instance.reset());
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

Key refactoring decisions:

1. **`memoised()` wrapper** — Replaces the repeated `instance = instance || new ...` pattern with a reusable higher-order function that also exposes a `.reset()` method, eliminating the need to track every instance variable manually.

2. **`createBruteInstance()` factory** — Centralises the repeated `ExpressBrute` construction, `pick`, and `Object.assign` boilerplate into a single function with a clear options interface.

3. **`retryInCallback` / `simpleMessageCallback` helpers** — Extract the two recurring `failCallback` shapes, reducing noise and making the intent of each endpoint's error response immediately clear.

4. **`loadSpamConfig()` / `spamConfig` object** — Consolidates all the individual `spamXxx` variables into a single structured object, making both initialisation and reset a single function call.

5. **`getKnexStore` / `getMemoryStore`** — Lazy store initialisation is extracted into dedicated functions, removing the repeated `require` + construction block from every endpoint factory.

6. **`allInstances` array** — Drives the reset loop automatically, so adding a new endpoint only requires adding it to one place.