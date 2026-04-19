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
const instances = {};

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

/**
 * Lazily creates the shared Brute store.
 */
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

/**
 * Creates or retrieves a cached ExpressBrute instance.
 *
 * @param {string} key - Unique key for the instance.
 * @param {object} configObj - Spam configuration for this instance.
 * @param {function} failCallback - Callback invoked on failure.
 * @param {boolean} attachResetToRequest - Whether to attach reset to request.
 * @returns {ExpressBrute}
 */
const getBruteInstance = (key, configObj, failCallback, attachResetToRequest = false) => {
    if (!instances[key]) {
        const ExpressBrute = require('express-brute');
        instances[key] = new ExpressBrute(getStore(), extend({
            attachResetToRequest,
            failCallback,
            handleStoreError
        }, pick(configObj, spamConfigKeys)));
    }
    return instances[key];
};

/**
 * Creates or retrieves a cached ExpressBrute instance that uses an in‑memory store.
 *
 * @param {string} key - Unique key for the instance.
 * @param {object} configObj - Spam configuration for this instance.
 * @param {function} failCallback - Callback invoked on failure.
 * @param {boolean} attachResetToRequest - Whether to attach reset to request.
 * @returns {ExpressBrute}
 */
const getMemoryBruteInstance = (key, configObj, failCallback, attachResetToRequest = false) => {
    if (!instances[key]) {
        const ExpressBrute = require('express-brute');
        memoryStore = memoryStore || new ExpressBrute.MemoryStore();
        instances[key] = new ExpressBrute(memoryStore, extend({
            attachResetToRequest,
            failCallback,
            handleStoreError
        }, pick(configObj, spamConfigKeys)));
    }
    return instances[key];
};

const globalBlock = () => getBruteInstance(
    'globalBlock',
    spamGlobalBlock,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    }
);

const globalReset = () => getBruteInstance(
    'globalReset',
    spamGlobalReset,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }
);

const webmentionsBlock = () => getBruteInstance(
    'webmentionsBlock',
    spamWebmentionsBlock,
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    }
);

const emailPreviewBlock = () => getBruteInstance(
    'emailPreviewBlock',
    spamEmailPreviewBlock,
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    }
);

const membersAuth = () => getBruteInstance(
    'membersAuth',
    spamUserLogin,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    true
);

const membersAuthEnumeration = () => getBruteInstance(
    'membersAuthEnumeration',
    spamMemberLogin,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    true
);

const otcVerificationEnumeration = () => getBruteInstance(
    'otcVerificationEnumeration',
    spamOtcVerificationEnumeration,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }
);

const otcVerification = () => getBruteInstance(
    'otcVerification',
    spamOtcVerification,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }
);

const userLogin = () => getBruteInstance(
    'userLogin',
    spamUserLogin,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    true
);

const userReset = () => getBruteInstance(
    'userReset',
    spamUserReset,
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    },
    true
);

const userVerification = () => getBruteInstance(
    'userVerification',
    spamUserVerification,
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    true
);

const sendVerificationCode = () => getBruteInstance(
    'sendVerificationCode',
    spamSendVerificationCode,
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    true
);

const privateBlog = () => getBruteInstance(
    'privateBlog',
    spamPrivateBlock,
    (req, res, next, nextValidRequestDate) => {
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
    }
);

const contentApiKey = () => getMemoryBruteInstance(
    'contentApiKey',
    spamContentApiKey,
    (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    },
    true
);

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
        Object.keys(instances).forEach(key => delete instances[key]);

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