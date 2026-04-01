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
 * Initializes or retrieves the database-backed brute force store
 * @returns {Object} The brute force store instance
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
 * Initializes or retrieves the memory-backed brute force store
 * @returns {Object} The memory store instance
 */
const getOrCreateMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Creates a fail callback for global block rate limiting
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @returns {Function} The fail callback function
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
 * @param {Object} spamConfig - The spam configuration object
 * @param {Function} failCallback - The fail callback function
 * @param {boolean} attachResetToRequest - Whether to attach reset to request
 * @returns {Object} The ExpressBrute instance
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
 * @param {Object} spamConfig - The spam configuration object
 * @param {Function} failCallback - The fail callback function
 * @param {boolean} attachResetToRequest - Whether to attach reset to request
 * @returns {Object} The ExpressBrute instance
 */
const createExpressBruteMemoryInstance = (spamConfig, failCallback, attachResetToRequest = false) => {
    const ExpressBrute = require('express-brute');
    const memStore = getOrCreateMemoryStore();

    return new ExpressBrute(memStore,
        extend({
            attachResetToRequest: attachResetToRequest,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys))
    );
};

/**
 * Locks a single endpoint based on excessive requests from an IP.
 * Currently only used for auth type methods.
 * Allows for a generous number of requests to prevent communities on the same IP being barred.
 * Defaults to 50 attempts per hour and locks the endpoint for an hour.
 * @returns {Object} The ExpressBrute instance
 */
const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(
        spamGlobalBlock,
        createGlobalBlockFailCallback(),
        false
    );

    return globalBlockInstance;
};

/**
 * Creates a global reset rate limiter
 * @returns {Object} The ExpressBrute instance
 */
const globalReset = () => {
    globalResetInstance = globalResetInstance || createExpressBruteInstance(
        spamGlobalReset,
        createGlobalResetFailCallback(),
        false
    );

    return globalResetInstance;
};

/**
 * Creates a webmentions block rate limiter
 * @returns {Object} The ExpressBrute instance
 */
const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(
        spamWebmentionsBlock,
        createWebmentionsBlockFailCallback(),
        false
    );

    return webmentionsBlockInstance;
};

/**
 * Creates an email preview block rate limiter
 * @returns {Object} The ExpressBrute instance
 */
const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(
        spamEmailPreviewBlock,
        createEmailPreviewBlockFailCallback(),
        false
    );

    return emailPreviewBlockInstance;
};

/**
 * Creates a members authentication rate limiter
 * @returns {Object} The ExpressBrute instance
 */
const membersAuth = () => {
    membersAuthInstance = membersAuthInstance ||