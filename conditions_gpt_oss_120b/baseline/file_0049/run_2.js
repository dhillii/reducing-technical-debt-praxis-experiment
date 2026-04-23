const moment = require('moment');
const {extend, pick} = require('lodash');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];
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

const getKnexStore = () => {
    if (!store) {
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

const getMemoryStore = () => {
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

const createInstance = (key, configObj, opts = {}) => {
    if (instances[key]) {
        return instances[key];
    }

    const isMemory = opts.memory;
    const storeInstance = isMemory ? getMemoryStore() : getKnexStore();

    const brute = new ExpressBrute(storeInstance, extend({
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            const msg = opts.message || 'Too many attempts';
            const err = new errors.TooManyRequestsError({
                message: typeof msg === 'function' ? msg(req, nextValidRequestDate) : msg,
                context: opts.context ? tpl(opts.context) : undefined,
                help: opts.help ? tpl(opts.help) : undefined,
                code: opts.code
            });
            if (opts.logError) {
                logging.error(err);
            }
            return next(err);
        },
        handleStoreError
    }, pick(configObj, spamConfigKeys)));

    instances[key] = brute;
    return brute;
};

const globalBlock = () => createInstance('globalBlock', spam.global_block, {
    message: (req, date) => `Too many attempts try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.forgottenPasswordIp.error, {
        rfa: (spam.global_block.freeRetries || 4) + 1,
        rfp: spam.global_block.lifetime || 3600
    }),
    help: tpl(messages.tooManyAttempts)
});

const globalReset = () => createInstance('globalReset', spam.global_reset, {
    message: (req, date) => `Too many attempts try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.forgottenPasswordIp.error, {
        rfa: (spam.global_reset.freeRetries || 4) + 1,
        rfp: spam.global_reset.lifetime || 3600
    }),
    help: tpl(messages.forgottenPasswordIp.context)
});

const webmentionsBlock = () => createInstance('webmentionsBlock', spam.webmentions_block, {
    message: messages.webmentionsBlock
});

const emailPreviewBlock = () => createInstance('emailPreviewBlock', spam.email_preview_block, {
    message: messages.emailPreviewBlock
});

const membersAuth = () => createInstance('membersAuth', spam.user_login, {
    attachResetToRequest: true,
    message: (req, date) => `Too many sign-in attempts try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.tooManySigninAttempts.context),
    help: tpl(messages.tooManySigninAttempts.context)
});

const membersAuthEnumeration = () => createInstance('membersAuthEnumeration', spam.member_login, {
    attachResetToRequest: true,
    message: (req, date) => `Too many different sign-in attempts, try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.tooManySigninAttempts.context),
    help: tpl(messages.tooManySigninAttempts.context)
});

const otcVerificationEnumeration = () => createInstance('otcVerificationEnumeration', spam.otc_verification_enumeration, {
    message: (req, date) => `Too many verification attempts across multiple codes, try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.tooManyOTCVerificationAttempts.context),
    help: tpl(messages.tooManyOTCVerificationAttempts.context),
    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
});

const otcVerification = () => createInstance('otcVerification', spam.otc_verification, {
    message: (req, date) => `Too many attempts for this verification code, try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.tooManyOTCVerificationAttempts.context),
    help: tpl(messages.tooManyOTCVerificationAttempts.context),
    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
});

const userLogin = () => createInstance('userLogin', spam.user_login, {
    attachResetToRequest: true,
    message: (req, date) => `Too many login attempts. Please wait ${moment(date).fromNow(true)} before trying again, or reset your password.`,
    context: tpl(messages.tooManySigninAttempts.context),
    help: tpl(messages.tooManySigninAttempts.context)
});

const userReset = () => createInstance('userReset', spam.user_reset, {
    attachResetToRequest: true,
    message: (req, date) => `Too many password reset attempts try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.forgottenPasswordEmail.error, {
        rfa: (spam.user_reset.freeRetries || 4) + 1,
        rfp: spam.user_reset.lifetime || 3600
    }),
    help: tpl(messages.forgottenPasswordEmail.context)
});

const userVerification = () => createInstance('userVerification', spam.user_verification, {
    attachResetToRequest: true,
    message: tpl(messages.tooManyAttempts)
});

const sendVerificationCode = () => createInstance('sendVerificationCode', spam.send_verification_code, {
    attachResetToRequest: true,
    message: tpl(messages.tooManyAttempts)
});

const privateBlog = () => createInstance('privateBlog', spam.private_block, {
    message: (req, date) => `Too many private sign-in attempts try again in ${moment(date).fromNow(true)}`,
    context: tpl(messages.tooManySigninAttempts.error, {
        rateSigninAttempts: (spam.private_block.freeRetries || 4) + 1,
        rateSigninPeriod: spam.private_block.lifetime || 3600
    }),
    logError: true
});

const contentApiKey = () => createInstance('contentApiKey', spam.content_api_key, {
    memory: true,
    attachResetToRequest: true,
    message: tpl(messages.tooManyAttempts),
    logError: true
});

const reset = () => {
    store = undefined;
    memoryStore = undefined;
    Object.keys(instances).forEach(k => delete instances[k]);

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