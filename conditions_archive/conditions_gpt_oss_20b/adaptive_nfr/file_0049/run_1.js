```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');

const spam = config.get('spam') || {};

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
 * Handles errors from the store.
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
 * Initializes the Brute store if not already created.
 * @returns {Object} Brute store instance
 */
const initStore = () => {
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
 * Initializes the in-memory store for content API key checks.
 * @returns {Object} Memory store instance
 */
const initMemoryStore = () => {
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Builds a fail callback that uses the nextValidRequestDate.
 * @param {Function} messageFn
 * @param {Function} contextFn
 * @param {Function} helpFn
 * @param {string} [code]
 * @returns {Function}
 */
const buildFailCallbackWithDate = (messageFn, contextFn, helpFn, code) => {
    return (req, res, next, nextValidRequestDate) => {
        const err = new errors.TooManyRequestsError({
            message: messageFn(nextValidRequestDate),
            context: contextFn(nextValidRequestDate),
            help: helpFn(nextValidRequestDate),
            code
        });
        return next(err);
    };
};

/**
 * Builds a fail callback that does not use nextValidRequestDate.
 * @param {string} message
 * @param {string} context
 * @param {string} help
 * @param {string} [code]
 * @returns {Function}
 */
const buildFailCallbackWithoutDate = (message, context, help, code) => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message,
            context,
            help,
            code
        });
        return next(err);
    };
};

/**
 * Creates a new ExpressBrute instance with the given configuration.
 * @param {Object} configObj
 * @param {boolean} attachReset
 * @param {Function} failCallback
 * @returns {Object}
 */
const createBruteInstance = (configObj, attachReset, failCallback) => {
    const store = initStore();
    const options = extend(
        {
            attachResetToRequest: attachReset,
            failCallback,
            handleStoreError
        },
        pick(configObj, spamConfigKeys)
    );
    return new ExpressBrute(store, options);
};

/**
 * Creates a new ExpressBrute instance using an in-memory store.
 * @param {Object} configObj
 * @param {boolean} attachReset
 * @param {Function} failCallback
 * @returns {Object}
 */
const createMemoryBruteInstance = (configObj, attachReset, failCallback) => {
    const store = initMemoryStore();
    const options = extend(
        {
            attachResetToRequest: attachReset,
            failCallback,
            handleStoreError
        },
        pick(configObj, spamConfigKeys)
    );
    return new ExpressBrute(store, options);
};

/**
 * Global block for IP-based rate limiting.
 */
const globalBlock = () => {
    if (!globalBlockInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () =>
            tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            });
        const helpFn = () => tpl(messages.tooManyAttempts);
        globalBlockInstance = createBruteInstance(
            spamGlobalBlock,
            false,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return globalBlockInstance;
};

/**
 * Global reset for IP-based rate limiting.
 */
const globalReset = () => {
    if (!globalResetInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () =>
            tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            });
        const helpFn = () => tpl(messages.forgottenPasswordIp.context);
        globalResetInstance = createBruteInstance(
            spamGlobalReset,
            false,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return globalResetInstance;
};

/**
 * Webmentions block.
 */
const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(
            spamWebmentionsBlock,
            false,
            buildFailCallbackWithoutDate(messages.webmentionsBlock, null, null)
        );
    }
    return webmentionsBlockInstance;
};

/**
 * Email preview block.
 */
const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(
            spamEmailPreviewBlock,
            false,
            buildFailCallbackWithoutDate(messages.emailPreviewBlock, null, null)
        );
    }
    return emailPreviewBlockInstance;
};

/**
 * Members authentication.
 */
const membersAuth = () => {
    if (!membersAuthInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () => tpl(messages.tooManySigninAttempts.context);
        const helpFn = () => tpl(messages.tooManySigninAttempts.context);
        membersAuthInstance = createBruteInstance(
            spamUserLogin,
            true,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return membersAuthInstance;
};

/**
 * Members authentication enumeration.
 */
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () => tpl(messages.tooManySigninAttempts.context);
        const helpFn = () => tpl(messages.tooManySigninAttempts.context);
        membersAuthEnumerationInstance = createBruteInstance(
            spamMemberLogin,
            true,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return membersAuthEnumerationInstance;
};

/**
 * OTC verification enumeration.
 */
const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () => tpl(messages.tooManyOTCVerificationAttempts.context);
        const helpFn = () => tpl(messages.tooManyOTCVerificationAttempts.context);
        otcVerificationEnumerationInstance = createBruteInstance(
            spamOtcVerificationEnumeration,
            false,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn, 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED')
        );
    }
    return otcVerificationEnumerationInstance;
};

/**
 * OTC verification.
 */
const otcVerification = () => {
    if (!otcVerificationInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () => tpl(messages.tooManyOTCVerificationAttempts.context);
        const helpFn = () => tpl(messages.tooManyOTCVerificationAttempts.context);
        otcVerificationInstance = createBruteInstance(
            spamOtcVerification,
            false,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn, 'OTC_CODE_ATTEMPTS_RATE_LIMITED')
        );
    }
    return otcVerificationInstance;
};

/**
 * User login rate limiting.
 */
const userLogin = () => {
    if (!userLoginInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`;
        const contextFn = () => tpl(messages.tooManySigninAttempts.context);
        const helpFn = () => tpl(messages.tooManySigninAttempts.context);
        userLoginInstance = createBruteInstance(
            spamUserLogin,
            true,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return userLoginInstance;
};

/**
 * User reset rate limiting.
 */
const userReset = () => {
    if (!userResetInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () =>
            tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            });
        const helpFn = () => tpl(messages.forgottenPasswordEmail.context);
        userResetInstance = createBruteInstance(
            spamUserReset,
            true,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return userResetInstance;
};

/**
 * User verification rate limiting.
 */
const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(
            spamUserVerification,
            true,
            buildFailCallbackWithoutDate(messages.tooManyAttempts, null, null)
        );
    }
    return userVerificationInstance;
};

/**
 * Send verification code rate limiting.
 */
const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(
            spamSendVerificationCode,
            true,
            buildFailCallbackWithoutDate(messages.tooManyAttempts, null, null)
        );
    }
    return sendVerificationCodeInstance;
};

/**
 * Private blog rate limiting.
 */
const privateBlog = () => {
    if (!privateBlogInstance) {
        const messageFn = (nextValidRequestDate) =>
            `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const contextFn = () =>
            tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
            });
        const helpFn = () => tpl(messages.tooManySigninAttempts.context);
        privateBlogInstance = createBruteInstance(
            spamPrivateBlock,
            false,
            buildFailCallbackWithDate(messageFn, contextFn, helpFn)
        );
    }
    return privateBlogInstance;
};

/**
 * Content API key rate limiting.
 */
const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createMemoryBruteInstance(
            spamContentApiKey,
            true,
            buildFailCallbackWithoutDate(messages.tooManyAttempts, null, null)
        );
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
```