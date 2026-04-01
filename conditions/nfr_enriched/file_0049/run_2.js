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

// Create a failure callback for rate limit errors with time-based messaging
const createFailCallback = (messageConfig, contextKey, helpKey) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messageConfig.error || messageConfig.context || messages.tooManyAttempts),
            help: tpl(messages[helpKey] || messageConfig.context || messages.tooManyAttempts)
        }));
    };
};

// Create a simple failure callback for rate limit errors without time-based messaging
const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: message
        }));
    };
};

// Create a failure callback for OTC verification enumeration attempts
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

// Create a failure callback for OTC verification code-specific attempts
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

// Create a failure callback for members authentication attempts
const createMembersAuthFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a failure callback for members authentication enumeration attempts
const createMembersAuthEnumerationFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a failure callback for user login attempts
const createUserLoginFailCallback = () => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

// Create a failure callback for user password reset attempts
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

// Create a failure callback for global block attempts
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

// Create a failure callback for global reset attempts
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

// Create a failure callback for private blog attempts
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

// Create a failure callback for content API key attempts
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
    return new ExpressBrute(getStore(),
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

const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createBruteInstance(
        spamGlobalBlock,
        createGlobalBlockFailCallback(),
        false
    );
    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createBruteInstance(
        spamGlobalReset,
        createGlobalResetFailCallback(),
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
    membersAuthInstance = membersAuthInstance || createBruteInstance(
        spamUserLogin,
        createMembersAuthFailCallback(),
        true
    );
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(
        spamMemberLogin,
        createMembersAuthEnumerationFailCallback(),
        true
    );
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(
        spamOtcVerificationEnumeration,
        createOtcEnumerationFailCallback(),
        false
    );
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    otcVerificationInstance = otcVerificationInstance || createBruteInstance(
        spamOtcVerification,
        createOtcVerificationFailCallback(),
        false
    );
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

const userReset = () => {
    userResetInstance = userResetInstance || createBruteInstance(
        spamUserReset,
        createUserResetFailCallback(),
        true
    );
    return userResetInstance;
};

const userVerification = () => {
    userVerificationInstance = userVerificationInstance || createBruteInstance(
        spamUserVerification,
        createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        true
    );
    return userVerificationInstance;
};

const sendVerificationCode = () => {
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
        createContentApiKeyFailCallback(),
        true
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
    otcVerificationEnumerationInstance = undefined;
    otcVerificationInstance = undefined;
    webmentionsBlockInstance = undefined;
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
```