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

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

/**
 * Centralised error handling for Brute store errors.
 */
const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // express-brute may not forward a callback; log and exit if so
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

/**
 * Lazily creates and returns a shared Knex-backed store for ExpressBrute.
 */
let store;
const getKnexStore = () => {
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
 * Lazily creates and returns a shared in‑memory store for ExpressBrute.
 */
let memoryStore;
const getMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Caches created ExpressBrute instances keyed by name.
 */
const instances = {};

/**
 * Retrieves a cached instance or creates a new one using the supplied factory.
 */
const getInstance = (key, factory) => {
    if (!instances[key]) {
        instances[key] = factory();
    }
    return instances[key];
};

/* ---------- Instance factories ---------- */

const createGlobalBlock = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError
    }, pick(spamGlobalBlock, spamConfigKeys)));
};

const createGlobalReset = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        },
        handleStoreError
    }, pick(spamGlobalReset, spamConfigKeys)));
};

const createWebmentionsBlock = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        handleStoreError
    }, pick(spamWebmentionsBlock, spamConfigKeys)));
};

const createEmailPreviewBlock = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        handleStoreError
    }, pick(spamEmailPreviewBlock, spamConfigKeys)));
};

const createMembersAuth = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError
    }, pick(spamUserLogin, spamConfigKeys)));
};

const createMembersAuthEnumeration = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError
    }, pick(spamMemberLogin, spamConfigKeys)));
};

const createOtcVerificationEnumeration = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        },
        handleStoreError
    }, pick(spamOtcVerificationEnumeration, spamConfigKeys)));
};

const createOtcVerification = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        },
        handleStoreError
    }, pick(spamOtcVerification, spamConfigKeys)));
};

const createUserLogin = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError
    }, pick(spamUserLogin, spamConfigKeys)));
};

const createUserReset = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        },
        handleStoreError
    }, pick(spamUserReset, spamConfigKeys)));
};

const createUserVerification = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError
    }, pick(spamUserVerification, spamConfigKeys)));
};

const createSendVerificationCode = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError
    }, pick(spamSendVerificationCode, spamConfigKeys)));
};

const createPrivateBlog = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getKnexStore(), extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
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
    }, pick(spamPrivateBlock, spamConfigKeys)));
};

const createContentApiKey = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getMemoryStore(), extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys)));
};

/* ---------- Exported getters ---------- */

const globalBlock = () => getInstance('globalBlock', createGlobalBlock);
const globalReset = () => getInstance('globalReset', createGlobalReset);
const webmentionsBlock = () => getInstance('webmentionsBlock', createWebmentionsBlock);
const emailPreviewBlock = () => getInstance('emailPreviewBlock', createEmailPreviewBlock);
const membersAuth = () => getInstance('membersAuth', createMembersAuth);
const membersAuthEnumeration = () => getInstance('membersAuthEnumeration', createMembersAuthEnumeration);
const otcVerificationEnumeration = () => getInstance('otcVerificationEnumeration', createOtcVerificationEnumeration);
const otcVerification = () => getInstance('otcVerification', createOtcVerification);
const userLogin = () => getInstance('userLogin', createUserLogin);
const userReset = () => getInstance('userReset', createUserReset);
const userVerification = () => getInstance('userVerification', createUserVerification);
const sendVerificationCode = () => getInstance('sendVerificationCode', createSendVerificationCode);
const privateBlog = () => getInstance('privateBlog', createPrivateBlog);
const contentApiKey = () => getInstance('contentApiKey', createContentApiKey);

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