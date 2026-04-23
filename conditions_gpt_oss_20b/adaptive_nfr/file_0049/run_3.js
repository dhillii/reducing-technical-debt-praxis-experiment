const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

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
 * Handles errors from the store and forwards them to the next middleware.
 * @param {Error} err
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
 * Lazily creates and returns the shared BruteKnex store.
 * @returns {BruteKnex}
 */
const getStore = () => {
    if (!store) {
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

/**
 * Lazily creates and returns the shared memory store for content API key checks.
 * @returns {ExpressBrute.MemoryStore}
 */
const getMemoryStore = () => {
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Creates an ExpressBrute instance with the provided configuration.
 * @param {BruteKnex|ExpressBrute.MemoryStore} store
 * @param {Object} configObj
 * @param {Function} failCallback
 * @param {boolean} attachResetToRequest
 * @returns {ExpressBrute}
 */
const createExpressBruteInstance = (store, configObj, failCallback, attachResetToRequest) => {
    return new ExpressBrute(store, extend({
        attachResetToRequest,
        failCallback,
        handleStoreError
    }, pick(configObj, spamConfigKeys)));
};

/**
 * Creates a fail callback that uses a nextValidRequestDate.
 * @param {string} message
 * @param {string} context
 * @param {string} help
 * @returns {Function}
 */
const createFailCallbackWithDate = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context,
            help
        }));
    };
};

/**
 * Creates a fail callback that does not use a nextValidRequestDate.
 * @param {string} message
 * @returns {Function}
 */
const createFailCallbackWithoutDate = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message
        }));
    };
};

/**
 * Creates a fail callback that logs an error before responding.
 * @param {string} message
 * @param {string} context
 * @returns {Function}
 */
const createPrivateBlogFailCallback = (message, context) => {
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

/**
 * Global block for excessive requests from an IP.
 * @returns {ExpressBrute}
 */
const globalBlock = () => {
    const store = getStore();

    if (!globalBlockInstance) {
        globalBlockInstance = createExpressBruteInstance(
            store,
            spamGlobalBlock,
            createFailCallbackWithDate(
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                tpl(messages.tooManyAttempts)
            ),
            false
        );
    }

    return globalBlockInstance;
};

/**
 * Global reset for excessive requests from an IP.
 * @returns {ExpressBrute}
 */
const globalReset = () => {
    const store = getStore();

    if (!globalResetInstance) {
        globalResetInstance = createExpressBruteInstance(
            store,
            spamGlobalReset,
            createFailCallbackWithDate(
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordIp.context),
                tpl(messages.forgottenPasswordIp.context)
            ),
            false
        );
    }

    return globalResetInstance;
};

/**
 * Webmentions block for excessive mention attempts.
 * @returns {ExpressBrute}
 */
const webmentionsBlock = () => {
    const store = getStore();

    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createExpressBruteInstance(
            store,
            spamWebmentionsBlock,
            createFailCallbackWithoutDate(messages.webmentionsBlock),
            false
        );
    }

    return webmentionsBlockInstance;
};

/**
 * Email preview block for excessive test email attempts.
 * @returns {ExpressBrute}
 */
const emailPreviewBlock = () => {
    const store = getStore();

    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createExpressBruteInstance(
            store,
            spamEmailPreviewBlock,
            createFailCallbackWithoutDate(messages.emailPreviewBlock),
            false
        );
    }

    return emailPreviewBlockInstance;
};

/**
 * Members authentication rate limiter.
 * @returns {ExpressBrute}
 */
const membersAuth = () => {
    const store = getStore();

    if (!membersAuthInstance) {
        membersAuthInstance = createExpressBruteInstance(
            store,
            spamUserLogin,
            createFailCallbackWithDate(
                `Too many sign-in attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            true
        );
    }

    return membersAuthInstance;
};

/**
 * Members authentication enumeration rate limiter.
 * @returns {ExpressBrute}
 */
const membersAuthEnumeration = () => {
    const store = getStore();

    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createExpressBruteInstance(
            store,
            spamMemberLogin,
            createFailCallbackWithDate(
                `Too many different sign-in attempts, try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            true
        );
    }

    return membersAuthEnumerationInstance;
};

/**
 * OTC verification enumeration rate limiter.
 * @returns {ExpressBrute}
 */
const otcVerificationEnumeration = () => {
    const store = getStore();

    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createExpressBruteInstance(
            store,
            spamOtcVerificationEnumeration,
            createFailCallbackWithDate(
                `Too many verification attempts across multiple codes, try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            ),
            false
        );
    }

    return otcVerificationEnumerationInstance;
};

/**
 * OTC verification rate limiter.
 * @returns {ExpressBrute}
 */
const otcVerification = () => {
    const store = getStore();

    if (!otcVerificationInstance) {
        otcVerificationInstance = createExpressBruteInstance(
            store,
            spamOtcVerification,
            createFailCallbackWithDate(
                `Too many attempts for this verification code, try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            ),
            false
        );
    }

    return otcVerificationInstance;
};

/**
 * User login rate limiter.
 * @returns {ExpressBrute}
 */
const userLogin = () => {
    const store = getStore();

    if (!userLoginInstance) {
        userLoginInstance = createExpressBruteInstance(
            store,
            spamUserLogin,
            createFailCallbackWithDate(
                `Too many login attempts. Please wait ${moment().fromNow(true)} before trying again, or reset your password.`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            true
        );
    }

    return userLoginInstance;
};

/**
 * User password reset rate limiter.
 * @returns {ExpressBrute}
 */
const userReset = () => {
    const store = getStore();

    if (!userResetInstance) {
        userResetInstance = createExpressBruteInstance(
            store,
            spamUserReset,
            createFailCallbackWithDate(
                `Too many password reset attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordEmail.context)
            ),
            true
        );
    }

    return userResetInstance;
};

/**
 * User verification rate limiter.
 * @returns {ExpressBrute}
 */
const userVerification = () => {
    const store = getStore();

    if (!userVerificationInstance) {
        userVerificationInstance = createExpressBruteInstance(
            store,
            spamUserVerification,
            createFailCallbackWithoutDate(messages.tooManyAttempts),
            true
        );
    }

    return userVerificationInstance;
};

/**
 * Send verification code rate limiter.
 * @returns {ExpressBrute}
 */
const sendVerificationCode = () => {
    const store = getStore();

    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createExpressBruteInstance(
            store,
            spamSendVerificationCode,
            createFailCallbackWithoutDate(messages.tooManyAttempts),
            true
        );
    }

    return sendVerificationCodeInstance;
};

/**
 * Private blog rate limiter.
 * @returns {ExpressBrute}
 */
const privateBlog = () => {
    const store = getStore();

    if (!privateBlogInstance) {
        privateBlogInstance = createExpressBruteInstance(
            store,
            spamPrivateBlock,
            createPrivateBlogFailCallback(
                tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                }),
                tpl(messages.tooManySigninAttempts.context)
            ),
            false
        );
    }

    return privateBlogInstance;
};

/**
 * Content API key rate limiter.
 * @returns {ExpressBrute}
 */
const contentApiKey = () => {
    const memory = getMemoryStore();

    if (!contentApiKeyInstance) {
        contentApiKeyInstance = new ExpressBrute(memory, extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            },
            handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys)));
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