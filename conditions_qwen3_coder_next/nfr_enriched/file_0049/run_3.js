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

const createBruteInstance = (store, config, failCallback) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createBruteKnexStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');
    return new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

const createMemoryStore = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute.MemoryStore();
};

const createFailCallback = (message, context, help, code) => {
    return (req, res, next, nextValidRequestDate) => {
        const errorOptions = {
            message,
            context,
            help
        };

        if (code) {
            errorOptions.code = code;
        }

        if (nextValidRequestDate) {
            errorOptions.message = `${message} Try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        }

        return next(new errors.TooManyRequestsError(errorOptions));
    };
};

const createGlobalBlockFailCallback = (configKey, messageKey) => {
    const config = spam[configKey] || {};
    const msg = messages[messageKey];
    return createFailCallback(
        `Too many attempts try again in ${moment().fromNow(true)}`,
        tpl(msg.error, {
            rfa: config.freeRetries + 1 || 5,
            rfp: config.lifetime || 60 * 60
        }),
        tpl(msg.context)
    );
};

const createGenericFailCallback = (message) => {
    return createFailCallback(message, tpl(message), tpl(message));
};

const createPrivateBlogFailCallback = () => {
    const config = spamPrivateBlock || {};
    const msg = messages.tooManySigninAttempts;
    const error = new errors.TooManyRequestsError({
        message: tpl(msg.error, {
            rateSigninAttempts: config.freeRetries + 1 || 5,
            rateSigninPeriod: config.lifetime || 60 * 60
        }),
        context: tpl(msg.context)
    });
    logging.error(error);

    return createFailCallback(
        `Too many private sign-in attempts try again in ${moment().fromNow(true)}`,
        undefined,
        undefined
    );
};

const createBruteKnexInstance = (config, failCallback) => {
    store = store || createBruteKnexStore();
    return createBruteInstance(store, config, failCallback);
};

const createMemoryBruteInstance = (config, failCallback) => {
    memoryStore = memoryStore || createMemoryStore();
    return createBruteInstance(memoryStore, config, failCallback);
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteKnexInstance(
            spamGlobalBlock,
            createGlobalBlockFailCallback('global_block', 'forgottenPasswordIp')
        );
    }
    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createBruteKnexInstance(
            spamGlobalReset,
            createGlobalBlockFailCallback('global_reset', 'forgottenPasswordIp')
        );
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteKnexInstance(
            spamWebmentionsBlock,
            createGenericFailCallback(messages.webmentionsBlock)
        );
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteKnexInstance(
            spamEmailPreviewBlock,
            createGenericFailCallback(messages.emailPreviewBlock)
        );
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteKnexInstance(
            spamUserLogin,
            createFailCallback(
                'Too many sign-in attempts try again in {time}',
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            )
        );
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteKnexInstance(
            spamMemberLogin,
            createFailCallback(
                'Too many different sign-in attempts, try again in {time}',
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            )
        );
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteKnexInstance(
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
        otcVerificationInstance = createBruteKnexInstance(
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
        userLoginInstance = createBruteKnexInstance(
            spamUserLogin,
            createFailCallback(
                'Too many login attempts. Please wait {time} before trying again, or reset your password.',
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            )
        );
    }
    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createBruteKnexInstance(
            spamUserReset,
            createFailCallback(
                'Too many password reset attempts try again in {time}',
                tpl(messages.forgottenPasswordEmail.error, {
                    rfa: (spamUserReset.freeRetries || 5) + 1,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordEmail.context)
            )
        );
    }
    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteKnexInstance(
            spamUserVerification,
            createGenericFailCallback(messages.tooManyAttempts)
        );
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteKnexInstance(
            spamSendVerificationCode,
            createGenericFailCallback(messages.tooManyAttempts)
        );
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteKnexInstance(
            spamPrivateBlock,
            createPrivateBlogFailCallback()
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