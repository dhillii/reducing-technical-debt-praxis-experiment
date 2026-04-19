const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const spam = config.get('spam') || {};

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
 * Handles errors from the store and forwards them to the next middleware.
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
 * Lazily creates and returns the shared Brute store.
 * @returns {Object}
 */
const getStore = () => {
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
};

/**
 * Lazily creates and returns the shared memory store.
 * @returns {Object}
 */
const getMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Creates a new ExpressBrute instance with common options.
 * @param {Object} store
 * @param {Object} configObj
 * @param {Function} failCallback
 * @param {boolean} [attachResetToRequest=false]
 * @returns {Object}
 */
const createBruteInstance = (store, configObj, failCallback, attachResetToRequest = false) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, extend({
        attachResetToRequest,
        failCallback,
        handleStoreError
    }, pick(configObj, spamConfigKeys)));
};

/**
 * Global block for IP-based rate limiting.
 * @returns {Object}
 */
const globalBlock = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            help: tpl(messages.tooManyAttempts)
        }));
    };
    globalBlockInstance = globalBlockInstance || createBruteInstance(store, spamGlobalBlock, failCallback, false);
    return globalBlockInstance;
};

/**
 * Global reset for IP-based rate limiting.
 * @returns {Object}
 */
const globalReset = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };
    globalResetInstance = globalResetInstance || createBruteInstance(store, spamGlobalReset, failCallback, false);
    return globalResetInstance;
};

/**
 * Webmentions block limiter.
 * @returns {Object}
 */
const webmentionsBlock = () => {
    const store = getStore();
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(store, spamWebmentionsBlock, failCallback, false);
    return webmentionsBlockInstance;
};

/**
 * Email preview block limiter.
 * @returns {Object}
 */
const emailPreviewBlock = () => {
    const store = getStore();
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(store, spamEmailPreviewBlock, failCallback, false);
    return emailPreviewBlockInstance;
};

/**
 * Members authentication limiter.
 * @returns {Object}
 */
const membersAuth = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    membersAuthInstance = membersAuthInstance || createBruteInstance(store, spamUserLogin, failCallback, true);
    return membersAuthInstance;
};

/**
 * Members authentication enumeration limiter.
 * @returns {Object}
 */
const membersAuthEnumeration = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(store, spamMemberLogin, failCallback, true);
    return membersAuthEnumerationInstance;
};

/**
 * OTC verification enumeration limiter.
 * @returns {Object}
 */
const otcVerificationEnumeration = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(store, spamOtcVerificationEnumeration, failCallback, false);
    return otcVerificationEnumerationInstance;
};

/**
 * OTC verification limiter.
 * @returns {Object}
 */
const otcVerification = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
    otcVerificationInstance = otcVerificationInstance || createBruteInstance(store, spamOtcVerification, failCallback, false);
    return otcVerificationInstance;
};

/**
 * User login limiter.
 * @returns {Object}
 */
const userLogin = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    userLoginInstance = userLoginInstance || createBruteInstance(store, spamUserLogin, failCallback, true);
    return userLoginInstance;
};

/**
 * User password reset limiter.
 * @returns {Object}
 */
const userReset = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
    userResetInstance = userResetInstance || createBruteInstance(store, spamUserReset, failCallback, true);
    return userResetInstance;
};

/**
 * User verification limiter.
 * @returns {Object}
 */
const userVerification = () => {
    const store = getStore();
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
    userVerificationInstance = userVerificationInstance || createBruteInstance(store, spamUserVerification, failCallback, true);
    return userVerificationInstance;
};

/**
 * Send verification code limiter.
 * @returns {Object}
 */
const sendVerificationCode = () => {
    const store = getStore();
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(store, spamSendVerificationCode, failCallback, true);
    return sendVerificationCodeInstance;
};

/**
 * Private blog authentication limiter.
 * @returns {Object}
 */
const privateBlog = () => {
    const store = getStore();
    const failCallback = (req, res, next, nextValidRequestDate) => {
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
    };
    privateBlogInstance = privateBlogInstance || createBruteInstance(store, spamPrivateBlock, failCallback, false);
    return privateBlogInstance;
};

/**
 * Content API key limiter using in-memory store.
 * @returns {Object}
 */
const contentApiKey = () => {
    const memory = getMemoryStore();
    const failCallback = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });
        logging.error(err);
        return next(err);
    };
    contentApiKeyInstance = contentApiKeyInstance || new (require('express-brute'))(memory, extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys)));
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