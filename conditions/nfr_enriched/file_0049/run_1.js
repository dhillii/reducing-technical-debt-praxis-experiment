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

// Initialize or retrieve the shared database store for brute force protection
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

// Create a fail callback for rate limit errors with time-based messaging
const createFailCallback = (messageConfig, spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = typeof messageConfig === 'string' 
            ? messageConfig 
            : tpl(messageConfig.error, {
                rfa: spamConfig.freeRetries + 1 || 5,
                rfp: spamConfig.lifetime || 60 * 60
            });

        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: message,
            help: tpl(messages.tooManyAttempts)
        }));
    };
};

// Create a fail callback for simple rate limit errors without time context
const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: message
        }));
    };
};

// Create a fail callback for sign-in attempts with context
const createSigninFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a fail callback for OTC verification enumeration attempts
const createOtcEnumerationFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

// Create a fail callback for OTC verification code attempts
const createOtcCodeFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

// Create a fail callback for user login attempts
const createUserLoginFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a fail callback for password reset attempts
const createPasswordResetFailCallback = (spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamConfig.freeRetries + 1 || 5, rfp: spamConfig.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
};

// Create a fail callback for private blog access attempts
const createPrivateBlogFailCallback = (spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error,
                {
                    rateSigninAttempts: spamConfig.freeRetries + 1 || 5,
                    rateSigninPeriod: spamConfig.lifetime || 60 * 60
                }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
};

// Create a fail callback for content API key rate limiting
const createContentApiKeyFailCallback = () => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

// Create an ExpressBrute instance with database store
const createBruteInstance = (config, failCallback, attachReset = false) => {
    const ExpressBrute = require('express-brute');
    const storeInstance = getStore();

    return new ExpressBrute(storeInstance,
        extend({
            attachResetToRequest: attachReset,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );
};

// Create an ExpressBrute instance with memory store
const createMemoryBruteInstance = (config, failCallback, attachReset = false) => {
    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore,
        extend({
            attachResetToRequest: attachReset,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );
};

// Locks a single endpoint based on excessive requests from an IP
const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createBruteInstance(
        spamGlobalBlock,
        createFailCallback(messages.forgottenPasswordIp, spamGlobalBlock),
        false
    );

    return globalBlockInstance;
};

// Handles global password reset rate limiting
const globalReset = () => {
    globalResetInstance = globalResetInstance || createBruteInstance(
        spamGlobalReset,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        },
        false
    );

    return globalResetInstance;
};

// Protects webmentions endpoint from spam
const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(
        spamWebmentionsBlock,
        createSimpleFailCallback(messages.webmentionsBlock),
        false
    );

    return webmentionsBlockInstance;
};

// Protects email preview endpoint from spam
const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(
        spamEmailPreviewBlock,
        createSimpleFailCallback(messages.emailPreviewBlock),
        false
    );

    return emailPreviewBlockInstance;
};

// Handles member authentication rate limiting
const membersAuth = () => {
    membersAuthInstance = membersAuthInstance || createBruteInstance(
        spamUserLogin,
        createSigninFailCallback(),
        true
    );

    return membersAuthInstance;
};

// Handles member authentication enumeration protection with higher limits
const membersAuthEnumeration = () => {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(
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

    return membersAuthEnumerationInstance;
};

// Handles OTC verification enumeration rate limiting
const otcVerificationEnumeration = () => {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(
        spamOtcVerificationEnumeration,
        createOtcEnumerationFailCallback(),
        false
    );

    return otcVerificationEnumerationInstance;
};

// Handles OTC verification code rate limiting
const otcVerification = () => {
    otcVerificationInstance = otcVerificationInstance || createBruteInstance(
        spamOtcVerification,
        createOtcCodeFailCallback(),
        false
    );

    return otcVerificationInstance;
};

// Stops login attempts for a user+IP pair with increasing time periods
const userLogin = () => {
    userLoginInstance = userLoginInstance || createBruteInstance(
        spamUserLogin,
        createUserLoginFailCallback(),
        true
    );

    return userLoginInstance;
};

// Stops password reset requests per email with rate limiting
const userReset = function userReset() {
    userResetInstance = userResetInstance || createBruteInstance(
        spamUserReset,
        createPasswordResetFailCallback(spamUserReset),
        true
    );

    return userResetInstance;
};

// Handles user verification rate limiting
const userVerification = function userVerification() {
    userVerificationInstance = userVerificationInstance || createBruteInstance(
        spamUserVerification,
        createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        true
    );

    return userVerificationInstance;
};

// Handles verification code sending rate limiting
const sendVerificationCode = function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(
        spamSendVerificationCode,
        createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        true
    );

    return sendVerificationCodeInstance;
};

// Protects a private blog from spam attacks
const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createBruteInstance(
        spamPrivateBlock,
        createPrivateBlogFailCallback(spamPrivateBlock),
        false
    );

    return privateBlogInstance;
};

// Handles content API key rate limiting with memory store
const contentApiKey = () => {
    contentApiKeyInstance = contentApiKeyInstance || createMemoryBruteInstance(
        spamContentApiKey,
        createContentApiKeyFailCallback(),
        true
    );

    return contentApiKeyInstance;
};

module.exports = {
    globalBlock: globalBlock,
    globalReset: globalReset,
    userLogin: userLogin,
    sendVerificationCode: sendVerificationCode,
    userVerification: userVerification,
    membersAuth: membersAuth,
    membersAuthEnumeration: membersAuthEnumeration,
    otcVerification: otcVerification,
    otcVerificationEnumeration: otcVerificationEnumeration,
    userReset: userReset,
    privateBlog: privateBlog,
    contentApiKey: contentApiKey,
    webmentionsBlock: webmentionsBlock,
    emailPreviewBlock: emailPreviewBlock,
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
        emailPreviewBlockInstance = undefined;
        webmentionsBlockInstance = undefined;

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
};