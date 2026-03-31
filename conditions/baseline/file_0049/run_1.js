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

const BRUTE_INSTANCES = {
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
    otcVerificationEnumeration: undefined,
    otcVerification: undefined
};

let spamConfig = {};

const loadSpamConfig = () => {
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

loadSpamConfig();

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
    if (!BRUTE_INSTANCES.store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        BRUTE_INSTANCES.store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return BRUTE_INSTANCES.store;
};

const getMemoryStore = () => {
    if (!BRUTE_INSTANCES.memoryStore) {
        const ExpressBrute = require('express-brute');
        BRUTE_INSTANCES.memoryStore = new ExpressBrute.MemoryStore();
    }
    return BRUTE_INSTANCES.memoryStore;
};

const createBruteInstance = (instanceKey, storeType, config, failCallback) => {
    if (BRUTE_INSTANCES[instanceKey]) {
        return BRUTE_INSTANCES[instanceKey];
    }

    const ExpressBrute = require('express-brute');
    const store = storeType === 'memory' ? getMemoryStore() : getStore();

    BRUTE_INSTANCES[instanceKey] = new ExpressBrute(
        store,
        extend({
            handleStoreError: handleStoreError,
            ...failCallback
        }, pick(config, SPAM_CONFIG_KEYS))
    );

    return BRUTE_INSTANCES[instanceKey];
};

const createFailCallback = (options = {}) => {
    const {
        attachResetToRequest = false,
        messageKey,
        messageTemplate,
        messageParams = {},
        contextKey,
        helpKey,
        customCode
    } = options;

    return {
        attachResetToRequest,
        failCallback(req, res, next, nextValidRequestDate) {
            let message = messageTemplate || messages[messageKey];
            
            if (typeof message === 'object') {
                message = message.error;
            }

            if (messageParams && Object.keys(messageParams).length > 0) {
                message = tpl(message, messageParams);
            }

            const errorConfig = { message };
            
            if (contextKey) {
                errorConfig.context = tpl(messages[contextKey]?.context || messages[contextKey]);
            }
            
            if (helpKey) {
                errorConfig.help = tpl(messages[helpKey]?.context || messages[helpKey]);
            }

            if (customCode) {
                errorConfig.code = customCode;
            }

            if (nextValidRequestDate) {
                errorConfig.message = `${message} try again in ${moment(nextValidRequestDate).fromNow(true)}`;
            }

            return next(new errors.TooManyRequestsError(errorConfig));
        }
    };
};

const globalBlock = () => {
    return createBruteInstance(
        'globalBlock',
        'db',
        spamConfig.globalBlock,
        createFailCallback({
            attachResetToRequest: false,
            messageKey: 'forgottenPasswordIp',
            messageParams: {
                rfa: spamConfig.globalBlock.freeRetries + 1 || 5,
                rfp: spamConfig.globalBlock.lifetime || 60 * 60
            },
            helpKey: 'tooManyAttempts'
        })
    );
};

const globalReset = () => {
    return createBruteInstance(
        'globalReset',
        'db',
        spamConfig.globalReset,
        createFailCallback({
            attachResetToRequest: false,
            messageKey: 'forgottenPasswordIp',
            messageParams: {
                rfa: spamConfig.globalReset.freeRetries + 1 || 5,
                rfp: spamConfig.globalReset.lifetime || 60 * 60
            },
            contextKey: 'forgottenPasswordIp'
        })
    );
};

const webmentionsBlock = () => {
    return createBruteInstance(
        'webmentionsBlock',
        'db',
        spamConfig.webmentionsBlock,
        createFailCallback({
            attachResetToRequest: false,
            messageTemplate: messages.webmentionsBlock
        })
    );
};

const emailPreviewBlock = () => {
    return createBruteInstance(
        'emailPreviewBlock',
        'db',
        spamConfig.emailPreviewBlock,
        createFailCallback({
            attachResetToRequest: false,
            messageTemplate: messages.emailPreviewBlock
        })
    );
};

const membersAuth = () => {
    return createBruteInstance(
        'membersAuth',
        'db',
        spamConfig.userLogin,
        createFailCallback({
            attachResetToRequest: true,
            messageTemplate: 'Too many sign-in attempts try again in {time}',
            contextKey: 'tooManySigninAttempts',
            helpKey: 'tooManySigninAttempts'
        })
    );
};

const membersAuthEnumeration = () => {
    return createBruteInstance(
        'membersAuthEnumeration',
        'db',
        spamConfig.memberLogin,
        createFailCallback({
            attachResetToRequest: true,
            messageTemplate: 'Too many different sign-in attempts, try again in {time}',
            contextKey: 'tooManySigninAttempts',
            helpKey: 'tooManySigninAttempts'
        })
    );
};

const otcVerificationEnumeration = () => {
    return createBruteInstance(
        'otcVerificationEnumeration',
        'db',
        spamConfig.otcVerificationEnumeration,
        createFailCallback({
            attachResetToRequest: false,
            messageTemplate: 'Too many verification attempts across multiple codes, try again in {time}',
            contextKey: 'tooManyOTCVerificationAttempts',
            helpKey: 'tooManyOTCVerificationAttempts',
            customCode: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        })
    );
};

const otcVerification = () => {
    return createBruteInstance(
        'otcVerification',
        'db',
        spamConfig.otcVerification,
        createFailCallback({
            attachResetToRequest: false,
            messageTemplate: 'Too many attempts for this verification code, try again in {time}',
            contextKey: 'tooManyOTCVerificationAttempts',
            helpKey: 'tooManyOTCVerificationAttempts',
            customCode: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        })
    );
};

const userLogin = () => {
    return createBruteInstance(
        'userLogin',
        'db',
        spamConfig.userLogin,
        createFailCallback({
            attachResetToRequest: true,
            messageTemplate: 'Too many login attempts. Please wait {time} before trying again, or reset your password.',
            contextKey: 'tooManySigninAttempts',
            helpKey: 'tooManySigninAttempts'
        })
    );
};

const userReset = () => {
    return createBruteInstance(
        'userReset',
        'db',
        spamConfig.userReset,
        createFailCallback({
            attachResetToRequest: true,
            messageKey: 'forgottenPasswordEmail',
            messageParams: {
                rfa: spamConfig.userReset.freeRetries + 1 || 5,
                rfp: spamConfig.userReset.lifetime || 60 * 60
            },
            contextKey: 'forgottenPasswordEmail'
        })
    );
};

const userVerification = () => {
    return createBruteInstance(
        'userVerification',
        'db',
        spamConfig.userVerification,
        createFailCallback({
            attachResetToRequest: true,
            messageKey: 'tooManyAttempts'
        })
    );
};

const sendVerificationCode = () => {
    return createBruteInstance(
        'sendVerificationCode',
        'db',
        spamConfig.sendVerificationCode,
        createFailCallback({
            attachResetToRequest: true,
            messageKey: 'tooManyAttempts'
        })
    );
};

const privateBlog = () => {
    if (BRUTE_INSTANCES.privateBlog) {
        return BRUTE_INSTANCES.privateBlog;
    }

    const ExpressBrute = require('express-brute');
    const store = getStore();

    BRUTE_INSTANCES.privateBlog = new ExpressBrute(
        store,
        extend({
            attachResetToRequest: false,
            failCallback(req, res, next, nextValidRequestDate) {
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
            },
            handleStoreError: handleStoreError
        }, pick(spamConfig.privateBlock, SPAM_CONFIG_KEYS))
    );

    return BRUTE_INSTANCES.privateBlog;
};

const contentApiKey = () => {
    return createBruteInstance(
        'contentApiKey',
        'memory',
        spamConfig.contentApiKey,
        createFailCallback({
            attachResetToRequest: true,
            messageKey: 'tooManyAttempts'
        })
    );
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
        Object.keys(BRUTE_INSTANCES).forEach(key => {
            BRUTE_INSTANCES[key] = undefined;
        });
        loadSpamConfig();
    }
};
```