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

let spam = config.get('spam') || {};
const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

const instances = {
    store: undefined,
    memoryStore: undefined,
    privateBlog: undefined,
    globalReset: undefined,
    globalBlock: undefined,
    webmentionsBlock: undefined,
    userLogin: undefined,
    membersAuth: undefined,
    membersAuthEnumeration: undefined,
    userReset: undefined,
    sendVerificationCode: undefined,
    userVerification: undefined,
    contentApiKey: undefined,
    emailPreviewBlock: undefined,
    otcVerificationEnumeration: undefined,
    otcVerification: undefined
};

const spamConfigs = {
    privateBlock: () => spam.private_block || {},
    globalBlock: () => spam.global_block || {},
    globalReset: () => spam.global_reset || {},
    userReset: () => spam.user_reset || {},
    userLogin: () => spam.user_login || {},
    sendVerificationCode: () => spam.send_verification_code || {},
    userVerification: () => spam.user_verification || {},
    memberLogin: () => spam.member_login || {},
    contentApiKey: () => spam.content_api_key || {},
    webmentionsBlock: () => spam.webmentions_block || {},
    emailPreviewBlock: () => spam.email_preview_block || {},
    otcVerificationEnumeration: () => spam.otc_verification_enumeration || {},
    otcVerification: () => spam.otc_verification || {}
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
    if (!instances.store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        instances.store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return instances.store;
};

const getMemoryStore = () => {
    if (!instances.memoryStore) {
        const ExpressBrute = require('express-brute');
        instances.memoryStore = new ExpressBrute.MemoryStore();
    }
    return instances.memoryStore;
};

const createBruteInstance = (instanceKey, spamConfig, options) => {
    if (instances[instanceKey]) {
        return instances[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const store = options.useMemoryStore ? getMemoryStore() : getStore();
    
    instances[instanceKey] = new ExpressBrute(store,
        extend({}, options.bruteOptions, pick(spamConfig, spamConfigKeys))
    );

    return instances[instanceKey];
};

const createFailCallback = (messageKey, params = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const baseMessage = typeof message === 'string' ? message : message.error;
        
        return next(new errors.TooManyRequestsError({
            message: nextValidRequestDate 
                ? `${baseMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`
                : baseMessage,
            context: typeof message === 'string' ? undefined : message.context,
            help: typeof message === 'string' ? undefined : message.context,
            ...params
        }));
    };
};

const globalBlock = () => {
    const spamConfig = spamConfigs.globalBlock();
    return createBruteInstance('globalBlock', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: createFailCallback('forgottenPasswordIp', {
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamConfig.freeRetries + 1 || 5, rfp: spamConfig.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }),
            handleStoreError: handleStoreError
        }
    });
};

const globalReset = () => {
    const spamConfig = spamConfigs.globalReset();
    return createBruteInstance('globalReset', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error,
                        {rfa: spamConfig.freeRetries + 1 || 5, rfp: spamConfig.lifetime || 60 * 60}),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const webmentionsBlock = () => {
    const spamConfig = spamConfigs.webmentionsBlock();
    return createBruteInstance('webmentionsBlock', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const emailPreviewBlock = () => {
    const spamConfig = spamConfigs.emailPreviewBlock();
    return createBruteInstance('emailPreviewBlock', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const membersAuth = () => {
    const spamConfig = spamConfigs.userLogin();
    return createBruteInstance('membersAuth', spamConfig, {
        bruteOptions: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const membersAuthEnumeration = () => {
    const spamConfig = spamConfigs.memberLogin();
    return createBruteInstance('membersAuthEnumeration', spamConfig, {
        bruteOptions: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const otcVerificationEnumeration = () => {
    const spamConfig = spamConfigs.otcVerificationEnumeration();
    return createBruteInstance('otcVerificationEnumeration', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const otcVerification = () => {
    const spamConfig = spamConfigs.otcVerification();
    return createBruteInstance('otcVerification', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const userLogin = () => {
    const spamConfig = spamConfigs.userLogin();
    return createBruteInstance('userLogin', spamConfig, {
        bruteOptions: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const userReset = () => {
    const spamConfig = spamConfigs.userReset();
    return createBruteInstance('userReset', spamConfig, {
        bruteOptions: {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error,
                        {rfa: spamConfig.freeRetries + 1 || 5, rfp: spamConfig.lifetime || 60 * 60}),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const userVerification = () => {
    const spamConfig = spamConfigs.userVerification();
    return createBruteInstance('userVerification', spamConfig, {
        bruteOptions: {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const sendVerificationCode = () => {
    const spamConfig = spamConfigs.sendVerificationCode();
    return createBruteInstance('sendVerificationCode', spamConfig, {
        bruteOptions: {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const privateBlog = () => {
    const spamConfig = spamConfigs.privateBlock();
    return createBruteInstance('privateBlog', spamConfig, {
        bruteOptions: {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error,
                        {
                            rateSigninAttempts: spamConfig.freeRetries + 1 || 5,
                            rateSigninPeriod: spamConfig.lifetime || 60 * 60
                        }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            },
            handleStoreError: handleStoreError
        }
    });
};

const contentApiKey = () => {
    const spamConfig = spamConfigs.contentApiKey();
    const memoryStore = getMemoryStore();
    
    if (instances.contentApiKey) {
        return instances.contentApiKey;
    }

    const ExpressBrute = require('express-brute');
    instances.contentApiKey = new ExpressBrute(memoryStore,
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
        }, pick(spamConfig, spamConfigKeys))
    );

    return instances.contentApiKey;
};

const resetInstances = () => {
    Object.keys(instances).forEach(key => {
        instances[key] = undefined;
    });

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