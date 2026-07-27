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
const createFailCallback = (messageConfig, params = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messageConfig.message || `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const context = messageConfig.context || tpl(messages.tooManyAttempts);
        const help = messageConfig.help || context;
        const code = messageConfig.code;

        const errorConfig = {
            message,
            context,
            help
        };

        if (code) {
            errorConfig.code = code;
        }

        return next(new errors.TooManyRequestsError(errorConfig));
    };
};

// Create a fail callback for rate limit errors without time-based messaging
const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message
        }));
    };
};

// Create a fail callback for private blog with logging
const createPrivateBlogFailCallback = (spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
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

// Create a fail callback for content API key with logging
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
    const bruteStore = getStore();

    return new ExpressBrute(bruteStore, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

// Create an ExpressBrute instance with memory store
const createMemoryBruteInstance = (config, failCallback, attachReset = false) => {
    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

// Locks a single endpoint based on excessive requests from an IP
const globalBlock = () => {
    if (!globalBlockInstance) {
        const failCallback = createFailCallback({
            message: `Too many attempts try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        });
        globalBlockInstance = createBruteInstance(spamGlobalBlock, failCallback, false);
    }
    return globalBlockInstance;
};

// Handles global password reset rate limiting
const globalReset = () => {
    if (!globalResetInstance) {
        const failCallback = createFailCallback({
            message: `Too many attempts try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        });
        globalResetInstance = createBruteInstance(spamGlobalReset, failCallback, false);
    }
    return globalResetInstance;
};

// Handles webmentions rate limiting
const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        const failCallback = createSimpleFailCallback(messages.webmentionsBlock);
        webmentionsBlockInstance = createBruteInstance(spamWebmentionsBlock, failCallback, false);
    }
    return webmentionsBlockInstance;
};

// Handles email preview rate limiting
const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        const failCallback = createSimpleFailCallback(messages.emailPreviewBlock);
        emailPreviewBlockInstance = createBruteInstance(spamEmailPreviewBlock, failCallback, false);
    }
    return emailPreviewBlockInstance;
};

// Handles members authentication rate limiting
const membersAuth = () => {
    if (!membersAuthInstance) {
        const failCallback = createFailCallback({
            message: `Too many sign-in attempts try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        });
        membersAuthInstance = createBruteInstance(spamUserLogin, failCallback, true);
    }
    return membersAuthInstance;
};

// Handles members authentication enumeration rate limiting with higher limits
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        const failCallback = createFailCallback({
            message: `Too many different sign-in attempts, try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        });
        membersAuthEnumerationInstance = createBruteInstance(spamMemberLogin, failCallback, true);
    }
    return membersAuthEnumerationInstance;
};

// Handles OTC verification enumeration rate limiting
const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        const failCallback = createFailCallback({
            message: `Too many verification attempts across multiple codes, try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        });
        otcVerificationEnumerationInstance = createBruteInstance(spamOtcVerificationEnumeration, failCallback, false);
    }
    return otcVerificationEnumerationInstance;
};

// Handles OTC verification rate limiting per code
const otcVerification = () => {
    if (!otcVerificationInstance) {
        const failCallback = createFailCallback({
            message: `Too many attempts for this verification code, try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        });
        otcVerificationInstance = createBruteInstance(spamOtcVerification, failCallback, false);
    }
    return otcVerificationInstance;
};

// Stops login attempts for a user+IP pair with increasing time periods
const userLogin = () => {
    if (!userLoginInstance) {
        const failCallback = createFailCallback({
            message: `Too many login attempts. Please wait ${moment().add(1, 'hour').fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        });
        userLoginInstance = createBruteInstance(spamUserLogin, failCallback, true);
    }
    return userLoginInstance;
};

// Stops password reset requests when exceeding rate limits
const userReset = () => {
    if (!userResetInstance) {
        const failCallback = createFailCallback({
            message: `Too many password reset attempts try again in ${moment().add(1, 'hour').fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        });
        userResetInstance = createBruteInstance(spamUserReset, failCallback, true);
    }
    return userResetInstance;
};

// Handles user verification rate limiting
const userVerification = () => {
    if (!userVerificationInstance) {
        const failCallback = createSimpleFailCallback(tpl(messages.tooManyAttempts));
        userVerificationInstance = createBruteInstance(spamUserVerification, failCallback, true);
    }
    return userVerificationInstance;
};

// Handles verification code sending rate limiting
const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        const failCallback = createSimpleFailCallback(tpl(messages.tooManyAttempts));
        sendVerificationCodeInstance = createBruteInstance(spamSendVerificationCode, failCallback, true);
    }
    return sendVerificationCodeInstance;
};

// Protects a private blog from spam attacks
const privateBlog = () => {
    if (!privateBlogInstance) {
        const failCallback = createPrivateBlogFailCallback(spamPrivateBlock);
        privateBlogInstance = createBruteInstance(spamPrivateBlock, failCallback, false);
    }
    return privateBlogInstance;
};

// Handles content API key rate limiting with memory store
const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        const failCallback = createContentApiKeyFailCallback();
        contentApiKeyInstance = createMemoryBruteInstance(spamContentApiKey, failCallback, true);
    }
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
        emailPreviewBlockInstance = undefined;
        otcVerificationEnumerationInstance = undefined;
        otcVerificationInstance = undefined;
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