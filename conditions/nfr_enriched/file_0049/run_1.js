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

const instances = {
    store: null,
    memoryStore: null,
    privateBlog: null,
    globalReset: null,
    globalBlock: null,
    webmentionsBlock: null,
    userLogin: null,
    membersAuth: null,
    membersAuthEnumeration: null,
    userReset: null,
    sendVerificationCode: null,
    userVerification: null,
    contentApiKey: null,
    emailPreviewBlock: null,
    otcVerificationEnumeration: null,
    otcVerification: null
};

let spamConfig = {};

const initializeSpamConfig = () => {
    spamConfig = config.get('spam') || {};
};

const getSpamSettings = (key) => {
    return spamConfig[key] || {};
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

const createBruteInstance = (instanceKey, storeType, config, failCallback) => {
    if (instances[instanceKey]) {
        return instances[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const store = storeType === 'memory' ? getMemoryStore() : getStore();
    const spamSettings = getSpamSettings(config.spamKey);

    instances[instanceKey] = new ExpressBrute(
        store,
        extend({
            attachResetToRequest: config.attachReset !== false,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(spamSettings, SPAM_CONFIG_KEYS))
    );

    return instances[instanceKey];
};

const createFailCallback = (config) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = config.message || tpl(messages.tooManyAttempts);
        const context = config.context || tpl(messages.tooManyAttempts);
        const help = config.help || context;

        return next(new errors.TooManyRequestsError({
            message,
            context,
            help,
            ...(config.code && { code: config.code })
        }));
    };
};

const globalBlock = () => {
    const spamSettings = getSpamSettings('global_block');
    return createBruteInstance('globalBlock', 'db', { spamKey: 'global_block' },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamSettings.freeRetries + 1 || 5,
                    rfp: spamSettings.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    );
};

const globalReset = () => {
    const spamSettings = getSpamSettings('global_reset');
    return createBruteInstance('globalReset', 'db', { spamKey: 'global_reset' },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamSettings.freeRetries + 1 || 5,
                    rfp: spamSettings.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    );
};

const webmentionsBlock = () => {
    return createBruteInstance('webmentionsBlock', 'db', { spamKey: 'webmentions_block' },
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    );
};

const emailPreviewBlock = () => {
    return createBruteInstance('emailPreviewBlock', 'db', { spamKey: 'email_preview_block' },
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    );
};

const membersAuth = () => {
    return createBruteInstance('membersAuth', 'db', { spamKey: 'user_login', attachReset: true },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    );
};

const membersAuthEnumeration = () => {
    return createBruteInstance('membersAuthEnumeration', 'db', { spamKey: 'member_login', attachReset: true },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    );
};

const otcVerificationEnumeration = () => {
    return createBruteInstance('otcVerificationEnumeration', 'db', { spamKey: 'otc_verification_enumeration', attachReset: false },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    );
};

const otcVerification = () => {
    return createBruteInstance('otcVerification', 'db', { spamKey: 'otc_verification', attachReset: false },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    );
};

const userLogin = () => {
    return createBruteInstance('userLogin', 'db', { spamKey: 'user_login', attachReset: true },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    );
};

const userReset = () => {
    const spamSettings = getSpamSettings('user_reset');
    return createBruteInstance('userReset', 'db', { spamKey: 'user_reset', attachReset: true },
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamSettings.freeRetries + 1 || 5,
                    rfp: spamSettings.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    );
};

const userVerification = () => {
    return createBruteInstance('userVerification', 'db', { spamKey: 'user_verification', attachReset: true },
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    );
};

const sendVerificationCode = () => {
    return createBruteInstance('sendVerificationCode', 'db', { spamKey: 'send_verification_code', attachReset: true },
        (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    );
};

const privateBlog = () => {
    const spamSettings = getSpamSettings('private_block');
    return createBruteInstance('privateBlog', 'db', { spamKey: 'private_block', attachReset: false },
        (req, res, next, nextValidRequestDate) => {
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
    );
};

const contentApiKey = () => {
    return createBruteInstance('contentApiKey', 'memory', { spamKey: 'content_api_key', attachReset: true },
        (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        }
    );
};

const resetInstances = () => {
    Object.keys(instances).forEach(key => {
        instances[key] = null;
    });
    initializeSpamConfig();
};

initializeSpamConfig();

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
```