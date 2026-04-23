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

const createExpressBruteInstance = (config, options = {}) => {
    const ExpressBrute = require('express-brute');
    const store = options.useMemoryStore ? getMemoryStore() : getStore();
    
    return new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest !== false,
        failCallback: options.failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createFailCallback = (messageKey, options = {}) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const baseMessage = options.baseMessage || `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        
        const errorConfig = {
            message: baseMessage,
            context: options.context || tpl(message?.context || message),
            help: options.help || tpl(message?.context || message)
        };

        if (options.code) {
            errorConfig.code = options.code;
        }

        return next(new errors.TooManyRequestsError(errorConfig));
    };
};

const globalBlock = () => {
    if (!instances.globalBlock) {
        instances.globalBlock = createExpressBruteInstance(spamConfig.global_block, {
            failCallback: createFailCallback('forgottenPasswordIp', {
                baseMessage: `Too many attempts try again in ${moment().add(spamConfig.global_block.lifetime || 3600, 'seconds').fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.global_block.freeRetries + 1 || 5,
                    rfp: spamConfig.global_block.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            })
        });
    }
    return instances.globalBlock;
};

const globalReset = () => {
    if (!instances.globalReset) {
        instances.globalReset = createExpressBruteInstance(spamConfig.global_reset, {
            failCallback: createFailCallback('forgottenPasswordIp', {
                baseMessage: `Too many attempts try again in ${moment().add(spamConfig.global_reset.lifetime || 3600, 'seconds').fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamConfig.global_reset.freeRetries + 1 || 5,
                    rfp: spamConfig.global_reset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            })
        });
    }
    return instances.globalReset;
};

const webmentionsBlock = () => {
    if (!instances.webmentionsBlock) {
        instances.webmentionsBlock = createExpressBruteInstance(spamConfig.webmentions_block, {
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            }
        });
    }
    return instances.webmentionsBlock;
};

const emailPreviewBlock = () => {
    if (!instances.emailPreviewBlock) {
        instances.emailPreviewBlock = createExpressBruteInstance(spamConfig.email_preview_block, {
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            }
        });
    }
    return instances.emailPreviewBlock;
};

const membersAuth = () => {
    if (!instances.membersAuth) {
        instances.membersAuth = createExpressBruteInstance(spamConfig.user_login, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }
    return instances.membersAuth;
};

const membersAuthEnumeration = () => {
    if (!instances.membersAuthEnumeration) {
        instances.membersAuthEnumeration = createExpressBruteInstance(spamConfig.member_login, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }
    return instances.membersAuthEnumeration;
};

const otcVerificationEnumeration = () => {
    if (!instances.otcVerificationEnumeration) {
        instances.otcVerificationEnumeration = createExpressBruteInstance(spamConfig.otc_verification_enumeration, {
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            }
        });
    }
    return instances.otcVerificationEnumeration;
};

const otcVerification = () => {
    if (!instances.otcVerification) {
        instances.otcVerification = createExpressBruteInstance(spamConfig.otc_verification, {
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            }
        });
    }
    return instances.otcVerification;
};

const userLogin = () => {
    if (!instances.userLogin) {
        instances.userLogin = createExpressBruteInstance(spamConfig.user_login, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }
    return instances.userLogin;
};

const userReset = () => {
    if (!instances.userReset) {
        instances.userReset = createExpressBruteInstance(spamConfig.user_reset, {
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
            }
        });
    }
    return instances.userReset;
};

const userVerification = () => {
    if (!instances.userVerification) {
        instances.userVerification = createExpressBruteInstance(spamConfig.user_verification, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }
    return instances.userVerification;
};

const sendVerificationCode = () => {
    if (!instances.sendVerificationCode) {
        instances.sendVerificationCode = createExpressBruteInstance(spamConfig.send_verification_code, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }
    return instances.sendVerificationCode;
};

const privateBlog = () => {
    if (!instances.privateBlog) {
        instances.privateBlog = createExpressBruteInstance(spamConfig.private_block, {
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
            }
        });
    }
    return instances.privateBlog;
};

const contentApiKey = () => {
    if (!instances.contentApiKey) {
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
    }
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