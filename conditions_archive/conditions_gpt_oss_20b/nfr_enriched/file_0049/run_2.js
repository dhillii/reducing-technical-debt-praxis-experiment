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
 * Handles errors from the underlying store.
 * @param {Error} err
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
 * Creates an ExpressBrute instance with the provided configuration.
 * @param {Object} configObj - Spam configuration for this instance.
 * @param {Function} failCallback - Callback invoked on rate limit exceed.
 * @param {boolean} [attachResetToRequest=false] - Whether to attach reset to request.
 * @param {boolean} [useMemoryStore=false] - Whether to use an in-memory store.
 * @returns {ExpressBrute} The configured ExpressBrute instance.
 */
const createBruteInstance = (configObj, failCallback, attachResetToRequest = false, useMemoryStore = false) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    let storeInstance;
    if (useMemoryStore) {
        if (!memoryStore) {
            memoryStore = new ExpressBrute.MemoryStore();
        }
        storeInstance = memoryStore;
    } else {
        if (!store) {
            store = new BruteKnex({
                tablename: 'brute',
                createTable: false,
                knex: db.knex
            });
        }
        storeInstance = store;
    }

    return new ExpressBrute(storeInstance, extend({
        attachResetToRequest,
        failCallback,
        handleStoreError
    }, pick(configObj, spamConfigKeys)));
};

const globalBlock = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            help: tpl(messages.tooManyAttempts)
        }));
    };

    if (!globalBlockInstance) {
        globalBlockInstance = createBruteInstance(spamGlobalBlock, failCallback, false, false);
    }
    return globalBlockInstance;
};

const globalReset = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };

    if (!globalResetInstance) {
        globalResetInstance = createBruteInstance(spamGlobalReset, failCallback, false, false);
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };

    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(spamWebmentionsBlock, failCallback, false, false);
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };

    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(spamEmailPreviewBlock, failCallback, false, false);
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(spamUserLogin, failCallback, true, false);
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(spamMemberLogin, failCallback, true, false);
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };

    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(spamOtcVerificationEnumeration, failCallback, false, false);
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };

    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(spamOtcVerification, failCallback, false, false);
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    if (!userLoginInstance) {
        userLoginInstance = createBruteInstance(spamUserLogin, failCallback, true, false);
    }
    return userLoginInstance;
};

const userReset = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };

    if (!userResetInstance) {
        userResetInstance = createBruteInstance(spamUserReset, failCallback, true, false);
    }
    return userResetInstance;
};

const userVerification = () => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(spamUserVerification, failCallback, true, false);
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(spamSendVerificationCode, failCallback, true, false);
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
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

    if (!privateBlogInstance) {
        privateBlogInstance = createBruteInstance(spamPrivateBlock, failCallback, false, false);
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    const failCallback = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };

    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createBruteInstance(spamContentApiKey, failCallback, true, true);
    }
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