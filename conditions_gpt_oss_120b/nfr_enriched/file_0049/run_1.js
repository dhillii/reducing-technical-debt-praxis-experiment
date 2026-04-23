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
 * Handles errors from the underlying store and forwards them as internal server errors.
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
 * Lazily creates and returns a shared Knex-backed store for ExpressBrute.
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
 * Lazily creates and returns an in‑memory store for rate‑limiting.
 */
const getMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Factory that creates an ExpressBrute instance with common configuration.
 *
 * @param {Object} options
 * @param {Object} options.cache - Store (Knex or memory) used by ExpressBrute.
 * @param {boolean} options.attachReset - Whether to attach reset to request.
 * @param {Object} options.config - Spam configuration object.
 * @param {Function} options.failCallback - Callback invoked on rate limit breach.
 * @returns {Object} ExpressBrute instance.
 */
const createBruteInstance = ({cache, attachReset, config, failCallback}) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(cache, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

/* Global IP block */
const globalBlock = () => {
    if (!globalBlockInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 3600
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        };
        globalBlockInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamGlobalBlock,
            failCallback: fail
        });
    }
    return globalBlockInstance;
};

/* Global reset block */
const globalReset = () => {
    if (!globalResetInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 3600
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        };
        globalResetInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamGlobalReset,
            failCallback: fail
        });
    }
    return globalResetInstance;
};

/* Webmentions block */
const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        const fail = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        };
        webmentionsBlockInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamWebmentionsBlock,
            failCallback: fail
        });
    }
    return webmentionsBlockInstance;
};

/* Email preview block */
const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        const fail = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        };
        emailPreviewBlockInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamEmailPreviewBlock,
            failCallback: fail
        });
    }
    return emailPreviewBlockInstance;
};

/* Member login (per‑IP) */
const membersAuth = () => {
    if (!membersAuthInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        membersAuthInstance = createBruteInstance({
            cache: getStore(),
            attachReset: true,
            config: spamUserLogin,
            failCallback: fail
        });
    }
    return membersAuthInstance;
};

/* Member enumeration (higher limits) */
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        membersAuthEnumerationInstance = createBruteInstance({
            cache: getStore(),
            attachReset: true,
            config: spamMemberLogin,
            failCallback: fail
        });
    }
    return membersAuthEnumerationInstance;
};

/* OTC verification enumeration */
const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        };
        otcVerificationEnumerationInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamOtcVerificationEnumeration,
            failCallback: fail
        });
    }
    return otcVerificationEnumerationInstance;
};

/* OTC verification per code */
const otcVerification = () => {
    if (!otcVerificationInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        };
        otcVerificationInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamOtcVerification,
            failCallback: fail
        });
    }
    return otcVerificationInstance;
};

/* User login (user+IP) */
const userLogin = () => {
    if (!userLoginInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
        userLoginInstance = createBruteInstance({
            cache: getStore(),
            attachReset: true,
            config: spamUserLogin,
            failCallback: fail
        });
    }
    return userLoginInstance;
};

/* User password reset */
const userReset = () => {
    if (!userResetInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 3600
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        };
        userResetInstance = createBruteInstance({
            cache: getStore(),
            attachReset: true,
            config: spamUserReset,
            failCallback: fail
        });
    }
    return userResetInstance;
};

/* User verification (generic) */
const userVerification = () => {
    if (!userVerificationInstance) {
        const fail = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        };
        userVerificationInstance = createBruteInstance({
            cache: getStore(),
            attachReset: true,
            config: spamUserVerification,
            failCallback: fail
        });
    }
    return userVerificationInstance;
};

/* Send verification code */
const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        const fail = (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        };
        sendVerificationCodeInstance = createBruteInstance({
            cache: getStore(),
            attachReset: true,
            config: spamSendVerificationCode,
            failCallback: fail
        });
    }
    return sendVerificationCodeInstance;
};

/* Private blog protection */
const privateBlog = () => {
    if (!privateBlogInstance) {
        const fail = (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamPrivateBlock.lifetime || 3600
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));
            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        };
        privateBlogInstance = createBruteInstance({
            cache: getStore(),
            attachReset: false,
            config: spamPrivateBlock,
            failCallback: fail
        });
    }
    return privateBlogInstance;
};

/* Content API key protection (in‑memory) */
const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        const fail = (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        };
        contentApiKeyInstance = createBruteInstance({
            cache: getMemoryStore(),
            attachReset: true,
            config: spamContentApiKey,
            failCallback: fail
        });
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
        webmentionsBlockInstance = undefined;
        emailPreviewBlockInstance = undefined;

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