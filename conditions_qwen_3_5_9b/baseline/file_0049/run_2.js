const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const _ = require('lodash');

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

const getSpamConfig = (key) => {
    const spam = config.get('spam') || {};
    const configMap = {
        private_block: 'privateBlock',
        global_block: 'globalBlock',
        global_reset: 'globalReset',
        user_reset: 'userReset',
        user_login: 'userLogin',
        send_verification_code: 'sendVerificationCode',
        user_verification: 'userVerification',
        member_login: 'memberLogin',
        content_api_key: 'contentApiKey',
        webmentions_block: 'webmentionsBlock',
        email_preview_block: 'emailPreviewBlock',
        otc_verification_enumeration: 'otcVerificationEnumeration',
        otc_verification: 'otcVerification'
    };

    const configKey = configMap[key];
    return spam[configKey] || {};
};

const createBruteInstance = (store, config, options = {}) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    const knexStore = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(knexStore, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        handleStoreError: (err) => {
            const customError = new errors.InternalServerError({
                message: 'Unknown error',
                err: err.parent ? err.parent : err
            });

            if (!err.next) {
                logging.error(err);
                return;
            }

            err.next(customError);
        }
    }, pick(config, spamConfigKeys)));

    if (options.failCallback) {
        instance.failCallback = options.failCallback;
    }

    return instance;
};

const createMemoryBruteInstance = (store, config, options = {}) => {
    const ExpressBrute = require('express-brute');

    const memoryStore = store || new ExpressBrute.MemoryStore();

    const instance = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        handleStoreError: (err) => {
            const customError = new errors.InternalServerError({
                message: 'Unknown error',
                err: err.parent ? err.parent : err
            });

            if (!err.next) {
                logging.error(err);
                return;
            }

            err.next(customError);
        }
    }, pick(config, spamConfigKeys)));

    if (options.failCallback) {
        instance.failCallback = options.failCallback;
    }

    return instance;
};

const getErrorMessage = (type, nextValidRequestDate) => {
    const timeString = nextValidRequestDate ? moment(nextValidRequestDate).fromNow(true) : '';
    const config = config.get('spam') || {};

    switch (type) {
        case 'forgottenPasswordEmail':
            return {
                message: `Too many password reset attempts try again in ${timeString}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: (config.user_reset?.freeRetries || 5) + 1,
                    rfp: config.user_reset?.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            };
        case 'forgottenPasswordIp':
            return {
                message: `Too many attempts try again in ${timeString}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: (config.global_block?.freeRetries || 5) + 1,
                    rfp: config.global_block?.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            };
        case 'tooManySigninAttempts':
            return {
                message: `Too many sign-in attempts try again in ${timeString}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            };
        case 'tooManyOTCVerificationAttempts':
            return {
                message: `Too many verification attempts across multiple codes, try again in ${timeString}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            };
        case 'otcCodeAttempts':
            return {
                message: `Too many attempts for this verification code, try again in ${timeString}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            };
        case 'userLogin':
            return {
                message: `Too many login attempts. Please wait ${timeString} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            };
        case 'privateBlog':
            return {
                message: `Too many private sign-in attempts try again in ${timeString}`,
                context: tpl(messages.tooManySigninAttempts.context)
            };
        case 'webmentions':
            return {
                message: messages.webmentionsBlock
            };
        case 'emailPreview':
            return {
                message: messages.emailPreviewBlock
            };
        default:
            return {
                message: tpl(messages.tooManyAttempts)
            };
    }
};

const getPrivateBlogErrorMessage = (nextValidRequestDate) => {
    const config = config.get('spam') || {};
    const timeString = nextValidRequestDate ? moment(nextValidRequestDate).fromNow(true) : '';

    return {
        message: `Too many private sign-in attempts try again in ${timeString}`,
        context: tpl(messages.tooManySigninAttempts.context)
    };
};

const getPrivateBlogLogMessage = (nextValidRequestDate) => {
    const config = config.get('spam') || {};
    const timeString = nextValidRequestDate ? moment(nextValidRequestDate).fromNow(true) : '';

    return {
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: (config.private_block?.freeRetries || 5) + 1,
            rateSigninPeriod: config.private_block?.lifetime || 60 * 60
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    };
};

const getSpamConfigMap = () => {
    const spam = config.get('spam') || {};
    return {
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

let store;
let memoryStore;
let instances = {};

const getInstance = (key) => {
    if (!instances[key]) {
        const config = getSpamConfig(key);
        const options = {
            attachResetToRequest: key === 'userLogin' || key === 'membersAuth' || key === 'membersAuthEnumeration' ||
                          key === 'userReset' || key === 'userVerification' || key === 'sendVerificationCode' ||
                          key === 'privateBlog' || key === 'contentApiKey',
            failCallback: (req, res, next, nextValidRequestDate) => {
                const errorConfig = getErrorMessage(key, nextValidRequestDate);
                const error = new errors.TooManyRequestsError({
                    message: errorConfig.message,
                    context: errorConfig.context,
                    help: errorConfig.help,
                    code: errorConfig.code
                });

                if (key === 'privateBlog') {
                    logging.error(new errors.TooManyRequestsError({
                        message: getPrivateBlogLogMessage(nextValidRequestDate).message,
                        context: getPrivateBlogLogMessage(nextValidRequestDate).context
                    }));
                }

                return next(error);
            }
        };

        if (key === 'contentApiKey') {
            instances[key] = createMemoryBruteInstance(memoryStore, config, options);
        } else {
            instances[key] = createBruteInstance(store, config, options);
        }
    }
    return instances[key];
};

module.exports = {
    globalBlock: () => getInstance('globalBlock'),
    globalReset: () => getInstance('globalReset'),
    userLogin: () => getInstance('userLogin'),
    sendVerificationCode: () => getInstance('sendVerificationCode'),
    userVerification: () => getInstance('userVerification'),
    membersAuth: () => getInstance('membersAuth'),
    membersAuthEnumeration: () => getInstance('membersAuthEnumeration'),
    otcVerification: () => getInstance('otcVerification'),
    otcVerificationEnumeration: () => getInstance('otcVerificationEnumeration'),
    userReset: () => getInstance('userReset'),
    privateBlog: () => getInstance('privateBlog'),
    contentApiKey: () => getInstance('contentApiKey'),
    webmentionsBlock: () => getInstance('webmentionsBlock'),
    emailPreviewBlock: () => getInstance('emailPreviewBlock'),
    reset: () => {
        store = undefined;
        memoryStore = undefined;
        instances = {};
        const spamConfig = getSpamConfigMap();
        config.set('spam', spamConfig);
    }
};