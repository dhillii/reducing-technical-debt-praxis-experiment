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
    store: null,
    memoryStore: null,
    instances: {}
};

const spamConfig = {
    privateBlock: 'private_block',
    globalBlock: 'global_block',
    globalReset: 'global_reset',
    userReset: 'user_reset',
    userLogin: 'user_login',
    sendVerificationCode: 'send_verification_code',
    userVerification: 'user_verification',
    memberLogin: 'member_login',
    contentApiKey: 'content_api_key',
    webmentionsBlock: 'webmentions_block',
    emailPreviewBlock: 'email_preview_block',
    otcVerificationEnumeration: 'otc_verification_enumeration',
    otcVerification: 'otc_verification'
};

const getSpamConfig = (key) => {
    const spam = config.get('spam') || {};
    return spam[key] || {};
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
    const spamSettings = getSpamConfig(spamConfigKey);
    const config = extend({
        attachResetToRequest: options.attachReset !== false,
        failCallback: options.failCallback,
        handleStoreError: handleStoreError
    }, pick(spamSettings, SPAM_CONFIG_KEYS));

    state.instances[instanceKey] = new ExpressBrute(options.store, config);
    return state.instances[instanceKey];
};

const createFailCallback = (messageKey, options = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const baseMessage = options.baseMessage || `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        
        const errorConfig = {
            message: baseMessage,
            ...options.errorConfig
        };

        if (options.logError) {
            logging.error(new errors.TooManyRequestsError(errorConfig));
        }

        return next(new errors.TooManyRequestsError(errorConfig));
    };
};

const globalBlock = () => {
    const spamSettings = getSpamConfig(spamConfig.globalBlock);
    return createBruteInstance('globalBlock', spamConfig.globalBlock, {
        store: getStore(),
        attachReset: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamSettings.freeRetries + 1 || 5,
                    rfp: spamSettings.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const globalReset = () => {
    const spamSettings = getSpamConfig(spamConfig.globalReset);
    return createBruteInstance('globalReset', spamConfig.globalReset, {
        store: getStore(),
        attachReset: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamSettings.freeRetries + 1 || 5,
                    rfp: spamSettings.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    });
};

const webmentionsBlock = () => {
    return createBruteInstance('webmentionsBlock', spamConfig.webmentionsBlock, {
        store: getStore(),
        attachReset: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    });
};

const emailPreviewBlock = () => {
    return createBruteInstance('emailPreviewBlock', spamConfig.emailPreviewBlock, {
        store: getStore(),
        attachReset: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    });
};

const membersAuth = () => {
    return createBruteInstance('membersAuth', spamConfig.userLogin, {
        store: getStore(),
        attachReset: true,
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
    return createBruteInstance('membersAuthEnumeration', spamConfig.memberLogin, {
        store: getStore(),
        attachReset: true,
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
    return createBruteInstance('otcVerificationEnumeration', spamConfig.otcVerificationEnumeration, {
        store: getStore(),
        attachReset: false,
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
    return createBruteInstance('otcVerification', spamConfig.otcVerification, {
        store: getStore(),
        attachReset: false,
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
    return createBruteInstance('userLogin', spamConfig.userLogin, {
        store: getStore(),
        attachReset: true,
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
    const spamSettings = getSpamConfig(spamConfig.userReset);
    return createBruteInstance('userReset', spamConfig.userReset, {
        store: getStore(),
        attachReset: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamSettings.freeRetries + 1 || 5,
                    rfp: spamSettings.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    });
};

const userVerification = () => {
    return createBruteInstance('userVerification', spamConfig.userVerification, {
        store: getStore(),
        attachReset: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const sendVerificationCode = () => {
    return createBruteInstance('sendVerificationCode', spamConfig.sendVerificationCode, {
        store: getStore(),
        attachReset: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const privateBlog = () => {
    const spamSettings = getSpamConfig(spamConfig.privateBlock);
    return createBruteInstance('privateBlog', spamConfig.privateBlock, {
        store: getStore(),
        attachReset: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamSettings.freeRetries + 1 || 5,
                    rateSigninPeriod: spamSettings.lifetime || 60 * 60
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
    return createBruteInstance('contentApiKey', spamConfig.contentApiKey, {
        store: getMemoryStore(),
        attachReset: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        }
    });
};

const reset = () => {
    state.store = null;
    state.memoryStore = null;
    state.instances = {};
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
```