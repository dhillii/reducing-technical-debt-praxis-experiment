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

// Extract spam configuration into separate objects for consistency
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
 * Handles errors from the underlying brute store
 * Converts internal errors to Ghost's InternalServerError if needed
 */
const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    if (err.next) {
        err.next(customError);
    } else {
        logging.error(err);
    }
};

/**
 * Constructs a failCallback for rate limiting middleware
 * @param {Object} options - Configuration options
 * @param {string} options.message - User-facing message
 * @param {string} [options.context] - Error context for translation
 * @param {string} [options.code] - Error code for client handling
 * @param {Function} [options.formatMessage] - Optional function to format dynamic message
 * @returns {Function} Express middleware callback
 */
const createFailCallback = ({ message, context, code, formatMessage }) => {
    return (req, res, next, nextValidRequestDate) => {
        const formattedMessage = formatMessage
            ? formatMessage(nextValidRequestDate)
            : message;

        const errorConfig = {
            message: formattedMessage
        };

        if (context) {
            errorConfig.context = tpl(context);
            errorConfig.help = tpl(context);
        }

        if (code) {
            errorConfig.code = code;
        }

        next(new errors.TooManyRequestsError(errorConfig));
    };
};

/**
 * Creates a standard ExpressBrute instance using a shared DB store
 * @param {Object} configOptions - ExpressBrute configuration options
 * @param {Object} configOptions.failCallback - Function to call when rate limited
 * @returns {Object} ExpressBrute instance
 */
function createRateLimiter(configOptions) {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(configOptions, spamConfigKeys)));
}

/**
 * Creates a rate limiter using memory store for API key limiting
 * @param {Object} configOptions - ExpressBrute configuration options
 * @param {Object} configOptions.failCallback - Function to call when rate limited
 * @returns {Object} ExpressBrute instance
 */
function createMemoryRateLimiter(configOptions) {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError
    }, pick(configOptions, spamConfigKeys)));
}

/**
 * Creates a failure callback with dynamic message formatting based on nextValidRequestDate
 * @param {string} baseMessage - Base message to use with moment formatting
 * @param {string} [context] - Error context string
 * @param {string} [code] - Optional error code
 * @returns {Function} Callback with dynamic formatting
 */
function createDynamicFailCallback(baseMessage, context, code) {
    return (req, res, next, nextValidRequestDate) => {
        const formattedMessage = baseMessage.replace(/(?:{momentFormat})?/, '').trim();
        const messageWithRelativeTime = `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;

        const errorConfig = {
            message: messageWithRelativeTime
        };

        if (context) {
            errorConfig.context = tpl(context);
            errorConfig.help = tpl(context);
        }

        if (code) {
            errorConfig.code = code;
        }

        next(new errors.TooManyRequestsError(errorConfig));
    };
}

// --- Specific Rate Limiters ---

const globalBlock = () => {
    const baseMessage = tpl(messages.forgottenPasswordIp.error, {
        rfa: spamGlobalBlock.freeRetries + 1 || 5,
        rfp: spamGlobalBlock.lifetime || 60 * 60
    });
    const context = tpl(messages.forgottenPasswordIp.context);

    if (!globalBlockInstance) {
        globalBlockInstance = createRateLimiter({
            failCallback: createFailCallback({
                message: `Too many attempts try again in {momentFormat}`,
                context,
                formatMessage: (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamGlobalBlock
        });
    }

    return globalBlockInstance;
};

const globalReset = () => {
    const baseMessage = tpl(messages.forgottenPasswordIp.error, {
        rfa: spamGlobalReset.freeRetries + 1 || 5,
        rfp: spamGlobalReset.lifetime || 60 * 60
    });
    const context = tpl(messages.forgottenPasswordIp.context);

    if (!globalResetInstance) {
        globalResetInstance = createRateLimiter({
            failCallback: createFailCallback({
                message: `Too many attempts try again in {momentFormat}`,
                context,
                formatMessage: (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamGlobalReset
        });
    }

    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createRateLimiter({
            failCallback: createFailCallback({
                message: messages.webmentionsBlock
            }),
            ...spamWebmentionsBlock
        });
    }

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createRateLimiter({
            failCallback: createFailCallback({
                message: messages.emailPreviewBlock
            }),
            ...spamEmailPreviewBlock
        });
    }

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createRateLimiter({
            attachResetToRequest: true,
            failCallback: createFailCallback({
                message: 'Too many sign-in attempts try again in {momentFormat}',
                context: tpl(messages.tooManySigninAttempts.context),
                formatMessage: (nextValidRequestDate) => `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamUserLogin
        });
    }

    return membersAuthInstance;
};

