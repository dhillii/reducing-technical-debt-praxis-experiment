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
 * Returns a shared BruteKnex store, initializing it if necessary.
 * @returns {Object}
 */
function getBruteStore() {
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
 * Returns a shared in‑memory store for content‑API keys.
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
 * Creates an ExpressBrute instance with the given configuration.
 * @param {Object} storeInstance
 * @param {Object} configObj
 * @param {boolean} attachReset
 * @param {Function} failCb
 * @returns {Object}
 */
function createExpressBruteInstance(storeInstance, configObj, attachReset, failCb) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(storeInstance, extend({
        attachResetToRequest: attachReset,
        failCallback: failCb,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));
}

/**
 * Global block for IP‑based rate limiting.
 * @returns {Object}
 */
function globalBlock() {
    const storeInstance = getBruteStore();

    if (!globalBlockInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        };
        globalBlockInstance = createExpressBruteInstance(storeInstance, spamGlobalBlock, false, failCb);
    }

    return globalBlockInstance;
}

/**
 * Global reset endpoint rate limiting.
 * @returns {Object}
 */
function globalReset() {
    const storeInstance = getBruteStore();

    if (!globalResetInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        };
        globalResetInstance = createExpressBruteInstance(storeInstance, spamGlobalReset, false, failCb);
    }

    return globalResetInstance;
}

/**
 * Rate limiting for webmentions.
 * @returns {Object}
 */
function webmentionsBlock() {
    const storeInstance = getBruteStore();

    if (!webmentionsBlockInstance) {
        const failCb = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        };
        webmentionsBlockInstance = createExpressBruteInstance(storeInstance, spamWebmentionsBlock, false, failCb);
    }

    return webmentionsBlockInstance;
}

/**
 * Rate limiting for email preview requests.
 * @returns {Object}
 */
function emailPreviewBlock() {
    const storeInstance = getBruteStore();

    if (!emailPreviewBlockInstance) {
        const failCb = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        };
        emailPreviewBlockInstance = createExpressBruteInstance(storeInstance, spamEmailPreviewBlock, false, failCb);
    }

    return emailPreviewBlockInstance;
}

/**
 * Member authentication rate limiting.
 * @returns {Object}
 */
function membersAuth() {
    const storeInstance = getBruteStore();

    if (!membersAuthInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        membersAuthInstance = createExpressBruteInstance(storeInstance, spamUserLogin, true, failCb);
    }

    return membersAuthInstance;
}

/**
 * Member authentication enumeration rate limiting.
 * @returns {Object}
 */
function membersAuthEnumeration() {
    const storeInstance = getBruteStore();

    if (!membersAuthEnumerationInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        membersAuthEnumerationInstance = createExpressBruteInstance(storeInstance, spamMemberLogin, true, failCb);
    }

    return membersAuthEnumerationInstance;
}

/**
 * OTC verification enumeration rate limiting.
 * @returns {Object}
 */
function otcVerificationEnumeration() {
    const storeInstance = getBruteStore();

    if (!otcVerificationEnumerationInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        };
        otcVerificationEnumerationInstance = createExpressBruteInstance(storeInstance, spamOtcVerificationEnumeration, false, failCb);
    }

    return otcVerificationEnumerationInstance;
}

/**
 * OTC verification rate limiting for a single code.
 * @returns {Object}
 */
function otcVerification() {
    const storeInstance = getBruteStore();

    if (!otcVerificationInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        };
        otcVerificationInstance = createExpressBruteInstance(storeInstance, spamOtcVerification, false, failCb);
    }

    return otcVerificationInstance;
}

/**
 * User login rate limiting.
 * @returns {Object}
 */
function userLogin() {
    const storeInstance = getBruteStore();

    if (!userLoginInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        userLoginInstance = createExpressBruteInstance(storeInstance, spamUserLogin, true, failCb);
    }

    return userLoginInstance;
}

/**
 * User password‑reset rate limiting.
 * @returns {Object}
 */
function userReset() {
    const storeInstance = getBruteStore();

    if (!userResetInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        };
        userResetInstance = createExpressBruteInstance(storeInstance, spamUserReset, true, failCb);
    }

    return userResetInstance;
}

/**
 * User verification rate limiting.
 * @returns {Object}
 */
function userVerification() {
    const storeInstance = getBruteStore();

    if (!userVerificationInstance) {
        const failCb = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        };
        userVerificationInstance = createExpressBruteInstance(storeInstance, spamUserVerification, true, failCb);
    }

    return userVerificationInstance;
}

/**
 * Send‑verification‑code rate limiting.
 * @returns {Object}
 */
function sendVerificationCode() {
    const storeInstance = getBruteStore();

    if (!sendVerificationCodeInstance) {
        const failCb = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        };
        sendVerificationCodeInstance = createExpressBruteInstance(storeInstance, spamSendVerificationCode, true, failCb);
    }

    return sendVerificationCodeInstance;
}

/**
 * Private‑blog login rate limiting.
 * @returns {Object}
 */
function privateBlog() {
    const storeInstance = getBruteStore();

    if (!privateBlogInstance) {
        const failCb = (req, res, next, nextValidRequestDate) => {
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
        privateBlogInstance = createExpressBruteInstance(storeInstance, spamPrivateBlock, false, failCb);
    }

    return privateBlogInstance;
}

/**
 * Content‑API‑key rate limiting (in‑memory).
 * @returns {Object}
 */
function contentApiKey() {
    const memStore = getMemoryStore();

    if (!contentApiKeyInstance) {
        const failCb = (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        };
        contentApiKeyInstance = createExpressBruteInstance(memStore, spamContentApiKey, true, failCb);
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