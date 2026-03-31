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

// Mutable state
let state = buildState();
const instances = {};

function buildState() {
    const spam = config.get('spam') || {};
    return {
        spam,
        spamPrivateBlock: spam.private_block || {},
        spamGlobalBlock: spam.global_block || {},
        spamGlobalReset: spam.global_reset || {},
        spamUserReset: spam.user_reset || {},
        spamUserLogin: spam.user_login || {},
        spamSendVerificationCode: spam.send_verification_code || {},
        spamUserVerification: spam.user_verification || {},
        spamMemberLogin: spam.member_login || {},
        spamContentApiKey: spam.content_api_key || {},
        spamWebmentionsBlock: spam.webmentions_block || {},
        spamEmailPreviewBlock: spam.email_preview_block || {},
        spamOtcVerificationEnumeration: spam.otc_verification_enumeration || {},
        spamOtcVerification: spam.otc_verification || {}
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
}

function getMemoryStore() {
    if (!instances.memoryStore) {
        const ExpressBrute = require('express-brute');
        instances.memoryStore = new ExpressBrute.MemoryStore();
    }
    return instances.memoryStore;
}

function createBruteInstance(storeGetter, spamConfig, options) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(
        storeGetter(),
        extend({ handleStoreError }, options, pick(spamConfig, SPAM_CONFIG_KEYS))
    );
}

function tooManyRequestsError(message, context, help, extra = {}) {
    return new errors.TooManyRequestsError({ message, context, help, ...extra });
}

function retryMessage(nextValidRequestDate, prefix = 'Too many attempts') {
    return `${prefix} try again in ${moment(nextValidRequestDate).fromNow(true)}`;
}

// Factory for singleton brute instances
function getInstance(key, storeGetter, spamConfig, options) {
    if (!instances[key]) {
        instances[key] = createBruteInstance(storeGetter, spamConfig, options);
    }
    return instances[key];
}

const globalBlock = () => getInstance('globalBlock', getKnexStore, state.spamGlobalBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryMessage(nextValidRequestDate, 'Too many attempts'),
            tpl(messages.forgottenPasswordIp.error, {
                rfa: state.spamGlobalBlock.freeRetries + 1 || 5,
                rfp: state.spamGlobalBlock.lifetime || 60 * 60
            }),
            tpl(messages.tooManyAttempts)
        ));
    }
});

const globalReset = () => getInstance('globalReset', getKnexStore, state.spamGlobalReset, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryMessage(nextValidRequestDate, 'Too many attempts'),
            tpl(messages.forgottenPasswordIp.error, {
                rfa: state.spamGlobalReset.freeRetries + 1 || 5,
                rfp: state.spamGlobalReset.lifetime || 60 * 60
            }),
            tpl(messages.forgottenPasswordIp.context)
        ));
    }
});

const webmentionsBlock = () => getInstance('webmentionsBlock', getKnexStore, state.spamWebmentionsBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(messages.webmentionsBlock));
    }
});

const emailPreviewBlock = () => getInstance('emailPreviewBlock', getKnexStore, state.spamEmailPreviewBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(messages.emailPreviewBlock));
    }
});

const membersAuth = () => getInstance('membersAuth', getKnexStore, state.spamUserLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ));
    }
});

const membersAuthEnumeration = () => getInstance('membersAuthEnumeration', getKnexStore, state.spamMemberLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ));
    }
});

const otcVerificationEnumeration = () => getInstance('otcVerificationEnumeration', getKnexStore, state.spamOtcVerificationEnumeration, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            { code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED' }
        ));
    }
});

const otcVerification = () => getInstance('otcVerification', getKnexStore, state.spamOtcVerification, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            tpl(messages.tooManyOTCVerificationAttempts.context),
            tpl(messages.tooManyOTCVerificationAttempts.context),
            { code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED' }
        ));
    }
});

const userLogin = () => getInstance('userLogin', getKnexStore, state.spamUserLogin, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            tpl(messages.tooManySigninAttempts.context),
            tpl(messages.tooManySigninAttempts.context)
        ));
    }
});

const userReset = () => getInstance('userReset', getKnexStore, state.spamUserReset, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(tooManyRequestsError(
            retryMessage(nextValidRequestDate, 'Too many password reset attempts'),
            tpl(messages.forgottenPasswordEmail.error, {
                rfa: state.spamUserReset.freeRetries + 1 || 5,
                rfp: state.spamUserReset.lifetime || 60 * 60
            }),
            tpl(messages.forgottenPasswordEmail.context)
        ));
    }
});

const userVerification = () => getInstance('userVerification', getKnexStore, state.spamUserVerification, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
    }
});

const sendVerificationCode = () => getInstance('sendVerificationCode', getKnexStore, state.spamSendVerificationCode, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
    }
});

const privateBlog = () => getInstance('privateBlog', getKnexStore, state.spamPrivateBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(tooManyRequestsError(
            tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: state.spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: state.spamPrivateBlock.lifetime || 60 * 60
            }),
            tpl(messages.tooManySigninAttempts.context)
        ));
        return next(tooManyRequestsError(
            `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        ));
    }
});

const contentApiKey = () => getInstance('contentApiKey', getMemoryStore, state.spamContentApiKey, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        const err = tooManyRequestsError(tpl(messages.tooManyAttempts));
        logging.error(err);
        return next(err);
    }
});

const reset = () => {
    Object.keys(instances).forEach(key => delete instances[key]);
    state = buildState();
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
    reset
};
```