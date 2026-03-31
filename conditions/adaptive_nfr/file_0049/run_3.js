```javascript
const moment = require('moment');
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

// Mutable state
let state = buildState();

function buildState() {
    const spam = config.get('spam') || {};
    return {
        spam,
        configs: {
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
        },
        store: null,
        memoryStore: null,
        instances: {}
    };
}

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

function getStore() {
    if (!state.store) {
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        state.store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return state.store;
}

function getMemoryStore() {
    if (!state.memoryStore) {
        const ExpressBrute = require('express-brute');
        state.memoryStore = new ExpressBrute.MemoryStore();
    }
    return state.memoryStore;
}

function createBruteInstance(bruteStore, spamConfig, options) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(
        bruteStore,
        Object.assign(
            { handleStoreError },
            options,
            pick(spamConfig, SPAM_CONFIG_KEYS)
        )
    );
}

function getInstance(key, factory) {
    if (!state.instances[key]) {
        state.instances[key] = factory();
    }
    return state.instances[key];
}

function tooManyRequestsError(message, context, help, extra = {}) {
    return new errors.TooManyRequestsError(Object.assign({ message, context, help }, extra));
}

function retryMessage(nextValidRequestDate) {
    return moment(nextValidRequestDate).fromNow(true);
}

// --- Public factory functions ---

const globalBlock = () => getInstance('globalBlock', () => createBruteInstance(
    getStore(),
    state.configs.globalBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many attempts try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: state.configs.globalBlock.freeRetries + 1 || 5,
                    rfp: state.configs.globalBlock.lifetime || 60 * 60
                }),
                tpl(messages.tooManyAttempts)
            ));
        }
    }
));

const globalReset = () => getInstance('globalReset', () => createBruteInstance(
    getStore(),
    state.configs.globalReset,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many attempts try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: state.configs.globalReset.freeRetries + 1 || 5,
                    rfp: state.configs.globalReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordIp.context)
            ));
        }
    }
));

const webmentionsBlock = () => getInstance('webmentionsBlock', () => createBruteInstance(
    getStore(),
    state.configs.webmentionsBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(messages.webmentionsBlock));
        }
    }
));

const emailPreviewBlock = () => getInstance('emailPreviewBlock', () => createBruteInstance(
    getStore(),
    state.configs.emailPreviewBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(messages.emailPreviewBlock));
        }
    }
));

const membersAuth = () => getInstance('membersAuth', () => createBruteInstance(
    getStore(),
    state.configs.userLogin,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many sign-in attempts try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ));
        }
    }
));

const membersAuthEnumeration = () => getInstance('membersAuthEnumeration', () => createBruteInstance(
    getStore(),
    state.configs.memberLogin,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many different sign-in attempts, try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ));
        }
    }
));

const otcVerificationEnumeration = () => getInstance('otcVerificationEnumeration', () => createBruteInstance(
    getStore(),
    state.configs.otcVerificationEnumeration,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many verification attempts across multiple codes, try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                { code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED' }
            ));
        }
    }
));

const otcVerification = () => getInstance('otcVerification', () => createBruteInstance(
    getStore(),
    state.configs.otcVerification,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many attempts for this verification code, try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                { code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED' }
            ));
        }
    }
));

const userLogin = () => getInstance('userLogin', () => createBruteInstance(
    getStore(),
    state.configs.userLogin,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many login attempts. Please wait ${retryMessage(nextValidRequestDate)} before trying again, or reset your password.`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ));
        }
    }
));

const userReset = () => getInstance('userReset', () => createBruteInstance(
    getStore(),
    state.configs.userReset,
    {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many password reset attempts try again in ${retryMessage(nextValidRequestDate)}`,
                tpl(messages.forgottenPasswordEmail.error, {
                    rfa: state.configs.userReset.freeRetries + 1 || 5,
                    rfp: state.configs.userReset.lifetime || 60 * 60
                }),
                tpl(messages.forgottenPasswordEmail.context)
            ));
        }
    }
));

const userVerification = () => getInstance('userVerification', () => createBruteInstance(
    getStore(),
    state.configs.userVerification,
    {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
        }
    }
));

const sendVerificationCode = () => getInstance('sendVerificationCode', () => createBruteInstance(
    getStore(),
    state.configs.sendVerificationCode,
    {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
        }
    }
));

const privateBlog = () => getInstance('privateBlog', () => createBruteInstance(
    getStore(),
    state.configs.privateBlock,
    {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            logging.error(tooManyRequestsError(
                tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: state.configs.privateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: state.configs.privateBlock.lifetime || 60 * 60
                }),
                tpl(messages.tooManySigninAttempts.context)
            ));
            return next(tooManyRequestsError(
                `Too many private sign-in attempts try again in ${retryMessage(nextValidRequestDate)}`
            ));
        }
    }
));

const contentApiKey = () => getInstance('contentApiKey', () => createBruteInstance(
    getMemoryStore(),
    state.configs.contentApiKey,
    {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = tooManyRequestsError(tpl(messages.tooManyAttempts));
            logging.error(err);
            return next(err);
        }
    }
));

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
        state = buildState();
    }
};
```