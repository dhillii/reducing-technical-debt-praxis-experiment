```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const MemoryStore = require('express-brute').MemoryStore;

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

const createBruteInstance = (config, options = {}) => {
    const db = require('../../../../data/db');
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest,
        failCallback: options.failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createMemoryBruteInstance = (config, options = {}) => {
    const memoryStore = memoryStore || new MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: options.attachResetToRequest,
        failCallback: options.failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const getFailCallback = (type, config) => {
    const nextValidRequestDate = (req, res, next) => nextValidRequestDate;
    
    switch (type) {
        case 'globalBlock':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));

        case 'globalReset':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));

        case 'webmentionsBlock':
            return (req, res, next) => next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));

        case 'emailPreviewBlock':
            return (req, res, next) => next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));

        case 'membersAuth':
        case 'membersAuthEnumeration':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));

        case 'otcVerificationEnumeration':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));

        case 'otcVerification':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));

        case 'userLogin':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));

        case 'userReset':
            return (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));

        case 'userVerification':
        case 'sendVerificationCode':
            return (req, res, next) => next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));

        case 'privateBlog':
            return (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: config.freeRetries + 1 || 5,
                        rateSigninPeriod: config.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            };

        case 'contentApiKey':
            return (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            };

        default:
            return (req, res, next) => next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
    }
};

const spamInstances = {
    globalBlock: null,
    globalReset: null,
    webmentionsBlock: null,
    emailPreviewBlock: null,
    membersAuth: null,
    membersAuthEnumeration: null,
    otcVerificationEnumeration: null,
    otcVerification: null,
    userLogin: null,
    userReset: null,
    userVerification: null,
    sendVerificationCode: null,
    privateBlog: null,
    contentApiKey: null
};

const getSpamConfig = (type) => {
    const configMap = {
        globalBlock: spamGlobalBlock,
        globalReset: spamGlobalReset,
        webmentionsBlock: spamWebmentionsBlock,
        emailPreviewBlock: spamEmailPreviewBlock,
        membersAuth: spamUserLogin,
        membersAuthEnumeration: spamMemberLogin,
        otcVerificationEnumeration: spamOtcVerificationEnumeration,
        otcVerification: spamOtcVerification,
        userLogin: spamUserLogin,
        userReset: spamUserReset,
        userVerification: spamUserVerification,
        sendVerificationCode: spamSendVerificationCode,
        privateBlog: spamPrivateBlock,
        contentApiKey: spamContentApiKey
    };

    return configMap[type] || {};
};

const getInstance = (type) => {
    const instance = spamInstances[type];
    if (instance) return instance;

    const config = getSpamConfig(type);
    const failCallback = getFailCallback(type, config);
    const useMemoryStore = type === 'contentApiKey';

    if (useMemoryStore) {
        spamInstances[type] = createMemoryBruteInstance(config, { failCallback });
    } else {
        spamInstances[type] = createBruteInstance(config, { failCallback });
    }

    return spamInstances[type];
};

const reset = () => {
    store = undefined;
    memoryStore = undefined;
    spamInstances = {};
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
    spamWebmentionsBlock = spam.webmentions_block || {};
    spamEmailPreviewBlock = spam.email_preview_block || {};
    spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
    spamOtcVerification = spam.otc_verification || {};
};

module.exports = {
    globalBlock: () => getInstance('globalBlock'),
    globalReset: () => getInstance('globalReset'),
    userLogin: () => getInstance('userLogin'),
    sendVerificationCode: () => getInstance('sendVerificationCode'),
    userVerification: () => getInstance('userVerification'),
    membersAuth: () => getInstance('membersAuth'),
    membersAuthEnumeration: () => getInstance('membersAuthEnumeration'),
    otcVerification: () => getInstance('otcVerification'),
    otcVerificationEnumeration: () => getInstance('otcVerificationEnumeration'),
    userReset: () => getInstance('userReset'),
    privateBlog: () => getInstance('privateBlog'),
    contentApiKey: () => getInstance('contentApiKey'),
    webmentionsBlock: () => getInstance('webmentionsBlock'),
    emailPreviewBlock: () => getInstance('emailPreviewBlock'),
    reset
};
```