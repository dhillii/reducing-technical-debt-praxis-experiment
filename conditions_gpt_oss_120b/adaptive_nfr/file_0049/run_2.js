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

let spamPrivateBlock = spam.private_block || {};
let spamGlobalBlock = spam.global_block || {};
let spamGlobalReset = spam.global_reset || {};
let spamUserReset = spam.user_reset || {};
let spamUserLogin = spam.user_login || {};
let spamSendVerificationCode = spam.send_verification_code || {};
let spamUserVerification = spam.user_verification || {};
let spamMemberLogin = spam.member_login || {};
let spamContentApiKey = spam.content_api_key || {};
let spamWebmentionsBlock = spam.webmentions_block || {};
let spamEmailPreviewBlock = spam.email_preview_block || {};
let spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
let spamOtcVerification = spam.otc_verification || {};

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

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

/**
 * Handles errors from the store.
 * @param {Error} err
 */
const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // see https://github.com/AdamPflug/express-brute/issues/45
    // express-brute does not always forward a callback
    // we are using reset as synchronous call, so we have to log the error if it occurs
    // there is no way to try/catch, because the reset operation happens asynchronous
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

/**
 * Returns a shared BruteKnex store, creating it if necessary.
 * @returns {Object}
 */
function getStore() {
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
 * Returns a shared in‑memory store for content API keys.
 * @returns {Object}
 */
function getMemoryStore() {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

/**
 * Creates an ExpressBrute instance with the given options.
 * @param {Object} storeInstance
 * @param {Object} options
 * @param {Object} spamConfig
 * @returns {Object}
 */
function createBruteInstance(storeInstance, options, spamConfig) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(storeInstance, extend(options, pick(spamConfig, spamConfigKeys)));
}

/* ---------- Fail callback factories ---------- */

/**
 * Global block fail callback.
 */
function globalBlockFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalBlock.freeRetries + 1 || 5,
            rfp: spamGlobalBlock.lifetime || 60 * 60
        }),
        help: tpl(messages.tooManyAttempts)
    }));
}

/**
 * Global reset fail callback.
 */
function globalResetFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalReset.freeRetries + 1 || 5,
            rfp: spamGlobalReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }));
}

/**
 * Webmentions block fail callback.
 */
function webmentionsFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    }));
}

/**
 * Email preview block fail callback.
 */
function emailPreviewFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    }));
}

/**
 * Members auth fail callback.
 */
function membersAuthFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

/**
 * Members auth enumeration fail callback.
 */
function membersAuthEnumFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

/**
 * OTC verification enumeration fail callback.
 */
function otcVerificationEnumFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
}

/**
 * OTC verification fail callback.
 */
function otcVerificationFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }));
}

/**
 * User login fail callback.
 */
function userLoginFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

/**
 * User reset fail callback.
 */
function userResetFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: spamUserReset.freeRetries + 1 || 5,
            rfp: spamUserReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    }));
}

/**
 * User verification fail callback.
 */
function userVerificationFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
}

/**
 * Send verification code fail callback.
 */
function sendVerificationCodeFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
}

/**
 * Private blog fail callback.
 */
function privateBlogFailCallback(req, res, next, nextValidRequestDate) {
    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));

    return next(new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
    }));
}

/**
 * Content API key fail callback.
 */
function contentApiKeyFailCallback(req, res, next) {
    const err = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });
    logging.error(err);
    return next(err);
}

/* ---------- Orchestration functions ---------- */

function globalBlock() {
    if (!globalBlockInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: globalBlockFailCallback,
            handleStoreError
        };
        globalBlockInstance = createBruteInstance(getStore(), options, spamGlobalBlock);
    }
    return globalBlockInstance;
}

function globalReset() {
    if (!globalResetInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: globalResetFailCallback,
            handleStoreError
        };
        globalResetInstance = createBruteInstance(getStore(), options, spamGlobalReset);
    }
    return globalResetInstance;
}

function webmentionsBlock() {
    if (!webmentionsBlockInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: webmentionsFailCallback,
            handleStoreError
        };
        webmentionsBlockInstance = createBruteInstance(getStore(), options, spamWebmentionsBlock);
    }
    return webmentionsBlockInstance;
}

function emailPreviewBlock() {
    if (!emailPreviewBlockInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: emailPreviewFailCallback,
            handleStoreError
        };
        emailPreviewBlockInstance = createBruteInstance(getStore(), options, spamEmailPreviewBlock);
    }
    return emailPreviewBlockInstance;
}

function membersAuth() {
    if (!membersAuthInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: membersAuthFailCallback,
            handleStoreError
        };
        membersAuthInstance = createBruteInstance(getStore(), options, spamUserLogin);
    }
    return membersAuthInstance;
}

/**
 * Higher limits for enumeration across all email addresses.
 */
function membersAuthEnumeration() {
    if (!membersAuthEnumerationInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: membersAuthEnumFailCallback,
            handleStoreError
        };
        membersAuthEnumerationInstance = createBruteInstance(getStore(), options, spamMemberLogin);
    }
    return membersAuthEnumerationInstance;
}

function otcVerificationEnumeration() {
    if (!otcVerificationEnumerationInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: otcVerificationEnumFailCallback,
            handleStoreError
        };
        otcVerificationEnumerationInstance = createBruteInstance(getStore(), options, spamOtcVerificationEnumeration);
    }
    return otcVerificationEnumerationInstance;
}

function otcVerification() {
    if (!otcVerificationInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: otcVerificationFailCallback,
            handleStoreError
        };
        otcVerificationInstance = createBruteInstance(getStore(), options, spamOtcVerification);
    }
    return otcVerificationInstance;
}

function userLogin() {
    if (!userLoginInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: userLoginFailCallback,
            handleStoreError
        };
        userLoginInstance = createBruteInstance(getStore(), options, spamUserLogin);
    }
    return userLoginInstance;
}

function userReset() {
    if (!userResetInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: userResetFailCallback,
            handleStoreError
        };
        userResetInstance = createBruteInstance(getStore(), options, spamUserReset);
    }
    return userResetInstance;
}

function userVerification() {
    if (!userVerificationInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: userVerificationFailCallback,
            handleStoreError
        };
        userVerificationInstance = createBruteInstance(getStore(), options, spamUserVerification);
    }
    return userVerificationInstance;
}

function sendVerificationCode() {
    if (!sendVerificationCodeInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: sendVerificationCodeFailCallback,
            handleStoreError
        };
        sendVerificationCodeInstance = createBruteInstance(getStore(), options, spamSendVerificationCode);
    }
    return sendVerificationCodeInstance;
}

function privateBlog() {
    if (!privateBlogInstance) {
        const options = {
            attachResetToRequest: false,
            failCallback: privateBlogFailCallback,
            handleStoreError
        };
        privateBlogInstance = createBruteInstance(getStore(), options, spamPrivateBlock);
    }
    return privateBlogInstance;
}

function contentApiKey() {
    if (!contentApiKeyInstance) {
        const options = {
            attachResetToRequest: true,
            failCallback: contentApiKeyFailCallback,
            handleStoreError
        };
        contentApiKeyInstance = createBruteInstance(getMemoryStore(), options, spamContentApiKey);
    }
    return contentApiKeyInstance;
}

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
    reset: () => {
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
};