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
 * Creates an ExpressBrute instance if it does not already exist.
 * @param {Object} existingInstance
 * @param {Object} options
 * @param {Function} createInstanceFn
 * @returns {Object}
 */
function getOrCreateInstance(existingInstance, options, createInstanceFn) {
    if (!existingInstance) {
        existingInstance = createInstanceFn(options);
    }
    return existingInstance;
}

/**
 * Builds the options object for an ExpressBrute instance.
 * @param {Object} spamConfig
 * @param {Function} failCallback
 * @param {boolean} attachReset
 * @returns {Object}
 */
function buildOptions(spamConfig, failCallback, attachReset) {
    return extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys));
}

/**
 * Global block instance for IP‑based rate limiting.
 * @returns {Object}
 */
function globalBlock() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamGlobalBlock,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        },
        false
    );

    globalBlockInstance = getOrCreateInstance(globalBlockInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return globalBlockInstance;
}

/**
 * Global reset instance for IP‑based rate limiting on reset actions.
 * @returns {Object}
 */
function globalReset() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamGlobalReset,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        },
        false
    );

    globalResetInstance = getOrCreateInstance(globalResetInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return globalResetInstance;
}

/**
 * Webmentions block instance.
 * @returns {Object}
 */
function webmentionsBlock() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamWebmentionsBlock,
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        false
    );

    webmentionsBlockInstance = getOrCreateInstance(webmentionsBlockInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return webmentionsBlockInstance;
}

/**
 * Email preview block instance.
 * @returns {Object}
 */
function emailPreviewBlock() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamEmailPreviewBlock,
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        false
    );

    emailPreviewBlockInstance = getOrCreateInstance(emailPreviewBlockInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return emailPreviewBlockInstance;
}

/**
 * Members authentication instance.
 * @returns {Object}
 */
function membersAuth() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamUserLogin,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        true
    );

    membersAuthInstance = getOrCreateInstance(membersAuthInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return membersAuthInstance;
}

/**
 * Members authentication enumeration instance (higher limits).
 * @returns {Object}
 */
function membersAuthEnumeration() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamMemberLogin,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        true
    );

    membersAuthEnumerationInstance = getOrCreateInstance(membersAuthEnumerationInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return membersAuthEnumerationInstance;
}

/**
 * OTC verification enumeration instance.
 * @returns {Object}
 */
function otcVerificationEnumeration() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamOtcVerificationEnumeration,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        },
        false
    );

    otcVerificationEnumerationInstance = getOrCreateInstance(otcVerificationEnumerationInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return otcVerificationEnumerationInstance;
}

/**
 * OTC verification instance.
 * @returns {Object}
 */
function otcVerification() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamOtcVerification,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        },
        false
    );

    otcVerificationInstance = getOrCreateInstance(otcVerificationInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return otcVerificationInstance;
}

/**
 * User login instance with increasing lockout periods.
 * @returns {Object}
 */
function userLogin() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamUserLogin,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        true
    );

    userLoginInstance = getOrCreateInstance(userLoginInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return userLoginInstance;
}

/**
 * User password‑reset instance.
 * @returns {Object}
 */
function userReset() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamUserReset,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        },
        true
    );

    userResetInstance = getOrCreateInstance(userResetInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return userResetInstance;
}

/**
 * User verification instance.
 * @returns {Object}
 */
function userVerification() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamUserVerification,
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        true
    );

    userVerificationInstance = getOrCreateInstance(userVerificationInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return userVerificationInstance;
}

/**
 * Send verification code instance.
 * @returns {Object}
 */
function sendVerificationCode() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamSendVerificationCode,
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        true
    );

    sendVerificationCodeInstance = getOrCreateInstance(sendVerificationCodeInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return sendVerificationCodeInstance;
}

/**
 * Private blog protection instance.
 * @returns {Object}
 */
function privateBlog() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamPrivateBlock,
        (req, res, next, nextValidRequestDate) => {
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
        },
        false
    );

    privateBlogInstance = getOrCreateInstance(privateBlogInstance, options, (opts) => new ExpressBrute(getStore(), opts));
    return privateBlogInstance;
}

/**
 * Content‑API‑key instance using an in‑memory store.
 * @returns {Object}
 */
function contentApiKey() {
    const ExpressBrute = require('express-brute');
    const options = buildOptions(
        spamContentApiKey,
        (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        true
    );

    contentApiKeyInstance = getOrCreateInstance(contentApiKeyInstance, options, (opts) => new ExpressBrute(getMemoryStore(), opts));
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