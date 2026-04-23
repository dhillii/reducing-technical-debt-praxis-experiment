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
 * Handles store error by logging it and returning a custom error.
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
 * @param {Object} options - The options for the ExpressBrute instance.
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
 * @param {Object} options - The options for the ExpressBrute instance.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstanceWithBruteKnexStore = (options) => {
    const store = createBruteKnexStore();
    return createExpressBruteInstance(store, options);
};

/**
 * Creates a new ExpressBrute instance with the given options and memory store.
 * @param {Object} options - The options for the ExpressBrute instance.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstanceWithMemoryStore = (options) => {
    const memoryStore = new (require('express-brute')).MemoryStore();
    return createExpressBruteInstance(memoryStore, options);
};

/**
 * Creates a new ExpressBrute instance for global block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createGlobalBlockInstance = () => {
    const options = extend({
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
    }, pick(spamGlobalBlock, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for global reset.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createGlobalResetInstance = () => {
    const options = extend({
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
    }, pick(spamGlobalReset, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for webmentions block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createWebmentionsBlockInstance = () => {
    const options = extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamWebmentionsBlock, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for email preview block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createEmailPreviewBlockInstance = () => {
    const options = extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamEmailPreviewBlock, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for members auth.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createMembersAuthInstance = () => {
    const options = extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for members auth enumeration.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createMembersAuthEnumerationInstance = () => {
    const options = extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamMemberLogin, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for otc verification enumeration.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createOtcVerificationEnumerationInstance = () => {
    const options = extend({
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
    }, pick(spamOtcVerificationEnumeration, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for otc verification.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createOtcVerificationInstance = () => {
    const options = extend({
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
    }, pick(spamOtcVerification, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for user login.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createUserLoginInstance = () => {
    const options = extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for send verification code.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createSendVerificationCodeInstance = () => {
    const options = extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamSendVerificationCode, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for user verification.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createUserVerificationInstance = () => {
    const options = extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserVerification, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for user reset.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createUserResetInstance = () => {
    const options = extend({
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
    }, pick(spamUserReset, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for private blog.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createPrivateBlogInstance = () => {
    const options = extend({
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
    }, pick(spamPrivateBlock, spamConfigKeys));
    return createExpressBruteInstanceWithBruteKnexStore(options);
};

/**
 * Creates a new ExpressBrute instance for content api key.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createContentApiKeyInstance = () => {
    const options = extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys));
    return createExpressBruteInstanceWithMemoryStore(options);
};

const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createGlobalBlockInstance();
    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createGlobalResetInstance();
    return globalResetInstance;
};

const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createWebmentionsBlockInstance();
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createEmailPreviewBlockInstance();
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    membersAuthInstance = membersAuthInstance || createMembersAuthInstance();
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createMembersAuthEnumerationInstance();
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createOtcVerificationEnumerationInstance();
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    otcVerificationInstance = otcVerificationInstance || createOtcVerificationInstance();
    return otcVerificationInstance;
};

const userLogin = () => {
    userLoginInstance = userLoginInstance || createUserLoginInstance();
    return userLoginInstance;
};

const sendVerificationCode = () => {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createSendVerificationCodeInstance();
    return sendVerificationCodeInstance;
};

const userVerification = () => {
    userVerificationInstance = userVerificationInstance || createUserVerificationInstance();
    return userVerificationInstance;
};

const userReset = () => {
    userResetInstance = userResetInstance || createUserResetInstance();
    return userResetInstance;
};

const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createPrivateBlogInstance();
    return privateBlogInstance;
};

const contentApiKey = () => {
    contentApiKeyInstance = contentApiKeyInstance || createContentApiKeyInstance();
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