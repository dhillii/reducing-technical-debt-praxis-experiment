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
 * Handles errors from the brute store.
 * @param {Error} err
 */
const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // express-brute may not forward a callback
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

/**
 * Lazily creates and returns a BruteKnex store.
 * @returns {Object}
 */
function getStore() {
    if (store) {
        return store;
    }
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
    return store;
}

/**
 * Lazily creates and returns an in‑memory store for content API keys.
 * @returns {Object}
 */
function getMemoryStore() {
    if (memoryStore) {
        return memoryStore;
    }
    const ExpressBrute = require('express-brute');
    memoryStore = new ExpressBrute.MemoryStore();
    return memoryStore;
}

/**
 * Creates an ExpressBrute instance with the given configuration.
 * @param {Object} storeOrMemory
 * @param {Object} spamConfig
 * @param {Function} failCallback
 * @param {boolean} attachReset
 * @returns {Object}
 */
function createBruteInstance(storeOrMemory, spamConfig, failCallback, attachReset) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(storeOrMemory, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));
}

/* ---------- Individual rate‑limit factories ---------- */

function globalBlock() {
    if (!globalBlockInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        };
        globalBlockInstance = createBruteInstance(getStore(), spamGlobalBlock, failCallback, false);
    }
    return globalBlockInstance;
}

function globalReset() {
    if (!globalResetInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        };
        globalResetInstance = createBruteInstance(getStore(), spamGlobalReset, failCallback, false);
    }
    return globalResetInstance;
}

function webmentionsBlock() {
    if (!webmentionsBlockInstance) {
        const failCallback = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        };
        webmentionsBlockInstance = createBruteInstance(getStore(), spamWebmentionsBlock, failCallback, false);
    }
    return webmentionsBlockInstance;
}

function emailPreviewBlock() {
    if (!emailPreviewBlockInstance) {
        const failCallback = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        };
        emailPreviewBlockInstance = createBruteInstance(getStore(), spamEmailPreviewBlock, failCallback, false);
    }
    return emailPreviewBlockInstance;
}

function membersAuth() {
    if (!membersAuthInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        membersAuthInstance = createBruteInstance(getStore(), spamUserLogin, failCallback, true);
    }
    return membersAuthInstance;
}

/**
 * Higher limits for enumeration across all email addresses.
 */
function membersAuthEnumeration() {
    if (!membersAuthEnumerationInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        membersAuthEnumerationInstance = createBruteInstance(getStore(), spamMemberLogin, failCallback, true);
    }
    return membersAuthEnumerationInstance;
}

function otcVerificationEnumeration() {
    if (!otcVerificationEnumerationInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        };
        otcVerificationEnumerationInstance = createBruteInstance(getStore(), spamOtcVerificationEnumeration, failCallback, false);
    }
    return otcVerificationEnumerationInstance;
}

function otcVerification() {
    if (!otcVerificationInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        };
        otcVerificationInstance = createBruteInstance(getStore(), spamOtcVerification, failCallback, false);
    }
    return otcVerificationInstance;
}

function userLogin() {
    if (!userLoginInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        userLoginInstance = createBruteInstance(getStore(), spamUserLogin, failCallback, true);
    }
    return userLoginInstance;
}

function userReset() {
    if (!userResetInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        };
        userResetInstance = createBruteInstance(getStore(), spamUserReset, failCallback, true);
    }
    return userResetInstance;
}

function userVerification() {
    if (!userVerificationInstance) {
        const failCallback = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        };
        userVerificationInstance = createBruteInstance(getStore(), spamUserVerification, failCallback, true);
    }
    return userVerificationInstance;
}

function sendVerificationCode() {
    if (!sendVerificationCodeInstance) {
        const failCallback = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        };
        sendVerificationCodeInstance = createBruteInstance(getStore(), spamSendVerificationCode, failCallback, true);
    }
    return sendVerificationCodeInstance;
}

function privateBlog() {
    if (!privateBlogInstance) {
        const failCallback = (req, res, next, nextValidRequestDate) => {
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
        };
        privateBlogInstance = createBruteInstance(getStore(), spamPrivateBlock, failCallback, false);
    }
    return privateBlogInstance;
}

function contentApiKey() {
    if (!contentApiKeyInstance) {
        const failCallback = (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        };
        contentApiKeyInstance = createBruteInstance(getMemoryStore(), spamContentApiKey, failCallback, true);
    }
    return contentApiKeyInstance;
}

/**
 * Resets all stored instances and reloads configuration.
 */
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
    reset: resetAll
};
```