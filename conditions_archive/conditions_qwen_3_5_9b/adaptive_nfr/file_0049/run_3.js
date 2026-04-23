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
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createFailCallback = (config, type) => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    const nextValidRequestDate = (req, res, next) => nextValidRequestDate;

    const failCallback = (req, res, next, nextValidRequestDate) => {
        const timeString = moment(nextValidRequestDate).fromNow(true);

        switch (type) {
            case 'forgottenPasswordEmail':
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    context: tpl(messages.forgottenPasswordEmail.context),
                    help: tpl(messages.tooManyAttempts)
                }));

            case 'forgottenPasswordIp':
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${timeString}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));

            case 'tooManySigninAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${timeString}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));

            case 'tooManyDifferentSigninAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${timeString}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));

            case 'otcTotalAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${timeString}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));

            case 'otcCodeAttempts':
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${timeString}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));

            case 'userLogin':
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${timeString} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));

            case 'userReset':
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${timeString}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));

            case 'userVerification':
            case 'sendVerificationCode':
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
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
                    message: `Too many private sign-in attempts try again in ${timeString}`
                }));

            case 'webmentionsBlock':
            case 'emailPreviewBlock':
                return next(new errors.TooManyRequestsError({
                    message: type === 'webmentionsBlock' ? messages.webmentionsBlock : messages.emailPreviewBlock
                }));

            case 'contentApiKey':
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);

            default:
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
        }
    };

    return failCallback;
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

const globalBlock = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamGlobalBlock, 'forgottenPasswordIp');
    const instance = createBruteInstance(store, spamGlobalBlock, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const globalReset = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamGlobalReset, 'forgottenPasswordIp');
    const instance = createBruteInstance(store, spamGlobalReset, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const webmentionsBlock = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamWebmentionsBlock, 'webmentionsBlock');
    const instance = createBruteInstance(store, spamWebmentionsBlock, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const emailPreviewBlock = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamEmailPreviewBlock, 'emailPreviewBlock');
    const instance = createBruteInstance(store, spamEmailPreviewBlock, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const membersAuth = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserLogin, 'tooManySigninAttempts');
    const instance = createBruteInstance(store, spamUserLogin, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
};

const membersAuthEnumeration = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamMemberLogin, 'tooManyDifferentSigninAttempts');
    const instance = createBruteInstance(store, spamMemberLogin, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
};

const otcVerificationEnumeration = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamOtcVerificationEnumeration, 'otcTotalAttempts');
    const instance = createBruteInstance(store, spamOtcVerificationEnumeration, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const otcVerification = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamOtcVerification, 'otcCodeAttempts');
    const instance = createBruteInstance(store, spamOtcVerification, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const userLogin = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserLogin, 'userLogin');
    const instance = createBruteInstance(store, spamUserLogin, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
};

const userReset = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserReset, 'userReset');
    const instance = createBruteInstance(store, spamUserReset, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
};

const userVerification = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamUserVerification, 'userVerification');
    const instance = createBruteInstance(store, spamUserVerification, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
};

const sendVerificationCode = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamSendVerificationCode, 'sendVerificationCode');
    const instance = createBruteInstance(store, spamSendVerificationCode, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
};

const privateBlog = () => {
    const store = createBruteStore();
    const failCallback = createFailCallback(spamPrivateBlock, 'privateBlog');
    const instance = createBruteInstance(store, spamPrivateBlock, { attachResetToRequest: false });

    instance.failCallback = failCallback;

    return instance;
};

const contentApiKey = () => {
    const memoryStore = createMemoryStore();
    const failCallback = createFailCallback(spamContentApiKey, 'contentApiKey');
    const instance = createBruteInstance(memoryStore, spamContentApiKey, { attachResetToRequest: true });

    instance.failCallback = failCallback;

    return instance;
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