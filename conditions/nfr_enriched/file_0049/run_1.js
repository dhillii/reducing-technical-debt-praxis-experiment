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
const createFailCallback = (messageConfig, contextMessage, helpMessage) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messageConfig.error || messageConfig, messageConfig),
            help: tpl(helpMessage || messageConfig.context)
        }));
    };
};

// Create a simple fail callback without time-based messaging
const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: message
        }));
    };
};

// Create an ExpressBrute instance with the given configuration
const createBruteInstance = (spamConfig, options = {}) => {
    const ExpressBrute = require('express-brute');
    const bruteStore = initializeStore();

    return new ExpressBrute(bruteStore,
        extend({
            attachResetToRequest: false,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys), options)
    );
};

// Global block: locks endpoint based on excessive requests from an IP
const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createBruteInstance(spamGlobalBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    });

    return globalBlockInstance;
};

// Global reset: rate limits password reset requests globally
const globalReset = () => {
    globalResetInstance = globalResetInstance || createBruteInstance(spamGlobalReset, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    });

    return globalResetInstance;
};

// Webmentions block: prevents spam from webmention attempts
const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(spamWebmentionsBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    });

    return webmentionsBlockInstance;
};

// Email preview block: limits test email sending
const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(spamEmailPreviewBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    });

    return emailPreviewBlockInstance;
};

// Members authentication: rate limits member login attempts
const membersAuth = () => {
    membersAuthInstance = membersAuthInstance || createBruteInstance(spamUserLogin, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });

    return membersAuthInstance;
};

// Members authentication enumeration: higher limits for cross-email attempts
const membersAuthEnumeration = () => {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(spamMemberLogin, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });

    return membersAuthEnumerationInstance;
};

// OTC verification enumeration: rate limits across multiple verification codes
const otcVerificationEnumeration = () => {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(spamOtcVerificationEnumeration, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    });

    return otcVerificationEnumerationInstance;
};

// OTC verification: rate limits attempts for a specific verification code
const otcVerification = () => {
    otcVerificationInstance = otcVerificationInstance || createBruteInstance(spamOtcVerification, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    });

    return otcVerificationInstance;
};

// User login: rate limits login attempts per user+IP with fibonacci backoff
const userLogin = () => {
    userLoginInstance = userLoginInstance || createBruteInstance(spamUserLogin, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });

    return userLoginInstance;
};

// User reset: rate limits password reset requests per email
const userReset = () => {
    userResetInstance = userResetInstance || createBruteInstance(spamUserReset, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    });

    return userResetInstance;
};

// User verification: rate limits user verification attempts
const userVerification = () => {
    userVerificationInstance = userVerificationInstance || createBruteInstance(spamUserVerification, {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });

    return userVerificationInstance;
};

// Send verification code: rate limits verification code sending
const sendVerificationCode = () => {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(spamSendVerificationCode, {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });

    return sendVerificationCodeInstance;
};

// Private blog: protects private blogs from spam attacks
const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createBruteInstance(spamPrivateBlock, {
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
    });

    return privateBlogInstance;
};

// Content API key: rate limits API key usage with in-memory store
const contentApiKey = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    contentApiKeyInstance = contentApiKeyInstance || new ExpressBrute(memoryStore,
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys))
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
    webmentionsBlockInstance = undefined;
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