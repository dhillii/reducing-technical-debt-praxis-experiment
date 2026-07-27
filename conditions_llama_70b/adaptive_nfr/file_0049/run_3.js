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
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteMemoryInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

/**
 * Gets the knex instance from the db module.
 * @returns {Object} The knex instance.
 */
const getKnexInstance = () => {
    return require('../../../../data/db').knex;
};

/**
 * Creates a new global block instance.
 * @returns {ExpressBrute} The new global block instance.
 */
const createGlobalBlockInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamGlobalBlock, spamConfigKeys)));
    return globalBlockInstance;
};

/**
 * Creates a new global reset instance.
 * @returns {ExpressBrute} The new global reset instance.
 */
const createGlobalResetInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    globalResetInstance = globalResetInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamGlobalReset, spamConfigKeys)));
    return globalResetInstance;
};

/**
 * Creates a new webmentions block instance.
 * @returns {ExpressBrute} The new webmentions block instance.
 */
const createWebmentionsBlockInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamWebmentionsBlock, spamConfigKeys)));
    return webmentionsBlockInstance;
};

/**
 * Creates a new email preview block instance.
 * @returns {ExpressBrute} The new email preview block instance.
 */
const createEmailPreviewBlockInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamEmailPreviewBlock, spamConfigKeys)));
    return emailPreviewBlockInstance;
};

/**
 * Creates a new members auth instance.
 * @returns {ExpressBrute} The new members auth instance.
 */
const createMembersAuthInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    membersAuthInstance = membersAuthInstance || createExpressBruteInstance(store, extend({
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
    return membersAuthInstance;
};

/**
 * Creates a new members auth enumeration instance.
 * @returns {ExpressBrute} The new members auth enumeration instance.
 */
const createMembersAuthEnumerationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createExpressBruteInstance(store, extend({
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
    return membersAuthEnumerationInstance;
};

/**
 * Creates a new otc verification enumeration instance.
 * @returns {ExpressBrute} The new otc verification enumeration instance.
 */
const createOtcVerificationEnumerationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createExpressBruteInstance(store, extend({
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
    return otcVerificationEnumerationInstance;
};

/**
 * Creates a new otc verification instance.
 * @returns {ExpressBrute} The new otc verification instance.
 */
const createOtcVerificationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    otcVerificationInstance = otcVerificationInstance || createExpressBruteInstance(store, extend({
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
    return otcVerificationInstance;
};

/**
 * Creates a new user login instance.
 * @returns {ExpressBrute} The new user login instance.
 */
const createUserLoginInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    userLoginInstance = userLoginInstance || createExpressBruteInstance(store, extend({
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
    return userLoginInstance;
};

/**
 * Creates a new user reset instance.
 * @returns {ExpressBrute} The new user reset instance.
 */
const createUserResetInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    userResetInstance = userResetInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserReset, spamConfigKeys)));
    return userResetInstance;
};

/**
 * Creates a new user verification instance.
 * @returns {ExpressBrute} The new user verification instance.
 */
const createUserVerificationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserVerification, spamConfigKeys)));
    return userVerificationInstance;
};

/**
 * Creates a new send verification code instance.
 * @returns {ExpressBrute} The new send verification code instance.
 */
const createSendVerificationCodeInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamSendVerificationCode, spamConfigKeys)));
    return sendVerificationCodeInstance;
};

/**
 * Creates a new private blog instance.
 * @returns {ExpressBrute} The new private blog instance.
 */
const createPrivateBlogInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(store, extend({
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
        },
        handleStoreError: handleStoreError
    }, pick(spamPrivateBlock, spamConfigKeys)));
    return privateBlogInstance;
};

/**
 * Creates a new content api key instance.
 * @returns {ExpressBrute} The new content api key instance.
 */
const createContentApiKeyInstance = () => {
    memoryStore = memoryStore || new (require('express-brute')).MemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteMemoryInstance(memoryStore, extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys)));
    return contentApiKeyInstance;
};

module.exports = {
    globalBlock: createGlobalBlockInstance,
    globalReset: createGlobalResetInstance,
    userLogin: createUserLoginInstance,
    sendVerificationCode: createSendVerificationCodeInstance,
    userVerification: createUserVerificationInstance,
    membersAuth: createMembersAuthInstance,
    membersAuthEnumeration: createMembersAuthEnumerationInstance,
    otcVerification: createOtcVerificationInstance,
    otcVerificationEnumeration: createOtcVerificationEnumerationInstance,
    userReset: createUserResetInstance,
    privateBlog: createPrivateBlogInstance,
    contentApiKey: createContentApiKeyInstance,
    webmentionsBlock: createWebmentionsBlockInstance,
    emailPreviewBlock: createEmailPreviewBlockInstance,
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