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

function createBruteInstance(bruteStore, options, spamConfigKey) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(
        bruteStore,
        Object.assign({handleStoreError}, options, pick(state.spamConfig[spamConfigKey], spamConfigKeys))
    );
}

function retryMessage(nextValidRequestDate) {
    return moment(nextValidRequestDate).fromNow(true);
}

function getInstance(instanceKey, bruteStoreFn, options, spamConfigKey) {
    if (!state.instances[instanceKey]) {
        state.instances[instanceKey] = createBruteInstance(bruteStoreFn(), options, spamConfigKey);
    }
    return state.instances[instanceKey];
}

const globalBlock = () => getInstance('globalBlock', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: state.spamConfig.global_block.freeRetries + 1 || 5,
                rfp: state.spamConfig.global_block.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    }
}, 'global_block');

const globalReset = () => getInstance('globalReset', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: state.spamConfig.global_reset.freeRetries + 1 || 5,
                rfp: state.spamConfig.global_reset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    }
}, 'global_reset');

const webmentionsBlock = () => getInstance('webmentionsBlock', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({message: messages.webmentionsBlock}));
    }
}, 'webmentions_block');

const emailPreviewBlock = () => getInstance('emailPreviewBlock', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({message: messages.emailPreviewBlock}));
    }
}, 'email_preview_block');

const membersAuth = () => getInstance('membersAuth', getKnexStore, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
}, 'user_login');

const membersAuthEnumeration = () => getInstance('membersAuthEnumeration', getKnexStore, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
}, 'member_login');

const otcVerificationEnumeration = () => getInstance('otcVerificationEnumeration', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    }
}, 'otc_verification_enumeration');

const otcVerification = () => getInstance('otcVerification', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    }
}, 'otc_verification');

const userLogin = () => getInstance('userLogin', getKnexStore, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${retryMessage(nextValidRequestDate)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    }
}, 'user_login');

const userReset = () => getInstance('userReset', getKnexStore, {
    attachResetToRequest: true,
    failCallback(req, res, next, nextValidRequestDate) {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${retryMessage(nextValidRequestDate)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: state.spamConfig.user_reset.freeRetries + 1 || 5,
                rfp: state.spamConfig.user_reset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    }
}, 'user_reset');

const userVerification = () => getInstance('userVerification', getKnexStore, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)}));
    }
}, 'user_verification');

const sendVerificationCode = () => getInstance('sendVerificationCode', getKnexStore, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        return next(new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)}));
    }
}, 'send_verification_code');

const privateBlog = () => getInstance('privateBlog', getKnexStore, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: state.spamConfig.private_block.freeRetries + 1 || 5,
                rateSigninPeriod: state.spamConfig.private_block.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${retryMessage(nextValidRequestDate)}`
        }));
    }
}, 'private_block');

const contentApiKey = () => getInstance('contentApiKey', getMemoryStore, {
    attachResetToRequest: true,
    failCallback(req, res, next) {
        const err = new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)});
        logging.error(err);
        return next(err);
    }
}, 'content_api_key');

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