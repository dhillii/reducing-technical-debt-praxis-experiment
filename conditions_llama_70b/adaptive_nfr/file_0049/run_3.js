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

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

/**
 * Handles store error by logging it and returning a custom error.
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
 * @param {Object} store - The store to use.
 * @param {Object} options - The options for the ExpressBrute instance.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

/**
 * Creates a new BruteKnex instance with the given tablename and knex.
 * @param {string} tablename - The tablename to use.
 * @param {Object} knex - The knex instance to use.
 * @returns {BruteKnex} The new BruteKnex instance.
 */
const createBruteKnexInstance = (tablename, knex) => {
    return new (require('brute-knex'))({
        tablename: tablename,
        createTable: false,
        knex: knex
    });
};

/**
 * Creates a new MemoryStore instance.
 * @returns {MemoryStore} The new MemoryStore instance.
 */
const createMemoryStoreInstance = () => {
    return new (require('express-brute')).MemoryStore();
};

/**
 * Gets the knex instance from the database.
 * @returns {Object} The knex instance.
 */
const getKnexInstance = () => {
    return require('../../../../data/db').knex;
};

/**
 * Creates a new ExpressBrute instance for the global block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createGlobalBlockInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamGlobalBlock, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the global reset.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createGlobalResetInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamGlobalReset, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the webmentions block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createWebmentionsBlockInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamWebmentionsBlock, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the email preview block.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createEmailPreviewBlockInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamEmailPreviewBlock, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the members auth.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createMembersAuthInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the members auth enumeration.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createMembersAuthEnumerationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamMemberLogin, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the otc verification enumeration.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createOtcVerificationEnumerationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamOtcVerificationEnumeration, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the otc verification.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createOtcVerificationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamOtcVerification, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the user login.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createUserLoginInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the user reset.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createUserResetInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserReset, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the user verification.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createUserVerificationInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserVerification, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the send verification code.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createSendVerificationCodeInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamSendVerificationCode, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the private blog.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createPrivateBlogInstance = () => {
    store = store || createBruteKnexInstance('brute', getKnexInstance());

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
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
        },
        handleStoreError: handleStoreError
    }, pick(spamPrivateBlock, spamConfigKeys)));
};

/**
 * Creates a new ExpressBrute instance for the content api key.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createContentApiKeyInstance = () => {
    memoryStore = memoryStore || createMemoryStoreInstance();

    return createExpressBruteInstance(memoryStore, extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys)));
};

let globalBlockInstance;
let globalResetInstance;
let webmentionsBlockInstance;
let emailPreviewBlockInstance;
let membersAuthInstance;
let membersAuthEnumerationInstance;
let otcVerificationEnumerationInstance;
let otcVerificationInstance;
let userLoginInstance;
let userResetInstance;
let sendVerificationCodeInstance;
let userVerificationInstance;
let contentApiKeyInstance;
let privateBlogInstance;

/**
 * Gets the global block instance.
 * @returns {ExpressBrute} The global block instance.
 */
const getGlobalBlockInstance = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createGlobalBlockInstance();
    }

    return globalBlockInstance;
};

/**
 * Gets the global reset instance.
 * @returns {ExpressBrute} The global reset instance.
 */
const getGlobalResetInstance = () => {
    if (!globalResetInstance) {
        globalResetInstance = createGlobalResetInstance();
    }

    return globalResetInstance;
};

/**
 * Gets the webmentions block instance.
 * @returns {ExpressBrute} The webmentions block instance.
 */
const getWebmentionsBlockInstance = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createWebmentionsBlockInstance();
    }

    return webmentionsBlockInstance;
};

/**
 * Gets the email preview block instance.
 * @returns {ExpressBrute} The email preview block instance.
 */
const getEmailPreviewBlockInstance = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createEmailPreviewBlockInstance();
    }

    return emailPreviewBlockInstance;
};

/**
 * Gets the members auth instance.
 * @returns {ExpressBrute} The members auth instance.
 */
const getMembersAuthInstance = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createMembersAuthInstance();
    }

    return membersAuthInstance;
};

/**
 * Gets the members auth enumeration instance.
 * @returns {ExpressBrute} The members auth enumeration instance.
 */
const getMembersAuthEnumerationInstance = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createMembersAuthEnumerationInstance();
    }

    return membersAuthEnumerationInstance;
};

/**
 * Gets the otc verification enumeration instance.
 * @returns {ExpressBrute} The otc verification enumeration instance.
 */
const getOtcVerificationEnumerationInstance = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createOtcVerificationEnumerationInstance();
    }

    return otcVerificationEnumerationInstance;
};

/**
 * Gets the otc verification instance.
 * @returns {ExpressBrute} The otc verification instance.
 */
const getOtcVerificationInstance = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createOtcVerificationInstance();
    }

    return otcVerificationInstance;
};

/**
 * Gets the user login instance.
 * @returns {ExpressBrute} The user login instance.
 */
const getUserLoginInstance = () => {
    if (!userLoginInstance) {
        userLoginInstance = createUserLoginInstance();
    }

    return userLoginInstance;
};

/**
 * Gets the user reset instance.
 * @returns {ExpressBrute} The user reset instance.
 */
const getUserResetInstance = () => {
    if (!userResetInstance) {
        userResetInstance = createUserResetInstance();
    }

    return userResetInstance;
};

/**
 * Gets the send verification code instance.
 * @returns {ExpressBrute} The send verification code instance.
 */
const getSendVerificationCodeInstance = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createSendVerificationCodeInstance();
    }

    return sendVerificationCodeInstance;
};

/**
 * Gets the user verification instance.
 * @returns {ExpressBrute} The user verification instance.
 */
const getUserVerificationInstance = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createUserVerificationInstance();
    }

    return userVerificationInstance;
};

/**
 * Gets the content api key instance.
 * @returns {ExpressBrute} The content api key instance.
 */
const getContentApiKeyInstance = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createContentApiKeyInstance();
    }

    return contentApiKeyInstance;
};

/**
 * Gets the private blog instance.
 * @returns {ExpressBrute} The private blog instance.
 */
const getPrivateBlogInstance = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createPrivateBlogInstance();
    }

    return privateBlogInstance;
};

module.exports = {
    globalBlock: getGlobalBlockInstance,
    globalReset: getGlobalResetInstance,
    userLogin: getUserLoginInstance,
    sendVerificationCode: getSendVerificationCodeInstance,
    userVerification: getUserVerificationInstance,
    membersAuth: getMembersAuthInstance,
    membersAuthEnumeration: getMembersAuthEnumerationInstance,
    otcVerification: getOtcVerificationInstance,
    otcVerificationEnumeration: getOtcVerificationEnumerationInstance,
    userReset: getUserResetInstance,
    privateBlog: getPrivateBlogInstance,
    contentApiKey: getContentApiKeyInstance,
    webmentionsBlock: getWebmentionsBlockInstance,
    emailPreviewBlock: getEmailPreviewBlockInstance,
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