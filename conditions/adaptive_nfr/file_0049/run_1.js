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

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

// Mutable state
let state = buildState();

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

// Instance cache
let instances = {};
let store;
let memoryStore;

// --- Store helpers ---

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
}

function getMemoryStore() {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
}

// --- Fail callback factories ---

function makeTimedFailCallback(getMessage) {
    return function failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError(getMessage(nextValidRequestDate)));
    };
}

function makeSimpleFailCallback(getMessage, shouldLog = false) {
    return function failCallback(req, res, next) {
        const err = new errors.TooManyRequestsError(getMessage());
        if (shouldLog) {
            logging.error(err);
        }
        return next(err);
    };
}

// --- Brute instance factory ---

function createBruteInstance(storeGetter, spamConfig, options) {
    const ExpressBrute = require('express-brute');
    const bruteStore = storeGetter();
    return new ExpressBrute(
        bruteStore,
        Object.assign(
            { handleStoreError },
            options,
            pick(spamConfig, spamConfigKeys)
        )
    );
}

function getOrCreate(key, storeGetter, spamConfig, options) {
    if (!instances[key]) {
        instances[key] = createBruteInstance(storeGetter, spamConfig, options);
    }
    return instances[key];
}

// --- Public API ---

const globalBlock = () => getOrCreate('globalBlock', getKnexStore, state.spamGlobalBlock, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: state.spamGlobalBlock.freeRetries + 1 || 5,
            rfp: state.spamGlobalBlock.lifetime || 60 * 60
        }),
        help: tpl(messages.tooManyAttempts)
    }))
});

const globalReset = () => getOrCreate('globalReset', getKnexStore, state.spamGlobalReset, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: state.spamGlobalReset.freeRetries + 1 || 5,
            rfp: state.spamGlobalReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }))
});

const webmentionsBlock = () => getOrCreate('webmentionsBlock', getKnexStore, state.spamWebmentionsBlock, {
    attachResetToRequest: false,
    failCallback: makeSimpleFailCallback(() => ({ message: messages.webmentionsBlock }))
});

const emailPreviewBlock = () => getOrCreate('emailPreviewBlock', getKnexStore, state.spamEmailPreviewBlock, {
    attachResetToRequest: false,
    failCallback: makeSimpleFailCallback(() => ({ message: messages.emailPreviewBlock }))
});

const membersAuth = () => getOrCreate('membersAuth', getKnexStore, state.spamUserLogin, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }))
});

const membersAuthEnumeration = () => getOrCreate('membersAuthEnumeration', getKnexStore, state.spamMemberLogin, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }))
});

const otcVerificationEnumeration = () => getOrCreate('otcVerificationEnumeration', getKnexStore, state.spamOtcVerificationEnumeration, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }))
});

const otcVerification = () => getOrCreate('otcVerification', getKnexStore, state.spamOtcVerification, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }))
});

const userLogin = () => getOrCreate('userLogin', getKnexStore, state.spamUserLogin, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }))
});

const userReset = () => getOrCreate('userReset', getKnexStore, state.spamUserReset, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: state.spamUserReset.freeRetries + 1 || 5,
            rfp: state.spamUserReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    }))
});

const userVerification = () => getOrCreate('userVerification', getKnexStore, state.spamUserVerification, {
    attachResetToRequest: true,
    failCallback: makeSimpleFailCallback(() => ({ message: tpl(messages.tooManyAttempts) }))
});

const sendVerificationCode = () => getOrCreate('sendVerificationCode', getKnexStore, state.spamSendVerificationCode, {
    attachResetToRequest: true,
    failCallback: makeSimpleFailCallback(() => ({ message: tpl(messages.tooManyAttempts) }))
});

const privateBlog = () => getOrCreate('privateBlog', getKnexStore, state.spamPrivateBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: state.spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: state.spamPrivateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
});

const contentApiKey = () => getOrCreate('contentApiKey', getMemoryStore, state.spamContentApiKey, {
    attachResetToRequest: true,
    failCallback: makeSimpleFailCallback(() => ({ message: tpl(messages.tooManyAttempts) }), true)
});

const reset = () => {
    store = undefined;
    memoryStore = undefined;
    instances = {};
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