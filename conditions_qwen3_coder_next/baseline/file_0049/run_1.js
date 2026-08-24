const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

let spam = config.get('spam') || {};
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

const createBruteInstance = (storeClass, config, failCallback, attachResetToRequest = false) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return new ExpressBrute(store, extend({
        attachResetToRequest,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createMemoryBruteInstance = (config, failCallback, attachResetToRequest = false) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createFailCallback = (message, context, help, code) => (req, res, next, nextValidRequestDate) => {
    const formattedMessage = nextValidRequestDate
        ? `${message} Try again in ${moment(nextValidRequestDate).fromNow(true)}.`
        : message;

    const errorOptions = {
        message: formattedMessage,
        context: context || tpl(message),
        help: help || tpl(message)
    };

    if (code) {
        errorOptions.code = code;
    }

    return next(new errors.TooManyRequestsError(errorOptions));
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteInstance(
            require('brute-knex'),
            spamGlobalBlock,
            createFailCallback(
                'Too many attempts try again in {time}',
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                tpl(messages.tooManyAttempts)
            )
        );
    }
    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createBruteInstance(
            require('brute-knex'),
            spamGlobalReset,
            createFailCallback(
                'Too many attempts try again in {time}',
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordIp.context)
            )
        );
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(
            require('brute-knex'),
            spamWebmentionsBlock,
            createFailCallback(messages.webmentionsBlock)
        );
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(
            require('brute-knex'),
            spamEmailPreviewBlock,
            createFailCallback(messages.emailPreviewBlock)
        );
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(
            require('brute-knex'),
            spamUserLogin,
            createFailCallback(
                'Too many sign-in attempts try again in {time}',
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context),
                null,
                true
            ),
            true
        );
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(
            require('brute-knex'),
            spamMemberLogin,
            createFailCallback(
                'Too many different sign-in attempts, try again in {time}',
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            true
        );
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(
            require('brute-knex'),
            spamOtcVerificationEnumeration,
            createFailCallback(
                'Too many verification attempts across multiple codes, try again in {time}',
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            )
        );
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(
            require('brute-knex'),
            spamOtcVerification,
            createFailCallback(
                'Too many attempts for this verification code, try again in {time}',
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            )
        );
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = createBruteInstance(
            require('brute-knex'),
            spamUserLogin,
            createFailCallback(
                'Too many login attempts. Please wait {time} before trying again, or reset your password.',
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ),
            true
        );
    }
    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createBruteInstance(
            require('brute-knex'),
            spamUserReset,
            createFailCallback(
                'Too many password reset attempts try again in {time}',
                tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordEmail.context)
            ),
            true
        );
    }
    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(
            require('brute-knex'),
            spamUserVerification,
            createFailCallback(tpl(messages.tooManyAttempts))
        );
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(
            require('brute-knex'),
            spamSendVerificationCode,
            createFailCallback(tpl(messages.tooManyAttempts))
        );
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteInstance(
            require('brute-knex'),
            spamPrivateBlock,
            (req, res, next, nextValidRequestDate) => {
                const message = `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
                const context = tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                });

                logging.error(new errors.TooManyRequestsError({
                    message: context,
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message,
                    context
                }));
            }
        );
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createMemoryBruteInstance(
            spamContentApiKey,
            (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            }
        );
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