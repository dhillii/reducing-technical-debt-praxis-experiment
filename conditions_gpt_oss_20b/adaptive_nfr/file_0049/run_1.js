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
 * Handles errors from the store and forwards them to the next middleware.
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
 * Lazily creates and returns the shared BruteKnex store.
 * @returns {Object}
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
 * Lazily creates and returns the shared ExpressBrute instance.
 * @param {Object} configObj - Spam configuration for this instance.
 * @param {Object} options - Options to pass to ExpressBrute.
 * @returns {Object}
 */
const createBruteInstance = (configObj, options) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(getStore(), extend(options, pick(configObj, spamConfigKeys)));
};

/**
 * Lazily creates and returns the shared ExpressBrute MemoryStore instance.
 * @returns {Object}
 */
const getMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Creates a fail callback that sends a TooManyRequestsError with a formatted message.
 * @param {string} messageTemplate
 * @param {Object} contextData
 * @param {string} helpMessage
 * @param {string} [code]
 * @returns {Function}
 */
const createFailCallback = (messageTemplate, contextData, helpMessage, code) => {
    return (req, res, next, nextValidRequestDate) => {
        const err = new errors.TooManyRequestsError({
            message: messageTemplate.replace('{nextValidRequestDate}', moment(nextValidRequestDate).fromNow(true)),
            context: tpl(messageTemplate, contextData),
            help: tpl(helpMessage),
            code
        });
        next(err);
    };
};

/**
 * Global block for IP-based rate limiting.
 * @returns {Object}
 */
const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteInstance(spamGlobalBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamGlobalBlock.freeRetries + 1 || 5,
                        rfp: spamGlobalBlock.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        });
    }
    return globalBlockInstance;
};

/**
 * Global reset for IP-based rate limiting.
 * @returns {Object}
 */
const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createBruteInstance(spamGlobalReset, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamGlobalReset.freeRetries + 1 || 5,
                        rfp: spamGlobalReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            },
            handleStoreError
        });
    }
    return globalResetInstance;
};

/**
 * Webmentions block limiter.
 * @returns {Object}
 */
const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(spamWebmentionsBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            },
            handleStoreError
        });
    }
    return webmentionsBlockInstance;
};

/**
 * Email preview block limiter.
 * @returns {Object}
 */
const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(spamEmailPreviewBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            },
            handleStoreError
        });
    }
    return emailPreviewBlockInstance;
};

/**
 * Members authentication limiter.
 * @returns {Object}
 */
const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(spamUserLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError
        });
    }
    return membersAuthInstance;
};

/**
 * Members authentication enumeration limiter.
 * @returns {Object}
 */
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(spamMemberLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError
        });
    }
    return membersAuthEnumerationInstance;
};

/**
 * OTC verification enumeration limiter.
 * @returns {Object}
 */
const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(spamOtcVerificationEnumeration, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError
        });
    }
    return otcVerificationEnumerationInstance;
};

/**
 * OTC verification limiter.
 * @returns {Object}
 */
const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(spamOtcVerification, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError
        });
    }
    return otcVerificationInstance;
};

/**
 * User login limiter.
 * @returns {Object}
 */
const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = createBruteInstance(spamUserLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError
        });
    }
    return userLoginInstance;
};

/**
 * User reset limiter.
 * @returns {Object}
 */
const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createBruteInstance(spamUserReset, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: spamUserReset.freeRetries + 1 || 5,
                        rfp: spamUserReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            },
            handleStoreError
        });
    }
    return userResetInstance;
};

/**
 * User verification limiter.
 * @returns {Object}
 */
const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(spamUserVerification, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        });
    }
    return userVerificationInstance;
};

/**
 * Send verification code limiter.
 * @returns {Object}
 */
const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(spamSendVerificationCode, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError
        });
    }
    return sendVerificationCodeInstance;
};

/**
 * Private blog limiter.
 * @returns {Object}
 */
const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteInstance(spamPrivateBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));
                next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            },
            handleStoreError
        });
    }
    return privateBlogInstance;
};

/**
 * Content API key limiter.
 * @returns {Object}
 */
const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = new (require('express-brute'))(getMemoryStore(), extend({
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                next(err);
            },
            handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys)));
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