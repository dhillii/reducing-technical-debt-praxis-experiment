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
    instanceName,
    instanceVarName,
    useMemoryStore = false,
    customStoreConfig = null
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    const store = customStoreConfig 
        ? customStoreConfig
        : (store || new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        }));

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    // Handle singleton pattern for specific instances
    if (instanceVarName && !global[instanceVarName]) {
        global[instanceVarName] = instance;
    }

    return instance;
};

const createBruteInstanceWithReset = (
    configObj,
    failCallback,
    instanceName,
    instanceVarName,
    useMemoryStore = false,
    customStoreConfig = null
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    const store = customStoreConfig 
        ? customStoreConfig
        : (store || new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        }));

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    // Handle singleton pattern for specific instances
    if (instanceVarName && !global[instanceVarName]) {
        global[instanceVarName] = instance;
    }

    return instance;
};

const createBruteInstanceNoReset = (
    configObj,
    failCallback,
    instanceName,
    instanceVarName,
    useMemoryStore = false,
    customStoreConfig = null
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    const store = customStoreConfig 
        ? customStoreConfig
        : (store || new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        }));

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    // Handle singleton pattern for specific instances
    if (instanceVarName && !global[instanceVarName]) {
        global[instanceVarName] = instance;
    }

    return instance;
};

const createMemoryBruteInstance = (
    configObj,
    failCallback,
    instanceName,
    instanceVarName
) => {
    const ExpressBrute = require('express-brute');

    const memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    const instance = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    // Handle singleton pattern for specific instances
    if (instanceVarName && !global[instanceVarName]) {
        global[instanceVarName] = instance;
    }

    return instance;
};

const getSpamConfig = () => {
    const spam = config.get('spam') || {};
    return {
        spamPrivateBlock: spam.private_block || {},
        spamGlobalBlock: spam.global_block || {},
        spamGlobalReset: spam.global_reset || {},
        spamUserReset: spam.user_reset || {},
        spamUserLogin: spam.user_login || {},
        spamSendVerificationCode: spam.send_verification_code || {},
        spamUserVerification: spam.user_verification || {},
        spamMemberLogin: spam.member_login || {},
        spamContentApiKey: spam.content_api_key || {},
        spamWebmentionsBlock: spam.webmentions_block || {},
        spamEmailPreviewBlock: spam.email_preview_block || {},
        spamOtcVerificationEnumeration: spam.otc_verification_enumeration || {},
        spamOtcVerification: spam.otc_verification || {}
    };
};

const getFailCallback = (config, type) => {
    const nextValidRequestDate = (req, res, next) => next;
    
    switch (type) {
        case 'forgottenPasswordIp':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            };
        case 'forgottenPasswordEmail':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: config.freeRetries + 1 || 5,
                        rfp: config.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
        case 'tooManySigninAttempts':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
        case 'tooManySigninAttemptsPrivate':
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
        case 'tooManyOTCVerificationAttempts':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
        case 'tooManyOTCCodeAttempts':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
        case 'tooManyLoginAttempts':
            return (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
        case 'tooManyAttempts':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
        case 'webmentionsBlock':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
        case 'emailPreviewBlock':
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
        default:
            return (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
    }
    };
};

const getSpamConfigValue = (key) => {
    const config = getSpamConfig();
    return {
        spamPrivateBlock: config.spamPrivateBlock,
        spamGlobalBlock: config.spamGlobalBlock,
        spamGlobalReset: config.spamGlobalReset,
        spamUserReset: config.spamUserReset,
        spamUserLogin: config.spamUserLogin,
        spamSendVerificationCode: config.spamSendVerificationCode,
        spamUserVerification: config.spamUserVerification,
        spamMemberLogin: config.spamMemberLogin,
        spamContentApiKey: config.spamContentApiKey,
        spamWebmentionsBlock: config.spamWebmentionsBlock,
        spamEmailPreviewBlock: config.spamEmailPreviewBlock,
        spamOtcVerificationEnumeration: config.spamOtcVerificationEnumeration,
        spamOtcVerification: config.spamOtcVerification
    }[key];
};

