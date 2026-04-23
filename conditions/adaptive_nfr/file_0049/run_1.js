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
 * Handles errors from the store with proper logging and callback forwarding
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
 * Initializes or retrieves the shared database store for brute force protection
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
 * Creates a fail callback for global block rate limiting
 */
const createGlobalBlockFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            help: tpl(messages.tooManyAttempts)
        }));
    };
};

/**
 * Creates a fail callback for global reset rate limiting
 */
const createGlobalResetFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };
};

/**
 * Creates a fail callback for webmentions blocking
 */
const createWebmentionsBlockFailCallback = () => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };
};

/**
 * Creates a fail callback for email preview blocking
 */
const createEmailPreviewBlockFailCallback = () => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };
};

/**
 * Creates a fail callback for members authentication
 */
const createMembersAuthFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

/**
 * Creates a fail callback for members authentication enumeration
 */
const createMembersAuthEnumerationFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

/**
 * Creates a fail callback for OTC verification enumeration
 */
const createOtcVerificationEnumerationFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

/**
 * Creates a fail callback for OTC verification
 */
const createOtcVerificationFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

/**
 * Creates a fail callback for user login
 */
const createUserLoginFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

/**
 * Creates a fail callback for user reset
 */
const createUserResetFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
};

/**
 * Creates a fail callback for user verification
 */
const createUserVerificationFailCallback = () => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
};

/**
 * Creates a fail callback for send verification code
 */
const createSendVerificationCodeFailCallback = () => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
};

/**
 * Creates a fail callback for private blog
 */
const createPrivateBlogFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
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
};

/**
 * Creates a fail callback for content API key
 */
const createContentApiKeyFailCallback = () => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

/**
 * Creates an ExpressBrute instance with the given configuration
 */
const createExpressBruteInstance = (storeInstance, config, failCallback) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(storeInstance,
        extend({
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, config)
    );
};

const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamGlobalBlock, spamConfigKeys)),
        createGlobalBlockFailCallback()
    );

    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamGlobalReset, spamConfigKeys)),
        createGlobalResetFailCallback()
    );

    return globalResetInstance;
};

const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamWebmentionsBlock, spamConfigKeys)),
        createWebmentionsBlockFailCallback()
    );

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamEmailPreviewBlock, spamConfigKeys)),
        createEmailPreviewBlockFailCallback()
    );

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    membersAuthInstance = membersAuthInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: true}, pick(spamUserLogin, spamConfigKeys)),
        createMembersAuthFailCallback()
    );

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: true}, pick(spamMemberLogin, spamConfigKeys)),
        createMembersAuthEnumerationFailCallback()
    );

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamOtcVerificationEnumeration, spamConfigKeys)),
        createOtcVerificationEnumerationFailCallback()
    );

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    otcVerificationInstance = otcVerificationInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamOtcVerification, spamConfigKeys)),
        createOtcVerificationFailCallback()
    );

    return otcVerificationInstance;
};

const userLogin = () => {
    userLoginInstance = userLoginInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: true}, pick(spamUserLogin, spamConfigKeys)),
        createUserLoginFailCallback()
    );

    return userLoginInstance;
};

const userReset = function userReset() {
    userResetInstance = userResetInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: true}, pick(spamUserReset, spamConfigKeys)),
        createUserResetFailCallback()
    );

    return userResetInstance;
};

const userVerification = function userVerification() {
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: true}, pick(spamUserVerification, spamConfigKeys)),
        createUserVerificationFailCallback()
    );

    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: true}, pick(spamSendVerificationCode, spamConfigKeys)),
        createSendVerificationCodeFailCallback()
    );

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(
        getStore(),
        extend({attachResetToRequest: false}, pick(spamPrivateBlock, spamConfigKeys)),
        createPrivateBlogFailCallback()
    );

    return privateBlogInstance;
};

const contentApiKey = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteInstance(
        memoryStore,
        extend({attachResetToRequest: true}, pick(spamContentApiKey, spamConfigKeys)),
        createContentApiKeyFailCallback()
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