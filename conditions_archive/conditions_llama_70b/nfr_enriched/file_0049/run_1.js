```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

// Constants
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

// Initialize spam configuration
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

// Initialize store instances
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

// Handle store error
const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // see https://github.com/AdamPflug/express-brute/issues/45
    // express-brute does not always forward a callback
    // we are using reset as synchronous call, so we have to log the error if it occurs
    // there is no way to try/catch, because the reset operation happens asynchronous
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

// Create ExpressBrute instance
const createExpressBruteInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

// Create BruteKnex store instance
const createBruteKnexStoreInstance = () => {
    const db = require('../../../../data/db');
    return new (require('brute-knex'))({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

// Create ExpressBrute options
const createExpressBruteOptions = (config, attachResetToRequest, failCallback) => {
    return extend({
        attachResetToRequest: attachResetToRequest,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys));
};

// Create fail callback
const createFailCallback = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message,
            context: context,
            help: help
        }));
    };
};

// Create private blog instance
const createPrivateBlogInstance = () => {
    store = store || createBruteKnexStoreInstance();
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamPrivateBlock, false, (req, res, next, nextValidRequestDate) => {
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
    }));

    return privateBlogInstance;
};

// Create global block instance
const createGlobalBlockInstance = () => {
    store = store || createBruteKnexStoreInstance();
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamGlobalBlock, false, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            help: tpl(messages.tooManyAttempts)
        }));
    }));

    return globalBlockInstance;
};

// Create global reset instance
const createGlobalResetInstance = () => {
    store = store || createBruteKnexStoreInstance();
    globalResetInstance = globalResetInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamGlobalReset, false, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }));

    return globalResetInstance;
};

// Create webmentions block instance
const createWebmentionsBlockInstance = () => {
    store = store || createBruteKnexStoreInstance();
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamWebmentionsBlock, false, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    }));

    return webmentionsBlockInstance;
};

// Create email preview block instance
const createEmailPreviewBlockInstance = () => {
    store = store || createBruteKnexStoreInstance();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamEmailPreviewBlock, false, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    }));

    return emailPreviewBlockInstance;
};

// Create members auth instance
const createMembersAuthInstance = () => {
    store = store || createBruteKnexStoreInstance();
    membersAuthInstance = membersAuthInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamUserLogin, true, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }));

    return membersAuthInstance;
};

// Create members auth enumeration instance
const createMembersAuthEnumerationInstance = () => {
    store = store || createBruteKnexStoreInstance();
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamMemberLogin, true, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }));

    return membersAuthEnumerationInstance;
};

// Create otc verification enumeration instance
const createOtcVerificationEnumerationInstance = () => {
    store = store || createBruteKnexStoreInstance();
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamOtcVerificationEnumeration, false, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }));

    return otcVerificationEnumerationInstance;
};

// Create otc verification instance
const createOtcVerificationInstance = () => {
    store = store || createBruteKnexStoreInstance();
    otcVerificationInstance = otcVerificationInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamOtcVerification, false, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }));

    return otcVerificationInstance;
};

// Create user login instance
const createUserLoginInstance = () => {
    store = store || createBruteKnexStoreInstance();
    userLoginInstance = userLoginInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamUserLogin, true, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }));

    return userLoginInstance;
};

// Create user reset instance
const createUserResetInstance = () => {
    store = store || createBruteKnexStoreInstance();
    userResetInstance = userResetInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamUserReset, true, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }));

    return userResetInstance;
};

// Create user verification instance
const createUserVerificationInstance = () => {
    store = store || createBruteKnexStoreInstance();
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamUserVerification, true, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }));

    return userVerificationInstance;
};

// Create send verification code instance
const createSendVerificationCodeInstance = () => {
    store = store || createBruteKnexStoreInstance();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(store, createExpressBruteOptions(spamSendVerificationCode, true, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }));

    return sendVerificationCodeInstance;
};

// Create content API key instance
const createContentApiKeyInstance = () => {
    memoryStore = memoryStore || new (require('express-brute')).MemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteInstance(memoryStore, createExpressBruteOptions(spamContentApiKey, true, (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    }));

    return contentApiKeyInstance;
};

module.exports = {
    globalBlock: createGlobalBlockInstance,
    globalReset: createGlobalResetInstance,
    userLogin: createUserLoginInstance,
    sendVerificationCode: createSendVerificationCodeInstance,
    userVerification: createUserVerificationInstance,
    membersAuth: createMembersAuthInstance,
    membersAuthEnumeration: createMembersAuthEnumerationInstance,
    otcVerification: createOtcVerificationInstance,
    otcVerificationEnumeration: createOtcVerificationEnumerationInstance,
    userReset: createUserResetInstance,
    privateBlog: createPrivateBlogInstance,
    contentApiKey: createContentApiKeyInstance,
    webmentionsBlock: createWebmentionsBlockInstance,
    emailPreviewBlock: createEmailPreviewBlockInstance,
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