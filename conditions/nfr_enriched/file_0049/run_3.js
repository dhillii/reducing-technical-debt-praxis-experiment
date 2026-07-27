const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
let spam = config.get('spam') || {};

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

let spamPrivateBlock = spam.private_block || {};
let spamGlobalBlock = spam.global_block || {};
let spamGlobalReset = spam.global_reset || {};
let spamUserReset = spam.user_reset || {};
let spamUserLogin = spam.user_login || {};
let spamSendVerificationCode = spam.send_verification_code || {};
let spamUserVerification = spam.user_verification || {};
let spamMemberLogin = spam.member_login || {};
let spamContentApiKey = spam.content_api_key || {};
let spamWebmentionsBlock = spam.webmentions_block || {};
let spamEmailPreviewBlock = spam.email_preview_block || {};
let spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
let spamOtcVerification = spam.otc_verification || {};

let store;
let memoryStore;
let privateBlogInstance;
let globalResetInstance;
let globalBlockInstance;
let webmentionsBlockInstance;
let userLoginInstance;
let membersAuthInstance;
let membersAuthEnumerationInstance;
let userResetInstance;
let sendVerificationCodeInstance;
let userVerificationInstance;
let contentApiKeyInstance;
let emailPreviewBlockInstance;
let otcVerificationEnumerationInstance;
let otcVerificationInstance;

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

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

// Initialize or retrieve the shared database store for brute force protection
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

// Create a fail callback for rate limit errors with time-based messaging
const createFailCallback = (messageConfig, spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = typeof messageConfig === 'string' 
            ? messageConfig 
            : `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        
        const context = messageConfig.context || tpl(messages.tooManyAttempts);
        const help = messageConfig.help || context;
        
        return next(new errors.TooManyRequestsError({
            message,
            context,
            help
        }));
    };
};

// Create a fail callback for rate limit errors with formatted parameters
const createFailCallbackWithParams = (errorMessage, contextMessage, spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `${errorMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(contextMessage, {
                rfa: spamConfig.freeRetries + 1 || 5,
                rfp: spamConfig.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    };
};

// Create a fail callback for enumeration-based rate limits
const createEnumerationFailCallback = (messageContext, errorCode) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messageContext),
            help: tpl(messageContext),
            code: errorCode
        }));
    };
};

// Create a fail callback for OTC verification rate limits
const createOtcFailCallback = (errorCode) => {
    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: errorCode
        }));
    };
};

// Create a fail callback for private blog rate limits
const createPrivateBlogFailCallback = (spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
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
    };
};

// Create an ExpressBrute instance with database store
const createBruteInstance = (config, options) => {
    const ExpressBrute = require('express-brute');
    const storeInstance = getStore();
    
    return new ExpressBrute(storeInstance, extend({
        attachResetToRequest: false,
        handleStoreError: handleStoreError
    }, options, pick(config, spamConfigKeys)));
};

// Create an ExpressBrute instance with memory store
const createMemoryBruteInstance = (config, options) => {
    const ExpressBrute = require('express-brute');
    memoryStore = memoryStore || new ExpressBrute.MemoryStore();
    
    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: true,
        handleStoreError: handleStoreError
    }, options, pick(config, spamConfigKeys)));
};

// Locks a single endpoint based on excessive requests from an IP
const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createBruteInstance(spamGlobalBlock, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    });

    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createBruteInstance(spamGlobalReset, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    });

    return globalResetInstance;
};

const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(spamWebmentionsBlock, {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    });

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(spamEmailPreviewBlock, {
        attachResetToRequest: false,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    });

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        const ExpressBrute = require('express-brute');
        const storeInstance = getStore();
        
        membersAuthInstance = new ExpressBrute(storeInstance, extend({
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys)));
    }

    return membersAuthInstance;
};

