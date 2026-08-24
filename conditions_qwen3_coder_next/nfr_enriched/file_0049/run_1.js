const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

let spam = config.get('spam') || {};
let store;
let memoryStore;
let instances = {};

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

/**
 * Creates an ExpressBrute instance with shared configuration logic.
 * @param {string} instanceKey - Unique identifier for the instance.
 * @param {Object} configKeyObj - Configuration subset from spam config.
 * @param {Object} messageObj - Message template for error formatting.
 * @param {Object} opts - Optional extra options for ExpressBrute constructor.
 * @returns {ExpressBrute} Instance of ExpressBrute.
 */
function createRateLimiter(instanceKey, configKeyObj, messageObj, opts = {}) {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const configKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

    if (!instances[instanceKey]) {
        instances[instanceKey] = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(new errors.TooManyRequestsError(createErrorMessage(req, instanceKey, configKeyObj, messageObj, nextValidRequestDate)));
                },
                handleStoreError: handleStoreError
            }, pick(configKeyObj, configKeys), opts)
        );
    }

    return instances[instanceKey];
}

/**
 * Handles error from ExpressBrute store.
 */
function handleStoreError(err) {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
}

/**
 * Creates error message object for rate limiting.
 */
function createErrorMessage(req, instanceKey, configKeyObj, messageObj, nextValidRequestDate) {
    const baseMessage = messageObj.error || messages.tooManyAttempts;
    const context = messageObj.context || 'Rate limit exceeded';

    if (instanceKey === 'globalReset' || instanceKey === 'userReset' || instanceKey === 'forgottenPasswordEmail') {
        return {
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(baseMessage, {
                rfa: configKeyObj.freeRetries + 1 || 5,
                rfp: configKeyObj.lifetime || 60 * 60
            }),
            help: tpl(context)
        };
    }

    if (instanceKey === 'webmentionsBlock' || instanceKey === 'emailPreviewBlock') {
        return {
            message: baseMessage
        };
    }

    if (instanceKey === 'userLogin' || instanceKey === 'privateBlog' || instanceKey === 'membersAuth' || instanceKey === 'membersAuthEnumeration') {
        return {
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        };
    }

    if (instanceKey === 'otcVerification' || instanceKey === 'otcVerificationEnumeration') {
        return {
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: instanceKey === 'otcVerification' ? 'OTC_CODE_ATTEMPTS_RATE_LIMITED' : 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        };
    }

    return {
        message: tpl(baseMessage),
        context: tpl(context)
    };
}

/**
 * Creates in-memory ExpressBrute instance for content API key.
 */
function createMemoryStoreRateLimiter(instanceKey, configKeyObj, messageObj) {
    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    if (!instances[instanceKey]) {
        instances[instanceKey] = new ExpressBrute(memoryStore,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next) {
                    const err = new errors.TooManyRequestsError({
                        message: tpl(messageObj || messages.tooManyAttempts)
                    });
                    logging.error(err);
                    return next(err);
                },
                handleStoreError: handleStoreError
            }, pick(configKeyObj, ['freeRetries', 'minWait', 'maxWait', 'lifetime']))
        );
    }

    return instances[instanceKey];
}

// --- Public API Functions ---

const globalBlock = () => {
    return createRateLimiter('globalBlock', spam.global_block || {}, messages.forgottenPasswordIp);
};

const globalReset = () => {
    return createRateLimiter('globalReset', spam.global_reset || {}, messages.forgottenPasswordIp);
};

const userLogin = () => {
    return createRateLimiter('userLogin', spam.user_login || {}, messages.tooManySigninAttempts, {attachResetToRequest: true});
};

const userReset = () => {
    return createRateLimiter('userReset', spam.user_reset || {}, messages.forgottenPasswordEmail, {attachResetToRequest: true});
};

const userVerification = () => {
    return createRateLimiter('userVerification', spam.user_verification || {}, messages.tooManyAttempts);
};

const sendVerificationCode = () => {
    return createRateLimiter('sendVerificationCode', spam.send_verification_code || {}, messages.tooManyAttempts, {attachResetToRequest: true});
};

const membersAuth = () => {
    return createRateLimiter('membersAuth', spam.user_login || {}, messages.tooManySigninAttempts, {attachResetToRequest: true});
};

const membersAuthEnumeration = () => {
    return createRateLimiter('membersAuthEnumeration', spam.member_login || {}, messages.tooManySigninAttempts, {attachResetToRequest: true});
};

const otcVerification = () => {
    return createRateLimiter('otcVerification', spam.otc_verification || {}, messages.tooManyOTCVerificationAttempts, {attachResetToRequest: false});
};

const otcVerificationEnumeration = () => {
    return createRateLimiter('otcVerificationEnumeration', spam.otc_verification_enumeration || {}, messages.tooManyOTCVerificationAttempts, {attachResetToRequest: false});
};

const privateBlog = () => {
    return createRateLimiter('privateBlog', spam.private_block || {}, messages.tooManySigninAttempts, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
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
        }
    });
};

const contentApiKey = () => {
    return createMemoryStoreRateLimiter('contentApiKey', spam.content_api_key || {});
};

const webmentionsBlock = () => {
    return createRateLimiter('webmentionsBlock', spam.webmentions_block || {}, messages.webmentionsBlock);
};

const emailPreviewBlock = () => {
    return createRateLimiter('emailPreviewBlock', spam.email_preview_block || {}, messages.emailPreviewBlock);
};

const reset = () => {
    instances = {};
    store = undefined;
    memoryStore = undefined;

    spam = config.get('spam') || {};
};

module.exports = {
    globalBlock,
    globalReset,
    userLogin,
    userReset,
    userVerification,
    sendVerificationCode,
    membersAuth,
    membersAuthEnumeration,
    otcVerification,
    otcVerificationEnumeration,
    privateBlog,
    contentApiKey,
    webmentionsBlock,
    emailPreviewBlock,
    reset
};