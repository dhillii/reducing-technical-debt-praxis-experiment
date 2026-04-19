```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

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

const createBruteInstance = (store, options, failCallback) => {
    return new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest,
        failCallback: (req, res, next, nextValidRequestDate) => {
            failCallback(req, res, next, nextValidRequestDate);
        },
        handleStoreError: handleStoreError
    }, pick(options, spamConfigKeys)));
};

const globalBlock = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamGlobalBlock.freeRetries + 1 || 5,
        lifetime: spamGlobalBlock.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {rfa: 5, rfp: 3600}),
            help: tpl(messages.tooManyAttempts)
        }));
    });
};

const globalReset = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamGlobalReset.freeRetries + 1 || 5,
        lifetime: spamGlobalReset.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {rfa: 5, rfp: 3600}),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    });
};

const webmentionsBlock = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamWebmentionsBlock.freeRetries + 1 || 5,
        lifetime: spamWebmentionsBlock.lifetime || 60 * 60
    }, (req, res, next) => {
        next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    });
};

const emailPreviewBlock = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamEmailPreviewBlock.freeRetries + 1 || 5,
        lifetime: spamEmailPreviewBlock.lifetime || 60 * 60
    }, (req, res, next) => {
        next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    });
};

const membersAuth = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamUserLogin.freeRetries + 1 || 5,
        lifetime: spamUserLogin.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    });
};

const membersAuthEnumeration = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamMemberLogin.freeRetries + 1 || 5,
        lifetime: spamMemberLogin.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    });
};

const otcVerificationEnumeration = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamOtcVerificationEnumeration.freeRetries + 1 || 5,
        lifetime: spamOtcVerificationEnumeration.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    });
};

const otcVerification = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamOtcVerification.freeRetries + 1 || 5,
        lifetime: spamOtcVerification.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    });
};

const userLogin = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamUserLogin.freeRetries + 1 || 5,
        lifetime: spamUserLogin.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    });
};

const userReset = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamUserReset.freeRetries + 1 || 5,
        lifetime: spamUserReset.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {rfa: 5, rfp: 3600}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    });
};

const userVerification = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamUserVerification.freeRetries + 1 || 5,
        lifetime: spamUserVerification.lifetime || 60 * 60
    }, (req, res, next) => {
        next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    });
};

const sendVerificationCode = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamSendVerificationCode.freeRetries + 1 || 5,
        lifetime: spamSendVerificationCode.lifetime || 60 * 60
    }, (req, res, next) => {
        next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    });
};

const privateBlog = () => {
    const store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return createBruteInstance(store, {
        attachResetToRequest: false,
        freeRetries: spamPrivateBlock.freeRetries + 1 || 5,
        lifetime: spamPrivateBlock.lifetime || 60 * 60
    }, (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: 5,
                rateSigninPeriod: 3600
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    });
};

const contentApiKey = () => {
    const store = memoryStore || new ExpressBrute.MemoryStore();

    return createBruteInstance(store, {
        attachResetToRequest: true,
        freeRetries: spamContentApiKey.freeRetries + 1 || 5,
        lifetime: spamContentApiKey.lifetime || 60 * 60
    }, (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        next(err);
    });
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
        spamPrivateBlock = spam.private_block || {};
        spamGlobalBlock = spam.global_block || {};
        spamGlobalReset = spam.global_reset || {};
        spamUserReset = spam.user_reset || {};
        spamUserLogin = spam.user_login || {};
        spamSendVerificationCode = spam.send_verification_code || {};
        spamUserVerification = spam.user_verification || {};
        spamMemberLogin = spam.member_login || {};
        spamContentApiKey = spam.content_api_key || {};
        spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
        spamOtcVerification = spam.otc_verification || {};
    }
};
```