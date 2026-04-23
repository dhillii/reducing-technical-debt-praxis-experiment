```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

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

const spam = config.get('spam') || {};

const spamConfig = {
    privateBlock: spam.private_block || {},
    globalBlock: spam.global_block || {},
    globalReset: spam.global_reset || {},
    userReset: spam.user_reset || {},
    userLogin: spam.user_login || {},
    sendVerificationCode: spam.send_verification_code || {},
    userVerification: spam.user_verification || {},
    memberLogin: spam.member_login || {},
    contentApiKey: spam.content_api_key || {},
    webmentionsBlock: spam.webmentions_block || {},
    emailPreviewBlock: spam.email_preview_block || {},
    otcVerificationEnumeration: spam.otc_verification_enumeration || {},
    otcVerification: spam.otc_verification || {}
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

const createExpressBruteInstance = (store, options) => {
    return new (require('express-brute'))(store, options);
};

const createBruteKnexStore = () => {
    const db = require('../../../../data/db');
    return new (require('brute-knex'))({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

const createMemoryStore = () => {
    return new (require('express-brute').MemoryStore)();
};

const createFailCallback = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: message,
            context: context,
            help: help
        }));
    };
};

const createFailCallbackWithNextValidRequestDate = (message, context, help) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: context,
            help: help
        }));
    };
};

const createExpressBruteOptions = (config, failCallback) => {
    return extend({
        attachResetToRequest: false,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys));
};

const createExpressBruteOptionsWithReset = (config, failCallback) => {
    return extend({
        attachResetToRequest: true,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys));
};

const globalBlockInstance = null;
const globalResetInstance = null;
const webmentionsBlockInstance = null;
const userLoginInstance = null;
const membersAuthInstance = null;
const membersAuthEnumerationInstance = null;
const userResetInstance = null;
const sendVerificationCodeInstance = null;
const userVerificationInstance = null;
const contentApiKeyInstance = null;
const emailPreviewBlockInstance = null;
const otcVerificationEnumerationInstance = null;
const otcVerificationInstance = null;
const privateBlogInstance = null;
let store = null;
let memoryStore = null;

const globalBlock = () => {
    if (!globalBlockInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordIp.error,
                {rfa: spamConfig.globalBlock.freeRetries + 1 || 5, rfp: spamConfig.globalBlock.lifetime || 60 * 60}),
            tpl(messages.tooManyAttempts)
        );
        globalBlockInstance = createExpressBruteInstance(store, createExpressBruteOptions(spamConfig.globalBlock, failCallback));
    }
    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordIp.error,
                {rfa: spamConfig.globalReset.freeRetries + 1 || 5, rfp: spamConfig.globalReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordIp.context)
        );
        globalResetInstance = createExpressBruteInstance(store, createExpressBruteOptions(spamConfig.globalReset, failCallback));
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallback(
            messages.webmentionsBlock,
            messages.webmentionsBlock,
            messages.webmentionsBlock
        );
        webmentionsBlockInstance = createExpressBruteInstance(store, createExpressBruteOptions(spamConfig.webmentionsBlock, failCallback));
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallback(
            messages.emailPreviewBlock,
            messages.emailPreviewBlock,
            messages.emailPreviewBlock
        );
        emailPreviewBlockInstance = createExpressBruteInstance(store, createExpressBruteOptions(spamConfig.emailPreviewBlock, failCallback));
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many sign-in attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        );
        membersAuthInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.userLogin, failCallback));
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many different sign-in attempts, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        );
        membersAuthEnumerationInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.memberLogin, failCallback));
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many verification attempts across multiple codes, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context)
        );
        otcVerificationEnumerationInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.otcVerificationEnumeration, failCallback));
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many attempts for this verification code, try again in ${moment().fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context)
        );
        otcVerificationInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.otcVerification, failCallback));
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    if (!userLoginInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many login attempts. Please wait ${moment().fromNow(true)} before trying again, or reset your password.`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        );
        userLoginInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.userLogin, failCallback));
    }
    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallbackWithNextValidRequestDate(
            `Too many password reset attempts try again in ${moment().fromNow(true)}`,
            tpl(messages.forgottenPasswordEmail.error,
                {rfa: spamConfig.userReset.freeRetries + 1 || 5, rfp: spamConfig.userReset.lifetime || 60 * 60}),
            tpl(messages.forgottenPasswordEmail.context)
        );
        userResetInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.userReset, failCallback));
    }
    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallback(
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts)
        );
        userVerificationInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.userVerification, failCallback));
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        store = store || createBruteKnexStore();
        const failCallback = createFailCallback(
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts),
            tpl(messages.tooManyAttempts)
        );
        sendVerificationCodeInstance = createExpressBruteInstance(store, createExpressBruteOptionsWithReset(spamConfig.sendVerificationCode, failCallback));
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        store = store || createBruteKnexStore();
        const failCallback = (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error,
                    {
                        rateSigninAttempts: spamConfig.privateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamConfig.privateBlock.lifetime || 60 * 60
                    }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        };
        privateBlogInstance = createExpressBruteInstance(store, createExpressBruteOptions(spamConfig.privateBlock, failCallback));
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        memoryStore = memoryStore || createMemoryStore();
        const failCallback = (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        };
        contentApiKeyInstance = createExpressBruteInstance(memoryStore, createExpressBruteOptionsWithReset(spamConfig.contentApiKey, failCallback));
    }
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
        store = null;
        memoryStore = null;
        privateBlogInstance = null;
        globalResetInstance = null;
        globalBlockInstance = null;
        userLoginInstance = null;
        membersAuthInstance = null;
        membersAuthEnumerationInstance = null;
        userResetInstance = null;
        sendVerificationCodeInstance = null;
        userVerificationInstance = null;
        contentApiKeyInstance = null;
        otcVerificationEnumerationInstance = null;
        otcVerificationInstance = null;

        spam = config.get('spam') || {};
        spamConfig.privateBlock = spam.private_block || {};
        spamConfig.globalBlock = spam.global_block || {};
        spamConfig.globalReset = spam.global_reset || {};
        spamConfig.userReset = spam.user_reset || {};
        spamConfig.userLogin = spam.user_login || {};
        spamConfig.sendVerificationCode = spam.send_verification_code || {};
        spamConfig.userVerification = spam.user_verification || {};
        spamConfig.memberLogin = spam.member_login || {};
        spamConfig.contentApiKey = spam.content_api_key || {};
        spamConfig.webmentionsBlock = spam.webmentions_block || {};
        spamConfig.emailPreviewBlock = spam.email_preview_block || {};
        spamConfig.otcVerificationEnumeration = spam.otc_verification_enumeration || {};
        spamConfig.otcVerification = spam.otc_verification || {};
    }
};
```