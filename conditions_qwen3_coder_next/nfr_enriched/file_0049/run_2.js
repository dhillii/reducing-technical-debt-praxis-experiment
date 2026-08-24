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
 * Handles store errors by converting them to InternalServerError if needed.
 * @param {Error} err - The error to handle
 */
const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // see https://github.com/AdamPflug/express-brute/issues/45
    // express-brute does not always forward a callback
    // we are using reset as synchronous call, so we have to log the error if it occurs
    // there is no way to try/catch, because the reset operation happens asynchronous
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

/**
 * Factory function to create a new ExpressBrute instance with shared configuration.
 * @param {Object} configOpts - Configuration for the Brute instance
 * @returns {ExpressBrute} Configured ExpressBrute instance
 */
const createBruteInstance = (configOpts) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return new ExpressBrute(store, configOpts);
};

/**
 * Factory function to create memory-backed ExpressBrute instance.
 * @param {Object} configOpts - Configuration for the Brute instance
 * @returns {ExpressBrute} Configured ExpressBrute instance
 */
const createMemoryBruteInstance = (configOpts) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();
    return new ExpressBrute(memoryStore, configOpts);
};

/**
 * Generates a standardized failCallback for rate-limiting errors with optional context.
 * @param {string} messageTemplate - Message string template
 * @param {Object} messageContext - Context object for templating
 * @param {string} [contextKey] - Optional context key from messages
 * @returns {Function} failCallback function
 */
const createFailCallback = (messageTemplate, messageContext, contextKey) => {
    return (req, res, next, nextValidRequestDate) => {
        const timeString = nextValidRequestDate && moment(nextValidRequestDate).fromNow(true);
        let message = timeString ? messageTemplate.replace('{time}', timeString) : messageTemplate;

        // Handle templating
        if (messageContext) {
            message = tpl(message, messageContext);
        }

        const errorOptions = {
            message,
            context: contextKey ? tpl(messages[contextKey].context) : undefined,
            help: tpl(messages.tooManyAttempts)
        };

        return next(new errors.TooManyRequestsError(errorOptions));
    };
};

/**
 * Creates a failCallback for generic rate limit without timing info.
 * @param {string} message - Final error message
 * @param {string} [contextKey] - Optional context key
 * @returns {Function} failCallback function
 */
const createFailCallbackNoTime = (message, contextKey) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message,
            context: contextKey ? tpl(messages[contextKey].context) : undefined,
            help: tpl(messages.tooManyAttempts)
        }));
    };
};

/**
 * Creates a failCallback with TOTP/OTC-specific error codes.
 * @param {string} message - Final error message
 * @param {string} contextKey - Context key from messages object
 * @param {string} errorCode - Custom error code
 * @returns {Function} failCallback function
 */
const createOtcFailCallback = (message, contextKey, errorCode) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message,
            context: tpl(messages[contextKey].context),
            help: tpl(messages[contextKey].context),
            code: errorCode
        }));
    };
};

const globalBlock = () => {
    const failCallback = createFailCallback(
        `Too many attempts try again in {time}`,
        {
            rfa: spamGlobalBlock.freeRetries + 1 || 5,
            rfp: spamGlobalBlock.lifetime || 60 * 60
        },
        'forgottenPasswordIp'
    );

    const configOpts = extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamGlobalBlock, spamConfigKeys));

    globalBlockInstance = globalBlockInstance || createBruteInstance(configOpts);
    return globalBlockInstance;
};

const globalReset = () => {
    const failCallback = createFailCallback(
        `Too many attempts try again in {time}`,
        {
            rfa: spamGlobalReset.freeRetries + 1 || 5,
            rfp: spamGlobalReset.lifetime || 60 * 60
        },
        'forgottenPasswordIp'
    );

    const configOpts = extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamGlobalReset, spamConfigKeys));

    globalResetInstance = globalResetInstance || createBruteInstance(configOpts);
    return globalResetInstance;
};

const webmentionsBlock = () => {
    const configOpts = extend({
        attachResetToRequest: false,
        failCallback: createFailCallbackNoTime(messages.webmentionsBlock),
        handleStoreError: handleStoreError
    }, pick(spamWebmentionsBlock, spamConfigKeys));

    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(configOpts);
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const configOpts = extend({
        attachResetToRequest: false,
        failCallback: createFailCallbackNoTime(messages.emailPreviewBlock),
        handleStoreError: handleStoreError
    }, pick(spamEmailPreviewBlock, spamConfigKeys));

    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(configOpts);
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const failCallback = createFailCallback(
        `Too many sign-in attempts try again in {time}`,
        undefined,
        'tooManySigninAttempts'
    );

    const configOpts = extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys));

    membersAuthInstance = membersAuthInstance || createBruteInstance(configOpts);
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const failCallback = createFailCallback(
        `Too many different sign-in attempts, try again in {time}`,
        undefined,
        'tooManySigninAttempts'
    );

    const configOpts = extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamMemberLogin, spamConfigKeys));

    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(configOpts);
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const failCallback = createOtcFailCallback(
        `Too many verification attempts across multiple codes, try again in {time}`,
        'tooManyOTCVerificationAttempts',
        'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    );

    const configOpts = extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamOtcVerificationEnumeration, spamConfigKeys));

    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(configOpts);
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const failCallback = createOtcFailCallback(
        `Too many attempts for this verification code, try again in {time}`,
        'tooManyOTCVerificationAttempts',
        'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    );

    const configOpts = extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamOtcVerification, spamConfigKeys));

    otcVerificationInstance = otcVerificationInstance || createBruteInstance(configOpts);
    return otcVerificationInstance;
};

const userLogin = () => {
    const failCallback = createFailCallback(
        `Too many login attempts. Please wait {time} before trying again, or reset your password.`,
        undefined,
        'tooManySigninAttempts'
    );

    const configOpts = extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys));

    userLoginInstance = userLoginInstance || createBruteInstance(configOpts);
    return userLoginInstance;
};

const userReset = () => {
    const failCallback = createFailCallback(
        `Too many password reset attempts try again in {time}`,
        {
            rfa: spamUserReset.freeRetries + 1 || 5,
            rfp: spamUserReset.lifetime || 60 * 60
        },
        'forgottenPasswordEmail'
    );

    const configOpts = extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamUserReset, spamConfigKeys));

    userResetInstance = userResetInstance || createBruteInstance(configOpts);
    return userResetInstance;
};

const userVerification = () => {
    const configOpts = extend({
        attachResetToRequest: true,
        failCallback: createFailCallbackNoTime(tpl(messages.tooManyAttempts)),
        handleStoreError: handleStoreError
    }, pick(spamUserVerification, spamConfigKeys));

    userVerificationInstance = userVerificationInstance || createBruteInstance(configOpts);
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const configOpts = extend({
        attachResetToRequest: true,
        failCallback: createFailCallbackNoTime(tpl(messages.tooManyAttempts)),
        handleStoreError: handleStoreError
    }, pick(spamSendVerificationCode, spamConfigKeys));

    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(configOpts);
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        const configContext = {
            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
        };
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, configContext),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };

    const configOpts = extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(spamPrivateBlock, spamConfigKeys));

    privateBlogInstance = privateBlogInstance || createBruteInstance(configOpts);
    return privateBlogInstance;
};

const contentApiKey = () => {
    const configOpts = extend({
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys));

    contentApiKeyInstance = contentApiKeyInstance || createMemoryBruteInstance(configOpts);
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