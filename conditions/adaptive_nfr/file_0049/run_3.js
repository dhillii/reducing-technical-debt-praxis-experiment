```javascript
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

const SPAM_CONFIG_KEYS = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

const state = {
    store: undefined,
    memoryStore: undefined,
    instances: {}
};

const getSpamConfig = () => config.get('spam') || {};

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
    if (!state.store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        state.store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return state.store;
};

const getMemoryStore = () => {
    if (!state.memoryStore) {
        const ExpressBrute = require('express-brute');
        state.memoryStore = new ExpressBrute.MemoryStore();
    }
    return state.memoryStore;
};

const createBruteInstance = (instanceKey, spamConfigKey, options) => {
    if (state.instances[instanceKey]) {
        return state.instances[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const spamConfig = getSpamConfig()[spamConfigKey] || {};
    const store = options.useMemoryStore ? getMemoryStore() : getStore();

    state.instances[instanceKey] = new ExpressBrute(
        store,
        extend({
            attachResetToRequest: options.attachResetToRequest !== false,
            failCallback: options.failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, SPAM_CONFIG_KEYS))
    );

    return state.instances[instanceKey];
};

const createFailCallback = (messageKey, contextKey, helpKey, extraContext = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const context = messages[contextKey];
        const help = messages[helpKey];

        const errorConfig = {
            message: nextValidRequestDate
                ? `${message} try again in ${moment(nextValidRequestDate).fromNow(true)}`
                : message,
            ...(context && { context: tpl(context) }),
            ...(help && { help: tpl(help) }),
            ...extraContext
        };

        return next(new errors.TooManyRequestsError(errorConfig));
    };
};

const globalBlock = () => {
    const spamConfig = getSpamConfig().global_block || {};
    return createBruteInstance('globalBlock', 'global_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.freeRetries + 1 || 5,
                    rfp: spamConfig.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const globalReset = () => {
    const spamConfig = getSpamConfig().global_reset || {};
    return createBruteInstance('globalReset', 'global_reset', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.freeRetries + 1 || 5,
                    rfp: spamConfig.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    });
};

const webmentionsBlock = () => {
    return createBruteInstance('webmentionsBlock', 'webmentions_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    });
};

const emailPreviewBlock = () => {
    return createBruteInstance('emailPreviewBlock', 'email_preview_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    });
};

const membersAuth = () => {
    return createBruteInstance('membersAuth', 'user_login', {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });
};

const membersAuthEnumeration = () => {
    return createBruteInstance('membersAuthEnumeration', 'member_login', {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });
};

const otcVerificationEnumeration = () => {
    return createBruteInstance('otcVerificationEnumeration', 'otc_verification_enumeration', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    });
};

const otcVerification = () => {
    return createBruteInstance('otcVerification', 'otc_verification', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    });
};

const userLogin = () => {
    return createBruteInstance('userLogin', 'user_login', {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });
};

const userReset = () => {
    const spamConfig = getSpamConfig().user_reset || {};
    return createBruteInstance('userReset', 'user_reset', {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamConfig.freeRetries + 1 || 5,
                    rfp: spamConfig.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    });
};

const userVerification = () => {
    return createBruteInstance('userVerification', 'user_verification', {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const sendVerificationCode = () => {
    return createBruteInstance('sendVerificationCode', 'send_verification_code', {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const privateBlog = () => {
    const spamConfig = getSpamConfig().private_block || {};
    return createBruteInstance('privateBlog', 'private_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamConfig.freeRetries + 1 || 5,
                    rateSigninPeriod: spamConfig.lifetime || 60 * 60
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        }
    });
};

const contentApiKey = () => {
    if (state.instances.contentApiKey) {
        return state.instances.contentApiKey];
    }

    const ExpressBrute = require('express-brute');
    const spamConfig = getSpamConfig().content_api_key || {};
    const memoryStore = getMemoryStore();

    state.instances.contentApiKey = new ExpressBrute(
        memoryStore,
        extend({
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError
        }, pick(spamConfig, SPAM_CONFIG_KEYS))
    );

    return state.instances.contentApiKey;
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
        state.store = undefined;
        state.memoryStore = undefined;
        state.instances = {};
    }
};
```