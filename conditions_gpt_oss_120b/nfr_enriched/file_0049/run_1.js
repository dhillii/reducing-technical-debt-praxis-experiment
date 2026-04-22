```javascript
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

/* ---------- Shared utilities ---------- */

/**
 * Handles errors from the store and forwards them to Express.
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
 * Lazily creates a shared Knex store for ExpressBrute.
 */
let sharedStore;
const getStore = () => {
    if (sharedStore) {
        return sharedStore;
    }
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');
    sharedStore = new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
    return sharedStore;
};

/**
 * Creates (or returns cached) ExpressBrute instance.
 *
 * @param {Object} cacheRef - Object holding the cached instance reference.
 * @param {string} cacheKey - Property name on cacheRef.
 * @param {Object} spamConfig - Spam configuration for this endpoint.
 * @param {Function} failCallbackFactory - Factory that returns a failCallback for ExpressBrute.
 * @returns {ExpressBrute} Configured ExpressBrute instance.
 */
const getBruteInstance = (cacheRef, cacheKey, spamConfig, failCallbackFactory) => {
    if (cacheRef[cacheKey]) {
        return cacheRef[cacheKey];
    }

    const ExpressBrute = require('express-brute');

    cacheRef[cacheKey] = new ExpressBrute(getStore(), extend({
        attachResetToRequest: false,
        failCallback: failCallbackFactory(),
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));

    return cacheRef[cacheKey];
};

/**
 * Creates (or returns cached) ExpressBrute instance that uses an in‑memory store.
 *
 * @param {Object} cacheRef - Object holding the cached instance reference.
 * @param {string} cacheKey - Property name on cacheRef.
 * @param {Object} spamConfig - Spam configuration for this endpoint.
 * @param {Function} failCallbackFactory - Factory that returns a failCallback for ExpressBrute.
 * @returns {ExpressBrute} Configured ExpressBrute instance.
 */
const getMemoryBruteInstance = (cacheRef, cacheKey, spamConfig, failCallbackFactory) => {
    if (cacheRef[cacheKey]) {
        return cacheRef[cacheKey];
    }

    const ExpressBrute = require('express-brute');
    const memoryStore = new ExpressBrute.MemoryStore();

    cacheRef[cacheKey] = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: true,
        failCallback: failCallbackFactory(),
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));

    return cacheRef[cacheKey];
};

/* ---------- Endpoint factories ---------- */

const cache = {};

const globalBlock = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spam.global_block.freeRetries + 1 || 5,
                rfp: spam.global_block.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    };
    return getBruteInstance(cache, 'globalBlock', spam.global_block || {}, failFactory);
};

const globalReset = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spam.global_reset.freeRetries + 1 || 5,
                rfp: spam.global_reset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };
    return getBruteInstance(cache, 'globalReset', spam.global_reset || {}, failFactory);
};

const webmentionsBlock = () => {
    const failFactory = () => (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };
    return getBruteInstance(cache, 'webmentionsBlock', spam.webmentions_block || {}, failFactory);
};

const emailPreviewBlock = () => {
    const failFactory = () => (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };
    return getBruteInstance(cache, 'emailPreviewBlock', spam.email_preview_block || {}, failFactory);
};

const membersAuth = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    // membersAuth uses attachResetToRequest = true
    const instance = cache.membersAuth || (() => {
        const ExpressBrute = require('express-brute');
        cache.membersAuth = new ExpressBrute(getStore(), extend({
            attachResetToRequest: true,
            failCallback: failFactory(),
            handleStoreError
        }, pick(spam.user_login || {}, spamConfigKeys)));
        return cache.membersAuth;
    })();
    return instance;
};

const membersAuthEnumeration = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    const instance = cache.membersAuthEnumeration || (() => {
        const ExpressBrute = require('express-brute');
        cache.membersAuthEnumeration = new ExpressBrute(getStore(), extend({
            attachResetToRequest: true,
            failCallback: failFactory(),
            handleStoreError
        }, pick(spam.member_login || {}, spamConfigKeys)));
        return cache.membersAuthEnumeration;
    })();
    return instance;
};

const otcVerificationEnumeration = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
    return getBruteInstance(cache, 'otcVerificationEnumeration', spam.otc_verification_enumeration || {}, failFactory);
};

const otcVerification = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
    return getBruteInstance(cache, 'otcVerification', spam.otc_verification || {}, failFactory);
};

const userLogin = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
    return getBruteInstance(cache, 'userLogin', spam.user_login || {}, failFactory);
};

const userReset = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spam.user_reset.freeRetries + 1 || 5,
                rfp: spam.user_reset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
    return getBruteInstance(cache, 'userReset', spam.user_reset || {}, failFactory);
};

const userVerification = () => {
    const failFactory = () => (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
    return getBruteInstance(cache, 'userVerification', spam.user_verification || {}, failFactory);
};

const sendVerificationCode = () => {
    const failFactory = () => (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
    return getBruteInstance(cache, 'sendVerificationCode', spam.send_verification_code || {}, failFactory);
};

const privateBlog = () => {
    const failFactory = () => (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spam.private_block.freeRetries + 1 || 5,
                rateSigninPeriod: spam.private_block.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
    return getBruteInstance(cache, 'privateBlog', spam.private_block || {}, failFactory);
};

const contentApiKey = () => {
    const failFactory = () => (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });
        logging.error(err);
        return next(err);
    };
    return getMemoryBruteInstance(cache, 'contentApiKey', spam.content_api_key || {}, failFactory);
};

/* ---------- Reset helper ---------- */

const reset = () => {
    // Clear caches
    Object.keys(cache).forEach(key => {
        cache[key] = undefined;
    });
    sharedStore = undefined;

    // Reload config
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
```