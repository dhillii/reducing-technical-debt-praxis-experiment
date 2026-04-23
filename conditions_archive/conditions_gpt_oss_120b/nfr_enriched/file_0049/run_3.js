```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

let spam = config.get('spam') || {};

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

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

/* ---------- Store handling ---------- */

/**
 * Lazily creates a shared Knex-backed store for ExpressBrute.
 * @returns {Object} BruteKnex store instance
 */
function getKnexStore() {
    if (!store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
}

/**
 * Lazily creates an in‑memory store for content‑API rate limiting.
 * @returns {Object} Memory store instance
 */
function getMemoryStore() {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

/* ---------- Error handling ---------- */

function handleStoreError(err) {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // express‑brute may not forward a callback; log and exit if so
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
}

/* ---------- Instance factories ---------- */

/**
 * Creates an ExpressBrute instance with the supplied configuration.
 * @param {Object} store Store to use (Knex or memory)
 * @param {Object} spamConfig Spam configuration object
 * @param {Function} failCallback Callback invoked on rate‑limit breach
 * @param {boolean} attachReset Whether to attach reset to request
 * @returns {Object} ExpressBrute instance
 */
function createBruteInstance(store, spamConfig, failCallback, attachReset = false) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));
}

/* ---------- Fail callbacks ---------- */

function globalBlockFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalBlock.freeRetries + 1 || 5,
            rfp: spamGlobalBlock.lifetime || 60 * 60
        }),
        help: tpl(messages.tooManyAttempts)
    }));
}

function globalResetFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalReset.freeRetries + 1 || 5,
            rfp: spamGlobalReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }));
}

function simpleMessageFail(message) {
    return (req, res, next) => next(new errors.TooManyRequestsError({message}));
}

function membersAuthFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

function privateBlogFail(req, res, next, nextValid) {
    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));

    return next(new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValid).fromNow(true)}`
    }));
}

function userLoginFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValid).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

function userResetFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: spamUserReset.freeRetries + 1 || 5,
            rfp: spamUserReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    }));
}

function genericTooManyAttemptsFail(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
}

function otcVerificationFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }));
}

function otcVerificationEnumerationFail(req, res, next, nextValid) {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
}

/* ---------- Exported factories ---------- */

let store;
let memoryStore;
let privateBlogInstance;
let globalResetInstance;
let globalBlockInstance;
let webmentionsBlockInstance;
let userLoginInstance;
let membersAuthInstance;
let membersAuthEnumerationInstance;
let userResetInstance;
let sendVerificationCodeInstance;
let userVerificationInstance;
let contentApiKeyInstance;
let emailPreviewBlockInstance;
let otcVerificationEnumerationInstance;
let otcVerificationInstance;

function globalBlock() {
    globalBlockInstance = globalBlockInstance || createBruteInstance(
        getKnexStore(),
        spamGlobalBlock,
        globalBlockFail,
        false
    );
    return globalBlockInstance;
}

function globalReset() {
    globalResetInstance = globalResetInstance || createBruteInstance(
        getKnexStore(),
        spamGlobalReset,
        globalResetFail,
        false
    );
    return globalResetInstance;
}

function webmentionsBlock() {
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(
        getKnexStore(),
        spamWebmentionsBlock,
        simpleMessageFail(messages.webmentionsBlock),
        false
    );
    return webmentionsBlockInstance;
}

function emailPreviewBlock() {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(
        getKnexStore(),
        spamEmailPreviewBlock,
        simpleMessageFail(messages.emailPreviewBlock),
        false
    );
    return emailPreviewBlockInstance;
}

function membersAuth() {
    membersAuthInstance = membersAuthInstance || createBruteInstance(
        getKnexStore(),
        spamUserLogin,
        membersAuthFail,
        true
    );
    return membersAuthInstance;
}

function membersAuthEnumeration() {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(
        getKnexStore(),
        spamMemberLogin,
        membersAuthFail,
        true
    );
    return membersAuthEnumerationInstance;
}

function otcVerificationEnumeration() {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(
        getKnexStore(),
        spamOtcVerificationEnumeration,
        otcVerificationEnumerationFail,
        false
    );
    return otcVerificationEnumerationInstance;
}

function otcVerification() {
    otcVerificationInstance = otcVerificationInstance || createBruteInstance(
        getKnexStore(),
        spamOtcVerification,
        otcVerificationFail,
        false
    );
    return otcVerificationInstance;
}

function userLogin() {
    userLoginInstance = userLoginInstance || createBruteInstance(
        getKnexStore(),
        spamUserLogin,
        userLoginFail,
        true
    );
    return userLoginInstance;
}

function userReset() {
    userResetInstance = userResetInstance || createBruteInstance(
        getKnexStore(),
        spamUserReset,
        userResetFail,
        true
    );
    return userResetInstance;
}

function userVerification() {
    userVerificationInstance = userVerificationInstance || createBruteInstance(
        getKnexStore(),
        spamUserVerification,
        genericTooManyAttemptsFail,
        true
    );
    return userVerificationInstance;
}

function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(
        getKnexStore(),
        spamSendVerificationCode,
        genericTooManyAttemptsFail,
        true
    );
    return sendVerificationCodeInstance;
}

function privateBlog() {
    privateBlogInstance = privateBlogInstance || createBruteInstance(
        getKnexStore(),
        spamPrivateBlock,
        privateBlogFail,
        false
    );
    return privateBlogInstance;
}

function contentApiKey() {
    contentApiKeyInstance = contentApiKeyInstance || createBruteInstance(
        getMemoryStore(),
        spamContentApiKey,
        genericTooManyAttemptsFail,
        true
    );
    return contentApiKeyInstance;
}

/* ---------- Reset helper ---------- */

function resetAll() {
    store = undefined;
    memoryStore = undefined;
    privateBlogInstance = undefined;
    globalResetInstance = undefined;
    globalBlockInstance = undefined;
    userLoginInstance = undefined;
    membersAuthInstance = undefined;
    membersAuthEnumerationInstance = undefined;
    userResetInstance = undefined;
    sendVerificationCodeInstance = undefined;
    userVerificationInstance = undefined;
    contentApiKeyInstance = undefined;
    otcVerificationEnumerationInstance = undefined;
    otcVerificationInstance = undefined;
    webmentionsBlockInstance = undefined;
    emailPreviewBlockInstance = undefined;

    spam = config.get('spam') || {};
    spamPrivateBlock = spam.private_block || {};
    spamGlobalBlock = spam.global_block || {};
    spamGlobalReset = spam.global_reset || {};
    spamUserReset = spam.user_reset || {};
    spamUserLogin = spam.user_login || {};
    spamSendVerificationCode = spam.send_verification_code || {};
    spamUserVerification = spam.user_verification || {};
    spamMemberLogin = spam.member_login || {};
    spamContentApiKey = spam.content_api_key || {};
    spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
    spamOtcVerification = spam.otc_verification || {};
}

/* ---------- Export ---------- */

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
    reset: resetAll
};
```