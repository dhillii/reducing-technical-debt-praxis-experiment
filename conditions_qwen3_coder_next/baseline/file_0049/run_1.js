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

const createExpressBruteInstance = (StoreClass, options) => {
    const db = require('../../../../data/db');
    store = store || new StoreClass({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
    return new options.brute(store, options.config);
};

const createMemoryBruteInstance = (options) => {
    memoryStore = memoryStore || new options.memoryStore();
    return new options.brute(memoryStore, options.config);
};

const getFailCallback = (config) => {
    const { message, context, help, code } = config;

    return (req, res, next, nextValidRequestDate) => {
        const formattedMessage = message.replace('{date}', moment(nextValidRequestDate).fromNow(true));

        const errorConfig = {
            message: formattedMessage
        };

        if (context) {
            errorConfig.context = tpl(context);
        }
        if (help) {
            errorConfig.help = tpl(help);
        }
        if (code) {
            errorConfig.code = code;
        }

        return next(new errors.TooManyRequestsError(errorConfig));
    };
};

const setupRateLimiter = ({
    bruteClass,
    storeClass,
    config: spamConfig,
    failConfig
}) => {
    const configOpts = extend({
        attachResetToRequest: false,
        failCallback: getFailCallback(failConfig),
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys));

    if (storeClass === undefined) {
        return createMemoryBruteInstance({
            brute: require('express-brute'),
            memoryStore: require('express-brute').MemoryStore,
            config: configOpts
        });
    }

    return createExpressBruteInstance(storeClass, {
        brute: require('express-brute'),
        config: configOpts
    });
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamGlobalBlock,
            failConfig: {
                message: `Too many attempts try again in {date}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                })
            }
        });
    }
    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamGlobalReset,
            failConfig: {
                message: `Too many attempts try again in {date}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                })
            }
        });
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamWebmentionsBlock,
            failConfig: {
                message: messages.webmentionsBlock
            }
        });
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamEmailPreviewBlock,
            failConfig: {
                message: messages.emailPreviewBlock
            }
        });
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamUserLogin,
            failConfig: {
                message: `Too many sign-in attempts try again in {date}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }
        });
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamMemberLogin,
            failConfig: {
                message: `Too many different sign-in attempts, try again in {date}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }
        });
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamOtcVerificationEnumeration,
            failConfig: {
                message: `Too many verification attempts across multiple codes, try again in {date}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }
        });
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamOtcVerification,
            failConfig: {
                message: `Too many attempts for this verification code, try again in {date}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }
        });
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamUserLogin,
            failConfig: {
                message: `Too many login attempts. Please wait {date} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }
        });
    }
    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamUserReset,
            failConfig: {
                message: `Too many password reset attempts try again in {date}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }
        });
    }
    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamUserVerification,
            failConfig: {
                message: tpl(messages.tooManyAttempts)
            }
        });
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamSendVerificationCode,
            failConfig: {
                message: tpl(messages.tooManyAttempts)
            }
        });
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = setupRateLimiter({
            storeClass: require('brute-knex'),
            bruteClass: require('express-brute'),
            config: spamPrivateBlock,
            failConfig: {
                message: `Too many private sign-in attempts try again in {date}`
            }
        });
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = setupRateLimiter({
            config: spamContentApiKey,
            failConfig: {
                message: tpl(messages.tooManyAttempts)
            }
        });
    }
    return contentApiKeyInstance;
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
        spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
        spamOtcVerification = spam.otc_verification || {};
    }
};