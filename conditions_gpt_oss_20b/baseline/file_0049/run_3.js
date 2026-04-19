const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const db = require('../../../../data/db');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');

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

const spamConfigs = {
    privateBlock: spam.private_block || {},
    globalBlock: spam.global_block || {},
    globalReset: spam.global_reset || {},
    userReset: spam.user_reset || {},
    userLogin: spam.user_login || {},
    sendVerificationCode: spam.send_verification_code || {},
    userVerification: spam.user_verification || {},
    memberLogin: spam.member_login || {},
    contentApiKey: spam.content_api_key || {},
    otcVerificationEnumeration: spam.otc_verification_enumeration || {},
    otcVerification: spam.otc_verification || {},
    webmentionsBlock: spam.webmentions_block || {},
    emailPreviewBlock: spam.email_preview_block || {}
};

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
        const options = extend(
            {
                attachResetToRequest: false,
                handleStoreError
            },
            customOptions,
            pick(configObj, spamConfigKeys)
        );
        instances[name] = new ExpressBrute(getStore(), options);
    }
    return instances[name];
};

const createMemoryInstance = (name, configObj, customOptions = {}) => {
    if (!instances[name]) {
        if (!memoryStore) {
            memoryStore = new ExpressBrute.MemoryStore();
        }
        const options = extend(
            {
                attachResetToRequest: true,
                handleStoreError
            },
            customOptions,
            pick(configObj, spamConfigKeys)
        );
        instances[name] = new ExpressBrute(memoryStore, options);
    }
    return instances[name];
};

const globalBlock = () => createInstance('globalBlock', spamConfigs.globalBlock, {
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfigs.globalBlock.freeRetries + 1 || 5,
                rfp: spamConfigs.globalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    }
});

const globalReset = () => createInstance('globalReset', spamConfigs.globalReset, {
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfigs.globalReset.freeRetries + 1 || 5,
                rfp: spamConfigs.globalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }
});

const webmentionsBlock = () => createInstance('webmentionsBlock', spamConfigs.webmentionsBlock, {
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    }
});

const emailPreviewBlock = () => createInstance('emailPreviewBlock', spamConfigs.emailPreviewBlock, {
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    }
});

const membersAuth = () => createInstance('membersAuth', spamConfigs.userLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const membersAuthEnumeration = () => createInstance('membersAuthEnumeration', spamConfigs.memberLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const otcVerificationEnumeration = () => createInstance('otcVerificationEnumeration', spamConfigs.otcVerificationEnumeration, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }
});

const otcVerification = () => createInstance('otcVerification', spamConfigs.otcVerification, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }
});

const userLogin = () => createInstance('userLogin', spamConfigs.userLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const userReset = () => createInstance('userReset', spamConfigs.userReset, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamConfigs.userReset.freeRetries + 1 || 5,
                rfp: spamConfigs.userReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }
});

const userVerification = () => createInstance('userVerification', spamConfigs.userVerification, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }
});

const sendVerificationCode = () => createInstance('sendVerificationCode', spamConfigs.sendVerificationCode, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }
});

const privateBlog = () => createInstance('privateBlog', spamConfigs.privateBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamConfigs.privateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamConfigs.privateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
});

const contentApiKey = () => createMemoryInstance('contentApiKey', spamConfigs.contentApiKey, {
    failCallback(req, res, next) {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    }
});

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
        Object.keys(instances).forEach(key => delete instances[key]);

        const newSpam = config.get('spam') || {};
        Object.assign(spamConfigs, {
            privateBlock: newSpam.private_block || {},
            globalBlock: newSpam.global_block || {},
            globalReset: newSpam.global_reset || {},
            userReset: newSpam.user_reset || {},
            userLogin: newSpam.user_login || {},
            sendVerificationCode: newSpam.send_verification_code || {},
            userVerification: newSpam.user_verification || {},
            memberLogin: newSpam.member_login || {},
            contentApiKey: newSpam.content_api_key || {},
            otcVerificationEnumeration: newSpam.otc_verification_enumeration || {},
            otcVerification: newSpam.otc_verification || {},
            webmentionsBlock: newSpam.webmentions_block || {},
            emailPreviewBlock: newSpam.email_preview_block || {}
        });
    }
};