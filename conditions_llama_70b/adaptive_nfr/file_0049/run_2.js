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
 * Creates a new ExpressBrute instance with a BruteKnex store.
 * @param {Object} options - The options for the ExpressBrute instance.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteWithBruteKnex = (options) => {
    const store = createBruteKnexStore();
    return createExpressBruteInstance(store, options);
};

/**
 * Creates a new ExpressBrute instance with a MemoryStore.
 * @param {Object} options - The options for the ExpressBrute instance.
 * @returns {ExpressBrute} The new ExpressBrute instance.
 */
const createExpressBruteWithMemoryStore = (options) => {
    const memoryStore = new (require('express-brute')).MemoryStore();
    return createExpressBruteInstance(memoryStore, options);
};

/**
 * Creates a fail callback function for an ExpressBrute instance.
 * @param {string} message - The message to display.
 * @param {string} context - The context of the error.
 * @param {string} help - The help message.
 * @returns {Function} The fail callback function.
 */
const createFailCallback = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message,
            context: context,
            help: help
        }));
    };
};

/**
 * Creates a fail callback function for an ExpressBrute instance with a nextValidRequestDate.
 * @param {string} message - The message to display.
 * @param {string} context - The context of the error.
 * @param {string} help - The help message.
 * @returns {Function} The fail callback function.
 */
const createFailCallbackWithNextValidRequestDate = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: context,
            help: help
        }));
    };
};

/**
 * Gets the global block instance.
 * @returns {ExpressBrute} The global block instance.
 */
const getGlobalBlockInstance = () => {
    if (!globalBlockInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                tpl(messages.tooManyAttempts)
            ),
            handleStoreError: handleStoreError
        }, pick(spamGlobalBlock, spamConfigKeys));
        globalBlockInstance = createExpressBruteWithBruteKnex(options);
    }
    return globalBlockInstance;
};

/**
 * Gets the global reset instance.
 * @returns {ExpressBrute} The global reset instance.
 */
const getGlobalResetInstance = () => {
    if (!globalResetInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                tpl(messages.forgottenPasswordIp.context)
            ),
            handleStoreError: handleStoreError
        }, pick(spamGlobalReset, spamConfigKeys));
        globalResetInstance = createExpressBruteWithBruteKnex(options);
    }
    return globalResetInstance;
};

/**
 * Gets the webmentions block instance.
 * @returns {ExpressBrute} The webmentions block instance.
 */
const getWebmentionsBlockInstance = () => {
    if (!webmentionsBlockInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(
                messages.webmentionsBlock,
                '',
                ''
            ),
            handleStoreError: handleStoreError
        }, pick(spamWebmentionsBlock, spamConfigKeys));
        webmentionsBlockInstance = createExpressBruteWithBruteKnex(options);
    }
    return webmentionsBlockInstance;
};

/**
 * Gets the email preview block instance.
 * @returns {ExpressBrute} The email preview block instance.
 */
const getEmailPreviewBlockInstance = () => {
    if (!emailPreviewBlockInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(
                messages.emailPreviewBlock,
                '',
                ''
            ),
            handleStoreError: handleStoreError
        }, pick(spamEmailPreviewBlock, spamConfigKeys));
        emailPreviewBlockInstance = createExpressBruteWithBruteKnex(options);
    }
    return emailPreviewBlockInstance;
};

/**
 * Gets the members auth instance.
 * @returns {ExpressBrute} The members auth instance.
 */
const getMembersAuthInstance = () => {
    if (!membersAuthInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many sign-in attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys));
        membersAuthInstance = createExpressBruteWithBruteKnex(options);
    }
    return membersAuthInstance;
};

/**
 * Gets the members auth enumeration instance.
 * @returns {ExpressBrute} The members auth enumeration instance.
 */
const getMembersAuthEnumerationInstance = () => {
    if (!membersAuthEnumerationInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many different sign-in attempts, try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            handleStoreError: handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys));
        membersAuthEnumerationInstance = createExpressBruteWithBruteKnex(options);
    }
    return membersAuthEnumerationInstance;
};

/**
 * Gets the otc verification enumeration instance.
 * @returns {ExpressBrute} The otc verification enumeration instance.
 */
const getOtcVerificationEnumerationInstance = () => {
    if (!otcVerificationEnumerationInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many verification attempts across multiple codes, try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys));
        otcVerificationEnumerationInstance = createExpressBruteWithBruteKnex(options);
    }
    return otcVerificationEnumerationInstance;
};

/**
 * Gets the otc verification instance.
 * @returns {ExpressBrute} The otc verification instance.
 */
const getOtcVerificationInstance = () => {
    if (!otcVerificationInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many attempts for this verification code, try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerification, spamConfigKeys));
        otcVerificationInstance = createExpressBruteWithBruteKnex(options);
    }
    return otcVerificationInstance;
};

/**
 * Gets the user login instance.
 * @returns {ExpressBrute} The user login instance.
 */
const getUserLoginInstance = () => {
    if (!userLoginInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many login attempts. Please wait ${moment().fromNow(true)} before trying again, or reset your password.`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys));
        userLoginInstance = createExpressBruteWithBruteKnex(options);
    }
    return userLoginInstance;
};

/**
 * Gets the send verification code instance.
 * @returns {ExpressBrute} The send verification code instance.
 */
const getSendVerificationCodeInstance = () => {
    if (!sendVerificationCodeInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(
                tpl(messages.tooManyAttempts),
                '',
                ''
            ),
            handleStoreError: handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys));
        sendVerificationCodeInstance = createExpressBruteWithBruteKnex(options);
    }
    return sendVerificationCodeInstance;
};

/**
 * Gets the user verification instance.
 * @returns {ExpressBrute} The user verification instance.
 */
const getUserVerificationInstance = () => {
    if (!userVerificationInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(
                tpl(messages.tooManyAttempts),
                '',
                ''
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserVerification, spamConfigKeys));
        userVerificationInstance = createExpressBruteWithBruteKnex(options);
    }
    return userVerificationInstance;
};

/**
 * Gets the user reset instance.
 * @returns {ExpressBrute} The user reset instance.
 */
const getUserResetInstance = () => {
    if (!userResetInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many password reset attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                tpl(messages.forgottenPasswordEmail.context)
            ),
            handleStoreError: handleStoreError
        }, pick(spamUserReset, spamConfigKeys));
        userResetInstance = createExpressBruteWithBruteKnex(options);
    }
    return userResetInstance;
};

/**
 * Gets the private blog instance.
 * @returns {ExpressBrute} The private blog instance.
 */
const getPrivateBlogInstance = () => {
    if (!privateBlogInstance) {
        const options = extend({
            attachResetToRequest: false,
            failCallback: createFailCallbackWithNextValidRequestDate(
                `Too many private sign-in attempts try again in ${moment().fromNow(true)}`,
                tpl(messages.tooManySigninAttempts.error,
                    {
                        rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                    }),
                tpl(messages.tooManySigninAttempts.context)
            ),
            handleStoreError: handleStoreError
        }, pick(spamPrivateBlock, spamConfigKeys));
        privateBlogInstance = createExpressBruteWithBruteKnex(options);
    }
    return privateBlogInstance;
};

/**
 * Gets the content API key instance.
 * @returns {ExpressBrute} The content API key instance.
 */
const getContentApiKeyInstance = () => {
    if (!contentApiKeyInstance) {
        const options = extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(
                tpl(messages.tooManyAttempts),
                '',
                ''
            ),
            handleStoreError: handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys));
        contentApiKeyInstance = createExpressBruteWithMemoryStore(options);
    }
    return contentApiKeyInstance;
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