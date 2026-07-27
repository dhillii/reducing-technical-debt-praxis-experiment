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
 * Creates a new BruteKnex instance with the given tablename and knex.
 * @param {string} tablename - The tablename to use.
 * @param {Object} knex - The knex instance to use.
 * @returns {BruteKnex} The new BruteKnex instance.
 */
const createBruteKnexInstance = (tablename, knex) => {
    return new (require('brute-knex'))({
        tablename: tablename,
        createTable: false,
        knex: knex
    });
};

/**
 * Creates a new ExpressBrute instance with the given store and options.
 * @param {Object} store - The store to use.
 * @param {Object} options - The options to pass to ExpressBrute.
 * @param {Object} spamConfig - The spam configuration to use.
 * @param {string} context - The context to use for error messages.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstanceWithSpamConfig = (store, options, spamConfig, context) => {
    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(context,
                    {rfa: spamConfig.freeRetries + 1 || 5, rfp: spamConfig.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance with the given store and options.
 * @param {Object} store - The store to use.
 * @param {Object} options - The options to pass to ExpressBrute.
 * @param {Object} spamConfig - The spam configuration to use.
 * @param {string} context - The context to use for error messages.
 * @param {string} error - The error message to use.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstanceWithSpamConfigAndError = (store, options, spamConfig, context, error) => {
    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: error
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys)));
};

/**
 * Gets the global block instance.
 * @returns {ExpressBrute} The global block instance.
 */
const getGlobalBlockInstance = () => {
    if (!globalBlockInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        globalBlockInstance = createExpressBruteInstanceWithSpamConfig(store, {}, spamGlobalBlock, messages.forgottenPasswordIp.error);
    }

    return globalBlockInstance;
};

/**
 * Gets the global reset instance.
 * @returns {ExpressBrute} The global reset instance.
 */
const getGlobalResetInstance = () => {
    if (!globalResetInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        globalResetInstance = createExpressBruteInstanceWithSpamConfig(store, {}, spamGlobalReset, messages.forgottenPasswordIp.error);
    }

    return globalResetInstance;
};

/**
 * Gets the webmentions block instance.
 * @returns {ExpressBrute} The webmentions block instance.
 */
const getWebmentionsBlockInstance = () => {
    if (!webmentionsBlockInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        webmentionsBlockInstance = createExpressBruteInstanceWithSpamConfigAndError(store, {}, spamWebmentionsBlock, '', messages.webmentionsBlock);
    }

    return webmentionsBlockInstance;
};

/**
 * Gets the email preview block instance.
 * @returns {ExpressBrute} The email preview block instance.
 */
const getEmailPreviewBlockInstance = () => {
    if (!emailPreviewBlockInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        emailPreviewBlockInstance = createExpressBruteInstanceWithSpamConfigAndError(store, {}, spamEmailPreviewBlock, '', messages.emailPreviewBlock);
    }

    return emailPreviewBlockInstance;
};

/**
 * Gets the members auth instance.
 * @returns {ExpressBrute} The members auth instance.
 */
const getMembersAuthInstance = () => {
    if (!membersAuthInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        membersAuthInstance = createExpressBruteInstance(store, extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys)));
    }

    return membersAuthInstance;
};

/**
 * Gets the members auth enumeration instance.
 * @returns {ExpressBrute} The members auth enumeration instance.
 */
const getMembersAuthEnumerationInstance = () => {
    if (!membersAuthEnumerationInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        membersAuthEnumerationInstance = createExpressBruteInstance(store, extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys)));
    }

    return membersAuthEnumerationInstance;
};

/**
 * Gets the otc verification enumeration instance.
 * @returns {ExpressBrute} The otc verification enumeration instance.
 */
const getOtcVerificationEnumerationInstance = () => {
    if (!otcVerificationEnumerationInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        otcVerificationEnumerationInstance = createExpressBruteInstance(store, extend({
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys)));
    }

    return otcVerificationEnumerationInstance;
};

/**
 * Gets the otc verification instance.
 * @returns {ExpressBrute} The otc verification instance.
 */
const getOtcVerificationInstance = () => {
    if (!otcVerificationInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        otcVerificationInstance = createExpressBruteInstance(store, extend({
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamOtcVerification, spamConfigKeys)));
    }

    return otcVerificationInstance;
};

/**
 * Gets the user login instance.
 * @returns {ExpressBrute} The user login instance.
 */
const getUserLoginInstance = () => {
    if (!userLoginInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        userLoginInstance = createExpressBruteInstance(store, extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys)));
    }

    return userLoginInstance;
};

/**
 * Gets the user reset instance.
 * @returns {ExpressBrute} The user reset instance.
 */
const getUserResetInstance = () => {
    if (!userResetInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        userResetInstance = createExpressBruteInstanceWithSpamConfig(store, {}, spamUserReset, messages.forgottenPasswordEmail.error);
    }

    return userResetInstance;
};

/**
 * Gets the user verification instance.
 * @returns {ExpressBrute} The user verification instance.
 */
const getUserVerificationInstance = () => {
    if (!userVerificationInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        userVerificationInstance = createExpressBruteInstanceWithSpamConfigAndError(store, {}, spamUserVerification, '', messages.tooManyAttempts);
    }

    return userVerificationInstance;
};

/**
 * Gets the send verification code instance.
 * @returns {ExpressBrute} The send verification code instance.
 */
const getSendVerificationCodeInstance = () => {
    if (!sendVerificationCodeInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        sendVerificationCodeInstance = createExpressBruteInstanceWithSpamConfigAndError(store, {}, spamSendVerificationCode, '', messages.tooManyAttempts);
    }

    return sendVerificationCodeInstance;
};

/**
 * Gets the private blog instance.
 * @returns {ExpressBrute} The private blog instance.
 */
const getPrivateBlogInstance = () => {
    if (!privateBlogInstance) {
        store = store || createBruteKnexInstance('brute', require('../../../../data/db').knex);
        privateBlogInstance = createExpressBruteInstanceWithSpamConfig(store, {}, spamPrivateBlock, messages.tooManySigninAttempts.error);
    }

    return privateBlogInstance;
};

/**
 * Gets the content api key instance.
 * @returns {ExpressBrute} The content api key instance.
 */
const getContentApiKeyInstance = () => {
    if (!contentApiKeyInstance) {
        memoryStore = memoryStore || new (require('express-brute')).MemoryStore();
        contentApiKeyInstance = createExpressBruteInstanceWithSpamConfigAndError(memoryStore, {}, spamContentApiKey, '', messages.tooManyAttempts);
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