const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

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
 * Handle errors from the store.
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
 * Ensure the shared Brute store is initialized.
 */
const initStore = () => {
    if (!store) {
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
};

/**
 * Create a new ExpressBrute instance with common defaults.
 * @param {Object} storeInstance - The store to use (BruteKnex or MemoryStore).
 * @param {Object} configObj - Spam configuration for this instance.
 * @param {Object} customOptions - Custom options to override defaults.
 * @returns {ExpressBrute}
 */
const createBruteInstance = (storeInstance, configObj, customOptions) => {
    const defaultOptions = {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            const err = new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            });
            return next(err);
        },
        handleStoreError
    };
    const options = extend(defaultOptions, pick(configObj, spamConfigKeys), customOptions);
    return new ExpressBrute(storeInstance, options);
};

/**
 * Global block limiter.
 */
const globalBlock = () => {
    if (!globalBlockInstance) {
        initStore();
        globalBlockInstance = createBruteInstance(store, spamGlobalBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamGlobalBlock.freeRetries + 1 || 5,
                        rfp: spamGlobalBlock.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }
    return globalBlockInstance;
};

/**
 * Global reset limiter.
 */
const globalReset = () => {
    if (!globalResetInstance) {
        initStore();
        globalResetInstance = createBruteInstance(store, spamGlobalReset, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamGlobalReset.freeRetries + 1 || 5,
                        rfp: spamGlobalReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            }
        });
    }
    return globalResetInstance;
};

/**
 * Webmentions block limiter.
 */
const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        initStore();
        webmentionsBlockInstance = createBruteInstance(store, spamWebmentionsBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            }
        });
    }
    return webmentionsBlockInstance;
};

/**
 * Email preview block limiter.
 */
const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        initStore();
        emailPreviewBlockInstance = createBruteInstance(store, spamEmailPreviewBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            }
        });
    }
    return emailPreviewBlockInstance;
};

/**
 * Members authentication limiter.
 */
const membersAuth = () => {
    if (!membersAuthInstance) {
        initStore();
        membersAuthInstance = createBruteInstance(store, spamUserLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }
    return membersAuthInstance;
};

/**
 * Members authentication enumeration limiter.
 */
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        initStore();
        membersAuthEnumerationInstance = createBruteInstance(store, spamMemberLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }
    return membersAuthEnumerationInstance;
};

/**
 * OTC verification enumeration limiter.
 */
const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        initStore();
        otcVerificationEnumerationInstance = createBruteInstance(store, spamOtcVerificationEnumeration, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            }
        });
    }
    return otcVerificationEnumerationInstance;
};

/**
 * OTC verification limiter.
 */
const otcVerification = () => {
    if (!otcVerificationInstance) {
        initStore();
        otcVerificationInstance = createBruteInstance(store, spamOtcVerification, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            }
        });
    }
    return otcVerificationInstance;
};

/**
 * User login limiter.
 */
const userLogin = () => {
    if (!userLoginInstance) {
        initStore();
        userLoginInstance = createBruteInstance(store, spamUserLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }
    return userLoginInstance;
};

/**
 * User password reset limiter.
 */
const userReset = () => {
    if (!userResetInstance) {
        initStore();
        userResetInstance = createBruteInstance(store, spamUserReset, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: spamUserReset.freeRetries + 1 || 5,
                        rfp: spamUserReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            }
        });
    }
    return userResetInstance;
};

/**
 * User verification limiter.
 */
const userVerification = () => {
    if (!userVerificationInstance) {
        initStore();
        userVerificationInstance = createBruteInstance(store, spamUserVerification, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }
    return userVerificationInstance;
};

/**
 * Send verification code limiter.
 */
const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        initStore();
        sendVerificationCodeInstance = createBruteInstance(store, spamSendVerificationCode, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }
    return sendVerificationCodeInstance;
};

/**
 * Private blog limiter.
 */
const privateBlog = () => {
    if (!privateBlogInstance) {
        initStore();
        privateBlogInstance = createBruteInstance(store, spamPrivateBlock, {
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
            }
        });
    }
    return privateBlogInstance;
};

/**
 * Content API key limiter.
 */
const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        if (!memoryStore) {
            memoryStore = new ExpressBrute.MemoryStore();
        }
        contentApiKeyInstance = createBruteInstance(memoryStore, spamContentApiKey, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                return next(err);
            }
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