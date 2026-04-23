const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

const spam = config.get('spam') || {};

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

let spamPrivateBlock = spam.private_block || {};
let spamGlobalBlock = spam.global_block || {};
let spamGlobalReset = spam.global_reset || {};
let spamUserReset = spam.user_reset || {};
let spamUserLogin = spam.user_login || {};
let spamSendVerificationCode = spam.send_verification_code || {};
let spamUserVerification = spam.user_verification || {};
let spamMemberLogin = spam.member_login || {};
let spamContentApiKey = spam.content_api_key || {};
let spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
let spamOtcVerification = spam.otc_verification || {};

let store;
let memoryStore;
const instances = {};

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

const getStore = () => {
    if (!store) {
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

const createInstance = (name, configObj, customOptions = {}) => {
    if (!instances[name]) {
        const baseOptions = {
            attachResetToRequest: false,
            handleStoreError
        };
        const options = extend(baseOptions, pick(configObj, spamConfigKeys), customOptions);
        instances[name] = new ExpressBrute(getStore(), options);
    }
    return instances[name];
};

const globalBlock = () => createInstance('globalBlock', spamGlobalBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    }
});

const globalReset = () => createInstance('globalReset', spamGlobalReset, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }
});

const webmentionsBlock = () => createInstance('webmentionsBlock', spamWebmentionsBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    }
});

const emailPreviewBlock = () => createInstance('emailPreviewBlock', spamEmailPreviewBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    }
});

const membersAuth = () => createInstance('membersAuth', spamUserLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const membersAuthEnumeration = () => createInstance('membersAuthEnumeration', spamMemberLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const otcVerificationEnumeration = () => createInstance('otcVerificationEnumeration', spamOtcVerificationEnumeration, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }
});

const otcVerification = () => createInstance('otcVerification', spamOtcVerification, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }
});

const userLogin = () => createInstance('userLogin', spamUserLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const userReset = () => createInstance('userReset', spamUserReset, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }
});

const userVerification = () => createInstance('userVerification', spamUserVerification, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }
});

const sendVerificationCode = () => createInstance('sendVerificationCode', spamSendVerificationCode, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }
});

const privateBlog = () => createInstance('privateBlog', spamPrivateBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
});

const contentApiKey = () => {
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    if (!instances.contentApiKey) {
        instances.contentApiKey = new ExpressBrute(memoryStore, {
            attachResetToRequest: true,
            handleStoreError,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                next(err);
            }
        });
    }
    return instances.contentApiKey;
};

const reset = () => {
    store = undefined;
    memoryStore = undefined;
    Object.keys(instances).forEach(key => delete instances[key]);

    const newSpam = config.get('spam') || {};
    spam = newSpam;
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