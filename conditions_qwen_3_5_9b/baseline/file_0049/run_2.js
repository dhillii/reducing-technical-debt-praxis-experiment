const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const _ = require('lodash');

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

const createBruteInstance = (
    configObj,
    failCallback,
    store,
    instanceName,
    instanceVarName,
    attachResetToRequest = false
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: attachResetToRequest,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    return instance;
};

const createMemoryBruteInstance = (
    configObj,
    failCallback,
    instanceName,
    instanceVarName,
    attachResetToRequest = false
) => {
    const ExpressBrute = require('express-brute');

    const memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    const instance = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: attachResetToRequest,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    return instance;
};

const getFailCallback = (type, configObj) => {
    const freeRetries = configObj.freeRetries + 1 || 5;
    const lifetime = configObj.lifetime || 60 * 60;

    switch (type) {
        case 'globalBlock':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {rfa: freeRetries, rfp: lifetime}),
                    help: tpl(messages.tooManyAttempts)
                }));
            };
        case 'globalReset':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {rfa: freeRetries, rfp: lifetime}),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            };
        case 'webmentions':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            };
        case 'emailPreview':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            };
        case 'membersAuth':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            };
        case 'membersAuthEnumeration':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            };
        case 'otcVerificationEnumeration':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            };
        case 'otcVerification':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            };
        case 'userLogin':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            };
        case 'userReset':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {rfa: freeRetries, rfp: lifetime}),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            };
        case 'userVerification':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            };
        case 'sendVerificationCode':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            };
        case 'privateBlog':
            return (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: freeRetries,
                        rateSigninPeriod: lifetime
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
            return null;
    }
};

const getSpamConfig = (key) => {
    const spam = config.get('spam') || {};
    return spam[key] || {};
};

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

const globalBlock = () => {
    const configObj = getSpamConfig('global_block');
    const failCallback = getFailCallback('globalBlock', configObj);
    return createBruteInstance(configObj, failCallback, store, 'globalBlock', 'globalBlockInstance', false);
};

const globalReset = () => {
    const configObj = getSpamConfig('global_reset');
    const failCallback = getFailCallback('globalReset', configObj);
    return createBruteInstance(configObj, failCallback, store, 'globalReset', 'globalResetInstance', false);
};

const webmentionsBlock = () => {
    const configObj = getSpamConfig('webmentions_block');
    const failCallback = getFailCallback('webmentions', configObj);
    return createBruteInstance(configObj, failCallback, store, 'webmentionsBlock', 'webmentionsBlockInstance', false);
};

const emailPreviewBlock = () => {
    const configObj = getSpamConfig('email_preview_block');
    const failCallback = getFailCallback('emailPreview', configObj);
    return createBruteInstance(configObj, failCallback, store, 'emailPreviewBlock', 'emailPreviewBlockInstance', false);
};

const membersAuth = () => {
    const configObj = getSpamConfig('user_login');
    const failCallback = getFailCallback('membersAuth', configObj);
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(configObj, failCallback, store, 'membersAuth', 'membersAuthInstance', true);
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const configObj = getSpamConfig('member_login');
    const failCallback = getFailCallback('membersAuthEnumeration', configObj);
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(configObj, failCallback, store, 'membersAuthEnumeration', 'membersAuthEnumerationInstance', true);
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const configObj = getSpamConfig('otc_verification_enumeration');
    const failCallback = getFailCallback('otcVerificationEnumeration', configObj);
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(configObj, failCallback, store, 'otcVerificationEnumeration', 'otcVerificationEnumerationInstance', false);
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const configObj = getSpamConfig('otc_verification');
    const failCallback = getFailCallback('otcVerification', configObj);
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(configObj, failCallback, store, 'otcVerification', 'otcVerificationInstance', false);
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    const configObj = getSpamConfig('user_login');
    const failCallback = getFailCallback('userLogin', configObj);
    if (!userLoginInstance) {
        userLoginInstance = createBruteInstance(configObj, failCallback, store, 'userLogin', 'userLoginInstance', true);
    }
    return userLoginInstance;
};

const userReset = () => {
    const configObj = getSpamConfig('user_reset');
    const failCallback = getFailCallback('userReset', configObj);
    if (!userResetInstance) {
        userResetInstance = createBruteInstance(configObj, failCallback, store, 'userReset', 'userResetInstance', true);
    }
    return userResetInstance;
};

const userVerification = () => {
    const configObj = getSpamConfig('user_verification');
    const failCallback = getFailCallback('userVerification', configObj);
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(configObj, failCallback, store, 'userVerification', 'userVerificationInstance', true);
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const configObj = getSpamConfig('send_verification_code');
    const failCallback = getFailCallback('sendVerificationCode', configObj);
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(configObj, failCallback, store, 'sendVerificationCode', 'sendVerificationCodeInstance', true);
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const configObj = getSpamConfig('private_block');
    const failCallback = getFailCallback('privateBlog', configObj);
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteInstance(configObj, failCallback, store, 'privateBlog', 'privateBlogInstance', false);
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    const configObj = getSpamConfig('content_api_key');
    const failCallback = getFailCallback('contentApiKey', configObj);
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createMemoryBruteInstance(configObj, failCallback, 'contentApiKey', 'contentApiKeyInstance', true);
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

        const spam = config.get('spam') || {};
        _.assignIn(module.exports, {
            spamPrivateBlock: spam.private_block || {},
            spamGlobalBlock: spam.global_block || {},
            spamGlobalReset: spam.global_reset || {},
            spamUserReset: spam.user_reset || {},
            spamUserLogin: spam.user_login || {},
            spamSendVerificationCode: spam.send_verification_code || {},
            spamUserVerification: spam.user_verification || {},
            spamMemberLogin: spam.member_login || {},
            spamContentApiKey: spam.content_api_key || {},
            spamOtcVerificationEnumeration: spam.otc_verification_enumeration || {},
            spamOtcVerification: spam.otc_verification || {}
        });
    }
};