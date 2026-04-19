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

const createFailCallbackGlobalBlock = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            help: tpl(messages.tooManyAttempts)
        }));
    };
};

const createFailCallbackGlobalReset = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };
};

const createFailCallbackWebmentions = (config) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };
};

const createFailCallbackEmailPreview = (config) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };
};

const createFailCallbackMembersAuth = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

const createFailCallbackMembersAuthEnumeration = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

const createFailCallbackOtcVerificationEnumeration = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

const createFailCallbackOtcVerification = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

const createFailCallbackUserLogin = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

const createFailCallbackUserReset = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
};

const createFailCallbackUserVerification = (config) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
};

const createFailCallbackSendVerificationCode = (config) => {
    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
};

const createFailCallbackPrivateBlog = (config) => {
    return (req, res, next, nextValidRequestDate) => {
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
    };
};

const createFailCallbackContentApiKey = (config) => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

const createExpressBruteInstance = (store, config, failCallback) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store,
        extend({
            attachResetToRequest: config.attachResetToRequest,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );
};

const globalBlock = () => {
    const config = spamGlobalBlock;
    const failCallback = createFailCallbackGlobalBlock(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    globalBlockInstance = globalBlockInstance || instance;
    return globalBlockInstance;
};

const globalReset = () => {
    const config = spamGlobalReset;
    const failCallback = createFailCallbackGlobalReset(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    globalResetInstance = globalResetInstance || instance;
    return globalResetInstance;
};

const webmentionsBlock = () => {
    const config = spamWebmentionsBlock;
    const failCallback = createFailCallbackWebmentions(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    webmentionsBlockInstance = webmentionsBlockInstance || instance;
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const config = spamEmailPreviewBlock;
    const failCallback = createFailCallbackEmailPreview(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    emailPreviewBlockInstance = emailPreviewBlockInstance || instance;
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const config = spamUserLogin;
    const failCallback = createFailCallbackMembersAuth(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    membersAuthInstance = membersAuthInstance || instance;
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const config = spamMemberLogin;
    const failCallback = createFailCallbackMembersAuthEnumeration(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || instance;
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const config = spamOtcVerificationEnumeration;
    const failCallback = createFailCallbackOtcVerificationEnumeration(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || instance;
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const config = spamOtcVerification;
    const failCallback = createFailCallbackOtcVerification(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    otcVerificationInstance = otcVerificationInstance || instance;
    return otcVerificationInstance;
};

const userLogin = () => {
    const config = spamUserLogin;
    const failCallback = createFailCallbackUserLogin(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    userLoginInstance = userLoginInstance || instance;
    return userLoginInstance;
};

const userReset = function userReset() {
    const config = spamUserReset;
    const failCallback = createFailCallbackUserReset(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    userResetInstance = userResetInstance || instance;
    return userResetInstance;
};

const userVerification = function userVerification() {
    const config = spamUserVerification;
    const failCallback = createFailCallbackUserVerification(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    userVerificationInstance = userVerificationInstance || instance;
    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    const config = spamSendVerificationCode;
    const failCallback = createFailCallbackSendVerificationCode(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    sendVerificationCodeInstance = sendVerificationCodeInstance || instance;
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const config = spamPrivateBlock;
    const failCallback = createFailCallbackPrivateBlog(config);
    const instance = createExpressBruteInstance(store, config, failCallback);
    privateBlogInstance = privateBlogInstance || instance;
    return privateBlogInstance;
};

const contentApiKey = () => {
    const config = spamContentApiKey;
    const failCallback = createFailCallbackContentApiKey(config);
    const instance = createExpressBruteInstance(memoryStore, config, failCallback);
    contentApiKeyInstance = contentApiKeyInstance || instance;
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