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

    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

const createStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    return new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

const createMemoryStore = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute.MemoryStore();
};

const createExpressBruteInstance = (storeInstance, config, failCallback) => {
    const ExpressBrute = require('express-brute');
    
    return new ExpressBrute(storeInstance,
        extend({
            attachResetToRequest: false,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );
};

const getOrCreateStore = () => {
    if (!store) {
        store = createStore();
    }
    return store;
};

const getOrCreateMemoryStore = () => {
    if (!memoryStore) {
        memoryStore = createMemoryStore();
    }
    return memoryStore;
};

const globalBlockFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error,
            {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
        help: tpl(messages.tooManyAttempts)
    }));
};

const globalResetFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error,
            {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
        help: tpl(messages.forgottenPasswordIp.context)
    }));
};

const webmentionsBlockFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    }));
};

const emailPreviewBlockFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    }));
};

const membersAuthFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

const membersAuthEnumerationFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

const otcVerificationEnumerationFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
};

const otcVerificationFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }));
};

const userLoginFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

const userResetFailCallback = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error,
            {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
        help: tpl(messages.forgottenPasswordEmail.context)
    }));
};

const userVerificationFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
};

const sendVerificationCodeFailCallback = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
};

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

const contentApiKeyFailCallback = (req, res, next) => {
    const err = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });

    logging.error(err);
    return next(err);
};

const globalBlock = () => {
    const storeInstance = getOrCreateStore();
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(
        storeInstance, 
        spamGlobalBlock, 
        globalBlockFailCallback
    );
    return globalBlockInstance;
};

const globalReset = () => {
    const storeInstance = getOrCreateStore();
    globalResetInstance = globalResetInstance || createExpressBruteInstance(
        storeInstance, 
        spamGlobalReset, 
        globalResetFailCallback
    );
    return globalResetInstance;
};

const webmentionsBlock = () => {
    const storeInstance = getOrCreateStore();
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(
        storeInstance, 
        spamWebmentionsBlock, 
        webmentionsBlockFailCallback
    );
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const storeInstance = getOrCreateStore();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(
        storeInstance, 
        spamEmailPreviewBlock, 
        emailPreviewBlockFailCallback
    );
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const storeInstance = getOrCreateStore();
    if (!membersAuthInstance) {
        const ExpressBrute = require('express-brute');
        membersAuthInstance = new ExpressBrute(storeInstance,
            extend({
                attachResetToRequest: true,
                failCallback: membersAuthFailCallback,
                handleStoreError: handleStoreError
            }, pick(spamUserLogin, spamConfigKeys))
        );
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const storeInstance = getOrCreateStore();
    if (!membersAuthEnumerationInstance) {
        const ExpressBrute = require('express-brute');
        membersAuthEnumerationInstance = new ExpressBrute(storeInstance,
            extend({
                attachResetToRequest: true,
                failCallback: membersAuthEnumerationFailCallback,
                handleStoreError: handleStoreError
            }, pick(spamMemberLogin, spamConfigKeys))
        );
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const storeInstance = getOrCreateStore();
    if (!otcVerificationEnumerationInstance) {
        const ExpressBrute = require('express-brute');
        otcVerificationEnumerationInstance = new ExpressBrute(storeInstance,
            extend({
                attachResetToRequest: false,
                failCallback: otcVerificationEnumerationFailCallback,
                handleStoreError: handleStoreError
            }, pick(spamOtcVerificationEnumeration, spamConfigKeys))
        );
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const storeInstance = getOrCreateStore();
    if (!otcVerificationInstance) {
        const ExpressBrute = require('express-brute');
        otcVerificationInstance = new ExpressBrute(storeInstance,
            extend({
                attachResetToRequest: false,
                failCallback: otcVerificationFailCallback,
                handleStoreError: handleStoreError
            }, pick(spamOtcVerification, spamConfigKeys))
        );
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    const storeInstance = getOrCreateStore();
    userLoginInstance = userLoginInstance || createExpressBruteInstance(
        storeInstance, 
        spamUserLogin, 
        userLoginFailCallback
    );
    return userLoginInstance;
};

const userReset = function userReset() {
    const storeInstance = getOrCreateStore();
    userResetInstance = userResetInstance || createExpressBruteInstance(
        storeInstance, 
        spamUserReset, 
        userResetFailCallback
    );
    return userResetInstance;
};

const userVerification = function userVerification() {
    const storeInstance = getOrCreateStore();
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(
        storeInstance, 
        spamUserVerification, 
        userVerificationFailCallback
    );
    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    const storeInstance = getOrCreateStore();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(
        storeInstance, 
        spamSendVerificationCode, 
        sendVerificationCodeFailCallback
    );
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const storeInstance = getOrCreateStore();
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(
        storeInstance, 
        spamPrivateBlock, 
        privateBlogFailCallback
    );
    return privateBlogInstance;
};

const contentApiKey = () => {
    const storeInstance = getOrCreateMemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteInstance(
        storeInstance, 
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