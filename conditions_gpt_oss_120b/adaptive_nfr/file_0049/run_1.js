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
 * Handles errors from the brute store.
 * @param {Error} err
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
 * Returns a shared BruteKnex store, creating it if necessary.
 * @param {Object} db Knex database instance
 * @returns {Object}
 */
function getStore(db) {
    if (!store) {
        const BruteKnex = require('brute-knex');
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
}

/**
 * Returns a shared in‑memory store for content API key rate limiting.
 * @returns {Object}
 */
function getMemoryStore() {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

/**
 * Creates a new ExpressBrute instance with the given configuration.
 * @param {Object} store
 * @param {Object} configObj Spam configuration object
 * @param {Function} failCallback
 * @returns {Object}
 */
function createBruteInstance(store, configObj, failCallback) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(configObj, spamConfigKeys)));
}

/**
 * Global block rate limiter.
 * @returns {Object}
 */
function globalBlock() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteInstance(store, spamGlobalBlock, (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        });
    }
    return globalBlockInstance;
}

/**
 * Global reset rate limiter.
 * @returns {Object}
 */
function globalReset() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!globalResetInstance) {
        globalResetInstance = createBruteInstance(store, spamGlobalReset, (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        });
    }
    return globalResetInstance;
}

/**
 * Webmentions block rate limiter.
 * @returns {Object}
 */
function webmentionsBlock() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(store, spamWebmentionsBlock, (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        });
    }
    return webmentionsBlockInstance;
}

/**
 * Email preview block rate limiter.
 * @returns {Object}
 */
function emailPreviewBlock() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(store, spamEmailPreviewBlock, (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        });
    }
    return emailPreviewBlockInstance;
}

/**
 * Members authentication rate limiter.
 * @returns {Object}
 */
function membersAuth() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!membersAuthInstance) {
        const ExpressBrute = require('express-brute');
        membersAuthInstance = new ExpressBrute(store, extend({
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
    }
    return membersAuthInstance;
}

/**
 * Members authentication enumeration rate limiter.
 * @returns {Object}
 */
function membersAuthEnumeration() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!membersAuthEnumerationInstance) {
        const ExpressBrute = require('express-brute');
        membersAuthEnumerationInstance = new ExpressBrute(store, extend({
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
    }
    return membersAuthEnumerationInstance;
}

/**
 * OTC verification enumeration rate limiter.
 * @returns {Object}
 */
function otcVerificationEnumeration() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!otcVerificationEnumerationInstance) {
        const ExpressBrute = require('express-brute');
        otcVerificationEnumerationInstance = new ExpressBrute(store, extend({
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
    }
    return otcVerificationEnumerationInstance;
}

/**
 * OTC verification rate limiter.
 * @returns {Object}
 */
function otcVerification() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!otcVerificationInstance) {
        const ExpressBrute = require('express-brute');
        otcVerificationInstance = new ExpressBrute(store, extend({
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
    }
    return otcVerificationInstance;
}

/**
 * User login rate limiter.
 * @returns {Object}
 */
function userLogin() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!userLoginInstance) {
        const ExpressBrute = require('express-brute');
        userLoginInstance = new ExpressBrute(store, extend({
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
    }
    return userLoginInstance;
}

/**
 * User password reset rate limiter.
 * @returns {Object}
 */
function userReset() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!userResetInstance) {
        const ExpressBrute = require('express-brute');
        userResetInstance = new ExpressBrute(store, extend({
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
    }
    return userResetInstance;
}

/**
 * User verification rate limiter.
 * @returns {Object}
 */
function userVerification() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!userVerificationInstance) {
        const ExpressBrute = require('express-brute');
        userVerificationInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        }, pick(spamUserVerification, spamConfigKeys)));
    }
    return userVerificationInstance;
}

/**
 * Send verification code rate limiter.
 * @returns {Object}
 */
function sendVerificationCode() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!sendVerificationCodeInstance) {
        const ExpressBrute = require('express-brute');
        sendVerificationCodeInstance = new ExpressBrute(store, extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys)));
    }
    return sendVerificationCodeInstance;
}

/**
 * Private blog rate limiter.
 * @returns {Object}
 */
function privateBlog() {
    const db = require('../../../../data/db');
    const store = getStore(db);
    if (!privateBlogInstance) {
        const ExpressBrute = require('express-brute');
        privateBlogInstance = new ExpressBrute(store, extend({
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
    }
    return privateBlogInstance;
}

/**
 * Content API key rate limiter.
 * @returns {Object}
 */
function contentApiKey() {
    const store = getMemoryStore();
    if (!contentApiKeyInstance) {
        const ExpressBrute = require('express-brute');
        contentApiKeyInstance = new ExpressBrute(store, extend({
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
    }
    return contentApiKeyInstance;
}

/**
 * Resets all stored instances and reloads spam configuration.
 */
function resetAll() {
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
    webmentionsBlockInstance = undefined;
    emailPreviewBlockInstance = undefined;
}

/**
 * Reloads spam configuration from the global config.
 */
function reloadSpamConfig() {
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
    spamWebmentionsBlock = spam.webmentions_block || {};
    spamEmailPreviewBlock = spam.email_preview_block || {};
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
    reset: () => {
        resetAll();
        reloadSpamConfig();
    }
};