const getSpamInstanceName = (key) => {
    const instanceNames = {
        spamPrivateBlock: 'privateBlogInstance',
        spamGlobalBlock: 'globalBlockInstance',
        spamGlobalReset: 'globalResetInstance',
        spamUserReset: 'userResetInstance',
        spamUserLogin: 'userLoginInstance',
        spamSendVerificationCode: 'sendVerificationCodeInstance',
        spamUserVerification: 'userVerificationInstance',
        spamMemberLogin: 'membersAuthEnumerationInstance',
        spamContentApiKey: 'contentApiKeyInstance',
        spamWebmentionsBlock: 'webmentionsBlockInstance',
        spamEmailPreviewBlock: 'emailPreviewBlockInstance',
        spamOtcVerificationEnumeration: 'otcVerificationEnumerationInstance',
        spamOtcVerification: 'otcVerificationInstance'
    };
    return instanceNames[key];
};

const getSpamInstanceVarName = (key) => {
    const instanceVarNames = {
        spamPrivateBlock: 'privateBlogInstance',
        spamGlobalBlock: 'globalBlockInstance',
        spamGlobalReset: 'globalResetInstance',
        spamUserReset: 'userResetInstance',
        spamUserLogin: 'userLoginInstance',
        spamSendVerificationCode: 'sendVerificationCodeInstance',
        spamUserVerification: 'userVerificationInstance',
        spamMemberLogin: 'membersAuthEnumerationInstance',
        spamContentApiKey: 'contentApiKeyInstance',
        spamWebmentionsBlock: 'webmentionsBlockInstance',
        spamEmailPreviewBlock: 'emailPreviewBlockInstance',
        spamOtcVerificationEnumeration: 'otcVerificationEnumerationInstance',
        spamOtcVerification: 'otcVerificationInstance'
    };
    return instanceVarNames[key];
};

const getSpamInstanceType = (key) => {
    const instanceTypes = {
        spamPrivateBlock: 'reset',
        spamGlobalBlock: 'reset',
        spamGlobalReset: 'reset',
        spamUserReset: 'reset',
        spamUserLogin: 'reset',
        spamSendVerificationCode: 'reset',
        spamUserVerification: 'reset',
        spamMemberLogin: 'reset',
        spamContentApiKey: 'memory',
        spamWebmentionsBlock: 'no-reset',
        spamEmailPreviewBlock: 'no-reset',
        spamOtcVerificationEnumeration: 'no-reset',
        spamOtcVerification: 'no-reset'
    };
    return instanceTypes[key];
};

const createInstance = (key) => {
    const config = getSpamConfigValue(key);
    const instanceName = getSpamInstanceName(key);
    const instanceVarName = getSpamInstanceVarName(key);
    const instanceType = getSpamInstanceType(key);
    const failCallback = getFailCallback(config, instanceType);

    if (instanceType === 'memory') {
        return createMemoryBruteInstance(config, failCallback, instanceName, instanceVarName);
    } else if (instanceType === 'reset') {
        return createBruteInstanceWithReset(config, failCallback, instanceName, instanceVarName);
    } else {
        return createBruteInstanceNoReset(config, failCallback, instanceName, instanceVarName);
    }
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

    const spam = config.get('spam') || {};
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
    globalBlock: () => createInstance('spamGlobalBlock'),
    globalReset: () => createInstance('spamGlobalReset'),
    userLogin: () => createInstance('spamUserLogin'),
    sendVerificationCode: () => createInstance('spamSendVerificationCode'),
    userVerification: () => createInstance('spamUserVerification'),
    membersAuth: () => createInstance('spamUserLogin'),
    membersAuthEnumeration: () => createInstance('spamMemberLogin'),
    otcVerification: () => createInstance('spamOtcVerification'),
    otcVerificationEnumeration: () => createInstance('spamOtcVerificationEnumeration'),
    userReset: () => createInstance('spamUserReset'),
    privateBlog: () => createInstance('spamPrivateBlock'),
    contentApiKey: () => createInstance('spamContentApiKey'),
    webmentionsBlock: () => createInstance('spamWebmentionsBlock'),
    emailPreviewBlock: () => createInstance('spamEmailPreviewBlock'),
    reset
};