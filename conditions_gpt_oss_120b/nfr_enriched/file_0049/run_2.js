```javascript
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
const instances = {};

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

/**
 * Centralised error handling for Brute store errors.
 */
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

/**
 * Lazily creates a Knex-backed store for express-brute.
 */
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

/**
 * Lazily creates an in‑memory store for express‑brute.
 */
const getMemoryStore = () => {
    if (!memoryStore) {
        const ExpressBrute = require('express-brute');
        memoryStore = new ExpressBrute.MemoryStore();
    }
    return memoryStore;
};

/**
 * Factory that creates or returns cached ExpressBrute instances.
 *
 * @param {string} key Unique identifier for the instance.
 * @param {object} opts Configuration options.
 * @param {object} opts.spamConfig Spam configuration object.
 * @param {boolean} opts.attachReset Whether to attach reset to request.
 * @param {function} opts.failCallback Failure callback for the brute instance.
 * @param {boolean} [opts.useMemoryStore] Use in‑memory store instead of DB store.
 * @returns {ExpressBrute}
 */
const getBruteInstance = (key, {spamConfig, attachReset, failCallback, useMemoryStore = false}) => {
    if (instances[key]) {
        return instances[key];
    }

    const ExpressBrute = require('express-brute');
    const storeObj = useMemoryStore ? getMemoryStore() : getStore();

    instances[key] = new ExpressBrute(storeObj, extend({
        attachResetToRequest: attachReset,
        failCallback,
        handleStoreError
    }, pick(spamConfig, spamConfigKeys)));

    return instances[key];
};

/* ---------- Fail callbacks for each brute type ---------- */

/* globalBlock */
const globalBlockFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalBlock.freeRetries + 1 || 5,
            rfp: spamGlobalBlock.lifetime || 60 * 60
        }),
        help: tpl(messages.tooManyAttempts)
    }));
};

/* globalReset */
const globalResetFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: spamGlobalReset.freeRetries + 1 || 5,
            rfp: spamGlobalReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }));
};

/* webmentionsBlock */
const webmentionsFail = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    }));
};

/* emailPreviewBlock */
const emailPreviewFail = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    }));
};

/* membersAuth */
const membersAuthFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

/* membersAuthEnumeration */
const membersAuthEnumFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

/* otcVerificationEnumeration */
const otcVerificationEnumFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
};

/* otcVerification */
const otcVerificationFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }));
};

/* userLogin */
const userLoginFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
};

/* userReset */
const userResetFail = (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: spamUserReset.freeRetries + 1 || 5,
            rfp: spamUserReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    }));
};

/* userVerification */
const userVerificationFail = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
};

/* sendVerificationCode */
const sendVerificationCodeFail = (req, res, next) => {
    return next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    }));
};

/* privateBlog */
const privateBlogFail = (req, res, next, nextValidRequestDate) => {
    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));

    return next(new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
    }));
};

/* contentApiKey */
const contentApiKeyFail = (req, res, next) => {
    const err = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });
    logging.error(err);
    return next(err);
};

/* ---------- Exported wrapper functions ---------- */

const globalBlock = () => getBruteInstance('globalBlock', {
    spamConfig: spamGlobalBlock,
    attachReset: false,
    failCallback: globalBlockFail
});

const globalReset = () => getBruteInstance('globalReset', {
    spamConfig: spamGlobalReset,
    attachReset: false,
    failCallback: globalResetFail
});

const webmentionsBlock = () => getBruteInstance('webmentionsBlock', {
    spamConfig: spamWebmentionsBlock,
    attachReset: false,
    failCallback: webmentionsFail
});

const emailPreviewBlock = () => getBruteInstance('emailPreviewBlock', {
    spamConfig: spamEmailPreviewBlock,
    attachReset: false,
    failCallback: emailPreviewFail
});

const membersAuth = () => getBruteInstance('membersAuth', {
    spamConfig: spamUserLogin,
    attachReset: true,
    failCallback: membersAuthFail
});

const membersAuthEnumeration = () => getBruteInstance('membersAuthEnumeration', {
    spamConfig: spamMemberLogin,
    attachReset: true,
    failCallback: membersAuthEnumFail
});

const otcVerificationEnumeration = () => getBruteInstance('otcVerificationEnumeration', {
    spamConfig: spamOtcVerificationEnumeration,
    attachReset: false,
    failCallback: otcVerificationEnumFail
});

const otcVerification = () => getBruteInstance('otcVerification', {
    spamConfig: spamOtcVerification,
    attachReset: false,
    failCallback: otcVerificationFail
});

const userLogin = () => getBruteInstance('userLogin', {
    spamConfig: spamUserLogin,
    attachReset: true,
    failCallback: userLoginFail
});

const userReset = () => getBruteInstance('userReset', {
    spamConfig: spamUserReset,
    attachReset: true,
    failCallback: userResetFail
});

const userVerification = () => getBruteInstance('userVerification', {
    spamConfig: spamUserVerification,
    attachReset: true,
    failCallback: userVerificationFail
});

const sendVerificationCode = () => getBruteInstance('sendVerificationCode', {
    spamConfig: spamSendVerificationCode,
    attachReset: true,
    failCallback: sendVerificationCodeFail
});

const privateBlog = () => getBruteInstance('privateBlog', {
    spamConfig: spamPrivateBlock,
    attachReset: false,
    failCallback: privateBlogFail
});

const contentApiKey = () => getBruteInstance('contentApiKey', {
    spamConfig: spamContentApiKey,
    attachReset: true,
    failCallback: contentApiKeyFail,
    useMemoryStore: true
});

/**
 * Resets internal caches and reloads spam configuration.
 */
const reset = () => {
    store = undefined;
    memoryStore = undefined;
    Object.keys(instances).forEach(k => delete instances[k]);

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
    reset
};
```