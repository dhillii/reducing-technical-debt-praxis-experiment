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
    const nextValidRequestDate = (req, res, next) => next;

    switch (type) {
        case 'globalBlock':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: configObj.freeRetries + 1 || 5,
                        rfp: configObj.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            };
        case 'globalReset':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: configObj.freeRetries + 1 || 5,
                        rfp: configObj.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            };
        case 'webmentionsBlock':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            };
        case 'emailPreviewBlock':
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
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: configObj.freeRetries + 1 || 5,
                        rfp: configObj.lifetime || 60 * 60
                    }),
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
                        rateSigninAttempts: configObj.freeRetries + 1 || 5,
                        rateSigninPeriod: configObj.lifetime || 60 * 60
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

const spamConfig = config.get('spam') || {};
const spamPrivateBlock = spamConfig.private_block || {};
const spamGlobalBlock = spamConfig.global_block || {};
const spamGlobalReset = spamConfig.global_reset || {};
const spamUserReset = spamConfig.user_reset || {};
const spamUserLogin = spamConfig.user_login || {};
const spamSendVerificationCode = spamConfig.send_verification_code || {};
const spamUserVerification = spamConfig.user_verification || {};
const spamMemberLogin = spamConfig.member_login || {};
const spamContentApiKey = spamConfig.content_api_key || {};
const spamWebmentionsBlock = spamConfig.webmentions_block || {};
const spamEmailPreviewBlock = spamConfig.email_preview_block || {};
const spamOtcVerificationEnumeration = spamConfig.otc_verification_enumeration || {};
const spamOtcVerification = spamConfig.otc_verification || {};

const getSpamConfig = (key) => {
    const configs = {
        privateBlock: spamPrivateBlock,
        globalBlock: spamGlobalBlock,
        globalReset: spamGlobalReset,
        userReset: spamUserReset,
        userLogin: spamUserLogin,
        sendVerificationCode: spamSendVerificationCode,
        userVerification: spamUserVerification,
        memberLogin: spamMemberLogin,
        contentApiKey: spamContentApiKey,
        webmentionsBlock: spamWebmentionsBlock,
        emailPreviewBlock: spamEmailPreviewBlock,
        otcVerificationEnumeration: spamOtcVerificationEnumeration,
        otcVerification: spamOtcVerification
    };
    return configs[key];
};

const getInstanceVarName = (key) => {
    const map = {
        privateBlock: 'privateBlogInstance',
        globalBlock: 'globalBlockInstance',
        globalReset: 'globalResetInstance',
        userReset: 'userResetInstance',
        userLogin: 'userLoginInstance',
        sendVerificationCode: 'sendVerificationCodeInstance',
        userVerification: 'userVerificationInstance',
        memberLogin: 'membersAuthInstance',
        contentApiKey: 'contentApiKeyInstance',
        webmentionsBlock: 'webmentionsBlockInstance',
        emailPreviewBlock: 'emailPreviewBlockInstance',
        otcVerificationEnumeration: 'otcVerificationEnumerationInstance',
        otcVerification: 'otcVerificationInstance'
    };
    return map[key];
};

const createInstance = (key) => {
    const configObj = getSpamConfig(key);
    const instanceVarName = getInstanceVarName(key);
    const failCallback = getFailCallback(key, configObj);
    const isMemoryStore = key === 'contentApiKey';

    if (!failCallback) {
        return null;
    }

    if (isMemoryStore) {
        return createMemoryBruteInstance(configObj, failCallback, key, instanceVarName);
    }

    return createBruteInstance(configObj, failCallback, store, instanceVarName);
};

const globalBlock = () => {
    const instance = createInstance('globalBlock');
    if (instance) {
        globalBlockInstance = instance;
    }
    return globalBlockInstance;
};

const globalReset = () => {
    const instance = createInstance('globalReset');
    if (instance) {
        globalResetInstance = instance;
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    const instance = createInstance('webmentionsBlock');
    if (instance) {
        webmentionsBlockInstance = instance;
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const instance = createInstance('emailPreviewBlock');
    if (instance) {
        emailPreviewBlockInstance = instance;
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const instance = createInstance('userLogin');
    if (instance) {
        membersAuthInstance = instance;
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const instance = createInstance('memberLogin');
    if (instance) {
        membersAuthEnumerationInstance = instance;
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const instance = createInstance('otcVerificationEnumeration');
    if (instance) {
        otcVerificationEnumerationInstance = instance;
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const instance = createInstance('otcVerification');
    if (instance) {
        otcVerificationInstance = instance;
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    const instance = createInstance('userLogin');
    if (instance) {
        userLoginInstance = instance;
    }
    return userLoginInstance;
};

const userReset = () => {
    const instance = createInstance('userReset');
    if (instance) {
        userResetInstance = instance;
    }
    return userResetInstance;
};

const userVerification = () => {
    const instance = createInstance('userVerification');
    if (instance) {
        userVerificationInstance = instance;
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const instance = createInstance('sendVerificationCode');
    if (instance) {
        sendVerificationCodeInstance = instance;
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const instance = createInstance('privateBlock');
    if (instance) {
        privateBlogInstance = instance;
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    const instance = createInstance('contentApiKey');
    if (instance) {
        contentApiKeyInstance = instance;
    }
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

    const newSpamConfig = config.get('spam') || {};
    const newSpamPrivateBlock = newSpamConfig.private_block || {};
    const newSpamGlobalBlock = newSpamConfig.global_block || {};
    const newSpamGlobalReset = newSpamConfig.global_reset || {};
    const newSpamUserReset = newSpamConfig.user_reset || {};
    const newSpamUserLogin = newSpamConfig.user_login || {};
    const newSpamSendVerificationCode = newSpamConfig.send_verification_code || {};
    const newSpamUserVerification = newSpamConfig.user_verification || {};
    const newSpamMemberLogin = newSpamConfig.member_login || {};
    const newSpamContentApiKey = newSpamConfig.content_api_key || {};
    const newSpamWebmentionsBlock = newSpamConfig.webmentions_block || {};
    const newSpamEmailPreviewBlock = newSpamConfig.email_preview_block || {};
    const newSpamOtcVerificationEnumeration = newSpamConfig.otc_verification_enumeration || {};
    const newSpamOtcVerification = newSpamConfig.otc_verification || {};

    spamConfig = newSpamConfig;
    spamPrivateBlock = newSpamPrivateBlock;
    spamGlobalBlock = newSpamGlobalBlock;
    spamGlobalReset = newSpamGlobalReset;
    spamUserReset = newSpamUserReset;
    spamUserLogin = newSpamUserLogin;
    spamSendVerificationCode = newSpamSendVerificationCode;
    spamUserVerification = newSpamUserVerification;
    spamMemberLogin = newSpamMemberLogin;
    spamContentApiKey = newSpamContentApiKey;
    spamWebmentionsBlock = newSpamWebmentionsBlock;
    spamEmailPreviewBlock = newSpamEmailPreviewBlock;
    spamOtcVerificationEnumeration = newSpamOtcVerificationEnumeration;
    spamOtcVerification = newSpamOtcVerification;
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
    reset
};