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

const createBruteInstance = (store, config, failCallbackFactory) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback: failCallbackFactory(config),
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createMemoryBruteInstance = (config, failCallbackFactory) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: false,
        failCallback: failCallbackFactory(config),
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createFailCallback = (message, context, code) => (config) => (req, res, next, nextValidRequestDate) => {
    const msg = typeof message === 'function' ? message(config, nextValidRequestDate) : message;
    const ctx = typeof context === 'function' ? context(config) : context;

    const error = new errors.TooManyRequestsError({
        message: msg,
        context: ctx,
        help: tpl(messages.tooManyAttempts)
    });

    if (code) {
        error.code = code;
    }

    return next(error);
};

const createIpBasedFailCallback = (messageTemplate, contextTemplate, code) => (config) => (req, res, next, nextValidRequestDate) => {
    const msg = messageTemplate.replace('{rfa}', config.freeRetries + 1 || 5)
        .replace('{rfp}', config.lifetime || 60 * 60);

    const ctx = contextTemplate ? tpl(contextTemplate) : undefined;

    const error = new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: ctx,
        help: tpl(messages.tooManyAttempts)
    });

    if (code) {
        error.code = code;
    }

    return next(error);
};

const createFixedMessageFailCallback = (message) => () => (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message,
        context: tpl(messages.tooManyAttempts)
    }));
};

const globalBlock = () => {
    const failCallback = createIpBasedFailCallback(
        'Too many attempts try again in {time}',
        messages.forgottenPasswordIp.error
    );

    return createBruteInstance(globalBlockInstance, spamGlobalBlock, failCallback);
};

const globalReset = () => {
    const failCallback = createIpBasedFailCallback(
        'Too many attempts try again in {time}',
        messages.forgottenPasswordIp.error
    );

    return createBruteInstance(globalResetInstance, spamGlobalReset, failCallback);
};

const webmentionsBlock = () => {
    const failCallback = createFixedMessageFailCallback(messages.webmentionsBlock);

    return createBruteInstance(webmentionsBlockInstance, spamWebmentionsBlock, failCallback);
};

const emailPreviewBlock = () => {
    const failCallback = createFixedMessageFailCallback(messages.emailPreviewBlock);

    return createBruteInstance(emailPreviewBlockInstance, spamEmailPreviewBlock, failCallback);
};

const membersAuth = () => {
    const failCallback = createFailCallback(
        'Too many sign-in attempts try again in {time}',
        messages.tooManySigninAttempts.context
    );

    return createBruteInstance(membersAuthInstance, spamUserLogin, failCallback);
};

const membersAuthEnumeration = () => {
    const failCallback = createFailCallback(
        'Too many different sign-in attempts, try again in {time}',
        messages.tooManySigninAttempts.context
    );

    return createBruteInstance(membersAuthEnumerationInstance, spamMemberLogin, failCallback);
};

const otcVerificationEnumeration = () => {
    const failCallback = createFailCallback(
        'Too many verification attempts across multiple codes, try again in {time}',
        messages.tooManyOTCVerificationAttempts.context,
        'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    );

    return createBruteInstance(otcVerificationEnumerationInstance, spamOtcVerificationEnumeration, failCallback);
};

const otcVerification = () => {
    const failCallback = createFailCallback(
        'Too many attempts for this verification code, try again in {time}',
        messages.tooManyOTCVerificationAttempts.context,
        'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    );

    return createBruteInstance(otcVerificationInstance, spamOtcVerification, failCallback);
};

const userLogin = () => {
    const failCallback = createFailCallback(
        'Too many login attempts. Please wait {time} before trying again, or reset your password.',
        messages.tooManySigninAttempts.context
    );

    return createBruteInstance(userLoginInstance, spamUserLogin, failCallback);
};

const userReset = () => {
    const failCallback = createIpBasedFailCallback(
        'Too many password reset attempts try again in {time}',
        messages.forgottenPasswordEmail.error
    );

    return createBruteInstance(userResetInstance, spamUserReset, failCallback);
};

const userVerification = () => {
    const failCallback = createFixedMessageFailCallback(tpl(messages.tooManyAttempts));

    return createBruteInstance(userVerificationInstance, spamUserVerification, failCallback);
};

const sendVerificationCode = () => {
    const failCallback = createFixedMessageFailCallback(tpl(messages.tooManyAttempts));

    return createBruteInstance(sendVerificationCodeInstance, spamSendVerificationCode, failCallback);
};

const privateBlog = () => {
    const failCallback = (config) => (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: config.freeRetries + 1 || 5,
                rateSigninPeriod: config.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };

    return createBruteInstance(privateBlogInstance, spamPrivateBlock, failCallback);
};

const contentApiKey = () => {
    const failCallback = () => (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };

    return createMemoryBruteInstance(spamContentApiKey, failCallback);
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