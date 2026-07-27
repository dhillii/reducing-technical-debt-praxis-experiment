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

const getMemoryStore = () => {
    if (!memoryStore) {
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

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

const createInstance = (key, {storeType = 'knex', attachReset = false, failBuilder, spamConfig}) => {
    if (instances[key]) {
        return instances[key];
    }

    const chosenStore = storeType === 'memory' ? getMemoryStore() : getStore();

    const brute = new ExpressBrute(chosenStore, extend({
        attachResetToRequest: attachReset,
        failCallback: failBuilder,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));

    instances[key] = brute;
    return brute;
};

/* Fail callback builders */
const genericFail = (msg, contextTpl, helpTpl) => (req, res, next, nextValid) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValid).fromNow(true)}`,
        context: tpl(contextTpl, msg),
        help: tpl(helpTpl)
    }));
};

const simpleFail = (message) => (req, res, next) => {
    return next(new errors.TooManyRequestsError({message}));
};

const privateBlogFail = (req, res, next, nextValid) => {
    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: (spam.private_block?.freeRetries ?? 5) + 1,
            rateSigninPeriod: spam.private_block?.lifetime ?? 3600
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));

    return next(new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValid).fromNow(true)}`
    }));
};

/* Exported factories */
const globalBlock = () => createInstance('globalBlock', {
    attachReset: false,
    failBuilder: genericFail(
        {rfa: (spam.global_block?.freeRetries ?? 5) + 1, rfp: spam.global_block?.lifetime ?? 3600},
        messages.forgottenPasswordIp.error,
        messages.tooManyAttempts
    ),
    spamConfig: spam.global_block || {}
});

const globalReset = () => createInstance('globalReset', {
    attachReset: false,
    failBuilder: genericFail(
        {rfa: (spam.global_reset?.freeRetries ?? 5) + 1, rfp: spam.global_reset?.lifetime ?? 3600},
        messages.forgottenPasswordIp.error,
        messages.forgottenPasswordIp.context
    ),
    spamConfig: spam.global_reset || {}
});

const webmentionsBlock = () => createInstance('webmentionsBlock', {
    attachReset: false,
    failBuilder: simpleFail(messages.webmentionsBlock),
    spamConfig: spam.webmentions_block || {}
});

const emailPreviewBlock = () => createInstance('emailPreviewBlock', {
    attachReset: false,
    failBuilder: simpleFail(messages.emailPreviewBlock),
    spamConfig: spam.email_preview_block || {}
});

const membersAuth = () => createInstance('membersAuth', {
    attachReset: true,
    failBuilder: (req, res, next, nextValid) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValid).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    spamConfig: spam.user_login || {}
});

const membersAuthEnumeration = () => createInstance('membersAuthEnumeration', {
    attachReset: true,
    failBuilder: (req, res, next, nextValid) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValid).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    spamConfig: spam.member_login || {}
});

const otcVerificationEnumeration = () => createInstance('otcVerificationEnumeration', {
    attachReset: false,
    failBuilder: (req, res, next, nextValid) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValid).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    },
    spamConfig: spam.otc_verification_enumeration || {}
});

const otcVerification = () => createInstance('otcVerification', {
    attachReset: false,
    failBuilder: (req, res, next, nextValid) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValid).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    },
    spamConfig: spam.otc_verification || {}
});

const userLogin = () => createInstance('userLogin', {
    attachReset: true,
    failBuilder: (req, res, next, nextValid) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValid).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    spamConfig: spam.user_login || {}
});

const userReset = () => createInstance('userReset', {
    attachReset: true,
    failBuilder: (req, res, next, nextValid) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValid).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: (spam.user_reset?.freeRetries ?? 5) + 1,
                rfp: spam.user_reset?.lifetime ?? 3600
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    },
    spamConfig: spam.user_reset || {}
});

const userVerification = () => createInstance('userVerification', {
    attachReset: true,
    failBuilder: (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    spamConfig: spam.user_verification || {}
});

const sendVerificationCode = () => createInstance('sendVerificationCode', {
    attachReset: true,
    failBuilder: (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    spamConfig: spam.send_verification_code || {}
});

const privateBlog = () => createInstance('privateBlog', {
    attachReset: false,
    failBuilder: privateBlogFail,
    spamConfig: spam.private_block || {}
});

const contentApiKey = () => {
    if (instances.contentApiKey) {
        return instances.contentApiKey;
    }
    const brute = new ExpressBrute(getMemoryStore(), extend({
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        handleStoreError
    }, pick(spam.content_api_key || {}, spamConfigKeys)));

    instances.contentApiKey = brute;
    return brute;
};

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