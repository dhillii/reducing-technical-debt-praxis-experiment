const moment = require('moment');
const {extend, pick} = require('lodash');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

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
let spam = config.get('spam') || {};

let store;
let memoryStore;
const instances = {};

const handleStoreError = err => {
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
    if (store) return store;
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');
    store = new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
    return store;
};

const getMemoryStore = () => {
    if (memoryStore) return memoryStore;
    const ExpressBrute = require('express-brute');
    memoryStore = new ExpressBrute.MemoryStore();
    return memoryStore;
};

const createInstance = (key, spamConfig, {attachReset = false, failCallback, storeFactory = getStore}) => {
    if (instances[key]) return instances[key];

    const ExpressBrute = require('express-brute');
    const storeInstance = storeFactory();

    instances[key] = new ExpressBrute(storeInstance, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));

    return instances[key];
};

const globalBlock = () => createInstance('globalBlock', spam.global_block || {}, {
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: (spam.global_block?.freeRetries ?? 5) + 1,
                rfp: spam.global_block?.lifetime ?? 3600
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    }
});

const globalReset = () => createInstance('globalReset', spam.global_reset || {}, {
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: (spam.global_reset?.freeRetries ?? 5) + 1,
                rfp: spam.global_reset?.lifetime ?? 3600
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }
});

const webmentionsBlock = () => createInstance('webmentionsBlock', spam.webmentions_block || {}, {
    failCallback: (req, res, next) => next(new errors.TooManyRequestsError({message: messages.webmentionsBlock}))
});

const emailPreviewBlock = () => createInstance('emailPreviewBlock', spam.email_preview_block || {}, {
    failCallback: (req, res, next) => next(new errors.TooManyRequestsError({message: messages.emailPreviewBlock}))
});

const membersAuth = () => createInstance('membersAuth', spam.user_login || {}, {
    attachReset: true,
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const membersAuthEnumeration = () => createInstance('membersAuthEnumeration', spam.member_login || {}, {
    attachReset: true,
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const otcVerificationEnumeration = () => createInstance('otcVerificationEnumeration', spam.otc_verification_enumeration || {}, {
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }
});

const otcVerification = () => createInstance('otcVerification', spam.otc_verification || {}, {
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }
});

const userLogin = () => createInstance('userLogin', spam.user_login || {}, {
    attachReset: true,
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
});

const userReset = () => createInstance('userReset', spam.user_reset || {}, {
    attachReset: true,
    failCallback: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: (spam.user_reset?.freeRetries ?? 5) + 1,
                rfp: spam.user_reset?.lifetime ?? 3600
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }
});

const userVerification = () => createInstance('userVerification', spam.user_verification || {}, {
    attachReset: true,
    failCallback: (req, res, next) => next(new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)}))
});

const sendVerificationCode = () => createInstance('sendVerificationCode', spam.send_verification_code || {}, {
    attachReset: true,
    failCallback: (req, res, next) => next(new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)}))
});

const privateBlog = () => createInstance('privateBlog', spam.private_block || {}, {
    failCallback: (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: (spam.private_block?.freeRetries ?? 5) + 1,
                rateSigninPeriod: spam.private_block?.lifetime ?? 3600
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
});

const contentApiKey = () => {
    const key = 'contentApiKey';
    if (instances[key]) return instances[key];

    const ExpressBrute = require('express-brute');
    const storeInstance = getMemoryStore();

    instances[key] = new ExpressBrute(storeInstance, extend({
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)});
            logging.error(err);
            return next(err);
        },
        handleStoreError
    }, pick(spam.content_api_key || {}, spamConfigKeys)));

    return instances[key];
};

const reset = () => {
    Object.keys(instances).forEach(k => delete instances[k]);
    store = undefined;
    memoryStore = undefined;
    spam = config.get('spam') || {};
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