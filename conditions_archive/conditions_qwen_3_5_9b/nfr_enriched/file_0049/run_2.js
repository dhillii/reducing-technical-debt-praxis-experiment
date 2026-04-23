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

const createBruteInstance = (store, config, options = {}) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        handleStoreError: handleStoreError,
        ...options
    }, pick(config, spamConfigKeys)));
};

const createFailCallback = (config, type) => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        const nextValidTime = moment(nextValidRequestDate).fromNow(true);

        switch (type) {
            case 'forgottenPasswordEmail':
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${nextValidTime}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));

            case 'forgottenPasswordIp':
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${nextValidTime}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));

            case 'tooManySigninAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${nextValidTime}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));

            case 'tooManyOTCVerificationAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${nextValidTime}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));

            case 'otcCodeAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${nextValidTime}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));

            case 'userLogin':
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${nextValidTime} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));

            case 'privateBlog':
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: config.freeRetries + 1 || 5,
                        rateSigninPeriod: config.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${nextValidTime}`
                }));

            default:
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
        }
    };
};

const createFailCallbackNoTime = (config, type) => {
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next) => {
        switch (type) {
            case 'webmentionsBlock':
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));

            case 'emailPreviewBlock':
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));

            case 'userVerification':
            case 'sendVerificationCode':
            case 'contentApiKey':
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));

            default:
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
        }
    };
};

const globalBlock = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamGlobalBlock, 'forgottenPasswordIp');

    globalBlockInstance = globalBlockInstance || createBruteInstance(
        store,
        spamGlobalBlock,
        { failCallback }
    );

    return globalBlockInstance;
};

const globalReset = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamGlobalReset, 'forgottenPasswordIp');

    globalResetInstance = globalResetInstance || createBruteInstance(
        store,
        spamGlobalReset,
        { failCallback }
    );

    return globalResetInstance;
};

const webmentionsBlock = () => {
    const store = createBruteStore();
    const failCallback = createFailCallbackNoTime(spamWebmentionsBlock, 'webmentionsBlock');

    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(
        store,
        spamWebmentionsBlock,
        { failCallback }
    );

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const store = createBruteStore();
    const failCallback = createFailCallbackNoTime(spamEmailPreviewBlock, 'emailPreviewBlock');

    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(
        store,
        spamEmailPreviewBlock,
        { failCallback }
    );

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserLogin, 'tooManySigninAttempts');

    membersAuthInstance = membersAuthInstance || createBruteInstance(
        store,
        spamUserLogin,
        { attachResetToRequest: true, failCallback }
    );

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamMemberLogin, 'tooManySigninAttempts');

    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(
        store,
        spamMemberLogin,
        { attachResetToRequest: true, failCallback }
    );

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamOtcVerificationEnumeration, 'tooManyOTCVerificationAttempts');

    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(
        store,
        spamOtcVerificationEnumeration,
        { failCallback }
    );

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamOtcVerification, 'otcCodeAttempts');

    otcVerificationInstance = otcVerificationInstance || createBruteInstance(
        store,
        spamOtcVerification,
        { failCallback }
    );

    return otcVerificationInstance;
};

const userLogin = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserLogin, 'userLogin');

    userLoginInstance = userLoginInstance || createBruteInstance(
        store,
        spamUserLogin,
        { attachResetToRequest: true, failCallback }
    );

    return userLoginInstance;
};

const userReset = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserReset, 'forgottenPasswordEmail');

    userResetInstance = userResetInstance || createBruteInstance(
        store,
        spamUserReset,
        { attachResetToRequest: true, failCallback }
    );

    return userResetInstance;
};

const userVerification = () => {
    const store = createBruteStore();
    const failCallback = createFailCallbackNoTime(spamUserVerification, 'userVerification');

    userVerificationInstance = userVerificationInstance || createBruteInstance(
        store,
        spamUserVerification,
        { failCallback }
    );

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const store = createBruteStore();
    const failCallback = createFailCallbackNoTime(spamSendVerificationCode, 'sendVerificationCode');

    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(
        store,
        spamSendVerificationCode,
        { attachResetToRequest: true, failCallback }
    );

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamPrivateBlock, 'privateBlog');

    privateBlogInstance = privateBlogInstance || createBruteInstance(
        store,
        spamPrivateBlock,
        { attachResetToRequest: false, failCallback }
    );

    return privateBlogInstance;
};

const contentApiKey = () => {
    const store = createMemoryStore();
    const failCallback = createFailCallbackNoTime(spamContentApiKey, 'contentApiKey');

    contentApiKeyInstance = contentApiKeyInstance || createBruteInstance(
        store,
        spamContentApiKey,
        { attachResetToRequest: true, failCallback }
    );

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
```