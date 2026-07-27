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
 * Handles store errors by logging the error and returning a custom error.
 * @param {Error} err - The error to handle.
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
 * Creates a new ExpressBrute instance with the given store and options.
 * @param {Object} store - The store to use.
 * @param {Object} options - The options to pass to ExpressBrute.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

/**
 * Creates a new BruteKnex store instance.
 * @returns {BruteKnex} The new BruteKnex store instance.
 */
const createBruteKnexStore = () => {
    const db = require('../../../../data/db');
    return new (require('brute-knex'))({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

/**
 * Creates a new ExpressBrute instance with the given options.
 * @param {Object} options - The options to pass to ExpressBrute.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstanceWithBruteKnexStore = (options) => {
    const store = createBruteKnexStore();
    return createExpressBruteInstance(store, options);
};

/**
 * Creates a new ExpressBrute instance with the given options and a memory store.
 * @param {Object} options - The options to pass to ExpressBrute.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstanceWithMemoryStore = (options) => {
    const memoryStore = new (require('express-brute')).MemoryStore();
    return createExpressBruteInstance(memoryStore, options);
};

/**
 * Creates a fail callback function for ExpressBrute.
 * @param {string} message - The message to display.
 * @param {string} context - The context to display.
 * @param {string} help - The help message to display.
 * @returns {Function} The fail callback function.
 */
const createFailCallback = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message,
            context: context,
            help: help
        }));
    };
};

/**
 * Creates a fail callback function for ExpressBrute with a custom error message.
 * @param {string} message - The message to display.
 * @param {Object} contextData - The data to use in the context message.
 * @param {string} context - The context to display.
 * @param {string} help - The help message to display.
 * @returns {Function} The fail callback function.
 */
const createFailCallbackWithCustomErrorMessage = (message, contextData, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message,
            context: tpl(context, contextData),
            help: help
        }));
    };
};

/**
 * Creates a fail callback function for ExpressBrute with a custom error message and a next valid request date.
 * @param {string} message - The message to display.
 * @param {Object} contextData - The data to use in the context message.
 * @param {string} context - The context to display.
 * @param {string} help - The help message to display.
 * @returns {Function} The fail callback function.
 */
const createFailCallbackWithCustomErrorMessageAndNextValidRequestDate = (message, contextData, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(context, contextData),
            help: help
        }));
    };
};

/**
 * Gets the global block instance.
 * @returns {ExpressBrute} The global block instance.
 */
const getGlobalBlockInstance = () => {
    if (!globalBlockInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithCustomErrorMessage(
                `Too many attempts try again in ${moment().fromNow(true)}`,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60},
                messages.forgottenPasswordIp.error,
                messages.tooManyAttempts
            ),
            handleStoreError: handleStoreError
        }, pick(spamGlobalBlock, spamConfigKeys));
        globalBlockInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return globalBlockInstance;
};

/**
 * Gets the global reset instance.
 * @returns {ExpressBrute} The global reset instance.
 */
const getGlobalResetInstance = () => {
    if (!globalResetInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithCustomErrorMessage(
                `Too many attempts try again in ${moment().fromNow(true)}`,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60},
                messages.forgottenPasswordIp.error,
                messages.forgottenPasswordIp.context
            ),
            handleStoreError: handleStoreError
        }, pick(spamGlobalReset, spamConfigKeys));
        globalResetInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return globalResetInstance;
};

/**
 * Gets the webmentions block instance.
 * @returns {ExpressBrute} The webmentions block instance.
 */
const getWebmentionsBlockInstance = () => {
    if (!webmentionsBlockInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(messages.webmentionsBlock, '', messages.webmentionsBlock),
            handleStoreError: handleStoreError
        }, pick(spamWebmentionsBlock, spamConfigKeys));
        webmentionsBlockInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return webmentionsBlockInstance;
};

/**
 * Gets the email preview block instance.
 * @returns {ExpressBrute} The email preview block instance.
 */
const getEmailPreviewBlockInstance = () => {
    if (!emailPreviewBlockInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(messages.emailPreviewBlock, '', messages.emailPreviewBlock),
            handleStoreError: handleStoreError
        }, pick(spamEmailPreviewBlock, spamConfigKeys));
        emailPreviewBlockInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return emailPreviewBlockInstance;
};

/**
 * Gets the members auth instance.
 * @returns {ExpressBrute} The members auth instance.
 */
const getMembersAuthInstance = () => {
    if (!membersAuthInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithCustomErrorMessageAndNextValidRequestDate(
                `Too many sign-in attempts try again in ${moment().fromNow(true)}`,
                {},
                messages.tooManySigninAttempts.context,
                messages.tooManySigninAttempts.context
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys));
        membersAuthInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return membersAuthInstance;
};

/**
 * Gets the members auth enumeration instance.
 * @returns {ExpressBrute} The members auth enumeration instance.
 */
