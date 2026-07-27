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
 * Handles errors from the store and forwards a custom error if a callback is provided.
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
 * Initializes the shared Brute store if it hasn't been created yet.
 */
const initStore = () => {
    if (!store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
};

/**
 * Initializes the in-memory Brute store for content API key rate limiting.
 */
const initMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
};

/**
 * Creates or retrieves a cached ExpressBrute instance.
 *
 * @param {Object} instance - The cached instance variable.
 * @param {Object} storeInstance - The store to use (shared or memory).
 * @param {Object} configObj - Spam configuration for this instance.
 * @param {Object} customOptions - Custom options for ExpressBrute.
 * @returns {Object} The ExpressBrute instance.
 */
const getOrCreateInstance = (instance, storeInstance, configObj, customOptions) => {
    if (!instance) {
        const ExpressBrute = require('express-brute');
        instance = new ExpressBrute(storeInstance, extend({
            attachResetToRequest: false,
            handleStoreError: handleStoreError,
            ...customOptions
        }, pick(configObj, spamConfigKeys)));
    }
    return instance;
};

/**
 * Global block limiter for IP-based requests.
 */
const globalBlock = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    };
    globalBlockInstance = getOrCreateInstance(globalBlockInstance, store, spamGlobalBlock, customOptions);
    return globalBlockInstance;
};

/**
 * Global reset limiter for IP-based requests.
 */
const globalReset = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    };
    globalResetInstance = getOrCreateInstance(globalResetInstance, store, spamGlobalReset, customOptions);
    return globalResetInstance;
};

/**
 * Webmentions block limiter.
 */
const webmentionsBlock = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    };
    webmentionsBlockInstance = getOrCreateInstance(webmentionsBlockInstance, store, spamWebmentionsBlock, customOptions);
    return webmentionsBlockInstance;
};

/**
 * Email preview block limiter.
 */
const emailPreviewBlock = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    };
    emailPreviewBlockInstance = getOrCreateInstance(emailPreviewBlockInstance, store, spamEmailPreviewBlock, customOptions);
    return emailPreviewBlockInstance;
};

/**
 * Members authentication limiter.
 */
const membersAuth = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    };
    membersAuthInstance = getOrCreateInstance(membersAuthInstance, store, spamUserLogin, customOptions);
    return membersAuthInstance;
};

/**
 * Members authentication enumeration limiter (higher limits across all emails).
 */
const membersAuthEnumeration = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    };
    membersAuthEnumerationInstance = getOrCreateInstance(membersAuthEnumerationInstance, store, spamMemberLogin, customOptions);
    return membersAuthEnumerationInstance;
};

/**
 * OTC verification enumeration limiter.
 */
const otcVerificationEnumeration = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    };
    otcVerificationEnumerationInstance = getOrCreateInstance(otcVerificationEnumerationInstance, store, spamOtcVerificationEnumeration, customOptions);
    return otcVerificationEnumerationInstance;
};

/**
 * OTC verification limiter for a single code.
 */
const otcVerification = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    };
    otcVerificationInstance = getOrCreateInstance(otcVerificationInstance, store, spamOtcVerification, customOptions);
    return otcVerificationInstance;
};

/**
 * User login limiter (user+IP pair).
 */
const userLogin = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    };
    userLoginInstance = getOrCreateInstance(userLoginInstance, store, spamUserLogin, customOptions);
    return userLoginInstance;
};

/**
 * User password reset limiter.
 */
const userReset = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    };
    userResetInstance = getOrCreateInstance(userResetInstance, store, spamUserReset, customOptions);
    return userResetInstance;
};

/**
 * User verification limiter.
 */
const userVerification = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    };
    userVerificationInstance = getOrCreateInstance(userVerificationInstance, store, spamUserVerification, customOptions);
    return userVerificationInstance;
};

/**
 * Send verification code limiter.
 */
const sendVerificationCode = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    };
    sendVerificationCodeInstance = getOrCreateInstance(sendVerificationCodeInstance, store, spamSendVerificationCode, customOptions);
    return sendVerificationCodeInstance;
};

/**
 * Private blog authentication limiter.
 */
const privateBlog = () => {
    initStore();
    const customOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error,
                    {
                        rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                    }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        }
    };
    privateBlogInstance = getOrCreateInstance(privateBlogInstance, store, spamPrivateBlock, customOptions);
    return privateBlogInstance;
};

/**
 * Content API key rate limiter using an in-memory store.
 */
const contentApiKey = () => {
    initMemoryStore();
    const customOptions = {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        }
    };
    contentApiKeyInstance = getOrCreateInstance(contentApiKeyInstance, memoryStore, spamContentApiKey, customOptions);
    return contentApiKeyInstance;
};

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