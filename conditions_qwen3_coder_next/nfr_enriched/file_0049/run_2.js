const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

let spam = config.get('spam') || {};
let store;
let memoryStore;
let instances = {};

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

const createBruteKnexStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    return new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

const createMemoryStore = () => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute.MemoryStore();
};

const createFailCallback = (message, context, help, errorCode = null) => {
    return (req, res, next, nextValidRequestDate) => {
        const errorMsg = typeof message === 'function'
            ? message(nextValidRequestDate)
            : message;

        const errorOptions = {
            message: errorMsg,
            context: context || tpl(messages.tooManyAttempts),
            help: help || tpl(messages.tooManyAttempts)
        };

        if (errorCode) {
            errorOptions.code = errorCode;
        }

        return next(new errors.TooManyRequestsError(errorOptions));
    };
};

const createBruteMiddleware = (instanceKey, storeFactory, configKey, options) => {
    const ExpressBrute = require('express-brute');
    const configSection = spam[configKey] || {};
    const store = storeFactory();
    
    instances[instanceKey] = instances[instanceKey] || new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback: createFailCallback(options.message, options.context, options.help, options.errorCode),
        handleStoreError: (err) => {
            const customError = new errors.InternalServerError({
                message: 'Unknown error',
                err: err.parent ? err.parent : err
            });

            if (!err.next) {
                logging.error(err);
                return;
            }

            err.next(customError);
        }
    }, pick(configSection, spamConfigKeys)));

    return instances[instanceKey];
};

const globalBlock = () => {
    return createBruteMiddleware('globalBlock', createBruteKnexStore, 'global_block', {
        message: (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: (spam.global_block?.freeRetries || 0) + 1,
            rfp: (spam.global_block?.lifetime || 3600) / 60
        }),
        help: tpl(messages.tooManyAttempts)
    });
};

const globalReset = () => {
    return createBruteMiddleware('globalReset', createBruteKnexStore, 'global_reset', {
        message: (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: (spam.global_reset?.freeRetries || 0) + 1,
            rfp: (spam.global_reset?.lifetime || 3600) / 60
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    });
};

const userLogin = () => {
    return createBruteMiddleware('userLogin', createBruteKnexStore, 'user_login', {
        message: (nextValidRequestDate) => `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });
};

const membersAuth = () => {
    return createBruteMiddleware('membersAuth', createBruteKnexStore, 'member_login', {
        message: (nextValidRequestDate) => `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });
};

const membersAuthEnumeration = () => {
    return createBruteMiddleware('membersAuthEnumeration', createBruteKnexStore, 'member_login', {
        message: (nextValidRequestDate) => `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });
};

const userReset = () => {
    return createBruteMiddleware('userReset', createBruteKnexStore, 'user_reset', {
        message: (nextValidRequestDate) => `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: (spam.user_reset?.freeRetries || 0) + 1,
            rfp: (spam.user_reset?.lifetime || 3600) / 60
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    });
};

const userVerification = () => {
    return createBruteMiddleware('userVerification', createBruteKnexStore, 'user_verification', {
        message: tpl(messages.tooManyAttempts),
        context: tpl(messages.tooManyAttempts)
    });
};

const sendVerificationCode = () => {
    return createBruteMiddleware('sendVerificationCode', createBruteKnexStore, 'send_verification_code', {
        message: tpl(messages.tooManyAttempts),
        context: tpl(messages.tooManyAttempts)
    });
};

const privateBlog = () => {
    return createBruteMiddleware('privateBlog', createBruteKnexStore, 'private_block', {
        message: (nextValidRequestDate) => `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        handleLogging: true
    });
};

const contentApiKey = () => {
    return createBruteMiddleware('contentApiKey', createMemoryStore, 'content_api_key', {
        message: tpl(messages.tooManyAttempts),
        context: tpl(messages.tooManyAttempts)
    });
};

const webmentionsBlock = () => {
    return createBruteMiddleware('webmentionsBlock', createBruteKnexStore, 'webmentions_block', {
        message: messages.webmentionsBlock,
        context: messages.webmentionsBlock
    });
};

const emailPreviewBlock = () => {
    return createBruteMiddleware('emailPreviewBlock', createBruteKnexStore, 'email_preview_block', {
        message: messages.emailPreviewBlock,
        context: messages.emailPreviewBlock
    });
};

const otcVerificationEnumeration = () => {
    return createBruteMiddleware('otcVerificationEnumeration', createBruteKnexStore, 'otc_verification_enumeration', {
        message: (nextValidRequestDate) => `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        errorCode: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    });
};

const otcVerification = () => {
    return createBruteMiddleware('otcVerification', createBruteKnexStore, 'otc_verification', {
        message: (nextValidRequestDate) => `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        errorCode: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    });
};

const resetInstances = () => {
    store = undefined;
    memoryStore = undefined;
    instances = {};

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
    reset: resetInstances
};