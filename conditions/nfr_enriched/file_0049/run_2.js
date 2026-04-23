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
            message: `${message} try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: messageConfig.context || tpl(messages.tooManySigninAttempts.context),
            help: messageConfig.context || tpl(messages.tooManyAttempts)
        }));
    };
};

// Create a fail callback for rate limit errors without time-based messaging
const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: message
        }));
    };
};

// Create a fail callback for OTC verification with error codes
const createOtcFailCallback = (errorCode) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: errorCode
        }));
    };
};

// Create a fail callback for members authentication
const createMembersAuthFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a fail callback for members auth enumeration
const createMembersAuthEnumerationFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a fail callback for user login
const createUserLoginFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a fail callback for private blog
const createPrivateBlogFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
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
};

// Create a fail callback for content API key
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
    const storeInstance = initializeStore();

    return new ExpressBrute(storeInstance,
        extend({
            attachResetToRequest: attachReset,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );
};

// Create an ExpressBrute instance with memory store
const createMemoryBruteInstance = (config, failCallback) => {
    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore,
        extend({
            attachResetToRequest: true,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );
};

const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createBruteInstance(
        spamGlobalBlock,
        createFailCallback(messages.forgottenPasswordIp, spamGlobalBlock),
        false
    );

    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createBruteInstance(
        spamGlobalReset,
        createFailCallback(messages.forgottenPasswordIp, spamGlobalReset),
        false
    );

    return globalResetInstance;
};

const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(
        spamWebmentionsBlock,
        createSimpleFailCallback(messages.webmentionsBlock),
        false
    );

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(
        spamEmailPreviewBlock,
        createSimpleFailCallback(messages.emailPreviewBlock),
        false
    );

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(
            spamUserLogin,
            createMembersAuthFailCallback(),
            true
        );
    }

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(
            spamMemberLogin,
            createMembersAuthEnumerationFailCallback(),
            true
        );
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(
            spamOtcVerificationEnumeration,
            createOtcFailCallback('OTC_TOTAL_ATTEMPTS_RATE_LIMITED'),
            false
        );
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(
            spamOtcVerification,
            createOtcFailCallback('OTC_CODE_ATTEMPTS_RATE_LIMITED'),
            false
        );
    }

    return otcVerificationInstance;
};

const userLogin = () => {
    userLoginInstance = userLoginInstance || createBruteInstance(
        spamUserLogin,
        createUserLoginFailCallback(),
        true
    );

    return userLoginInstance;
};

const userReset = function userReset() {
    userResetInstance = userResetInstance || createBruteInstance(
        spamUserReset,
        createFailCallback(messages.forgottenPasswordEmail, spamUserReset),
        true
    );

    return userResetInstance;
};

const userVerification = function userVerification() {
    userVerificationInstance = userVerificationInstance || createBruteInstance(
        spamUserVerification,
        createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        true
    );

    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(
        spamSendVerificationCode,
        createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        true
    );

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createBruteInstance(
        spamPrivateBlock,
        createPrivateBlogFailCallback(),
        false
    );

    return privateBlogInstance;
};

const contentApiKey = () => {
    contentApiKeyInstance = contentApiKeyInstance || createMemoryBruteInstance(
        spamContentApiKey,
        createContentApiKeyFailCallback()
    );

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
    webmentionsBlockInstance = undefined;
    otcVerificationEnumerationInstance = undefined;
    otcVerificationInstance = undefined;
};

// Reload spam configuration from config
const reloadSpamConfig = () => {
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
    reset: () => {
        resetInstances();
        reloadSpamConfig();
    }
};