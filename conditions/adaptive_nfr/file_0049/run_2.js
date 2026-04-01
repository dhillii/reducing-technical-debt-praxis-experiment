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

/**
 * Handles errors from the brute force store
 * @param {Error} err - The error object
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
 * @returns {Object} BruteKnex store instance
 */
const getOrCreateStore = () => {
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
 * Creates a fail callback for rate limit exceeded scenarios with time-based message
 * @param {string} errorMessage - The error message template
 * @param {Object} context - Context object for the error
 * @param {string} help - Help text for the error
 * @returns {Function} Fail callback function
 */
const createTimeBasedFailCallback = (errorMessage, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `${errorMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: context,
            help: help
        }));
    };
};

/**
 * Creates a fail callback for rate limit exceeded scenarios without time-based message
 * @param {string} message - The error message
 * @returns {Function} Fail callback function
 */
const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: message
        }));
    };
};

/**
 * Creates a fail callback for OTC verification enumeration
 * @returns {Function} Fail callback function
 */
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

/**
 * Creates a fail callback for OTC verification per code
 * @returns {Function} Fail callback function
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
 * Creates a fail callback for members authentication
 * @returns {Function} Fail callback function
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
 * @returns {Function} Fail callback function
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
 * Creates a fail callback for user login
 * @returns {Function} Fail callback function
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
 * Creates a fail callback for user password reset
 * @returns {Function} Fail callback function
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
 * Creates a fail callback for global block
 * @returns {Function} Fail callback function
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
 * Creates a fail callback for global reset
 * @returns {Function} Fail callback function
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
 * Creates a fail callback for private blog
 * @returns {Function} Fail callback function
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
 * @returns {Function} Fail callback function
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
 * Creates an ExpressBrute instance with database store
 * @param {Object} spamConfig - Spam configuration object
 * @param {Function} failCallback - Callback function for rate limit exceeded
 * @param {boolean} attachResetToRequest - Whether to attach reset to request
 * @returns {Object} ExpressBrute instance
 */
const createExpressBruteInstance = (spamConfig, failCallback, attachResetToRequest = false) => {
    const ExpressBrute = require('express-brute');
    const storeInstance = getOrCreateStore();

    return new ExpressBrute(storeInstance,
        extend({
            attachResetToRequest: attachResetToRequest,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys))
    );
};

/**
 * Creates an ExpressBrute instance with memory store
 * @param {Object} spamConfig - Spam configuration object
 * @param {Function} failCallback - Callback function for rate limit exceeded
 * @returns {Object} ExpressBrute instance
 */
const createExpressBruteMemoryInstance = (spamConfig, failCallback) => {
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

// This locks a single endpoint based on excessive requests from an IP.
// Currently only used for auth type methods.
// We allow for a generous number of requests here to prevent communites on the same IP bing barred on account of a single user
// Defaults to 50 attempts per hour and locks the endpoint for an hour
const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createExpressBruteInstance(
            spamGlobalBlock,
            createGlobalBlockFailCallback(),
            false
        );
    }

    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createExpressBruteInstance(
            spamGlobalReset,
            createGlobalResetFailCallback(),
            false
        );
    }

    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createExpressBruteInstance(
            spamWebmentionsBlock,
            createSimpleFailCallback(messages.webmentionsBlock),
            false
        );
    }

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createExpressBruteInstance(
            spamEmailPreviewBlock,
            createSimpleFailCallback(messages.emailPreviewBlock),
            false
        );
    }

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createExpressBruteInstance(
            spamUserLogin,
            createMembersAuthFailCallback(),
            true
        );
    }

    return membersAuthInstance;
};

/**
 * This one should have higher limits because it checks across all email addresses
 */
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createExpressBruteInstance(
            spamMemberLogin,
            createMembersAuthEnumerationFailCallback(),
            true
        );
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createExpressBruteInstance(
            spamOtcVerificationEnumeration,
            createOtcEnumerationFailCallback(),
            false
        );
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createExpressBruteInstance(
            spamOtcVerification,
            createOtc