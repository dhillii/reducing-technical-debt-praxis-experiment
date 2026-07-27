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

const createBruteInstance = (instanceVar, spamConfig, options) => {
    if (!instanceVar) {
        const ExpressBrute = require('express-brute');
        const bruteStore = getStore();
        instanceVar = new ExpressBrute(bruteStore,
            extend({
                handleStoreError: handleStoreError
            }, options, pick(spamConfig, spamConfigKeys))
        );
    }
    return instanceVar;
};

const createFailCallback = (messageKey, spamConfig, includeTime = true, customCode = null) => {
    return (req, res, next, nextValidRequestDate) => {
        const message = messages[messageKey];
        const errorObj = {
            message: includeTime ? `${message.error || message} try again in ${moment(nextValidRequestDate).fromNow(true)}` : (message.error || message),
            context: message.context || tpl(messages.tooManySigninAttempts.context),
            help: message.context || tpl(messages.tooManySigninAttempts.context)
        };

        if (customCode) {
            errorObj.code = customCode;
        }

        if (spamConfig && spamConfig.freeRetries !== undefined) {
            errorObj.context = tpl(message.error || message, {
                rfa: spamConfig.freeRetries + 1 || 5,
                rfp: spamConfig.lifetime || 60 * 60,
                rateSigninAttempts: spamConfig.freeRetries + 1 || 5,
                rateSigninPeriod: spamConfig.lifetime || 60 * 60
            });
        }

        return next(new errors.TooManyRequestsError(errorObj));
    };
};

const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createBruteInstance(
        globalBlockInstance,
        spamGlobalBlock,
        {
            attachResetToRequest: false,
            failCallback: createFailCallback('forgottenPasswordIp', spamGlobalBlock)
        }
    );
    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createBruteInstance(
        globalResetInstance,
        spamGlobalReset,
        {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error,
                        {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            }
        }
    );
    return globalResetInstance;
};

const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(
        webmentionsBlockInstance,
        spamWebmentionsBlock,
        {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            }
        }
    );
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(
        emailPreviewBlockInstance,
        spamEmailPreviewBlock,
        {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            }
        }
    );
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    membersAuthInstance = membersAuthInstance || createBruteInstance(
        membersAuthInstance,
        spamUserLogin,
        {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        }
    );
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstance(
        membersAuthEnumerationInstance,
        spamMemberLogin,
        {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        }
    );
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(
        otcVerificationEnumerationInstance,
        spamOtcVerificationEnumeration,
        {
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
    );
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    otcVerificationInstance = otcVerificationInstance || createBruteInstance(
        otcVerificationInstance,
        spamOtcVerification,
        {
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
    );
    return otcVerificationInstance;
};

const userLogin = () => {
    userLoginInstance = userLoginInstance || createBruteInstance(
        userLoginInstance,
        spamUserLogin,
        {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        }
    );
    return userLoginInstance;
};

const userReset = () => {
    userResetInstance = userResetInstance || createBruteInstance(
        userResetInstance,
        spamUserReset,
        {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error,
                        {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            }
        }
    );
    return userResetInstance;
};

const userVerification = () => {
    userVerificationInstance = userVerificationInstance || createBruteInstance(
        userVerificationInstance,
        spamUserVerification,
        {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        }
    );
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(
        sendVerificationCodeInstance,
        spamSendVerificationCode,
        {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        }
    );
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createBruteInstance(
        privateBlogInstance,
        spamPrivateBlock,
        {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error,
                        {
                            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                        }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            }
        }
    );
    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        const ExpressBrute = require('express-brute');
        memoryStore = memoryStore || new ExpressBrute.MemoryStore();

        contentApiKeyInstance = new ExpressBrute(memoryStore,
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
            }, pick(spamContentApiKey, spamConfigKeys))
        );
    }

    return contentApiKeyInstance;
};

const resetInstances = () => {
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
};

const resetConfig = () => {
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
        resetConfig();
    }
};