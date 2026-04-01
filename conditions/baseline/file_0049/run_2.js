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

const failCallbacks = {
    globalBlock: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfig.global_block.freeRetries + 1 || 5,
                rfp: spamConfig.global_block.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    },
    globalReset: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamConfig.global_reset.freeRetries + 1 || 5,
                rfp: spamConfig.global_reset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    },
    webmentionsBlock: (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    },
    emailPreviewBlock: (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    },
    membersAuth: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    membersAuthEnumeration: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    otcVerificationEnumeration: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    },
    otcVerification: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    },
    userLogin: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    },
    userReset: (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamConfig.user_reset.freeRetries + 1 || 5,
                rfp: spamConfig.user_reset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    },
    userVerification: (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    sendVerificationCode: (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    },
    privateBlog: (req, res, next, nextValidRequestDate) => {
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
    contentApiKey: (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });
        logging.error(err);
        return next(err);
    }
};

const bruteInstances = {
    globalBlock: () => {
        if (!instances.globalBlock) {
            instances.globalBlock = createExpressBruteInstance(spamConfig.global_block, {
                attachResetToRequest: false,
                failCallback: failCallbacks.globalBlock
            });
        }
        return instances.globalBlock;
    },
    globalReset: () => {
        if (!instances.globalReset) {
            instances.globalReset = createExpressBruteInstance(spamConfig.global_reset, {
                attachResetToRequest: false,
                failCallback: failCallbacks.globalReset
            });
        }
        return instances.globalReset;
    },
    webmentionsBlock: () => {
        if (!instances.webmentionsBlock) {
            instances.webmentionsBlock = createExpressBruteInstance(spamConfig.webmentions_block, {
                attachResetToRequest: false,
                failCallback: failCallbacks.webmentionsBlock
            });
        }
        return instances.webmentionsBlock;
    },
    emailPreviewBlock: () => {
        if (!instances.emailPreviewBlock) {
            instances.emailPreviewBlock = createExpressBruteInstance(spamConfig.email_preview_block, {
                attachResetToRequest: false,
                failCallback: failCallbacks.emailPreviewBlock
            });
        }
        return instances.emailPreviewBlock;
    },
    membersAuth: () => {
        if (!instances.membersAuth) {
            instances.membersAuth = createExpressBruteInstance(spamConfig.user_login, {
                attachResetToRequest: true,
                failCallback: failCallbacks.membersAuth
            });
        }
        return instances.membersAuth;
    },
    membersAuthEnumeration: () => {
        if (!instances.membersAuthEnumeration) {
            instances.membersAuthEnumeration = createExpressBruteInstance(spamConfig.member_login, {
                attachResetToRequest: true,
                failCallback: failCallbacks.membersAuthEnumeration
            });
        }
        return instances.membersAuthEnumeration;
    },
    otcVerificationEnumeration: () => {
        if (!instances.otcVerificationEnumeration) {
            instances.otcVerificationEnumeration = createExpressBruteInstance(spamConfig.otc_verification_enumeration, {
                attachResetToRequest: false,
                failCallback: failCallbacks.otcVerificationEnumeration
            });
        }
        return instances.otcVerificationEnumeration;
    },
    otcVerification: () => {
        if (!instances.otcVerification) {
            instances.otcVerification = createExpressBruteInstance(spamConfig.otc_verification, {
                attachResetToRequest: false,
                failCallback: failCallbacks.otcVerification
            });
        }
        return instances.otcVerification;
    },
    userLogin: () => {
        if (!instances.userLogin) {
            instances.userLogin = createExpressBruteInstance(spamConfig.user_login, {
                attachResetToRequest: true,
                failCallback: failCallbacks.userLogin
            });
        }
        return instances.userLogin;
    },
    userReset: () => {
        if (!instances.userReset) {
            instances.userReset = createExpressBruteInstance(spamConfig.user_reset, {
                attachResetToRequest: true,
                failCallback: failCallbacks.userReset
            });
        }
        return instances.userReset;
    },
    userVerification: () => {
        if (!instances.userVerification) {
            instances.userVerification = createExpressBruteInstance(spamConfig.user_verification, {
                attachResetToRequest: true,
                failCallback: failCallbacks.userVerification
            });
        }
        return instances.userVerification;
    },
    sendVerificationCode: () => {
        if (!instances.sendVerificationCode) {
            instances.sendVerificationCode = createExpressBruteInstance(spamConfig.send_verification_code, {
                attachResetToRequest: true,
                failCallback: failCallbacks.sendVerificationCode
            });
        }
        return instances.sendVerificationCode;
    },
    privateBlog: () => {
        if (!instances.privateBlog) {
            instances.privateBlog = createExpressBruteInstance(spamConfig.private_block, {
                attachResetToRequest: false,
                failCallback: failCallbacks.privateBlog
            });
        }
        return instances.privateBlog;
    },
    contentApiKey: () => {
        if (!instances.contentApiKey) {
            const ExpressBrute = require('express-brute');
            instances.contentApiKey = new ExpressBrute(getMemoryStore(), extend({
                attachResetToRequest: true,
                failCallback: failCallbacks.contentApiKey,
                handleStoreError: handleStoreError
            }, pick(spamConfig.content_api_key, spamConfigKeys)));
        }
        return instances.contentApiKey;
    }
};

const resetConfig = () => {
    Object.keys(instances).forEach(key => {
        instances[key] = undefined;
    });

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
        email_preview_block: spam.