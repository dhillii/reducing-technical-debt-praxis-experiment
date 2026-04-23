const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
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

let store;
let memoryStore;
let instances = {};
let spamConfig = {};

const initializeSpamConfig = () => {
    const spam = config.get('spam') || {};
    spamConfig = {
        privateBlock: spam.private_block || {},
        globalBlock: spam.global_block || {},
        globalReset: spam.global_reset || {},
        userReset: spam.user_reset || {},
        userLogin: spam.user_login || {},
        sendVerificationCode: spam.send_verification_code || {},
        userVerification: spam.user_verification || {},
        memberLogin: spam.member_login || {},
        contentApiKey: spam.content_api_key || {},
        webmentionsBlock: spam.webmentions_block || {},
        emailPreviewBlock: spam.email_preview_block || {},
        otcVerificationEnumeration: spam.otc_verification_enumeration || {},
        otcVerification: spam.otc_verification || {}
    };
};

initializeSpamConfig();

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

const createBruteInstance = (instanceKey, spamConfigKey, failCallback, options = {}) => {
    if (instances[instanceKey]) {
        return instances[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const bruteStore = options.useMemoryStore ? (memoryStore || (memoryStore = new ExpressBrute.MemoryStore())) : getStore();

    const config = extend({
        attachResetToRequest: options.attachResetToRequest !== false,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(spamConfig[spamConfigKey], spamConfigKeys));

    instances[instanceKey] = new ExpressBrute(bruteStore, config);
    return instances[instanceKey];
};

const createFailCallback = (messageKey, options = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const errorOptions = {
            message: options.message || (typeof message === 'string' ? message : message.error),
            context: options.context || (typeof message === 'object' ? message.context : undefined),
            help: options.help || (typeof message === 'object' ? message.context : undefined)
        };

        if (options.code) {
            errorOptions.code = options.code;
        }

        return next(new errors.TooManyRequestsError(errorOptions));
    };
};

const globalBlock = () => {
    return createBruteInstance('globalBlock', 'globalBlock', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfig.globalBlock.freeRetries + 1 || 5,
                rfp: spamConfig.globalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    });
};

const globalReset = () => {
    return createBruteInstance('globalReset', 'globalReset', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfig.globalReset.freeRetries + 1 || 5,
                rfp: spamConfig.globalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    });
};

const webmentionsBlock = () => {
    return createBruteInstance('webmentionsBlock', 'webmentionsBlock', (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    }, { attachResetToRequest: false });
};

const emailPreviewBlock = () => {
    return createBruteInstance('emailPreviewBlock', 'emailPreviewBlock', (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    }, { attachResetToRequest: false });
};

const membersAuth = () => {
    return createBruteInstance('membersAuth', 'userLogin', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }, { attachResetToRequest: true });
};

const membersAuthEnumeration = () => {
    return createBruteInstance('membersAuthEnumeration', 'memberLogin', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }, { attachResetToRequest: true });
};

const otcVerificationEnumeration = () => {
    return createBruteInstance('otcVerificationEnumeration', 'otcVerificationEnumeration', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }, { attachResetToRequest: false });
};

const otcVerification = () => {
    return createBruteInstance('otcVerification', 'otcVerification', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }, { attachResetToRequest: false });
};

const userLogin = () => {
    return createBruteInstance('userLogin', 'userLogin', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }, { attachResetToRequest: true });
};

const userReset = () => {
    return createBruteInstance('userReset', 'userReset', (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamConfig.userReset.freeRetries + 1 || 5,
                rfp: spamConfig.userReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }, { attachResetToRequest: true });
};

const userVerification = () => {
    return createBruteInstance('userVerification', 'userVerification', (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }, { attachResetToRequest: true });
};

const sendVerificationCode = () => {
    return createBruteInstance('sendVerificationCode', 'sendVerificationCode', (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    }, { attachResetToRequest: true });
};

const privateBlog = () => {
    return createBruteInstance('privateBlog', 'privateBlock', (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamConfig.privateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamConfig.privateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }, { attachResetToRequest: false });
};

const contentApiKey = () => {
    if (instances.contentApiKey) {
        return instances.contentApiKey];
    }

    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    const config = extend({
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamConfig.contentApiKey, spamConfigKeys));

    instances.contentApiKey = new ExpressBrute(memoryStore, config);
    return instances.contentApiKey;
};

module.exports = {
    globalBlock: globalBlock,
    globalReset: globalReset,
    userLogin: userLogin,
    sendVerificationCode: sendVerificationCode,
    userVerification: userVerification,
    membersAuth: membersAuth,
    membersAuthEnumeration: membersAuthEnumeration,
    otcVerification: otcVerification,
    otcVerificationEnumeration: otcVerificationEnumeration,
    userReset: userReset,
    privateBlog: privateBlog,
    contentApiKey: contentApiKey,
    webmentionsBlock: webmentionsBlock,
    emailPreviewBlock: emailPreviewBlock,
    reset: () => {
        store = undefined;
        memoryStore = undefined;
        instances = {};
        initializeSpamConfig();
    }
};