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

const getStore = () => {
    if (!store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

const getMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

const createBruteInstance = (store, configObj, options) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, extend(options, pick(configObj, spamConfigKeys)));
};

const createFailCallbackWithRetry = (messageFn, contextFn, helpFn) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: messageFn(nextValidRequestDate),
            context: contextFn(),
            help: helpFn()
        }));
    };
};

const createFailCallbackSimple = (message, context, help, code) => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message,
            context,
            help,
            code
        });
        return next(err);
    };
};

const globalBlock = () => {
    const store = getStore();
    globalBlockInstance = globalBlockInstance || createBruteInstance(store, spamGlobalBlock, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithRetry(
            (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            () => tpl(messages.forgottenPasswordIp.error, {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            () => tpl(messages.tooManyAttempts)
        ),
        handleStoreError
    });
    return globalBlockInstance;
};

const globalReset = () => {
    const store = getStore();
    globalResetInstance = globalResetInstance || createBruteInstance(store, spamGlobalReset, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithRetry(
            (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            () => tpl(messages.forgottenPasswordIp.error, {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            () => tpl(messages.forgottenPasswordIp.context)
        ),
        handleStoreError
    });
    return globalResetInstance;
};

const webmentionsBlock = () => {
    const store = getStore();
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(store, spamWebmentionsBlock, {
        attachResetToRequest: false,
        failCallback: createFailCallbackSimple(
            messages.webmentionsBlock,
            null,
            null
        ),
        handleStoreError
    });
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const store = getStore();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(store, spamEmailPreviewBlock, {
        attachResetToRequest: false,
        failCallback: createFailCallbackSimple(
            messages.emailPreviewBlock,
            null,
            null
        ),
        handleStoreError
    });
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const store = getStore();
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(store, spamUserLogin, {
            attachResetToRequest: true,
            failCallback: createFailCallbackWithRetry(
                (nextValidRequestDate) => `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                () => tpl(messages.tooManySigninAttempts.context),
                () => tpl(messages.tooManySigninAttempts.context)
            ),
            handleStoreError
        });
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const store = getStore();
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(store, spamMemberLogin, {
            attachResetToRequest: true,
            failCallback: createFailCallbackWithRetry(
                (nextValidRequestDate) => `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                () => tpl(messages.tooManySigninAttempts.context),
                () => tpl(messages.tooManySigninAttempts.context)
            ),
            handleStoreError
        });
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const store = getStore();
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(store, spamOtcVerificationEnumeration, {
            attachResetToRequest: false,
            failCallback: createFailCallbackWithRetry(
                (nextValidRequestDate) => `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                () => tpl(messages.tooManyOTCVerificationAttempts.context),
                () => tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError
        });
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const store = getStore();
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(store, spamOtcVerification, {
            attachResetToRequest: false,
            failCallback: createFailCallbackWithRetry(
                (nextValidRequestDate) => `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                () => tpl(messages.tooManyOTCVerificationAttempts.context),
                () => tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError
        });
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    const store = getStore();
    userLoginInstance = userLoginInstance || createBruteInstance(store, spamUserLogin, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithRetry(
            (nextValidRequestDate) => `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            () => tpl(messages.tooManySigninAttempts.context),
            () => tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError
    });
    return userLoginInstance;
};

const userReset = () => {
    const store = getStore();
    userResetInstance = userResetInstance || createBruteInstance(store, spamUserReset, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithRetry(
            (nextValidRequestDate) => `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            () => tpl(messages.forgottenPasswordEmail.error, {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            () => tpl(messages.forgottenPasswordEmail.context)
        ),
        handleStoreError
    });
    return userResetInstance;
};

const userVerification = () => {
    const store = getStore();
    userVerificationInstance = userVerificationInstance || createBruteInstance(store, spamUserVerification, {
        attachResetToRequest: true,
        failCallback: createFailCallbackSimple(
            tpl(messages.tooManyAttempts),
            null,
            null
        ),
        handleStoreError
    });
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const store = getStore();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(store, spamSendVerificationCode, {
        attachResetToRequest: true,
        failCallback: createFailCallbackSimple(
            tpl(messages.tooManyAttempts),
            null,
            null
        ),
        handleStoreError
    });
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const store = getStore();
    privateBlogInstance = privateBlogInstance || createBruteInstance(store, spamPrivateBlock, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
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
        },
        handleStoreError
    });
    return privateBlogInstance;
};

const contentApiKey = () => {
    const store = getMemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createBruteInstance(store, spamContentApiKey, {
        attachResetToRequest: true,
        failCallback: createFailCallbackSimple(
            tpl(messages.tooManyAttempts),
            null,
            null
        ),
        handleStoreError
    });
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