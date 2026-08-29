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
 * @description Creates a new BruteKnex store instance
 * @returns {Object} BruteKnex store instance
 */
const createStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    return new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

/**
 * @description Creates a new ExpressBrute instance with common configuration
 * @param {Object} store - The storage backend
 * @param {Object} spamConfig - Configuration for spam prevention
 * @param {Function} failCallback - Callback function for failed attempts
 * @returns {Object} ExpressBrute instance
 */
const createExpressBruteInstance = (store, spamConfig, failCallback) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(store,
        extend({
            attachResetToRequest: false,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys))
    );
};

/**
 * @description Creates a new ExpressBrute instance with request attachment enabled
 * @param {Object} store - The storage backend
 * @param {Object} spamConfig - Configuration for spam prevention
 * @param {Function} failCallback - Callback function for failed attempts
 * @returns {Object} ExpressBrute instance
 */
const createAttachedExpressBruteInstance = (store, spamConfig, failCallback) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(store,
        extend({
            attachResetToRequest: true,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, spamConfigKeys))
    );
};

/**
 * @description Fail callback for global block attempts
 */
const globalBlockFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error,
            {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
        help: tpl(messages.tooManyAttempts)
    }));
};

/**
 * @description Fail callback for global reset attempts
 */
const globalResetFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error,
            {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
        help: tpl(messages.forgottenPasswordIp.context)
    }));
};

/**
 * @description Fail callback for webmentions block attempts
 */
const webmentionsBlockFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    }));
};

/**
 * @description Fail callback for email preview block attempts
 */
const emailPreviewBlockFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    }));
};

/**
 * @description Fail callback for member authentication attempts
 */
const membersAuthFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

/**
 * @description Fail callback for member authentication enumeration attempts
 */
const membersAuthEnumerationFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

/**
 * @description Fail callback for OTC verification enumeration attempts
 */
const otcVerificationEnumerationFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
};

/**
 * @description Fail callback for OTC verification attempts
 */
const otcVerificationFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }));
};

/**
 * @description Fail callback for user login attempts
 */
const userLoginFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

/**
 * @description Fail callback for user reset attempts
 */
const userResetFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error,
            {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
        help: tpl(messages.forgottenPasswordEmail.context)
    }));
};

/**
 * @description Fail callback for user verification attempts
 */
const userVerificationFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
};

/**
 * @description Fail callback for send verification code attempts
 */
const sendVerificationCodeFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
};

/**
 * @description Fail callback for private blog access attempts
 */
const privateBlogFailCallback = (req, res, next, nextValidRequestDate) => {
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

/**
 * @description Fail callback for content API key attempts
 */
const contentApiKeyFailCallback = (req, res, next) => {
    const err = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });

    logging.error(err);
    return next(err);
};

// This locks a single endpoint based on excessive requests from an IP.
// Currently only used for auth type methods.
// We allow for a generous number of requests here to prevent communites on the same IP bing barred on account of a single user
// Defaults to 50 attempts per hour and locks the endpoint for an hour
const globalBlock = () => {
    store = store || createStore();

    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(
        store,
        spamGlobalBlock,
        globalBlockFailCallback
    );

    return globalBlockInstance;
};

const globalReset = () => {
    store = store || createStore();

    globalResetInstance = globalResetInstance || createExpressBruteInstance(
        store,
        spamGlobalReset,
        globalResetFailCallback
    );

    return globalResetInstance;
};

const webmentionsBlock = () => {
    store = store || createStore();

    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(
        store,
        spamWebmentionsBlock,
        webmentionsBlockFailCallback
    );

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    store = store || createStore();

    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(
        store,
        spamEmailPreviewBlock,
        emailPreviewBlockFailCallback
    );

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    store = store || createStore();

    if (!membersAuthInstance) {
        membersAuthInstance = createAttachedExpressBruteInstance(
            store,
            spamUserLogin,
            membersAuthFailCallback
        );
    }

    return membersAuthInstance;
};

/**
 * This one should have higher limits because it checks across all email addresses
 */
const membersAuthEnumeration = () => {
    store = store || createStore();

    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createAttachedExpressBruteInstance(
            store,
            spamMemberLogin,
            membersAuthEnumerationFailCallback
        );
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    store = store || createStore();

    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createExpressBruteInstance(
            store,
            spamOtcVerificationEnumeration,
            otcVerificationEnumerationFailCallback
        );
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    store = store || createStore();

    if (!otcVerificationInstance) {
        otcVerificationInstance = createExpressBruteInstance(
            store,
            spamOtcVerification,
            otcVerificationFailCallback
        );
    }

    return otcVerificationInstance;
};

// Stops login attempts for a user+IP pair with an increasing time period starting from 10 minutes
// and rising to a week in a fibonnaci sequence
// The user+IP count is reset when on successful login
// Default value of 5 attempts per user+IP pair
const userLogin = () => {
    store = store || createStore();

    userLoginInstance = userLoginInstance || createAttachedExpressBruteInstance(
        store,
        spamUserLogin,
        userLoginFailCallback
    );

    return userLoginInstance;
};

// Stop password reset requests when there are (freeRetries + 1) requests per lifetime per email
// Defaults here are 5 attempts per hour for a user+IP pair
// The endpoint is then locked for an hour
const userReset = function userReset() {
    store = store || createStore();

    userResetInstance = userResetInstance || createAttachedExpressBruteInstance(
        store,
        spamUserReset,
        userResetFailCallback
    );

    return userResetInstance;
};

const userVerification = function userVerification() {
    store = store || createStore();

    userVerificationInstance = userVerificationInstance || createAttachedExpressBruteInstance(
        store,
        spamUserVerification,
        userVerificationFailCallback
    );

    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    store = store || createStore();

    sendVerificationCodeInstance = sendVerificationCodeInstance || createAttachedExpressBruteInstance(
        store,
        spamSendVerificationCode,
        sendVerificationCodeFailCallback
    );

    return sendVerificationCodeInstance;
};

// This protects a private blog from spam attacks. The defaults here allow 10 attempts per IP per hour
// The endpoint is then locked for an hour
const privateBlog = () => {
    store = store || createStore();

    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(
        store,
        spamPrivateBlock,
        privateBlogFailCallback
    );

    return privateBlogInstance;
};

const contentApiKey = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    contentApiKeyInstance = contentApiKeyInstance || createAttachedExpressBruteInstance(
        memoryStore,
        spamContentApiKey,
        contentApiKeyFailCallback
    );

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