/**
 * This one should have higher limits because it checks across all email addresses
 */
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createRateLimiter({
            attachResetToRequest: true,
            failCallback: createFailCallback({
                message: 'Too many different sign-in attempts, try again in {momentFormat}',
                context: tpl(messages.tooManySigninAttempts.context),
                formatMessage: (nextValidRequestDate) => `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamMemberLogin
        });
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createRateLimiter({
            attachResetToRequest: false,
            failCallback: createFailCallback({
                message: 'Too many verification attempts across multiple codes, try again in {momentFormat}',
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED',
                formatMessage: (nextValidRequestDate) => `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamOtcVerificationEnumeration
        });
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createRateLimiter({
            attachResetToRequest: false,
            failCallback: createFailCallback({
                message: 'Too many attempts for this verification code, try again in {momentFormat}',
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED',
                formatMessage: (nextValidRequestDate) => `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamOtcVerification
        });
    }

    return otcVerificationInstance;
};

/**
 * Stops login attempts for a user+IP pair with an increasing time period starting from 10 minutes
 * and rising to a week in a fibonnaci sequence
 * The user+IP count is reset when on successful login
 * Default value of 5 attempts per user+IP pair
 */
const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = createRateLimiter({
            attachResetToRequest: true,
            failCallback: createFailCallback({
                message: 'Too many login attempts. Please wait {momentFormat} before trying again, or reset your password.',
                context: tpl(messages.tooManySigninAttempts.context),
                formatMessage: (nextValidRequestDate) => `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`
            }),
            ...spamUserLogin
        });
    }

    return userLoginInstance;
};

/**
 * Stop password reset requests when there are (freeRetries + 1) requests per lifetime per email
 * Defaults here are 5 attempts per hour for a user+IP pair
 * The endpoint is then locked for an hour
 */
const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createRateLimiter({
            attachResetToRequest: true,
            failCallback: createFailCallback({
                message: 'Too many password reset attempts try again in {momentFormat}',
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                formatMessage: (nextValidRequestDate) => `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }),
            ...spamUserReset
        });
    }

    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createRateLimiter({
            attachResetToRequest: true,
            failCallback: createFailCallback({
                message: tpl(messages.tooManyAttempts)
            }),
            ...spamUserVerification
        });
    }

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createRateLimiter({
            attachResetToRequest: true,
            failCallback: createFailCallback({
                message: tpl(messages.tooManyAttempts)
            }),
            ...spamSendVerificationCode
        });
    }

    return sendVerificationCodeInstance;
};

/**
 * Protects a private blog from spam attacks
 * The defaults allow 10 attempts per IP per hour
 * The endpoint is then locked for an hour
 */
const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createRateLimiter({
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                const message = tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                });

                logging.error(new errors.TooManyRequestsError({
                    message,
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            },
            ...spamPrivateBlock
        });
    }

    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createMemoryRateLimiter({
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            },
            ...spamContentApiKey
        });
    }

    return contentApiKeyInstance;
};

module.exports = {
    globalBlock,
    globalReset,
    userLogin,
    sendVerificationCode,
    userVerification,
    membersAuth,
    membersAuthEnumeration,
    otcVerification,
    otcVerificationEnumeration,
    userReset,
    privateBlog,
    contentApiKey,
    webmentionsBlock,
    emailPreviewBlock,
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