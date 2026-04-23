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

const createSimpleFailCallback = (message) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: message
        }));
    };
};

const globalBlock = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallback(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordIp.error, {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamGlobalBlock, spamConfigKeys)
    });
};

const globalReset = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallback(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordIp.error, {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordIp.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamGlobalReset, spamConfigKeys)
    });
};

const webmentionsBlock = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createSimpleFailCallback(messages.webmentionsBlock),
        handleStoreError: handleStoreError,
        ...pick(spamWebmentionsBlock, spamConfigKeys)
    });
};

const emailPreviewBlock = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createSimpleFailCallback(messages.emailPreviewBlock),
        handleStoreError: handleStoreError,
        ...pick(spamEmailPreviewBlock, spamConfigKeys)
    });
};

const membersAuth = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallback(
            `Too many sign-in attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserLogin, spamConfigKeys)
    });
};

const membersAuthEnumeration = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallback(
            `Too many different sign-in attempts, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamMemberLogin, spamConfigKeys)
    });
};

const otcVerificationEnumeration = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallback(
            `Too many verification attempts across multiple codes, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        ),
        handleStoreError: handleStoreError,
        ...pick(spamOtcVerificationEnumeration, spamConfigKeys)
    });
};

const otcVerification = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallback(
            `Too many attempts for this verification code, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        ),
        handleStoreError: handleStoreError,
        ...pick(spamOtcVerification, spamConfigKeys)
    });
};

const userLogin = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallback(
            `Too many login attempts. Please wait ${moment().fromNow(true)} before trying again, or reset your password.`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserLogin, spamConfigKeys)
    });
};

const userReset = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallback(
            `Too many password reset attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordEmail.error, {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordEmail.context)
        ),
        handleStoreError: handleStoreError,
        ...pick(spamUserReset, spamConfigKeys)
    });
};

const userVerification = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        handleStoreError: handleStoreError,
        ...pick(spamUserVerification, spamConfigKeys)
    });
};

const sendVerificationCode = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createSimpleFailCallback(tpl(messages.tooManyAttempts)),
        handleStoreError: handleStoreError,
        ...pick(spamSendVerificationCode, spamConfigKeys)
    });
};

const privateBlog = () => {
    store = store || createBruteKnexStore();
    return createExpressBruteInstance(store, {
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
        handleStoreError: handleStoreError,
        ...pick(spamPrivateBlock, spamConfigKeys)
    });
};

const contentApiKey = () => {
    memoryStore = memoryStore || createMemoryStore();
    return createExpressBruteInstance(memoryStore, {
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