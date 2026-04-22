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

// Spam configuration
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

// Store instances
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

// Error handling
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

// Create ExpressBrute instance
const createExpressBruteInstance = (store, options) => {
    return new ExpressBrute(store, options);
};

// Create BruteKnex store
const createBruteKnexStore = () => {
    const db = require('../../../../data/db');
    return new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

// Create MemoryStore
const createMemoryStore = () => {
    return new ExpressBrute.MemoryStore();
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

// Create fail callback with nextValidRequestDate
const createFailCallbackWithNextValidRequestDate = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message + ` try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: context,
            help: help
        }));
    };
};

// Global block
const globalBlock = () => {
    store = store || createBruteKnexStore();
    globalBlockInstance = globalBlockInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many attempts try again in `,
            tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
            tpl(messages.tooManyAttempts)
        ),
        handleStoreError: handleStoreError
    }, pick(spamGlobalBlock, spamConfigKeys));

    return globalBlockInstance;
};

// Global reset
const globalReset = () => {
    store = store || createBruteKnexStore();
    globalResetInstance = globalResetInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many attempts try again in `,
            tpl(messages.forgottenPasswordIp.error,
                {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordIp.context)
        ),
        handleStoreError: handleStoreError
    }, pick(spamGlobalReset, spamConfigKeys));

    return globalResetInstance;
};

// Webmentions block
const webmentionsBlock = () => {
    store = store || createBruteKnexStore();
    webmentionsBlockInstance = webmentionsBlockInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamWebmentionsBlock, spamConfigKeys));

    return webmentionsBlockInstance;
};

// Email preview block
const emailPreviewBlock = () => {
    store = store || createBruteKnexStore();
    emailPreviewBlockInstance = emailPreviewBlockInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamEmailPreviewBlock, spamConfigKeys));

    return emailPreviewBlockInstance;
};

// Members auth
const membersAuth = () => {
    store = store || createBruteKnexStore();
    membersAuthInstance = membersAuthInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many sign-in attempts try again in `,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys));

    return membersAuthInstance;
};

// Members auth enumeration
const membersAuthEnumeration = () => {
    store = store || createBruteKnexStore();
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many different sign-in attempts, try again in `,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError
    }, pick(spamMemberLogin, spamConfigKeys));

    return membersAuthEnumerationInstance;
};

// OTC verification enumeration
const otcVerificationEnumeration = () => {
    store = store || createBruteKnexStore();
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many verification attempts across multiple codes, try again in `,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        ),
        handleStoreError: handleStoreError
    }, pick(spamOtcVerificationEnumeration, spamConfigKeys));

    return otcVerificationEnumerationInstance;
};

// OTC verification
const otcVerification = () => {
    store = store || createBruteKnexStore();
    otcVerificationInstance = otcVerificationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many attempts for this verification code, try again in `,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        ),
        handleStoreError: handleStoreError
    }, pick(spamOtcVerification, spamConfigKeys));

    return otcVerificationInstance;
};

// User login
const userLogin = () => {
    store = store || createBruteKnexStore();
    userLoginInstance = userLoginInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many login attempts. Please wait `,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ),
        handleStoreError: handleStoreError
    }, pick(spamUserLogin, spamConfigKeys));

    return userLoginInstance;
};

// User reset
const userReset = () => {
    store = store || createBruteKnexStore();
    userResetInstance = userResetInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: createFailCallbackWithNextValidRequestDate(
            `Too many password reset attempts try again in `,
            tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordEmail.context)
        ),
        handleStoreError: handleStoreError
    }, pick(spamUserReset, spamConfigKeys));

    return userResetInstance;
};

// User verification
const userVerification = () => {
    store = store || createBruteKnexStore();
    userVerificationInstance = userVerificationInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamUserVerification, spamConfigKeys));

    return userVerificationInstance;
};

// Send verification code
const sendVerificationCode = () => {
    store = store || createBruteKnexStore();
    sendVerificationCodeInstance = sendVerificationCodeInstance || createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    }, pick(spamSendVerificationCode, spamConfigKeys));

    return sendVerificationCodeInstance;
};

// Private blog
const privateBlog = () => {
    store = store || createBruteKnexStore();
    privateBlogInstance = privateBlogInstance || createExpressBruteInstance(store, {
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
        },
        handleStoreError: handleStoreError
    }, pick(spamPrivateBlock, spamConfigKeys));

    return privateBlogInstance;
};

// Content API key
const contentApiKey = () => {
    memoryStore = memoryStore || createMemoryStore();
    contentApiKeyInstance = contentApiKeyInstance || createExpressBruteInstance(memoryStore, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamContentApiKey, spamConfigKeys));

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