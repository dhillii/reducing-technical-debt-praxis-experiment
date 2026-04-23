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

let spamConfig = {
    private_block: {},
    global_block: {},
    global_reset: {},
    user_reset: {},
    user_login: {},
    send_verification_code: {},
    user_verification: {},
    member_login: {},
    content_api_key: {},
    webmentions_block: {},
    email_preview_block: {},
    otc_verification_enumeration: {},
    otc_verification: {}
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

const createExpressBruteInstance = (config, options) => {
    const ExpressBrute = require('express-brute');
    const store = options.useMemoryStore ? getMemoryStore() : getStore();
    return new ExpressBrute(store, extend(options.bruteConfig, pick(config, spamConfigKeys)));
};

const failCallbackFactory = (messageKey, params = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const baseMessage = typeof message === 'string' ? message : message.error;
        const context = typeof message === 'string' ? undefined : message.context;
        
        const errorConfig = {
            message: nextValidRequestDate 
                ? `${baseMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`
                : baseMessage
        };

        if (context) {
            errorConfig.context = tpl(context);
            errorConfig.help = tpl(context);
        }

        if (params.code) {
            errorConfig.code = params.code;
        }

        return next(new errors.TooManyRequestsError(errorConfig));
    };
};

const createBruteInstance = (instanceKey, spamConfigKey, bruteConfig, useMemoryStore = false) => {
    if (instances[instanceKey]) {
        return instances[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const store = useMemoryStore ? getMemoryStore() : getStore();
    
    instances[instanceKey] = new ExpressBrute(store, extend(bruteConfig, pick(spamConfig[spamConfigKey], spamConfigKeys)));
    return instances[instanceKey];
};

const globalBlock = () => {
    return createBruteInstance('globalBlock', 'global_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.global_block.freeRetries + 1 || 5,
                    rfp: spamConfig.global_block.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    });
};

const globalReset = () => {
    return createBruteInstance('globalReset', 'global_reset', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.global_reset.freeRetries + 1 || 5,
                    rfp: spamConfig.global_reset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        },
        handleStoreError: handleStoreError
    });
};

const webmentionsBlock = () => {
    return createBruteInstance('webmentionsBlock', 'webmentions_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        },
        handleStoreError: handleStoreError
    });
};

const emailPreviewBlock = () => {
    return createBruteInstance('emailPreviewBlock', 'email_preview_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        },
        handleStoreError: handleStoreError
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
        },
        handleStoreError: handleStoreError
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
        },
        handleStoreError: handleStoreError
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
        },
        handleStoreError: handleStoreError
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
        },
        handleStoreError: handleStoreError
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
        },
        handleStoreError: handleStoreError
    });
};

const userReset = () => {
    return createBruteInstance('userReset', 'user_reset', {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamConfig.user_reset.freeRetries + 1 || 5,
                    rfp: spamConfig.user_reset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        },
        handleStoreError: handleStoreError
    });
};

const userVerification = () => {
    return createBruteInstance('userVerification', 'user_verification', {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    });
};

const sendVerificationCode = () => {
    return createBruteInstance('sendVerificationCode', 'send_verification_code', {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        },
        handleStoreError: handleStoreError
    });
};

const privateBlog = () => {
    return createBruteInstance('privateBlog', 'private_block', {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamConfig.private_block.freeRetries + 1 || 5,
                    rateSigninPeriod: spamConfig.private_block.lifetime || 60 * 60
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        },
        handleStoreError: handleStoreError
    });
};

const contentApiKey = () => {
    if (instances.contentApiKey) {
        return instances.contentApiKey;
    }

    const ExpressBrute = require('express-brute');
    const memoryStore = getMemoryStore();

    instances.contentApiKey = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        handleStoreError: handleStoreError
    }, pick(spamConfig.content_api_key, spamConfigKeys)));

    return instances.contentApiKey;
};

const resetInstances = () => {
    Object.keys(instances).forEach(key => {
        instances[key] = undefined;
    });
};

const reloadSpamConfig = () => {
    const spam = config.get('spam') || {};
    spamConfig = {
        private_block: spam.private_block || {},
        global_block: spam.global_block || {},
        global_reset: spam.global_reset || {},
        user_reset: spam.user_reset || {},
        user_login: spam.user_login || {},
        send_verification_code: spam.send_verification_code || {},
        user_verification: spam.user_verification || {},
        member_login: spam.member_login || {},
        content_api_key: spam.content_api_key || {},
        webmentions_block: spam.webmentions_block || {},
        email_preview_block: spam.email_preview_block || {},
        otc_verification_enumeration: spam.otc_verification_enumeration || {},
        otc_verification: spam.otc_verification || {}
    };
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
        resetInstances();
        reloadSpamConfig();
    }
};
```