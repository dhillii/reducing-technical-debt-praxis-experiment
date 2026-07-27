const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
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

const spamPrivateBlock = spam.private_block || {};
const spamGlobalBlock = spam.global_block || {};
const spamGlobalReset = spam.global_reset || {};
const spamUserReset = spam.user_reset || {};
const spamUserLogin = spam.user_login || {};
const spamSendVerificationCode = spam.send_verification_code || {};
const spamUserVerification = spam.user_verification || {};
const spamMemberLogin = spam.member_login || {};
const spamContentApiKey = spam.content_api_key || {};
const spamWebmentionsBlock = spam.webmentions_block || {};
const spamEmailPreviewBlock = spam.email_preview_block || {};
const spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
const spamOtcVerification = spam.otc_verification || {};

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

let store;
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

const getInstance = (name, configObj, failCallback, attachReset = true) => {
    if (!instances[name]) {
        const ExpressBrute = require('express-brute');
        instances[name] = new ExpressBrute(getStore(), extend({
            attachResetToRequest: attachReset,
            failCallback,
            handleStoreError
        }, pick(configObj, spamConfigKeys)));
    }
    return instances[name];
};

const globalBlock = () => {
    return getInstance('globalBlock', spamGlobalBlock, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    }, false);
};

const globalReset = () => {
    return getInstance('globalReset', spamGlobalReset, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }, false);
};

const webmentionsBlock = () => {
    return getInstance('webmentionsBlock', spamWebmentionsBlock, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    }, false);
};

const emailPreviewBlock = () => {
    return getInstance('emailPreviewBlock', spamEmailPreviewBlock, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    }, false);
};

const membersAuth = () => {
    return getInstance('membersAuth', spamUserLogin, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }, true);
};

const membersAuthEnumeration = () => {
    return getInstance('membersAuthEnumeration', spamMemberLogin, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }, true);
};

const otcVerificationEnumeration = () => {
    return getInstance('otcVerificationEnumeration', spamOtcVerificationEnumeration, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }, false);
};

const otcVerification = () => {
    return getInstance('otcVerification', spamOtcVerification, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }, false);
};

const userLogin = () => {
    return getInstance('userLogin', spamUserLogin, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }, true);
};

const userReset = () => {
    return getInstance('userReset', spamUserReset, (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }, true);
};

const userVerification = () => {
    return getInstance('userVerification', spamUserVerification, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }, true);
};

const sendVerificationCode = () => {
    return getInstance('sendVerificationCode', spamSendVerificationCode, (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }, true);
};

const privateBlog = () => {
    return getInstance('privateBlog', spamPrivateBlock, (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }, false);
};

const contentApiKey = () => {
    if (!instances.contentApiKey) {
        const ExpressBrute = require('express-brute');
        const memoryStore = new ExpressBrute.MemoryStore();
        instances.contentApiKey = new ExpressBrute(memoryStore, extend({
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                return next(err);
            },
            handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys)));
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
        Object.keys(instances).forEach(key => {
            instances[key] = undefined;
        });

        const newSpam = config.get('spam') || {};
        spamPrivateBlock = newSpam.private_block || {};
        spamGlobalBlock = newSpam.global_block || {};
        spamGlobalReset = newSpam.global_reset || {};
        spamUserReset = newSpam.user_reset || {};
        spamUserLogin = newSpam.user_login || {};
        spamSendVerificationCode = newSpam.send_verification_code || {};
        spamUserVerification = newSpam.user_verification || {};
        spamMemberLogin = newSpam.member_login || {};
        spamContentApiKey = newSpam.content_api_key || {};
        spamOtcVerificationEnumeration = newSpam.otc_verification_enumeration || {};
        spamOtcVerification = newSpam.otc_verification || {};
    }
};