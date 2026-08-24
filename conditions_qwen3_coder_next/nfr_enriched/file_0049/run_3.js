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

const createBruteInstance = (store, config, failCallback) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createBruteKnexStore = () => {
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

const createFailCallback = (message, context, help, code) => {
    return (req, res, next, nextValidRequestDate) => {
        const formattedMessage = nextValidRequestDate
            ? `${message} Try again in ${moment(nextValidRequestDate).fromNow(true)}`
            : message;

        const errorOptions = {
            message: formattedMessage,
            context: context || tpl(messages.tooManyAttempts),
            help: help || tpl(messages.tooManyAttempts)
        };

        if (code) {
            errorOptions.code = code;
        }

        return next(new errors.TooManyRequestsError(errorOptions));
    };
};

const createGlobalBlockInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many attempts try again in',
        tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalBlock.freeRetries + 1 || 5,
            rfp: spamGlobalBlock.lifetime || 60 * 60
        }),
        tpl(messages.tooManyAttempts)
    );

    return createBruteInstance(store, spamGlobalBlock, failCallback);
};

const createGlobalResetInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many attempts try again in',
        tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalReset.freeRetries + 1 || 5,
            rfp: spamGlobalReset.lifetime || 60 * 60
        }),
        tpl(messages.forgottenPasswordIp.context)
    );

    return createBruteInstance(store, spamGlobalReset, failCallback);
};

const createWebmentionsBlockInstance = (store) => {
    const failCallback = createFailCallback(messages.webmentionsBlock);

    return createBruteInstance(store, spamWebmentionsBlock, failCallback);
};

const createEmailPreviewBlockInstance = (store) => {
    const failCallback = createFailCallback(messages.emailPreviewBlock);

    return createBruteInstance(store, spamEmailPreviewBlock, failCallback);
};

const createMembersAuthInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many sign-in attempts try again in',
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );

    const instance = createBruteInstance(store, spamUserLogin, failCallback);
    instance.options.attachResetToRequest = true;
    return instance;
};

const createMembersAuthEnumerationInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many different sign-in attempts, try again in',
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );

    const instance = createBruteInstance(store, spamMemberLogin, failCallback);
    instance.options.attachResetToRequest = true;
    return instance;
};

const createOtcVerificationEnumerationInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many verification attempts across multiple codes, try again in',
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    );

    return createBruteInstance(store, spamOtcVerificationEnumeration, failCallback);
};

const createOtcVerificationInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many attempts for this verification code, try again in',
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    );

    return createBruteInstance(store, spamOtcVerification, failCallback);
};

const createUserLoginInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many login attempts. Please wait',
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );

    const instance = createBruteInstance(store, spamUserLogin, failCallback);
    instance.options.attachResetToRequest = true;
    return instance;
};

const createUserResetInstance = (store) => {
    const failCallback = createFailCallback(
        'Too many password reset attempts try again in',
        tpl(messages.forgottenPasswordEmail.error, {
            rfa: spamUserReset.freeRetries + 1 || 5,
            rfp: spamUserReset.lifetime || 60 * 60
        }),
        tpl(messages.forgottenPasswordEmail.context)
    );

    const instance = createBruteInstance(store, spamUserReset, failCallback);
    instance.options.attachResetToRequest = true;
    return instance;
};

const createUserVerificationInstance = (store) => {
    const failCallback = createFailCallback(tpl(messages.tooManyAttempts));

    return createBruteInstance(store, spamUserVerification, failCallback);
};

const createSendVerificationCodeInstance = (store) => {
    const failCallback = createFailCallback(tpl(messages.tooManyAttempts));

    const instance = createBruteInstance(store, spamSendVerificationCode, failCallback);
    instance.options.attachResetToRequest = true;
    return instance;
};

const createPrivateBlogInstance = (store) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
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

    return createBruteInstance(store, spamPrivateBlock, failCallback);
};

const createContentApiKeyInstance = () => {
    const failCallback = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };

    const instance = createBruteInstance(memoryStore, spamContentApiKey, failCallback);
    instance.options.attachResetToRequest = true;
    return instance;
};

const globalBlock = () => {
    store = store || createBruteKnexStore();
    globalBlockInstance = globalBlockInstance || createGlobalBlockInstance(store);
    return globalBlockInstance;
};

const globalReset = () => {
    store = store || createBruteKnexStore();
    globalResetInstance = globalResetInstance || createGlobalResetInstance(store);
    return globalResetInstance;
};

const webmentionsBlock = () => {
    store = store || createBruteKnexStore();
    webmentionsBlockInstance = webmentionsBlockInstance || createWebmentionsBlockInstance(store);
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    store = store || createBruteKnexStore();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createEmailPreviewBlockInstance(store);
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    store = store || createBruteKnexStore();
    if (!membersAuthInstance) {
        membersAuthInstance = createMembersAuthInstance(store);
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    store = store || createBruteKnexStore();
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createMembersAuthEnumerationInstance(store);
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    store = store || createBruteKnexStore();
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createOtcVerificationEnumerationInstance(store);
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    store = store || createBruteKnexStore();
    if (!otcVerificationInstance) {
        otcVerificationInstance = createOtcVerificationInstance(store);
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    store = store || createBruteKnexStore();
    userLoginInstance = userLoginInstance || createUserLoginInstance(store);
    return userLoginInstance;
};

const userReset = function userReset() {
    store = store || createBruteKnexStore();
    userResetInstance = userResetInstance || createUserResetInstance(store);
    return userResetInstance;
};

const userVerification = function userVerification() {
    store = store || createBruteKnexStore();
    userVerificationInstance = userVerificationInstance || createUserVerificationInstance(store);
    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    store = store || createBruteKnexStore();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createSendVerificationCodeInstance(store);
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    store = store || createBruteKnexStore();
    privateBlogInstance = privateBlogInstance || createPrivateBlogInstance(store);
    return privateBlogInstance;
};

const contentApiKey = () => {
    memoryStore = memoryStore || createMemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createContentApiKeyInstance();
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