// Higher limits for enumeration checks across all email addresses
const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        const ExpressBrute = require('express-brute');
        const storeInstance = getStore();
        
        membersAuthEnumerationInstance = new ExpressBrute(storeInstance, extend({
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys)));
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        const ExpressBrute = require('express-brute');
        const storeInstance = getStore();
        
        otcVerificationEnumerationInstance = new ExpressBrute(storeInstance, extend({
            attachResetToRequest: false,
            failCallback: createEnumerationFailCallback(
                messages.tooManyOTCVerificationAttempts.context,
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            ),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys)));
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        const ExpressBrute = require('express-brute');
        const storeInstance = getStore();
        
        otcVerificationInstance = new ExpressBrute(storeInstance, extend({
            attachResetToRequest: false,
            failCallback: createOtcFailCallback('OTC_CODE_ATTEMPTS_RATE_LIMITED'),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerification, spamConfigKeys)));
    }

    return otcVerificationInstance;
};

// Stops login attempts for a user+IP pair with increasing time periods
const userLogin = () => {
    userLoginInstance = userLoginInstance || createBruteInstance(spamUserLogin, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });

    return userLoginInstance;
};

// Stop password reset requests when exceeding rate limits per email
const userReset = function userReset() {
    userResetInstance = userResetInstance || createBruteInstance(spamUserReset, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    });

    return userResetInstance;
};

const userVerification = function userVerification() {
    userVerificationInstance = userVerificationInstance || createBruteInstance(spamUserVerification, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });

    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(spamSendVerificationCode, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });

    return sendVerificationCodeInstance;
};

// Protects a private blog from spam attacks
const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createBruteInstance(spamPrivateBlock, {
        attachResetToRequest: false,
        failCallback: createPrivateBlogFailCallback(spamPrivateBlock)
    });

    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        const ExpressBrute = require('express-brute');
        memoryStore = memoryStore || new ExpressBrute.MemoryStore();
        
        contentApiKeyInstance = new ExpressBrute(memoryStore, extend({
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys)));
    }

    return contentApiKeyInstance;
};

module.exports = {
    globalBlock: globalBlock,
    globalReset: globalReset,
    userLogin: userLogin,
    sendVerificationCode: sendVerificationCode,
    userVerification: userVerification,
    membersAuth: membersAuth,
    membersAuthEnumeration: membersAuthEnumeration,
    otcVerification: otcVerification,
    otcVerificationEnumeration: otcVerificationEnumeration,
    userReset: userReset,
    privateBlog: privateBlog,
    contentApiKey: contentApiKey,
    webmentionsBlock: webmentionsBlock,
    emailPreviewBlock: emailPreviewBlock,
    reset: () => {
        store = undefined;
        memoryStore = undefined;
        privateBlogInstance = undefined;
        globalResetInstance = undefined;
        globalBlockInstance = undefined;
        userLoginInstance = undefined;
        membersAuthInstance = undefined;
        membersAuthEnumerationInstance = undefined;
        userResetInstance = undefined;
        sendVerificationCodeInstance = undefined;
        userVerificationInstance = undefined;
        contentApiKeyInstance = undefined;
        emailPreviewBlockInstance = undefined;
        webmentionsBlockInstance = undefined;
        otcVerificationEnumerationInstance = undefined;
        otcVerificationInstance = undefined;

        spam = config.get('spam') || {};
        spamPrivateBlock = spam.private_block || {};
        spamGlobalBlock = spam.global_block || {};
        spamGlobalReset = spam.global_reset || {};
        spamUserReset = spam.user_reset || {};
        spamUserLogin = spam.user_login || {};
        spamSendVerificationCode = spam.send_verification_code || {};
        spamUserVerification = spam.user_verification || {};
        spamMemberLogin = spam.member_login || {};
        spamContentApiKey = spam.content_api_key || {};
        spamWebmentionsBlock = spam.webmentions_block || {};
        spamEmailPreviewBlock = spam.email_preview_block || {};
        spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
        spamOtcVerification = spam.otc_verification || {};
    }
};