const moment = require('moment');
const { extend, pick } = require('lodash');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const spam = config.get('spam') || {};

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

let store;
let memoryStore;
const instances = {};

const getStore = () => {
    if (!store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

const createBruteInstance = (configObj, customOptions = {}) => {
    const ExpressBrute = require('express-brute');
    const baseOptions = {
        attachResetToRequest: false,
        handleStoreError
    };
    const options = extend(baseOptions, pick(configObj, spamConfigKeys), customOptions);
    return new ExpressBrute(getStore(), options);
};

const createMemoryBruteInstance = (configObj, customOptions = {}) => {
    const ExpressBrute = require('express-brute');
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    const baseOptions = {
        attachResetToRequest: false,
        handleStoreError
    };
    const options = extend(baseOptions, pick(configObj, spamConfigKeys), customOptions);
    return new ExpressBrute(memoryStore, options);
};

const failCallbackFactory = (messageFn) => (req, res, next, nextValidRequestDate) => {
    const err = new errors.TooManyRequestsError({
        message: messageFn(nextValidRequestDate),
        context: messageFn.context,
        help: messageFn.help
    });
    next(err);
};

const globalBlock = () => {
    if (!instances.globalBlock) {
        const configObj = spam.global_block || {};
        const messageFn = (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.forgottenPasswordIp.error, {
            rfa: configObj.freeRetries + 1 || 5,
            rfp: configObj.lifetime || 60 * 60
        });
        messageFn.help = tpl(messages.tooManyAttempts);
        instances.globalBlock = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.globalBlock;
};

const globalReset = () => {
    if (!instances.globalReset) {
        const configObj = spam.global_reset || {};
        const messageFn = (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.forgottenPasswordIp.error, {
            rfa: configObj.freeRetries + 1 || 5,
            rfp: configObj.lifetime || 60 * 60
        });
        messageFn.help = tpl(messages.forgottenPasswordIp.context);
        instances.globalReset = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.globalReset;
};

const webmentionsBlock = () => {
    if (!instances.webmentionsBlock) {
        const configObj = spam.webmentions_block || {};
        const messageFn = () => messages.webmentionsBlock;
        messageFn.context = null;
        messageFn.help = null;
        instances.webmentionsBlock = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.webmentionsBlock;
};

const emailPreviewBlock = () => {
    if (!instances.emailPreviewBlock) {
        const configObj = spam.email_preview_block || {};
        const messageFn = () => messages.emailPreviewBlock;
        messageFn.context = null;
        messageFn.help = null;
        instances.emailPreviewBlock = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.emailPreviewBlock;
};

const membersAuth = () => {
    if (!instances.membersAuth) {
        const configObj = spam.user_login || {};
        const messageFn = (nextValidRequestDate) => `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.tooManySigninAttempts.context);
        messageFn.help = tpl(messages.tooManySigninAttempts.context);
        instances.membersAuth = createBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.membersAuth;
};

const membersAuthEnumeration = () => {
    if (!instances.membersAuthEnumeration) {
        const configObj = spam.member_login || {};
        const messageFn = (nextValidRequestDate) => `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.tooManySigninAttempts.context);
        messageFn.help = tpl(messages.tooManySigninAttempts.context);
        instances.membersAuthEnumeration = createBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.membersAuthEnumeration;
};

const otcVerificationEnumeration = () => {
    if (!instances.otcVerificationEnumeration) {
        const configObj = spam.otc_verification_enumeration || {};
        const messageFn = (nextValidRequestDate) => `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.tooManyOTCVerificationAttempts.context);
        messageFn.help = tpl(messages.tooManyOTCVerificationAttempts.context);
        messageFn.code = 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED';
        instances.otcVerificationEnumeration = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.otcVerificationEnumeration;
};

const otcVerification = () => {
    if (!instances.otcVerification) {
        const configObj = spam.otc_verification || {};
        const messageFn = (nextValidRequestDate) => `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.tooManyOTCVerificationAttempts.context);
        messageFn.help = tpl(messages.tooManyOTCVerificationAttempts.context);
        messageFn.code = 'OTC_CODE_ATTEMPTS_RATE_LIMITED';
        instances.otcVerification = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.otcVerification;
};

const userLogin = () => {
    if (!instances.userLogin) {
        const configObj = spam.user_login || {};
        const messageFn = (nextValidRequestDate) => `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`;
        messageFn.context = tpl(messages.tooManySigninAttempts.context);
        messageFn.help = tpl(messages.tooManySigninAttempts.context);
        instances.userLogin = createBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.userLogin;
};

const userReset = () => {
    if (!instances.userReset) {
        const configObj = spam.user_reset || {};
        const messageFn = (nextValidRequestDate) => `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.forgottenPasswordEmail.error, {
            rfa: configObj.freeRetries + 1 || 5,
            rfp: configObj.lifetime || 60 * 60
        });
        messageFn.help = tpl(messages.forgottenPasswordEmail.context);
        instances.userReset = createBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.userReset;
};

const userVerification = () => {
    if (!instances.userVerification) {
        const configObj = spam.user_verification || {};
        const messageFn = () => tpl(messages.tooManyAttempts);
        messageFn.context = null;
        messageFn.help = null;
        instances.userVerification = createBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.userVerification;
};

const sendVerificationCode = () => {
    if (!instances.sendVerificationCode) {
        const configObj = spam.send_verification_code || {};
        const messageFn = () => tpl(messages.tooManyAttempts);
        messageFn.context = null;
        messageFn.help = null;
        instances.sendVerificationCode = createBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.sendVerificationCode;
};

const privateBlog = () => {
    if (!instances.privateBlog) {
        const configObj = spam.private_block || {};
        const messageFn = (nextValidRequestDate) => `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        messageFn.context = tpl(messages.tooManySigninAttempts.context);
        messageFn.help = null;
        instances.privateBlog = createBruteInstance(configObj, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: configObj.freeRetries + 1 || 5,
                        rateSigninPeriod: configObj.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));
                next(new errors.TooManyRequestsError({
                    message: messageFn(nextValidRequestDate)
                }));
            }
        });
    }
    return instances.privateBlog;
};

const contentApiKey = () => {
    if (!instances.contentApiKey) {
        const configObj = spam.content_api_key || {};
        const messageFn = () => tpl(messages.tooManyAttempts);
        messageFn.context = null;
        messageFn.help = null;
        instances.contentApiKey = createMemoryBruteInstance(configObj, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(messageFn)
        });
    }
    return instances.contentApiKey;
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
        Object.keys(instances).forEach(key => {
            instances[key] = undefined;
        });

        const newSpam = config.get('spam') || {};
        spam.private_block = newSpam.private_block || {};
        spam.global_block = newSpam.global_block || {};
        spam.global_reset = newSpam.global_reset || {};
        spam.user_reset = newSpam.user_reset || {};
        spam.user_login = newSpam.user_login || {};
        spam.send_verification_code = newSpam.send_verification_code || {};
        spam.user_verification = newSpam.user_verification || {};
        spam.member_login = newSpam.member_login || {};
        spam.content_api_key = newSpam.content_api_key || {};
        spam.otc_verification_enumeration = newSpam.otc_verification_enumeration || {};
        spam.otc_verification = newSpam.otc_verification || {};
    }
};