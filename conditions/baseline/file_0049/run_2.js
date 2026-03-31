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

let state = buildState();

function buildState() {
    const spam = config.get('spam') || {};
    return {
        spam,
        spamConfigs: {
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

function createBruteInstance(store, spamConfig, options) {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(
        store,
        Object.assign({ handleStoreError }, options, pick(spamConfig, SPAM_CONFIG_KEYS))
    );
}

function getInstance(key, factory) {
    if (!state.instances[key]) {
        state.instances[key] = factory();
    }
    return state.instances[key];
}

function tooManyRequestsError(message, context, help, extra = {}) {
    return new errors.TooManyRequestsError({ message, context, help, ...extra });
}

function retryMessage(nextValidRequestDate, prefix) {
    return `${prefix} ${moment(nextValidRequestDate).fromNow(true)}`;
}

const globalBlock = () => getInstance('globalBlock', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.globalBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many attempts try again in'),
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: state.spamConfigs.globalBlock.freeRetries + 1 || 5,
                    rfp: state.spamConfigs.globalBlock.lifetime || 3600
                }),
                tpl(messages.tooManyAttempts)
            ));
        }
    })
);

const globalReset = () => getInstance('globalReset', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.globalReset, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many attempts try again in'),
                tpl(messages.forgottenPasswordIp.error, {
                    rfa: state.spamConfigs.globalReset.freeRetries + 1 || 5,
                    rfp: state.spamConfigs.globalReset.lifetime || 3600
                }),
                tpl(messages.forgottenPasswordIp.context)
            ));
        }
    })
);

const webmentionsBlock = () => getInstance('webmentionsBlock', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.webmentionsBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(messages.webmentionsBlock));
        }
    })
);

const emailPreviewBlock = () => getInstance('emailPreviewBlock', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.emailPreviewBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(messages.emailPreviewBlock));
        }
    })
);

const membersAuth = () => getInstance('membersAuth', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.userLogin, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many sign-in attempts try again in'),
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ));
        }
    })
);

const membersAuthEnumeration = () => getInstance('membersAuthEnumeration', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.memberLogin, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many different sign-in attempts, try again in'),
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ));
        }
    })
);

const otcVerificationEnumeration = () => getInstance('otcVerificationEnumeration', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.otcVerificationEnumeration, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many verification attempts across multiple codes, try again in'),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                { code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED' }
            ));
        }
    })
);

const otcVerification = () => getInstance('otcVerification', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.otcVerification, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many attempts for this verification code, try again in'),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                tpl(messages.tooManyOTCVerificationAttempts.context),
                { code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED' }
            ));
        }
    })
);

const userLogin = () => getInstance('userLogin', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.userLogin, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                tpl(messages.tooManySigninAttempts.context),
                tpl(messages.tooManySigninAttempts.context)
            ));
        }
    })
);

const userReset = () => getInstance('userReset', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.userReset, {
        attachResetToRequest: true,
        failCallback(req, res, next, nextValidRequestDate) {
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many password reset attempts try again in'),
                tpl(messages.forgottenPasswordEmail.error, {
                    rfa: state.spamConfigs.userReset.freeRetries + 1 || 5,
                    rfp: state.spamConfigs.userReset.lifetime || 3600
                }),
                tpl(messages.forgottenPasswordEmail.context)
            ));
        }
    })
);

const userVerification = () => getInstance('userVerification', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.userVerification, {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
        }
    })
);

const sendVerificationCode = () => getInstance('sendVerificationCode', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.sendVerificationCode, {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            return next(tooManyRequestsError(tpl(messages.tooManyAttempts)));
        }
    })
);

const privateBlog = () => getInstance('privateBlog', () =>
    createBruteInstance(getKnexStore(), state.spamConfigs.privateBlock, {
        attachResetToRequest: false,
        failCallback(req, res, next, nextValidRequestDate) {
            logging.error(tooManyRequestsError(
                tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: state.spamConfigs.privateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: state.spamConfigs.privateBlock.lifetime || 3600
                }),
                tpl(messages.tooManySigninAttempts.context)
            ));
            return next(tooManyRequestsError(
                retryMessage(nextValidRequestDate, 'Too many private sign-in attempts try again in')
            ));
        }
    })
);

const contentApiKey = () => getInstance('contentApiKey', () =>
    createBruteInstance(getMemoryStore(), state.spamConfigs.contentApiKey, {
        attachResetToRequest: true,
        failCallback(req, res, next) {
            const err = tooManyRequestsError(tpl(messages.tooManyAttempts));
            logging.error(err);
            return next(err);
        }
    })
);

const reset = () => {
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