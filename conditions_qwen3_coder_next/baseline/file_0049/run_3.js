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

const createBruteInstance = (storeClass, config, messages, extraOptions = {}) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const baseOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            const message = extraOptions.messageTemplate
                ? extraOptions.messageTemplate(nextValidRequestDate)
                : messages.webmentionsBlock || messages.emailPreviewBlock || messages.tooManyAttempts;

            return next(new errors.TooManyRequestsError({
                message,
                context: messages.context || messages.error,
                help: messages.context || messages.error
            }));
        },
        handleStoreError
    };

    return new ExpressBrute(store, extend(baseOptions, pick(config, spamConfigKeys), extraOptions));
};

const createBruteInstanceWithMemoryStore = (config, messages, extraOptions = {}) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    const baseOptions = {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: messages.tooManyAttempts || messages.webmentionsBlock || messages.emailPreviewBlock
            });

            logging.error(err);
            return next(err);
        },
        handleStoreError
    };

    return new ExpressBrute(memoryStore, extend(baseOptions, pick(config, spamConfigKeys), extraOptions));
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteInstance(null, spamGlobalBlock, messages.forgottenPasswordIp, {
            messageTemplate: (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        });
    }
    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createBruteInstance(null, spamGlobalReset, messages.forgottenPasswordIp, {
            messageTemplate: (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        });
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(null, spamWebmentionsBlock, messages, {
            messageTemplate: () => messages.webmentionsBlock
        });
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(null, spamEmailPreviewBlock, messages, {
            messageTemplate: () => messages.emailPreviewBlock
        });
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(null, spamUserLogin, messages.tooManySigninAttempts, {
            attachResetToRequest: true,
            messageTemplate: (nextValidRequestDate) => `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        });
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(null, spamMemberLogin, messages.tooManySigninAttempts, {
            attachResetToRequest: true,
            messageTemplate: (nextValidRequestDate) => `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`
        });
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(null, spamOtcVerificationEnumeration, messages.tooManyOTCVerificationAttempts, {
            attachResetToRequest: false,
            messageTemplate: (nextValidRequestDate) => `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            extraOptions: {
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }
        });
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(null, spamOtcVerification, messages.tooManyOTCVerificationAttempts, {
            attachResetToRequest: false,
            messageTemplate: (nextValidRequestDate) => `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            extraOptions: {
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }
        });
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = createBruteInstance(null, spamUserLogin, messages.tooManySigninAttempts, {
            attachResetToRequest: true,
            messageTemplate: (nextValidRequestDate) => `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`
        });
    }
    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createBruteInstance(null, spamUserReset, messages.forgottenPasswordEmail, {
            attachResetToRequest: true,
            messageTemplate: (nextValidRequestDate) => `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        });
    }
    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(null, spamUserVerification, messages, {
            attachResetToRequest: true,
            messageTemplate: () => messages.tooManyAttempts
        });
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(null, spamSendVerificationCode, messages, {
            attachResetToRequest: true,
            messageTemplate: () => messages.tooManyAttempts
        });
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteInstance(null, spamPrivateBlock, messages.tooManySigninAttempts, {
            attachResetToRequest: false,
            messageTemplate: (nextValidRequestDate) => `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        });
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createBruteInstanceWithMemoryStore(spamContentApiKey, messages, {
            attachResetToRequest: true
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