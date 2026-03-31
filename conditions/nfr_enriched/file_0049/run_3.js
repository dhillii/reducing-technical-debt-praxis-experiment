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

const createBruteInstance = (key, spamConfig, options) => {
    if (state.instances[key]) {
        return state.instances[key];
    }

    const ExpressBrute = require('express-brute');
    const store = options.useMemoryStore ? getMemoryStore() : getStore();

    state.instances[key] = new ExpressBrute(
        store,
        extend({
            attachResetToRequest: options.attachResetToRequest !== false,
            failCallback: options.failCallback,
            handleStoreError: handleStoreError
        }, pick(spamConfig, SPAM_CONFIG_KEYS))
    );

    return state.instances[key];
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

const bruteForceConfigs = {
    globalBlock: {
        key: 'globalBlock',
        spamConfigKey: 'global_block',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                const spamConfig = getSpamConfig().global_block || {};
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamConfig.freeRetries + 1 || 5,
                        rfp: spamConfig.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            }
        }
    },
    globalReset: {
        key: 'globalReset',
        spamConfigKey: 'global_reset',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                const spamConfig = getSpamConfig().global_reset || {};
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: spamConfig.freeRetries + 1 || 5,
                        rfp: spamConfig.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            }
        }
    },
    webmentionsBlock: {
        key: 'webmentionsBlock',
        spamConfigKey: 'webmentions_block',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            }
        }
    },
    emailPreviewBlock: {
        key: 'emailPreviewBlock',
        spamConfigKey: 'email_preview_block',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            }
        }
    },
    membersAuth: {
        key: 'membersAuth',
        spamConfigKey: 'user_login',
        options: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        }
    },
    membersAuthEnumeration: {
        key: 'membersAuthEnumeration',
        spamConfigKey: 'member_login',
        options: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        }
    },
    otcVerificationEnumeration: {
        key: 'otcVerificationEnumeration',
        spamConfigKey: 'otc_verification_enumeration',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            }
        }
    },
    otcVerification: {
        key: 'otcVerification',
        spamConfigKey: 'otc_verification',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            }
        }
    },
    userLogin: {
        key: 'userLogin',
        spamConfigKey: 'user_login',
        options: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        }
    },
    userReset: {
        key: 'userReset',
        spamConfigKey: 'user_reset',
        options: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                const spamConfig = getSpamConfig().user_reset || {};
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: spamConfig.freeRetries + 1 || 5,
                        rfp: spamConfig.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            }
        }
    },
    userVerification: {
        key: 'userVerification',
        spamConfigKey: 'user_verification',
        options: {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        }
    },
    sendVerificationCode: {
        key: 'sendVerificationCode',
        spamConfigKey: 'send_verification_code',
        options: {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        }
    },
    privateBlog: {
        key: 'privateBlog',
        spamConfigKey: 'private_block',
        options: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                const spamConfig = getSpamConfig().private_block || {};
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
        }
    },
    contentApiKey: {
        key: 'contentApiKey',
        spamConfigKey: 'content_api_key',
        options: {
            attachResetToRequest: true,
            useMemoryStore: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            }
        }
    }
};

const createBruteForceMiddleware = (configName) => {
    const config = bruteForceConfigs[configName];
    if (!config) {
        throw new Error(`Unknown brute force config: ${configName}`);
    }

    const spamConfig = getSpamConfig()[config.spamConfigKey] || {};
    return createBruteInstance(config.key, spamConfig, config.options);
};

module.exports = {
    globalBlock: () => createBruteForceMiddleware('globalBlock'),
    globalReset: () => createBruteForceMiddleware('globalReset'),
    userLogin: () => createBruteForceMiddleware('userLogin'),
    sendVerificationCode: () => createBruteForceMiddleware('sendVerificationCode'),
    userVerification: () => createBruteForceMiddleware('userVerification'),
    membersAuth: () => createBruteForceMiddleware('membersAuth'),
    membersAuthEnumeration: () => createBruteForceMiddleware('membersAuthEnumeration'),
    otcVerification: () => createBruteForceMiddleware('otcVerification'),
    otcVerificationEnumeration: () => createBruteForceMiddleware('otcVerificationEnumeration'),
    userReset: () => createBruteForceMiddleware('userReset'),
    privateBlog: () => createBruteForceMiddleware('privateBlog'),
    contentApiKey: () => createBruteForceMiddleware('contentApiKey'),
    webmentionsBlock: () => createBruteForceMiddleware('webmentionsBlock'),
    emailPreviewBlock: () => createBruteForceMiddleware('emailPreviewBlock'),
    reset: () => {
        state.store = null;
        state.memoryStore = null;
        state.instances = {};
    }
};
```