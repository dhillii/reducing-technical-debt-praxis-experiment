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

const getBruteKnexStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return store;
};

const createExpressBruteInstance = (storeInstance, configOptions, failCallback) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(storeInstance, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(configOptions, spamConfigKeys)));
};

const createExpressBruteWithMemoryStore = (configOptions, failCallback) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(configOptions, spamConfigKeys)));
};

const createFailCallbackWithWaitTime = (messageTemplate, contextTemplate, options = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `${messageTemplate} ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(contextTemplate, options),
            help: tpl(contextTemplate),
            code: options.code
        }));
    };
};

const createFailCallbackStaticMessage = (messageText, contextTemplate, extraOptions = {}) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messageText,
            context: tpl(contextTemplate),
            help: tpl(contextTemplate),
            ...extraOptions
        }));
    };
};

const createFailCallbackWithLogging = (messageTemplate, contextTemplate, logOptions = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const tooManyRequestsError = new errors.TooManyRequestsError({
            message: tpl(messageTemplate, logOptions),
            context: tpl(contextTemplate)
        });

        logging.error(tooManyRequestsError);

        return next(new errors.TooManyRequestsError({
            message: `${messageTemplate} ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
};

const createGlobalBlockFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many attempts try again in',
        messages.forgottenPasswordIp.error,
        { rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60 }
    );
};

const createGlobalResetFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many attempts try again in',
        messages.forgottenPasswordIp.error,
        { rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60 }
    );
};

const createWebmentionsBlockFailCallback = () => {
    return createFailCallbackStaticMessage(
        messages.webmentionsBlock,
        messages.webmentionsBlock
    );
};

const createEmailPreviewBlockFailCallback = () => {
    return createFailCallbackStaticMessage(
        messages.emailPreviewBlock,
        messages.emailPreviewBlock
    );
};

const createMembersAuthFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many sign-in attempts try again in',
        messages.tooManySigninAttempts.context
    );
};

const createMembersAuthEnumerationFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many different sign-in attempts, try again in',
        messages.tooManySigninAttempts.context
    );
};

const createOTCVerificationEnumerationFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many verification attempts across multiple codes, try again in',
        messages.tooManyOTCVerificationAttempts.context,
        { code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED' }
    );
};

const createOTCVerificationFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many attempts for this verification code, try again in',
        messages.tooManyOTCVerificationAttempts.context,
        { code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED' }
    );
};

const createUserLoginFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many login attempts. Please wait',
        messages.tooManySigninAttempts.context
    );
};

const createUserResetFailCallback = () => {
    return createFailCallbackWithWaitTime(
        'Too many password reset attempts try again in',
        messages.forgottenPasswordEmail.error,
        { rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60 }
    );
};

const createUserVerificationFailCallback = () => {
    return createFailCallbackStaticMessage(
        tpl(messages.tooManyAttempts),
        messages.tooManyAttempts
    );
};

const createSendVerificationCodeFailCallback = () => {
    return createFailCallbackStaticMessage(
        tpl(messages.tooManyAttempts),
        messages.tooManyAttempts
    );
};

const createPrivateBlogFailCallback = () => {
    return createFailCallbackWithLogging(
        'Too many private sign-in attempts try again in',
        messages.tooManySigninAttempts.context,
        {
            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
        }
    );
};

const createContentApiKeyFailCallback = () => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

const createStore = () => getBruteKnexStore();

const createGlobalBlockInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamGlobalBlock,
        createGlobalBlockFailCallback()
    );
};

const createGlobalResetInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamGlobalReset,
        createGlobalResetFailCallback()
    );
};

const createWebmentionsBlockInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamWebmentionsBlock,
        createWebmentionsBlockFailCallback()
    );
};

const createEmailPreviewBlockInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamEmailPreviewBlock,
        createEmailPreviewBlockFailCallback()
    );
};

const createMembersAuthInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamUserLogin,
        createMembersAuthFailCallback()
    );
};

const createMembersAuthEnumerationInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamMemberLogin,
        createMembersAuthEnumerationFailCallback()
    );
};

const createOTCVerificationEnumerationInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamOtcVerificationEnumeration,
        createOTCVerificationEnumerationFailCallback()
    );
};

const createOTCVerificationInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamOtcVerification,
        createOTCVerificationFailCallback()
    );
};

const createUserLoginInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamUserLogin,
        createUserLoginFailCallback()
    );
};

const createUserResetInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamUserReset,
        createUserResetFailCallback()
    );
};

const createUserVerificationInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamUserVerification,
        createUserVerificationFailCallback()
    );
};

const createSendVerificationCodeInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamSendVerificationCode,
        createSendVerificationCodeFailCallback()
    );
};

const createPrivateBlogInstance = () => {
    return createExpressBruteInstance(
        createStore(),
        spamPrivateBlock,
        createPrivateBlogFailCallback()
    );
};

const createContentApiKeyInstance = () => {
    return createExpressBruteWithMemoryStore(
        spamContentApiKey,
        createContentApiKeyFailCallback()
    );
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
    if (!membersAuthInstance) {
        membersAuthInstance = createMembersAuthInstance();
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createMembersAuthEnumerationInstance();
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createOTCVerificationEnumerationInstance();
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createOTCVerificationInstance();
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    userLoginInstance = userLoginInstance || createUserLoginInstance();
    return userLoginInstance;
};

const userReset = function userReset() {
    userResetInstance = userResetInstance || createUserResetInstance();
    return userResetInstance;
};

const userVerification = function userVerification() {
    userVerificationInstance = userVerificationInstance || createUserVerificationInstance();
    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createSendVerificationCodeInstance();
    return sendVerificationCodeInstance;
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