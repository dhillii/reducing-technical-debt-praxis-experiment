const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

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

const createExpressBruteInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

const createBruteKnexStore = () => {
    const db = require('../../../../data/db');
    return new (require('brute-knex'))({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

const createMemoryStore = () => {
    return new (require('express-brute')).MemoryStore();
};

const createFailCallback = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message,
            context: context,
            help: help
        }));
    };
};

const createFailCallbackWithNextValidRequestDate = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: context,
            help: help
        }));
    };
};

const createPrivateBlogFailCallback = (message, context) => {
    return (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: message,
            context: context
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
};

const spam = config.get('spam') || {};

const spamPrivateBlock = spam.private_block || {};
const spamGlobalBlock = spam.global_block || {};
const spamGlobalReset = spam.global_reset || {};
const spamUserReset = spam.user_reset || {};
const spamUserLogin = spam.user_login || {};
const spamSendVerificationCode = spam.send_verification_code || {};
const spamUserVerification = spam.user_verification || {};
const spamMemberLogin = spam.member_login || {};
const spamContentApiKey = spam.content_api_key || {};
const spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
const spamOtcVerification = spam.otc_verification || {};

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

const globalBlock = () => {
    store = store || createBruteKnexStore();
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamGlobalBlock, spamConfigKeys)
    });

    return globalBlockInstance;
};

const globalReset = () => {
    store = store || createBruteKnexStore();
    globalResetInstance = globalResetInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordIp.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamGlobalReset, spamConfigKeys)
    });

    return globalResetInstance;
};

const webmentionsBlock = () => {
    store = store || createBruteKnexStore();
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallback(
            messages.webmentionsBlock,
            messages.webmentionsBlock,
            messages.webmentionsBlock
        ),
        handleStoreError: handleStoreError,
        ...pick(spamWebmentionsBlock, spamConfigKeys)
    });

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    store = store || createBruteKnexStore();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallback(
            messages.emailPreviewBlock,
            messages.emailPreviewBlock,
            messages.emailPreviewBlock
        ),
        handleStoreError: handleStoreError,
        ...pick(spamEmailPreviewBlock, spamConfigKeys)
    });

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    store = store || createBruteKnexStore();
    membersAuthInstance = membersAuthInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many sign-in attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserLogin, spamConfigKeys)
    });

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    store = store || createBruteKnexStore();
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many different sign-in attempts, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamMemberLogin, spamConfigKeys)
    });

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    store = store || createBruteKnexStore();
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many verification attempts across multiple codes, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        ),
        handleStoreError: handleStoreError,
        ...pick(spamOtcVerificationEnumeration, spamConfigKeys)
    });

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    store = store || createBruteKnexStore();
    otcVerificationInstance = otcVerificationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many attempts for this verification code, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        ),
        handleStoreError: handleStoreError,
        ...pick(spamOtcVerification, spamConfigKeys)
    });

    return otcVerificationInstance;
};

const userLogin = () => {
    store = store || createBruteKnexStore();
    userLoginInstance = userLoginInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many login attempts. Please wait ${moment().fromNow(true)} before trying again, or reset your password.`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserLogin, spamConfigKeys)
    });

    return userLoginInstance;
};

const userReset = () => {
    store = store || createBruteKnexStore();
    userResetInstance = userResetInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many password reset attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordEmail.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserReset, spamConfigKeys)
    });

    return userResetInstance;
};

const userVerification = () => {
    store = store || createBruteKnexStore();
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallback(
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserVerification, spamConfigKeys)
    });

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    store = store || createBruteKnexStore();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallback(
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamSendVerificationCode, spamConfigKeys)
    });

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    store = store || createBruteKnexStore();
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createPrivateBlogFailCallback(
            tpl(messages.tooManySigninAttempts.error,
                {
                    rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                }),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamPrivateBlock, spamConfigKeys)
    });

    return privateBlogInstance;
};

const contentApiKey = () => {
    memoryStore = memoryStore || createMemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteInstance(memoryStore, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError,
        ...pick(spamContentApiKey, spamConfigKeys)
    });

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