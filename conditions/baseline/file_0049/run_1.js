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

const createBruteInstance = (key, config, failCallback, attachReset = false) => {
    if (instances[key]) {
        return instances[key];
    }

    const ExpressBrute = require('express-brute');
    const bruteStore = key === 'contentApiKey' ? (memoryStore || (memoryStore = new ExpressBrute.MemoryStore())) : getStore();

    instances[key] = new ExpressBrute(bruteStore,
        extend({
            attachResetToRequest: attachReset,
            failCallback: failCallback,
            handleStoreError: handleStoreError
        }, pick(config, spamConfigKeys))
    );

    return instances[key];
};

const createFailCallback = (messageKey, configKey, includeTime = true, customCode = null) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const config = spamConfig[configKey];
        
        let errorMessage = message.error || message;
        
        if (includeTime && nextValidRequestDate) {
            errorMessage = `${errorMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        }

        if (typeof message === 'string') {
            return next(new errors.TooManyRequestsError({ message: tpl(errorMessage) }));
        }

        const errorObj = {
            message: tpl(errorMessage, {
                rfa: config.freeRetries + 1 || 5,
                rfp: config.lifetime || 60 * 60,
                rateSigninAttempts: config.freeRetries + 1 || 5,
                rateSigninPeriod: config.lifetime || 60 * 60
            }),
            context: tpl(message.context)
        };

        if (customCode) {
            errorObj.code = customCode;
        }

        return next(new errors.TooManyRequestsError(errorObj));
    };
};

const globalBlock = () => {
    return createBruteInstance(
        'globalBlock',
        spamConfig.globalBlock,
        createFailCallback('forgottenPasswordIp', 'globalBlock')
    );
};

const globalReset = () => {
    return createBruteInstance(
        'globalReset',
        spamConfig.globalReset,
        createFailCallback('forgottenPasswordIp', 'globalReset')
    );
};

const webmentionsBlock = () => {
    return createBruteInstance(
        'webmentionsBlock',
        spamConfig.webmentionsBlock,
        (req, res, next) => next(new errors.TooManyRequestsError({ message: messages.webmentionsBlock }))
    );
};

const emailPreviewBlock = () => {
    return createBruteInstance(
        'emailPreviewBlock',
        spamConfig.emailPreviewBlock,
        (req, res, next) => next(new errors.TooManyRequestsError({ message: messages.emailPreviewBlock }))
    );
};

const membersAuth = () => {
    return createBruteInstance(
        'membersAuth',
        spamConfig.userLogin,
        (req, res, next, nextValidRequestDate) => 
            next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            })),
        true
    );
};

const membersAuthEnumeration = () => {
    return createBruteInstance(
        'membersAuthEnumeration',
        spamConfig.memberLogin,
        (req, res, next, nextValidRequestDate) =>
            next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            })),
        true
    );
};

const otcVerificationEnumeration = () => {
    return createBruteInstance(
        'otcVerificationEnumeration',
        spamConfig.otcVerificationEnumeration,
        (req, res, next, nextValidRequestDate) =>
            next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }))
    );
};

const otcVerification = () => {
    return createBruteInstance(
        'otcVerification',
        spamConfig.otcVerification,
        (req, res, next, nextValidRequestDate) =>
            next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }))
    );
};

const userLogin = () => {
    return createBruteInstance(
        'userLogin',
        spamConfig.userLogin,
        (req, res, next, nextValidRequestDate) =>
            next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            })),
        true
    );
};

const userReset = () => {
    return createBruteInstance(
        'userReset',
        spamConfig.userReset,
        (req, res, next, nextValidRequestDate) =>
            next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamConfig.userReset.freeRetries + 1 || 5,
                    rfp: spamConfig.userReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            })),
        true
    );
};

const userVerification = () => {
    return createBruteInstance(
        'userVerification',
        spamConfig.userVerification,
        (req, res, next) => next(new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) })),
        true
    );
};

const sendVerificationCode = () => {
    return createBruteInstance(
        'sendVerificationCode',
        spamConfig.sendVerificationCode,
        (req, res, next) => next(new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) })),
        true
    );
};

const privateBlog = () => {
    return createBruteInstance(
        'privateBlog',
        spamConfig.privateBlock,
        (req, res, next, nextValidRequestDate) => {
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
        }
    );
};

const contentApiKey = () => {
    if (instances.contentApiKey) {
        return instances.contentApiKey;
    }

    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    instances.contentApiKey = new ExpressBrute(memoryStore,
        extend({
            attachResetToRequest: true,
            failCallback(req, res, next) {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });
                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError
        }, pick(spamConfig.contentApiKey, spamConfigKeys))
    );

    return instances.contentApiKey;
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
        store = undefined;
        memoryStore = undefined;
        instances = {};
        initializeSpamConfig();
    }
};
```