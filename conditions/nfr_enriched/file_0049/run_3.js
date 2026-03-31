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
        spamConfig: {
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
            email_preview_block: spam.email_preview_block || {},
            otc_verification_enumeration: spam.otc_verification_enumeration || {},
            otc_verification: spam.otc_verification || {}
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

function getKnexStore() {
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

function createBruteInstance(bruteStore, spamConfigKey, options) {
    const ExpressBrute = require('express-brute');
    const spamConf = state.spamConfig[spamConfigKey] || {};
    return new ExpressBrute(
        bruteStore,
        Object.assign({}, options, pick(spamConf, SPAM_CONFIG_KEYS))
    );
}

function getOrCreateInstance(instanceKey, spamConfigKey, options, useMemoryStore = false) {
    if (!state.instances[instanceKey]) {
        const bruteStore = useMemoryStore ? getMemoryStore() : getKnexStore();
        state.instances[instanceKey] = createBruteInstance(bruteStore, spamConfigKey, options);
    }
    return state.instances[instanceKey];
}

function tooManyRequestsError(message, context, help, extra = {}) {
    return new errors.TooManyRequestsError(Object.assign({message, context, help}, extra));
}

function retryInError(message, nextValidRequestDate) {
    return `${message} ${moment(nextValidRequestDate).fromNow(true)}`;
}

// --- Public factory functions ---

const globalBlock = () => getOrCreateInstance('globalBlock', 'global_block', {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        const {freeRetries = 4, lifetime = 3600} = state.spamConfig.global_block;
        return next(tooManyRequestsError(
            retryInError('Too many attempts try again in', nextValidRequestDate),
            tpl(messages.forgottenPasswordIp.error, {rfa: freeRetries + 1, rfp: lifetime}),
            tpl(messages.tooManyAttempts)
        ));
    },
    handleStoreError
});

const globalReset = () => getOrCreateInstance('globalReset', 'global_reset', {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        const {freeRetries = 4, lifetime = 3600} = state.spamConfig.global_reset;
        return next(tooManyRequestsError(
            retryInError('Too many attempts try again in', nextValidRequestDate),
            tpl(messages.forgottenPasswordIp.error, {rfa: freeRetries + 1, rfp: lifetime}),
            tpl(messages.forgottenPasswordIp.context)
        ));
    },
    handleStoreError
});

const webmentionsBlock = () => getOrCreateInstance('webmentionsBlock', 'webmentions_block', {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(messages.webmentionsBlock));
    },
    handleStoreError
});

const emailPreviewBlock = () => getOrCreateInstance('emailPreviewBlock', 'email_preview_block', {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(messages.emailPreviewBlock));
    },
    handleStoreError
});

const membersAuth = () => getOrCreateInstance('membersAuth', 'user_login', {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryInError('Too many sign-in attempts try again in', nextValidRequestDate),
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ));
    },
    handleStoreError
});

const membersAuthEnumeration = () => getOrCreateInstance('membersAuthEnumeration', 'member_login', {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryInError('Too many different sign-in attempts, try again in', nextValidRequestDate),
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ));
    },
    handleStoreError
});

const otcVerificationEnumeration = () => getOrCreateInstance('otcVerificationEnumeration', 'otc_verification_enumeration', {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryInError('Too many verification attempts across multiple codes, try again in', nextValidRequestDate),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            {code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'}
        ));
    },
    handleStoreError
});

const otcVerification = () => getOrCreateInstance('otcVerification', 'otc_verification', {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryInError('Too many attempts for this verification code, try again in', nextValidRequestDate),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            {code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'}
        ));
    },
    handleStoreError
});

const userLogin = () => getOrCreateInstance('userLogin', 'user_login', {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ));
    },
    handleStoreError
});

const userReset = () => getOrCreateInstance('userReset', 'user_reset', {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        const {freeRetries = 4, lifetime = 3600} = state.spamConfig.user_reset;
        return next(tooManyRequestsError(
            retryInError('Too many password reset attempts try again in', nextValidRequestDate),
            tpl(messages.forgottenPasswordEmail.error, {rfa: freeRetries + 1, rfp: lifetime}),
            tpl(messages.forgottenPasswordEmail.context)
        ));
    },
    handleStoreError
});

const userVerification = () => getOrCreateInstance('userVerification', 'user_verification', {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
    },
    handleStoreError
});

const sendVerificationCode = () => getOrCreateInstance('sendVerificationCode', 'send_verification_code', {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
    },
    handleStoreError
});

const privateBlog = () => getOrCreateInstance('privateBlog', 'private_block', {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        const {freeRetries = 4, lifetime = 3600} = state.spamConfig.private_block;
        logging.error(tooManyRequestsError(
            tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: freeRetries + 1,
                rateSigninPeriod: lifetime
            }),
            tpl(messages.tooManySigninAttempts.context)
        ));
        return next(tooManyRequestsError(
            retryInError('Too many private sign-in attempts try again in', nextValidRequestDate)
        ));
    },
    handleStoreError
});

const contentApiKey = () => getOrCreateInstance('contentApiKey', 'content_api_key', {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        const err = tooManyRequestsError(tpl(messages.tooManyAttempts));
        logging.error(err);
        return next(err);
    },
    handleStoreError
}, true);

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