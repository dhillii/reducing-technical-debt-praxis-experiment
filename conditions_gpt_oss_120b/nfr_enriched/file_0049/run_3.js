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

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

// Cache for singleton instances
const instanceCache = {};

// Store for DB-backed brute
let dbStore;

// In‑memory store for content API key brute
let memoryStore;

/**
 * Lazily creates (or returns) a Knex‑backed Brute store.
 */
function getDbStore() {
    if (dbStore) {
        return dbStore;
    }
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');
    dbStore = new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
    return dbStore;
}

/**
 * Centralised error handling for Brute store operations.
 */
function handleStoreError(err) {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // express‑brute may not forward a callback; log and exit if so
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
}

/**
 * Retrieves a cached instance or creates a new one using the supplied factory.
 * @param {string} key Unique identifier for the instance.
 * @param {Function} factory Function that returns a new instance.
 * @returns {*} Cached or newly created instance.
 */
function getInstance(key, factory) {
    if (!instanceCache[key]) {
        instanceCache[key] = factory();
    }
    return instanceCache[key];
}

/**
 * Creates an ExpressBrute instance with the provided configuration.
 * @param {Object} store Brute store (DB or memory).
 * @param {Object} options Brute options (attachResetToRequest, failCallback, etc.).
 * @returns {Object} ExpressBrute instance.
 */
function createBrute(store, options) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, options);
}

/* ---------- Exported factory functions ---------- */

function globalBlock() {
    return getInstance('globalBlock', () => {
        const opts = extend({
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
        }, pick(spamGlobalBlock, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function globalReset() {
    return getInstance('globalReset', () => {
        const opts = extend({
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
        }, pick(spamGlobalReset, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function webmentionsBlock() {
    return getInstance('webmentionsBlock', () => {
        const opts = extend({
            attachResetToRequest: false,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            },
            handleStoreError
        }, pick(spamWebmentionsBlock, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function emailPreviewBlock() {
    return getInstance('emailPreviewBlock', () => {
        const opts = extend({
            attachResetToRequest: false,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            },
            handleStoreError
        }, pick(spamEmailPreviewBlock, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function membersAuth() {
    return getInstance('membersAuth', () => {
        const opts = extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError
        }, pick(spamUserLogin, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function membersAuthEnumeration() {
    return getInstance('membersAuthEnumeration', () => {
        const opts = extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function otcVerificationEnumeration() {
    return getInstance('otcVerificationEnumeration', () => {
        const opts = extend({
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
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function otcVerification() {
    return getInstance('otcVerification', () => {
        const opts = extend({
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
        }, pick(spamOtcVerification, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function userLogin() {
    return getInstance('userLogin', () => {
        const opts = extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError
        }, pick(spamUserLogin, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function userReset() {
    return getInstance('userReset', () => {
        const opts = extend({
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
        }, pick(spamUserReset, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function userVerification() {
    return getInstance('userVerification', () => {
        const opts = extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        }, pick(spamUserVerification, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function sendVerificationCode() {
    return getInstance('sendVerificationCode', () => {
        const opts = extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function privateBlog() {
    return getInstance('privateBlog', () => {
        const opts = extend({
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
        }, pick(spamPrivateBlock, spamConfigKeys));

        return createBrute(getDbStore(), opts);
    });
}

function contentApiKey() {
    return getInstance('contentApiKey', () => {
        if (!memoryStore) {
            const ExpressBrute = require('express-brute');
            memoryStore = new ExpressBrute.MemoryStore();
        }

        const opts = extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                return next(err);
            },
            handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys));

        return createBrute(memoryStore, opts);
    });
}

/**
 * Resets internal caches and reloads spam configuration.
 */
function reset() {
    // Clear cached instances and stores
    Object.keys(instanceCache).forEach(key => delete instanceCache[key]);
    dbStore = undefined;
    memoryStore = undefined;

    // Reload configuration
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
    reset
};