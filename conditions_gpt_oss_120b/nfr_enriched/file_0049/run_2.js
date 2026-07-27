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

/**
 * Centralised error handling for Brute store operations.
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
 * Lazily creates a Knex-backed Brute store (shared across all DB‑backed instances).
 */
let knexStore;
const getKnexStore = () => {
    if (knexStore) {
        return knexStore;
    }
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    knexStore = new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
    return knexStore;
};

/**
 * Retrieves or creates an ExpressBrute instance.
 *
 * @param {string} key Unique identifier for caching the instance.
 * @param {object} spamConfig Spam configuration for this instance.
 * @param {function} failCallback Function invoked on rate‑limit breach.
 * @param {boolean} attachReset Whether to attach reset to request.
 * @param {boolean} useMemoryStore Whether to use an in‑memory store instead of Knex.
 * @returns {object} ExpressBrute instance.
 */
const instances = {};
const getOrCreateInstance = (key, spamConfig, failCallback, attachReset = false, useMemoryStore = false) => {
    if (instances[key]) {
        return instances[key];
    }

    const ExpressBrute = require('express-brute');
    const store = useMemoryStore ? new ExpressBrute.MemoryStore() : getKnexStore();

    instances[key] = new ExpressBrute(store, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));

    return instances[key];
};

/* ---------- Exported factory functions ---------- */

/**
 * Global block for IP‑based rate limiting.
 */
const globalBlock = () => getOrCreateInstance(
    'globalBlock',
    spam.global_block || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: (spam.global_block?.freeRetries ?? 5) + 1,
                rfp: spam.global_block?.lifetime ?? 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    },
    false
);

/**
 * Global reset endpoint rate limiting.
 */
const globalReset = () => getOrCreateInstance(
    'globalReset',
    spam.global_reset || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: (spam.global_reset?.freeRetries ?? 5) + 1,
                rfp: spam.global_reset?.lifetime ?? 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    },
    false
);

/**
 * Rate limiting for webmentions.
 */
const webmentionsBlock = () => getOrCreateInstance(
    'webmentionsBlock',
    spam.webmentions_block || {},
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    },
    false
);

/**
 * Rate limiting for email preview requests.
 */
const emailPreviewBlock = () => getOrCreateInstance(
    'emailPreviewBlock',
    spam.email_preview_block || {},
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    },
    false
);

/**
 * Member authentication (sign‑in) rate limiting.
 */
const membersAuth = () => getOrCreateInstance(
    'membersAuth',
    spam.user_login || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    true
);

/**
 * Member authentication enumeration (different email) rate limiting.
 */
const membersAuthEnumeration = () => getOrCreateInstance(
    'membersAuthEnumeration',
    spam.member_login || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    true
);

/**
 * OTC verification enumeration (multiple codes) rate limiting.
 */
const otcVerificationEnumeration = () => getOrCreateInstance(
    'otcVerificationEnumeration',
    spam.otc_verification_enumeration || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    },
    false
);

/**
 * OTC verification (single code) rate limiting.
 */
const otcVerification = () => getOrCreateInstance(
    'otcVerification',
    spam.otc_verification || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    },
    false
);

/**
 * User login (user+IP) rate limiting.
 */
const userLogin = () => getOrCreateInstance(
    'userLogin',
    spam.user_login || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    true
);

/**
 * User password reset rate limiting.
 */
const userReset = () => getOrCreateInstance(
    'userReset',
    spam.user_reset || {},
    (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: (spam.user_reset?.freeRetries ?? 5) + 1,
                rfp: spam.user_reset?.lifetime ?? 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    },
    true
);

/**
 * User verification (generic) rate limiting.
 */
const userVerification = () => getOrCreateInstance(
    'userVerification',
    spam.user_verification || {},
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    true
);

/**
 * Send verification code rate limiting.
 */
const sendVerificationCode = () => getOrCreateInstance(
    'sendVerificationCode',
    spam.send_verification_code || {},
    (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    true
);

/**
 * Private blog sign‑in rate limiting.
 */
const privateBlog = () => getOrCreateInstance(
    'privateBlog',
    spam.private_block || {},
    (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: (spam.private_block?.freeRetries ?? 5) + 1,
                rateSigninPeriod: spam.private_block?.lifetime ?? 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    },
    false
);

/**
 * Content API key rate limiting (in‑memory store).
 */
const contentApiKey = () => getOrCreateInstance(
    'contentApiKey',
    spam.content_api_key || {},
    (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });
        logging.error(err);
        return next(err);
    },
    true,
    true
);

/**
 * Reset all cached instances and reload configuration.
 */
const reset = () => {
    Object.keys(instances).forEach(key => delete instances[key]);
    knexStore = undefined;

    spam = config.get('spam') || {};
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
    reset
};