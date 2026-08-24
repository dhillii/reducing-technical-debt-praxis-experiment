const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

let spam = config.get('spam') || {};
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

const createBruteInstance = (storeClass, configObj, failCallbackFactory, extraOptions = {}) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const baseOptions = {
        attachResetToRequest: false,
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
    };

    const options = extend(baseOptions, pick(configObj, spamConfigKeys), extraOptions);
    options.failCallback = failCallbackFactory(configObj);

    return new ExpressBrute(store, options);
};

const createMemoryBruteInstance = (configObj, failCallbackFactory, extraOptions = {}) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    const baseOptions = {
        attachResetToRequest: false,
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
    };

    const options = extend(baseOptions, pick(configObj, spamConfigKeys), extraOptions);
    options.failCallback = failCallbackFactory(configObj);

    return new ExpressBrute(memoryStore, options);
};

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

const createFailCallback = (messageTemplate, contextTemplate, extraFields = {}) => {
    return (configObj) => (req, res, next, nextValidRequestDate) => {
        const message = typeof messageTemplate === 'string'
            ? messageTemplate
            : tpl(messageTemplate.error, {
                rfa: (configObj && configObj.freeRetries) ? configObj.freeRetries + 1 : 5,
                rfp: (configObj && configObj.lifetime) ? configObj.lifetime : 60 * 60
            });

        const context = contextTemplate ? tpl(contextTemplate, {
            rfa: (configObj && configObj.freeRetries) ? configObj.freeRetries + 1 : 5,
            rfp: (configObj && configObj.lifetime) ? configObj.lifetime : 60 * 60
        }) : undefined;

        const errorOptions = {
            message: message,
            context: context,
            help: context
        };

        return next(new errors.TooManyRequestsError(extend(errorOptions, extraFields)));
    };
};

const createSimpleFailCallback = (message) => {
    return () => (req, res, next) => next(new errors.TooManyRequestsError({ message }));
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteInstance(
            require('brute-knex'),
            spam.global_block || {},
            createFailCallback(messages.forgottenPasswordIp.error, messages.forgottenPasswordIp.context),
            { attachResetToRequest: false }
        );
    }
    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createBruteInstance(
            require('brute-knex'),
            spam.global_reset || {},
            createFailCallback(messages.forgottenPasswordIp.error, messages.forgottenPasswordIp.context),
            { attachResetToRequest: false }
        );
    }
    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteInstance(
            require('brute-knex'),
            spam.webmentions_block || {},
            createSimpleFailCallback(messages.webmentionsBlock),
            { attachResetToRequest: false }
        );
    }
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteInstance(
            require('brute-knex'),
            spam.email_preview_block || {},
            createSimpleFailCallback(messages.emailPreviewBlock),
            { attachResetToRequest: false }
        );
    }
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(
            require('brute-knex'),
            spam.user_login || {},
            createFailCallback(
                'Too many sign-in attempts try again in {time}',
                messages.tooManySigninAttempts.context,
                { message: null }
            ),
            { attachResetToRequest: true }
        );
        // Override message with dynamic time
        const originalFailCallback = membersAuthInstance.failCallback;
        membersAuthInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many sign-in attempts try again in ${timeStr}`;
            return next(new errors.TooManyRequestsError({
                message: msg,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(
            require('brute-knex'),
            spam.member_login || {},
            createFailCallback(
                'Too many different sign-in attempts, try again in {time}',
                messages.tooManySigninAttempts.context,
                { message: null }
            ),
            { attachResetToRequest: true }
        );
        const originalFailCallback = membersAuthEnumerationInstance.failCallback;
        membersAuthEnumerationInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many different sign-in attempts, try again in ${timeStr}`;
            return next(new errors.TooManyRequestsError({
                message: msg,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(
            require('brute-knex'),
            spam.otc_verification_enumeration || {},
            createFailCallback(
                'Too many verification attempts across multiple codes, try again in {time}',
                messages.tooManyOTCVerificationAttempts.context,
                { message: null, code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED' }
            ),
            { attachResetToRequest: false }
        );
        const originalFailCallback = otcVerificationEnumerationInstance.failCallback;
        otcVerificationEnumerationInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many verification attempts across multiple codes, try again in ${timeStr}`;
            return next(new errors.TooManyRequestsError({
                message: msg,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        };
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(
            require('brute-knex'),
            spam.otc_verification || {},
            createFailCallback(
                'Too many attempts for this verification code, try again in {time}',
                messages.tooManyOTCVerificationAttempts.context,
                { message: null, code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED' }
            ),
            { attachResetToRequest: false }
        );
        const originalFailCallback = otcVerificationInstance.failCallback;
        otcVerificationInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many attempts for this verification code, try again in ${timeStr}`;
            return next(new errors.TooManyRequestsError({
                message: msg,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        };
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = createBruteInstance(
            require('brute-knex'),
            spam.user_login || {},
            createFailCallback(
                'Too many login attempts. Please wait {time} before trying again, or reset your password.',
                messages.tooManySigninAttempts.context,
                { message: null }
            ),
            { attachResetToRequest: true }
        );
        const originalFailCallback = userLoginInstance.failCallback;
        userLoginInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many login attempts. Please wait ${timeStr} before trying again, or reset your password.`;
            return next(new errors.TooManyRequestsError({
                message: msg,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        };
    }
    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createBruteInstance(
            require('brute-knex'),
            spam.user_reset || {},
            createFailCallback(messages.forgottenPasswordEmail.error, messages.forgottenPasswordEmail.context),
            { attachResetToRequest: true }
        );
        const originalFailCallback = userResetInstance.failCallback;
        userResetInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many password reset attempts try again in ${timeStr}`;
            return next(new errors.TooManyRequestsError({
                message: msg,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: (spam.user_reset && spam.user_reset.freeRetries) ? spam.user_reset.freeRetries + 1 : 5,
                    rfp: (spam.user_reset && spam.user_reset.lifetime) ? spam.user_reset.lifetime : 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        };
    }
    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteInstance(
            require('brute-knex'),
            spam.user_verification || {},
            createSimpleFailCallback(messages.tooManyAttempts),
            { attachResetToRequest: true }
        );
    }
    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteInstance(
            require('brute-knex'),
            spam.send_verification_code || {},
            createSimpleFailCallback(messages.tooManyAttempts),
            { attachResetToRequest: true }
        );
    }
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteInstance(
            require('brute-knex'),
            spam.private_block || {},
            createFailCallback(messages.tooManySigninAttempts.error, messages.tooManySigninAttempts.context),
            { attachResetToRequest: false }
        );
        const originalFailCallback = privateBlogInstance.failCallback;
        privateBlogInstance.failCallback = (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: (spam.private_block && spam.private_block.freeRetries) ? spam.private_block.freeRetries + 1 : 5,
                    rateSigninPeriod: (spam.private_block && spam.private_block.lifetime) ? spam.private_block.lifetime : 60 * 60
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            const timeStr = moment(nextValidRequestDate).fromNow(true);
            const msg = `Too many private sign-in attempts try again in ${timeStr}`;
            return next(new errors.TooManyRequestsError({ message: msg }));
        };
    }
    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createMemoryBruteInstance(
            spam.content_api_key || {},
            createSimpleFailCallback(messages.tooManyAttempts),
            { attachResetToRequest: true }
        );
        const originalFailCallback = contentApiKeyInstance.failCallback;
        contentApiKeyInstance.failCallback = (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        };
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
        otcVerificationEnumerationInstance = undefined;
        otcVerificationInstance = undefined;

        spam = config.get('spam') || {};
    }
};