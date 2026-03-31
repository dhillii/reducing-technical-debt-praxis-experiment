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

function getOrCreateInstance(instanceKey, factory) {
    if (!state.instances[instanceKey]) {
        state.instances[instanceKey] = factory();
    }
    return state.instances[instanceKey];
}

function createKnexBruteInstance(instanceKey, spamConfig, options) {
    return getOrCreateInstance(instanceKey, () =>
        createBruteInstance(getKnexStore(), spamConfig, options)
    );
}

// --- Public spam protection factories ---

const globalBlock = () => createKnexBruteInstance('globalBlock', state.spamConfigs.globalBlock, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: state.spamConfigs.globalBlock.freeRetries + 1 || 5,
            rfp: state.spamConfigs.globalBlock.lifetime || 60 * 60
        }),
        help: tpl(messages.tooManyAttempts)
    }))
});

const globalReset = () => createKnexBruteInstance('globalReset', state.spamConfigs.globalReset, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: state.spamConfigs.globalReset.freeRetries + 1 || 5,
            rfp: state.spamConfigs.globalReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }))
});

const webmentionsBlock = () => createKnexBruteInstance('webmentionsBlock', state.spamConfigs.webmentionsBlock, {
    attachResetToRequest: false,
    failCallback: makeSimpleFailCallback(() => ({ message: messages.webmentionsBlock }))
});

const emailPreviewBlock = () => createKnexBruteInstance('emailPreviewBlock', state.spamConfigs.emailPreviewBlock, {
    attachResetToRequest: false,
    failCallback: makeSimpleFailCallback(() => ({ message: messages.emailPreviewBlock }))
});

const membersAuth = () => createKnexBruteInstance('membersAuth', state.spamConfigs.userLogin, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }))
});

const membersAuthEnumeration = () => createKnexBruteInstance('membersAuthEnumeration', state.spamConfigs.memberLogin, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }))
});

const otcVerificationEnumeration = () => createKnexBruteInstance('otcVerificationEnumeration', state.spamConfigs.otcVerificationEnumeration, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }))
});

const otcVerification = () => createKnexBruteInstance('otcVerification', state.spamConfigs.otcVerification, {
    attachResetToRequest: false,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }))
});

const userLogin = () => createKnexBruteInstance('userLogin', state.spamConfigs.userLogin, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }))
});

const userReset = () => createKnexBruteInstance('userReset', state.spamConfigs.userReset, {
    attachResetToRequest: true,
    failCallback: makeTimedFailCallback(nextValidRequestDate => ({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: state.spamConfigs.userReset.freeRetries + 1 || 5,
            rfp: state.spamConfigs.userReset.lifetime || 60 * 60
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    }))
});

const userVerification = () => createKnexBruteInstance('userVerification', state.spamConfigs.userVerification, {
    attachResetToRequest: true,
    failCallback: makeSimpleFailCallback(() => ({ message: tpl(messages.tooManyAttempts) }))
});

const sendVerificationCode = () => createKnexBruteInstance('sendVerificationCode', state.spamConfigs.sendVerificationCode, {
    attachResetToRequest: true,
    failCallback: makeSimpleFailCallback(() => ({ message: tpl(messages.tooManyAttempts) }))
});

const privateBlog = () => createKnexBruteInstance('privateBlog', state.spamConfigs.privateBlock, {
    attachResetToRequest: false,
    failCallback(req, res, next, nextValidRequestDate) {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: state.spamConfigs.privateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: state.spamConfigs.privateBlock.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    }
});

const contentApiKey = () => getOrCreateInstance('contentApiKey', () =>
    createBruteInstance(getMemoryStore(), state.spamConfigs.contentApiKey, {
        attachResetToRequest: true,
        failCallback: makeSimpleFailCallback(() => ({ message: tpl(messages.tooManyAttempts) }), true)
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