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

// Initialize the database store for brute force protection
const initializeStore = () => {
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
};

// Create a fail callback for rate limit errors with time-based messaging
const createFailCallback = (messageConfig, spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = typeof messageConfig === 'string'
            ? messageConfig
            : `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;

        const context = messageConfig.context || messageConfig.error || messages.tooManyAttempts;
        const error = messageConfig.error
            ? tpl(messageConfig.error, {
                rfa: spamConfig.freeRetries + 1 || 5,
                rfp: spamConfig.lifetime || 60 * 60,
                rateSigninAttempts: spamConfig.freeRetries + 1 || 5,
                rateSigninPeriod: spamConfig.lifetime || 60 * 60
            })
            : null;

        return next(new errors.TooManyRequestsError({
            message: message,
            context: error || context,
            help: context
        }));
    };
};

// Create a fail callback for OTC verification with specific error codes
const createOtcFailCallback = (errorCode) => {
    return (req, res, next, nextValidRequestDate) => {
        const isEnumeration = errorCode === 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED';
        const message = isEnumeration
            ? `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`
            : `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`;

        return next(new errors.TooManyRequestsError({
            message: message,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: errorCode
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
const createBruteInstance = (spamConfig, failCallback, attachReset = false) => {
    const ExpressBrute = require('express-brute');
    const storeInstance = initializeStore();

    return new ExpressBrute(storeInstance,
        extend({
            attachResetToRequest: attachReset,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys))
    );
};

// Create an ExpressBrute instance with memory store
const createMemoryBruteInstance = (spamConfig, failCallback) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore,
        extend({
            attachResetToRequest: true,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys))
    );
};

// Locks a single endpoint based on excessive requests from an IP
const globalBlock = () => {
    if (globalBlockInstance) {
        return globalBlockInstance;
    }

    const failCallback = createFailCallback(messages.forgottenPasswordIp, spamGlobalBlock);
    globalBlockInstance = createBruteInstance(spamGlobalBlock, failCallback, false);

    return globalBlockInstance;
};

// Protects global password reset endpoint
const globalReset = () => {
    if (globalResetInstance) {
        return globalResetInstance;
    }

    const failCallback = createFailCallback(messages.forgottenPasswordIp, spamGlobalReset);
    globalResetInstance = createBruteInstance(spamGlobalReset, failCallback, false);

    return globalResetInstance;
};

// Protects webmentions endpoint from spam
const webmentionsBlock = () => {
    if (webmentionsBlockInstance) {
        return webmentionsBlockInstance;
    }

    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };

    webmentionsBlockInstance = createBruteInstance(spamWebmentionsBlock, failCallback, false);

    return webmentionsBlockInstance;
};

// Protects email preview endpoint from spam
const emailPreviewBlock = () => {
    if (emailPreviewBlockInstance) {
        return emailPreviewBlockInstance;
    }

    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };

    emailPreviewBlockInstance = createBruteInstance(spamEmailPreviewBlock, failCallback, false);

    return emailPreviewBlockInstance;
};

// Protects members authentication endpoint
const membersAuth = () => {
    if (membersAuthInstance) {
        return membersAuthInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    membersAuthInstance = createBruteInstance(spamUserLogin, failCallback, true);

    return membersAuthInstance;
};

// Protects members authentication enumeration with higher limits
const membersAuthEnumeration = () => {
    if (membersAuthEnumerationInstance) {
        return membersAuthEnumerationInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    membersAuthEnumerationInstance = createBruteInstance(spamMemberLogin, failCallback, true);

    return membersAuthEnumerationInstance;
};

// Protects OTC verification enumeration across multiple codes
const otcVerificationEnumeration = () => {
    if (otcVerificationEnumerationInstance) {
        return otcVerificationEnumerationInstance;
    }

    const failCallback = createOtcFailCallback('OTC_TOTAL_ATTEMPTS_RATE_LIMITED');
    otcVerificationEnumerationInstance = createBruteInstance(spamOtcVerificationEnumeration, failCallback, false);

    return otcVerificationEnumerationInstance;
};

// Protects OTC verification for individual codes
const otcVerification = () => {
    if (otcVerificationInstance) {
        return otcVerificationInstance;
    }

    const failCallback = createOtcFailCallback('OTC_CODE_ATTEMPTS_RATE_LIMITED');
    otcVerificationInstance = createBruteInstance(spamOtcVerification, failCallback, false);

    return otcVerificationInstance;
};

// Stops login attempts for a user+IP pair with increasing time periods
const userLogin = () => {
    if (userLoginInstance) {
        return userLoginInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    userLoginInstance = createBruteInstance(spamUserLogin, failCallback, true);

    return userLoginInstance;
};

// Stops password reset requests when exceeding rate limits
const userReset = () => {
    if (userResetInstance) {
        return userResetInstance;
    }

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

    userResetInstance = createBruteInstance(spamUserReset, failCallback, true);

    return userResetInstance;
};

// Protects user verification endpoint
const userVerification = () => {
    if (userVerificationInstance) {
        return userVerificationInstance;
    }

    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    userVerificationInstance = createBruteInstance(spamUserVerification, failCallback, true);

    return userVerificationInstance;
};

// Protects verification code sending endpoint
const sendVerificationCode = () => {
    if (sendVerificationCodeInstance) {
        return sendVerificationCodeInstance;
    }

    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    sendVerificationCodeInstance = createBruteInstance(spamSendVerificationCode, failCallback, true);

    return sendVerificationCodeInstance;
};

// Protects private blog from spam attacks
const privateBlog = () => {
    if (privateBlogInstance) {
        return privateBlogInstance;
    }

    const failCallback = createPrivateBlogFailCallback(spamPrivateBlock);
    privateBlogInstance = createBruteInstance(spamPrivateBlock, failCallback, false);

    return privateBlogInstance;
};

// Protects content API key endpoint with memory store
const contentApiKey = () => {
    if (contentApiKeyInstance) {
        return contentApiKeyInstance;
    }

    const failCallback = createContentApiKeyFailCallback();
    contentApiKeyInstance = createMemoryBruteInstance(spamContentApiKey, failCallback);

    return contentApiKeyInstance;
};

// Reset all instances and reload configuration
const resetInstances = () => {
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
    reset: resetInstances
};