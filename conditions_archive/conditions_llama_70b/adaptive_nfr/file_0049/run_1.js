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
 * Handles store errors by logging the error and returning a custom error.
 * @param {Error} err - The error to handle.
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
 * Creates a new ExpressBrute instance with the given store and options.
 * @param {Object} store - The store to use for the ExpressBrute instance.
 * @param {Object} options - The options for the ExpressBrute instance.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

/**
 * Creates a new BruteKnex store instance.
 * @returns {BruteKnex} The new BruteKnex store instance.
 */
const createBruteKnexStore = () => {
    const db = require('../../../../data/db');
    return new (require('brute-knex'))({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

/**
 * Creates a new ExpressBrute MemoryStore instance.
 * @returns {ExpressBrute.MemoryStore} The new ExpressBrute MemoryStore instance.
 */
const createMemoryStore = () => {
    return new (require('express-brute')).MemoryStore();
};

/**
 * Gets the fail callback for a given error message and context.
 * @param {string} errorMessage - The error message to use.
 * @param {string} context - The context to use.
 * @returns {Function} The fail callback function.
 */
const getFailCallback = (errorMessage, context) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: errorMessage,
            context: context
        }));
    };
};

/**
 * Gets the options for a given spam configuration.
 * @param {Object} spamConfig - The spam configuration to use.
 * @returns {Object} The options for the ExpressBrute instance.
 */
const getOptions = (spamConfig) => {
    return extend({
        attachResetToRequest: false,
        failCallback: getFailCallback(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys));
};

/**
 * Creates a new ExpressBrute instance for global block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const globalBlock = () => {
    store = store || createBruteKnexStore();
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(store, extend(getOptions(spamGlobalBlock), {
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    }));
    return globalBlockInstance;
};

/**
 * Creates a new ExpressBrute instance for global reset.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const globalReset = () => {
    store = store || createBruteKnexStore();
    globalResetInstance = globalResetInstance || createExpressBruteInstance(store, extend(getOptions(spamGlobalReset), {
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    }));
    return globalResetInstance;
};

/**
 * Creates a new ExpressBrute instance for webmentions block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const webmentionsBlock = () => {
    store = store || createBruteKnexStore();
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(store, extend(getOptions(spamWebmentionsBlock), {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    }));
    return webmentionsBlockInstance;
};

/**
 * Creates a new ExpressBrute instance for email preview block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const emailPreviewBlock = () => {
    store = store || createBruteKnexStore();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(store, extend(getOptions(spamEmailPreviewBlock), {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    }));
    return emailPreviewBlockInstance;
};

/**
 * Creates a new ExpressBrute instance for members auth.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const membersAuth = () => {
    store = store || createBruteKnexStore();
    membersAuthInstance = membersAuthInstance || createExpressBruteInstance(store, extend(getOptions(spamUserLogin), {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    }));
    return membersAuthInstance;
};

/**
 * Creates a new ExpressBrute instance for members auth enumeration.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const membersAuthEnumeration = () => {
    store = store || createBruteKnexStore();
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createExpressBruteInstance(store, extend(getOptions(spamMemberLogin), {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    }));
    return membersAuthEnumerationInstance;
};

/**
 * Creates a new ExpressBrute instance for otc verification enumeration.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const otcVerificationEnumeration = () => {
    store = store || createBruteKnexStore();
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createExpressBruteInstance(store, extend(getOptions(spamOtcVerificationEnumeration), {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    }));
    return otcVerificationEnumerationInstance;
};

/**
 * Creates a new ExpressBrute instance for otc verification.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const otcVerification = () => {
    store = store || createBruteKnexStore();
    otcVerificationInstance = otcVerificationInstance || createExpressBruteInstance(store, extend(getOptions(spamOtcVerification), {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    }));
    return otcVerificationInstance;
};

/**
 * Creates a new ExpressBrute instance for user login.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const userLogin = () => {
    store = store || createBruteKnexStore();
    userLoginInstance = userLoginInstance || createExpressBruteInstance(store, extend(getOptions(spamUserLogin), {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    }));
    return userLoginInstance;
};

/**
 * Creates a new ExpressBrute instance for user reset.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const userReset = () => {
    store = store || createBruteKnexStore();
    userResetInstance = userResetInstance || createExpressBruteInstance(store, extend(getOptions(spamUserReset), {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    }));
    return userResetInstance;
};

/**
 * Creates a new ExpressBrute instance for user verification.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const userVerification = () => {
    store = store || createBruteKnexStore();
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(store, extend(getOptions(spamUserVerification), {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    }));
    return userVerificationInstance;
};

/**
 * Creates a new ExpressBrute instance for send verification code.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const sendVerificationCode = () => {
    store = store || createBruteKnexStore();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(store, extend(getOptions(spamSendVerificationCode), {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    }));
    return sendVerificationCodeInstance;
};

/**
 * Creates a new ExpressBrute instance for private blog.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const privateBlog = () => {
    store = store || createBruteKnexStore();
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(store, extend(getOptions(spamPrivateBlock), {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error,
                    {
                        rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                    }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        }
    }));
    return privateBlogInstance;
};

/**
 * Creates a new ExpressBrute instance for content api key.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const contentApiKey = () => {
    memoryStore = memoryStore || createMemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteInstance(memoryStore, extend(getOptions(spamContentApiKey), {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        }
    }));
    return contentApiKeyInstance;
};

module.exports = {
    globalBlock: globalBlock,
    globalReset: globalReset,
    userLogin: userLogin,
    sendVerificationCode: sendVerificationCode,
    userVerification: userVerification,
    membersAuth: membersAuth,
    membersAuthEnumeration: membersAuthEnumeration,
    otcVerification: otcVerification,
    otcVerificationEnumeration: otcVerificationEnumeration,
    userReset: userReset,
    privateBlog: privateBlog,
    contentApiKey: contentApiKey,
    webmentionsBlock: webmentionsBlock,
    emailPreviewBlock: emailPreviewBlock,
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
```