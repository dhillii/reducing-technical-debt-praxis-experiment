```javascript
const moment = require('moment');
const {extend, pick} = require('lodash');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];
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

let store;
let memoryStore;
let instances = {};

const handleStoreError = err => {
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
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

const createInstance = (key, spamConfig, failCallback, attachReset = false) => {
    if (instances[key]) return instances[key];

    const opts = extend(
        {
            attachResetToRequest: attachReset,
            failCallback,
            handleStoreError
        },
        pick(spamConfig, spamConfigKeys)
    );

    const brute = new ExpressBrute(
        key.includes('memory') ? memoryStore : getStore(),
        opts
    );

    instances[key] = brute;
    return brute;
};

const initMemoryStore = () => {
    if (!memoryStore) memoryStore = new ExpressBrute.MemoryStore();
};

const getSpam = () => config.get('spam') || {};

const getSpamBlock = (type) => (getSpam()[type] || {});

const globalBlock = () => createInstance(
    'globalBlock',
    getSpamBlock('global_block'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: (getSpamBlock('global_block').freeRetries ?? 5) + 1,
            rfp: getSpamBlock('global_block').lifetime ?? 3600
        }),
        help: tpl(messages.tooManyAttempts)
    }))
);

const globalReset = () => createInstance(
    'globalReset',
    getSpamBlock('global_reset'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: (getSpamBlock('global_reset').freeRetries ?? 5) + 1,
            rfp: getSpamBlock('global_reset').lifetime ?? 3600
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }))
);

const webmentionsBlock = () => createInstance(
    'webmentionsBlock',
    getSpamBlock('webmentions_block'),
    (req, res, next) => next(new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    }))
);

const emailPreviewBlock = () => createInstance(
    'emailPreviewBlock',
    getSpamBlock('email_preview_block'),
    (req, res, next) => next(new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    }))
);

const membersAuth = () => createInstance(
    'membersAuth',
    getSpamBlock('user_login'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    })),
    true
);

const membersAuthEnumeration = () => createInstance(
    'membersAuthEnumeration',
    getSpamBlock('member_login'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    })),
    true
);

const otcVerificationEnumeration = () => createInstance(
    'otcVerificationEnumeration',
    getSpamBlock('otc_verification_enumeration'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }))
);

const otcVerification = () => createInstance(
    'otcVerification',
    getSpamBlock('otc_verification'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }))
);

const userLogin = () => createInstance(
    'userLogin',
    getSpamBlock('user_login'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    })),
    true
);

const userReset = () => createInstance(
    'userReset',
    getSpamBlock('user_reset'),
    (req, res, next, nextValidRequestDate) => next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: (getSpamBlock('user_reset').freeRetries ?? 5) + 1,
            rfp: getSpamBlock('user_reset').lifetime ?? 3600
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    })),
    true
);

const userVerification = () => createInstance(
    'userVerification',
    getSpamBlock('user_verification'),
    (req, res, next) => next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    })),
    true
);

const sendVerificationCode = () => createInstance(
    'sendVerificationCode',
    getSpamBlock('send_verification_code'),
    (req, res, next) => next(new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    })),
    true
);

const privateBlog = () => createInstance(
    'privateBlog',
    getSpamBlock('private_block'),
    (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: (getSpamBlock('private_block').freeRetries ?? 5) + 1,
                rateSigninPeriod: getSpamBlock('private_block').lifetime ?? 3600
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));
        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
);

const contentApiKey = () => {
    initMemoryStore();
    return createInstance(
        'contentApiKeyMemory',
        getSpamBlock('content_api_key'),
        (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });
            logging.error(err);
            return next(err);
        },
        true
    );
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
        instances = {};

        // Force re‑load of spam config on next call
        // (config module caches values, so we just clear our local copy)
    }
};
```