const getMembersAuthEnumerationInstance = () => {
    if (!membersAuthEnumerationInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithCustomErrorMessageAndNextValidRequestDate(
                `Too many different sign-in attempts, try again in ${moment().fromNow(true)}`,
                {},
                messages.tooManySigninAttempts.context,
                messages.tooManySigninAttempts.context
            ),
            handleStoreError: handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys));
        membersAuthEnumerationInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return membersAuthEnumerationInstance;
};

/**
 * Gets the otc verification enumeration instance.
 * @returns {ExpressBrute} The otc verification enumeration instance.
 */
const getOtcVerificationEnumerationInstance = () => {
    if (!otcVerificationEnumerationInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithCustomErrorMessageAndNextValidRequestDate(
                `Too many verification attempts across multiple codes, try again in ${moment().fromNow(true)}`,
                {},
                messages.tooManyOTCVerificationAttempts.context,
                messages.tooManyOTCVerificationAttempts.context,
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys));
        otcVerificationEnumerationInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return otcVerificationEnumerationInstance;
};

/**
 * Gets the otc verification instance.
 * @returns {ExpressBrute} The otc verification instance.
 */
const getOtcVerificationInstance = () => {
    if (!otcVerificationInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithCustomErrorMessageAndNextValidRequestDate(
                `Too many attempts for this verification code, try again in ${moment().fromNow(true)}`,
                {},
                messages.tooManyOTCVerificationAttempts.context,
                messages.tooManyOTCVerificationAttempts.context,
                'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerification, spamConfigKeys));
        otcVerificationInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return otcVerificationInstance;
};

/**
 * Gets the user login instance.
 * @returns {ExpressBrute} The user login instance.
 */
const getUserLoginInstance = () => {
    if (!userLoginInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithCustomErrorMessageAndNextValidRequestDate(
                `Too many login attempts. Please wait ${moment().fromNow(true)} before trying again, or reset your password.`,
                {},
                messages.tooManySigninAttempts.context,
                messages.tooManySigninAttempts.context
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys));
        userLoginInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return userLoginInstance;
};

/**
 * Gets the send verification code instance.
 * @returns {ExpressBrute} The send verification code instance.
 */
const getSendVerificationCodeInstance = () => {
    if (!sendVerificationCodeInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(messages.tooManyAttempts, '', messages.tooManyAttempts),
            handleStoreError: handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys));
        sendVerificationCodeInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return sendVerificationCodeInstance;
};

/**
 * Gets the user verification instance.
 * @returns {ExpressBrute} The user verification instance.
 */
const getUserVerificationInstance = () => {
    if (!userVerificationInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(messages.tooManyAttempts, '', messages.tooManyAttempts),
            handleStoreError: handleStoreError
        }, pick(spamUserVerification, spamConfigKeys));
        userVerificationInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return userVerificationInstance;
};

/**
 * Gets the user reset instance.
 * @returns {ExpressBrute} The user reset instance.
 */
const getUserResetInstance = () => {
    if (!userResetInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithCustomErrorMessage(
                `Too many password reset attempts try again in ${moment().fromNow(true)}`,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60},
                messages.forgottenPasswordEmail.error,
                messages.forgottenPasswordEmail.context
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserReset, spamConfigKeys));
        userResetInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return userResetInstance;
};

/**
 * Gets the private blog instance.
 * @returns {ExpressBrute} The private blog instance.
 */
const getPrivateBlogInstance = () => {
    if (!privateBlogInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
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
            },
            handleStoreError: handleStoreError
        }, pick(spamPrivateBlock, spamConfigKeys));
        privateBlogInstance = createExpressBruteInstanceWithBruteKnexStore(options);
    }
    return privateBlogInstance;
};

/**
 * Gets the content API key instance.
 * @returns {ExpressBrute} The content API key instance.
 */
const getContentApiKeyInstance = () => {
    if (!contentApiKeyInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: messages.tooManyAttempts
                });

                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys));
        contentApiKeyInstance = createExpressBruteInstanceWithMemoryStore(options);
    }
    return contentApiKeyInstance;
};

module.exports = {
    globalBlock: getGlobalBlockInstance,
    globalReset: getGlobalResetInstance,
    userLogin: getUserLoginInstance,
    sendVerificationCode: getSendVerificationCodeInstance,
    userVerification: getUserVerificationInstance,
    membersAuth: getMembersAuthInstance,
    membersAuthEnumeration: getMembersAuthEnumerationInstance,
    otcVerification: getOtcVerificationInstance,
    otcVerificationEnumeration: getOtcVerificationEnumerationInstance,
    userReset: getUserResetInstance,
    privateBlog: getPrivateBlogInstance,
    contentApiKey: getContentApiKeyInstance,
    webmentionsBlock: getWebmentionsBlockInstance,
    emailPreviewBlock: getEmailPreviewBlockInstance,
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