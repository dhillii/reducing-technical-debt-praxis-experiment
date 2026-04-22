```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

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

    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

/**
 * Returns a shared BruteKnex store, creating it if necessary.
 * @returns {BruteKnex}
 */
function getStore() {
    if (!store) {
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
 * @returns {ExpressBrute.MemoryStore}
 */
function getMemoryStore() {
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

/**
 * Fail callback for global block.
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
 * Fail callback for global reset.
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
 * Fail callback for webmentions block.
 */
function webmentionsBlockFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    }));
}

/**
 * Fail callback for email preview block.
 */
function emailPreviewBlockFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    }));
}

/**
 * Fail callback for members authentication.
 */
function membersAuthFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

/**
 * Fail callback for members authentication enumeration.
 */
function membersAuthEnumerationFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

/**
 * Fail callback for OTC verification enumeration.
 */
function otcVerificationEnumerationFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
}

/**
 * Fail callback for OTC verification.
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
 * Fail callback for user login.
 */
function userLoginFailCallback(req, res, next, nextValidRequestDate) {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}

/**
 * Fail callback for user password reset.
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
 * Fail callback for user verification.
 */
function userVerificationFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
}

/**
 * Fail callback for sending verification code.
 */
function sendVerificationCodeFailCallback(req, res, next) {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
}

/**
 * Fail callback for private blog protection.
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
 * Fail callback for content API key protection.
 */
function contentApiKeyFailCallback(req, res, next) {
    const err = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });

    logging.error(err);
    return next(err);
}

/**
 * Creates or returns the global block instance.
 * @returns {ExpressBrute}
 */
function globalBlock() {
    const store = getStore();

    if (!globalBlockInstance) {
        globalBlockInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: globalBlockFailCallback,
            handleStoreError
        }, pick(spamGlobalBlock, spamConfigKeys)));
    }

    return globalBlockInstance;
}

/**
 * Creates or returns the global reset instance.
 * @returns {ExpressBrute}
 */
function globalReset() {
    const store = getStore();

    if (!globalResetInstance) {
        globalResetInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: globalResetFailCallback,
            handleStoreError
        }, pick(spamGlobalReset, spamConfigKeys)));
    }

    return globalResetInstance;
}

/**
 * Creates or returns the webmentions block instance.
 * @returns {ExpressBrute}
 */
function webmentionsBlock() {
    const store = getStore();

    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: webmentionsBlockFailCallback,
            handleStoreError
        }, pick(spamWebmentionsBlock, spamConfigKeys)));
    }

    return webmentionsBlockInstance;
}

/**
 * Creates or returns the email preview block instance.
 * @returns {ExpressBrute}
 */
function emailPreviewBlock() {
    const store = getStore();

    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: emailPreviewBlockFailCallback,
            handleStoreError
        }, pick(spamEmailPreviewBlock, spamConfigKeys)));
    }

    return emailPreviewBlockInstance;
}

/**
 * Creates or returns the members authentication instance.
 * @returns {ExpressBrute}
 */
function membersAuth() {
    const store = getStore();

    if (!membersAuthInstance) {
        membersAuthInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback: membersAuthFailCallback,
            handleStoreError
        }, pick(spamUserLogin, spamConfigKeys)));
    }

    return membersAuthInstance;
}

/**
 * Creates or returns the members authentication enumeration instance.
 * @returns {ExpressBrute}
 */
function membersAuthEnumeration() {
    const store = getStore();

    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback: membersAuthEnumerationFailCallback,
            handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys)));
    }

    return membersAuthEnumerationInstance;
}

/**
 * Creates or returns the OTC verification enumeration instance.
 * @returns {ExpressBrute}
 */
function otcVerificationEnumeration() {
    const store = getStore();

    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: otcVerificationEnumerationFailCallback,
            handleStoreError
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys)));
    }

    return otcVerificationEnumerationInstance;
}

/**
 * Creates or returns the OTC verification instance.
 * @returns {ExpressBrute}
 */
function otcVerification() {
    const store = getStore();

    if (!otcVerificationInstance) {
        otcVerificationInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: otcVerificationFailCallback,
            handleStoreError
        }, pick(spamOtcVerification, spamConfigKeys)));
    }

    return otcVerificationInstance;
}

/**
 * Creates or returns the user login instance.
 * @returns {ExpressBrute}
 */
function userLogin() {
    const store = getStore();

    if (!userLoginInstance) {
        userLoginInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback: userLoginFailCallback,
            handleStoreError
        }, pick(spamUserLogin, spamConfigKeys)));
    }

    return userLoginInstance;
}

/**
 * Creates or returns the user password reset instance.
 * @returns {ExpressBrute}
 */
function userReset() {
    const store = getStore();

    if (!userResetInstance) {
        userResetInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback: userResetFailCallback,
            handleStoreError
        }, pick(spamUserReset, spamConfigKeys)));
    }

    return userResetInstance;
}

/**
 * Creates or returns the user verification instance.
 * @returns {ExpressBrute}
 */
function userVerification() {
    const store = getStore();

    if (!userVerificationInstance) {
        userVerificationInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback: userVerificationFailCallback,
            handleStoreError
        }, pick(spamUserVerification, spamConfigKeys)));
    }

    return userVerificationInstance;
}

/**
 * Creates or returns the send verification code instance.
 * @returns {ExpressBrute}
 */
function sendVerificationCode() {
    const store = getStore();

    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback: sendVerificationCodeFailCallback,
            handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys)));
    }

    return sendVerificationCodeInstance;
}

/**
 * Creates or returns the private blog protection instance.
 * @returns {ExpressBrute}
 */
function privateBlog() {
    const store = getStore();

    if (!privateBlogInstance) {
        privateBlogInstance = new ExpressBrute(store, extend({
            attachResetToRequest: false,
            failCallback: privateBlogFailCallback,
            handleStoreError
        }, pick(spamPrivateBlock, spamConfigKeys)));
    }

    return privateBlogInstance;
}

/**
 * Creates or returns the content API key protection instance.
 * @returns {ExpressBrute}
 */
function contentApiKey() {
    const memory = getMemoryStore();

    if (!contentApiKeyInstance) {
        contentApiKeyInstance = new ExpressBrute(memory, extend({
            attachResetToRequest: true,
            failCallback: contentApiKeyFailCallback,
            handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys)));
    }

    return contentApiKeyInstance;
}

/**
 * Resets all stored instances and reloads configuration.
 */
function reset() {
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
    spamWebmentionsBlock = spam.webmentions_block || {};
    spamEmailPreviewBlock = spam.email_preview_block || {};
    spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
    spamOtcVerification = spam.otc_verification || {};
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
    reset
};
```