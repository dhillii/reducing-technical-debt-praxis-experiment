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

// Create a standard TooManyRequestsError with time-based message
const createTimeBasedError = (baseMessage, context, help, nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `${baseMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: context,
        help: help
    });
};

// Create a simple TooManyRequestsError without time information
const createSimpleError = (message) => {
    return new errors.TooManyRequestsError({
        message: message
    });
};

// Create ExpressBrute instance with database store
const createExpressBruteInstance = (config) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getStore(), config);
};

// Create ExpressBrute instance with memory store
const createExpressBruteMemoryInstance = (config) => {
    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();
    return new ExpressBrute(memoryStore, config);
};

// Build configuration for ExpressBrute with standard error handling
const buildBruteConfig = (spamConfig, failCallback) => {
    return extend({
        attachResetToRequest: false,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys));
};

// Build configuration for ExpressBrute with request reset attachment
const buildBruteConfigWithReset = (spamConfig, failCallback) => {
    return extend({
        attachResetToRequest: true,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys));
};

// Global block: Locks endpoint based on excessive requests from an IP
const globalBlock = () => {
    if (globalBlockInstance) {
        return globalBlockInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createTimeBasedError(
            'Too many attempts',
            tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            }),
            tpl(messages.tooManyAttempts),
            nextValidRequestDate
        ));
    };

    globalBlockInstance = createExpressBruteInstance(buildBruteConfig(spamGlobalBlock, failCallback));
    return globalBlockInstance;
};

// Global reset: Rate limits password reset requests globally
const globalReset = () => {
    if (globalResetInstance) {
        return globalResetInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createTimeBasedError(
            'Too many attempts',
            tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            }),
            tpl(messages.forgottenPasswordIp.context),
            nextValidRequestDate
        ));
    };

    globalResetInstance = createExpressBruteInstance(buildBruteConfig(spamGlobalReset, failCallback));
    return globalResetInstance;
};

// Webmentions block: Prevents excessive mention attempts
const webmentionsBlock = () => {
    if (webmentionsBlockInstance) {
        return webmentionsBlockInstance;
    }

    const failCallback = (req, res, next) => {
        return next(createSimpleError(messages.webmentionsBlock));
    };

    webmentionsBlockInstance = createExpressBruteInstance(buildBruteConfig(spamWebmentionsBlock, failCallback));
    return webmentionsBlockInstance;
};

// Email preview block: Limits test email sending
const emailPreviewBlock = () => {
    if (emailPreviewBlockInstance) {
        return emailPreviewBlockInstance;
    }

    const failCallback = (req, res, next) => {
        return next(createSimpleError(messages.emailPreviewBlock));
    };

    emailPreviewBlockInstance = createExpressBruteInstance(buildBruteConfig(spamEmailPreviewBlock, failCallback));
    return emailPreviewBlockInstance;
};

// Members authentication: Rate limits member sign-in attempts
const membersAuth = () => {
    if (membersAuthInstance) {
        return membersAuthInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createTimeBasedError(
            'Too many sign-in attempts',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context),
            nextValidRequestDate
        ));
    };

    membersAuthInstance = createExpressBruteInstance(buildBruteConfigWithReset(spamUserLogin, failCallback));
    return membersAuthInstance;
};

// Members authentication enumeration: Higher limits for cross-email sign-in attempts
const membersAuthEnumeration = () => {
    if (membersAuthEnumerationInstance) {
        return membersAuthEnumerationInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createTimeBasedError(
            'Too many different sign-in attempts',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context),
            nextValidRequestDate
        ));
    };

    membersAuthEnumerationInstance = createExpressBruteInstance(buildBruteConfigWithReset(spamMemberLogin, failCallback));
    return membersAuthEnumerationInstance;
};

// OTC verification enumeration: Rate limits verification attempts across multiple codes
const otcVerificationEnumeration = () => {
    if (otcVerificationEnumerationInstance) {
        return otcVerificationEnumerationInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };

    otcVerificationEnumerationInstance = createExpressBruteInstance(buildBruteConfig(spamOtcVerificationEnumeration, failCallback));
    return otcVerificationEnumerationInstance;
};

// OTC verification: Rate limits verification attempts for a specific code
const otcVerification = () => {
    if (otcVerificationInstance) {
        return otcVerificationInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };

    otcVerificationInstance = createExpressBruteInstance(buildBruteConfig(spamOtcVerification, failCallback));
    return otcVerificationInstance;
};

// User login: Rate limits login attempts per user+IP with fibonacci backoff
const userLogin = () => {
    if (userLoginInstance) {
        return userLoginInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createTimeBasedError(
            'Too many login attempts. Please wait',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context),
            nextValidRequestDate
        ));
    };

    userLoginInstance = createExpressBruteInstance(buildBruteConfigWithReset(spamUserLogin, failCallback));
    return userLoginInstance;
};

// User reset: Rate limits password reset requests per email
const userReset = () => {
    if (userResetInstance) {
        return userResetInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createTimeBasedError(
            'Too many password reset attempts',
            tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            }),
            tpl(messages.forgottenPasswordEmail.context),
            nextValidRequestDate
        ));
    };

    userResetInstance = createExpressBruteInstance(buildBruteConfigWithReset(spamUserReset, failCallback));
    return userResetInstance;
};

// User verification: Rate limits user verification attempts
const userVerification = () => {
    if (userVerificationInstance) {
        return userVerificationInstance;
    }

    const failCallback = (req, res, next) => {
        return next(createSimpleError(tpl(messages.tooManyAttempts)));
    };

    userVerificationInstance = createExpressBruteInstance(buildBruteConfigWithReset(spamUserVerification, failCallback));
    return userVerificationInstance;
};

// Send verification code: Rate limits verification code sending
const sendVerificationCode = () => {
    if (sendVerificationCodeInstance) {
        return sendVerificationCodeInstance;
    }

    const failCallback = (req, res, next) => {
        return next(createSimpleError(tpl(messages.tooManyAttempts)));
    };

    sendVerificationCodeInstance = createExpressBruteInstance(buildBruteConfigWithReset(spamSendVerificationCode, failCallback));
    return sendVerificationCodeInstance;
};

// Private blog: Protects private blogs from spam attacks
const privateBlog = () => {
    if (privateBlogInstance) {
        return privateBlogInstance;
    }

    const failCallback = (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(createTimeBasedError(
            'Too many private sign-in attempts',
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context),
            nextValidRequestDate
        ));
    };

    privateBlogInstance = createExpressBruteInstance(buildBruteConfig(spamPrivateBlock, failCallback));
    return privateBlogInstance;
};

// Content API key: Rate limits API key usage with memory store
const contentApiKey = () => {
    if (contentApiKeyInstance) {
        return contentApiKeyInstance;
    }

    const failCallback = (req, res, next) => {
        const err = createSimpleError(tpl(messages.tooManyAttempts));
        logging.error(err);
        return next(err);
    };

    const config = extend({
        attachResetToRequest: true,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys));

    contentApiKeyInstance = createExpressBruteMemoryInstance(config);
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