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

const createBruteStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return store;
};

const createMemoryStore = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return memoryStore;
};

const createGlobalBlock = () => {
    const ExpressBrute = require('express-brute');

    globalBlockInstance = globalBlockInstance || new ExpressBrute(createBruteStore(),
        extend({
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
        }, pick(spamGlobalBlock, spamConfigKeys))
    );

    return globalBlockInstance;
};

const createGlobalReset = () => {
    const ExpressBrute = require('express-brute');

    globalResetInstance = globalResetInstance || new ExpressBrute(createBruteStore(),
        extend({
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
        }, pick(spamGlobalReset, spamConfigKeys))
    );

    return globalResetInstance;
};

const createWebmentionsBlock = () => {
    const ExpressBrute = require('express-brute');

    webmentionsBlockInstance = webmentionsBlockInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamWebmentionsBlock, spamConfigKeys))
    );

    return webmentionsBlockInstance;
};

const createEmailPreviewBlock = () => {
    const ExpressBrute = require('express-brute');

    emailPreviewBlockInstance = emailPreviewBlockInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamEmailPreviewBlock, spamConfigKeys))
    );

    return emailPreviewBlockInstance;
};

const createMembersAuth = () => {
    const ExpressBrute = require('express-brute');

    membersAuthInstance = membersAuthInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys))
    );

    return membersAuthInstance;
};

const createMembersAuthEnumeration = () => {
    const ExpressBrute = require('express-brute');

    membersAuthEnumerationInstance = membersAuthEnumerationInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys))
    );

    return membersAuthEnumerationInstance;
};

const createOtcVerificationEnumeration = () => {
    const ExpressBrute = require('express-brute');

    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || new ExpressBrute(createBruteStore(),
        extend({
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
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys))
    );

    return otcVerificationEnumerationInstance;
};

const createOtcVerification = () => {
    const ExpressBrute = require('express-brute');

    otcVerificationInstance = otcVerificationInstance || new ExpressBrute(createBruteStore(),
        extend({
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
        }, pick(spamOtcVerification, spamConfigKeys))
    );

    return otcVerificationInstance;
};

const createUserLogin = () => {
    const ExpressBrute = require('express-brute');

    userLoginInstance = userLoginInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next, nextValidRequestDate) {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys))
    );

    return userLoginInstance;
};

const createUserReset = () => {
    const ExpressBrute = require('express-brute');

    userResetInstance = userResetInstance || new ExpressBrute(createBruteStore(),
        extend({
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
        }, pick(spamUserReset, spamConfigKeys))
    );

    return userResetInstance;
};

const createUserVerification = () => {
    const ExpressBrute = require('express-brute');

    userVerificationInstance = userVerificationInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamUserVerification, spamConfigKeys))
    );

    return userVerificationInstance;
};

const createSendVerificationCode = () => {
    const ExpressBrute = require('express-brute');

    sendVerificationCodeInstance = sendVerificationCodeInstance || new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys))
    );

    return sendVerificationCodeInstance;
};

const createPrivateBlog = () => {
    const ExpressBrute = require('express-brute');

    privateBlogInstance = privateBlogInstance || new ExpressBrute(createBruteStore(),
        extend({
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
        }, pick(spamPrivateBlock, spamConfigKeys))
    );

    return privateBlogInstance;
};

const createContentApiKey = () => {
    const ExpressBrute = require('express-brute');

    contentApiKeyInstance = contentApiKeyInstance || new ExpressBrute(createMemoryStore(),
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys))
    );

    return contentApiKeyInstance;
};

const reset = () => {
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
};

module.exports = {
    globalBlock: createGlobalBlock,
    globalReset: createGlobalReset,
    userLogin: createUserLogin,
    sendVerificationCode: createSendVerificationCode,
    userVerification: createUserVerification,
    membersAuth: createMembersAuth,
    membersAuthEnumeration: createMembersAuthEnumeration,
    otcVerification: createOtcVerification,
    otcVerificationEnumeration: createOtcVerificationEnumeration,
    userReset: createUserReset,
    privateBlog: createPrivateBlog,
    contentApiKey: createContentApiKey,
    webmentionsBlock: createWebmentionsBlock,
    emailPreviewBlock: createEmailPreviewBlock,
    reset: reset
};