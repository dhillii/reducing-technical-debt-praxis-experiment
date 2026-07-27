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

let store;
let memoryStore;
let instanceCache = {};

const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // see https://github.com/AdamPflug/express-brute/issues/45
    // express-brute does not always forward a callback
    // we are using reset as synchronous call, so we have to log the error if it occurs
    // there is no way to try/catch, because the reset operation happens asynchronous
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

/**
 * Lazily creates a Knex-backed store for express-brute.
 */
function getStore() {
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
}

/**
 * Lazily creates an in‑memory store for express‑brute.
 */
function getMemoryStore() {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

/**
 * Returns a cached ExpressBrute instance or creates a new one.
 *
 * @param {string} key Cache identifier.
 * @param {object} options Configuration for the instance.
 * @param {boolean} [options.useMemory] Use in‑memory store instead of Knex.
 * @param {object} options.spamConfig Spam‑related configuration.
 * @param {function} options.failCallback Callback invoked on rate‑limit breach.
 * @param {boolean} options.attachReset Whether to attach reset to request.
 * @returns {object} ExpressBrute instance.
 */
function getBruteInstance(key, {useMemory = false, spamConfig, failCallback, attachReset = false}) {
    if (!instanceCache[key]) {
        const ExpressBrute = require('express-brute');
        const storeObj = useMemory ? getMemoryStore() : getStore();

        const options = extend(
            {
                attachResetToRequest: attachReset,
                failCallback,
                handleStoreError
            },
            pick(spamConfig, spamConfigKeys)
        );

        instanceCache[key] = new ExpressBrute(storeObj, options);
    }
    return instanceCache[key];
}

// Global IP block for generic endpoints
function globalBlock() {
    const cfg = spam.global_block || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: cfg.freeRetries + 1 || 5,
                rfp: cfg.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    };
    return getBruteInstance('globalBlock', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// Global IP block for password‑reset endpoints
function globalReset() {
    const cfg = spam.global_reset || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: cfg.freeRetries + 1 || 5,
                rfp: cfg.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };
    return getBruteInstance('globalReset', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// Block excessive web‑mention attempts
function webmentionsBlock() {
    const cfg = spam.webmentions_block || {};
    const fail = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };
    return getBruteInstance('webmentionsBlock', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// Block excessive email‑preview attempts
function emailPreviewBlock() {
    const cfg = spam.email_preview_block || {};
    const fail = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };
    return getBruteInstance('emailPreviewBlock', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// Member sign‑in attempts (standard)
function membersAuth() {
    const cfg = spam.user_login || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    return getBruteInstance('membersAuth', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// Member sign‑in attempts across all emails (enumeration)
function membersAuthEnumeration() {
    const cfg = spam.member_login || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    return getBruteInstance('membersAuthEnumeration', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// OTC verification attempts across multiple codes
function otcVerificationEnumeration() {
    const cfg = spam.otc_verification_enumeration || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
    return getBruteInstance('otcVerificationEnumeration', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// OTC verification attempts for a single code
function otcVerification() {
    const cfg = spam.otc_verification || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
    return getBruteInstance('otcVerification', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// User‑specific login attempts
function userLogin() {
    const cfg = spam.user_login || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    return getBruteInstance('userLogin', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// Password‑reset attempts per email
function userReset() {
    const cfg = spam.user_reset || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: cfg.freeRetries + 1 || 5,
                rfp: cfg.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
    return getBruteInstance('userReset', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// Verification code request attempts
function userVerification() {
    const cfg = spam.user_verification || {};
    const fail = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
    return getBruteInstance('userVerification', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// Send verification code attempts
function sendVerificationCode() {
    const cfg = spam.send_verification_code || {};
    const fail = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
    return getBruteInstance('sendVerificationCode', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// Private blog login attempts
function privateBlog() {
    const cfg = spam.private_block || {};
    const fail = (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: cfg.freeRetries + 1 || 5,
                rateSigninPeriod: cfg.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
    return getBruteInstance('privateBlog', {
        spamConfig: cfg,
        failCallback: fail,
        attachReset: false
    });
}

// Content API key rate limiting (in‑memory)
function contentApiKey() {
    const cfg = spam.content_api_key || {};
    const fail = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });
        logging.error(err);
        return next(err);
    };
    return getBruteInstance('contentApiKey', {
        useMemory: true,
        spamConfig: cfg,
        failCallback: fail,
        attachReset: true
    });
}

// Reset all cached instances and reload configuration
function reset() {
    store = undefined;
    memoryStore = undefined;
    instanceCache = {};

    spam = config.get('spam') || {};
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