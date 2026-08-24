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
let privateBlogInstance;
let globalResetInstance;
let globalBlockInstance;
let webmentionsBlockInstance;
let userLoginInstance;
let membersAuthInstance;
let membersAuthEnumerationInstance;
let userResetInstance;
let sendVerificationCodeInstance;
let userVerificationInstance;
let contentApiKeyInstance;
let emailPreviewBlockInstance;
let otcVerificationEnumerationInstance;
let otcVerificationInstance;

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

const createExpressBruteInstance = (store, configOptions, failCallback) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(configOptions, spamConfigKeys)));
};

const createMemoryStoreBruteInstance = (configOptions, failCallback) => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return new ExpressBrute(memoryStore, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError
    }, pick(configOptions, spamConfigKeys)));
};

const createGlobalBlockFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error,
            {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
        help: tpl(messages.tooManyAttempts)
    });
};

const createGlobalResetFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error,
            {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
        help: tpl(messages.forgottenPasswordIp.context)
    });
};

const createWebmentionsBlockFailCallback = () => {
    return new errors.TooManyRequestsError({
        message: messages.webmentionsBlock
    });
};

const createEmailPreviewBlockFailCallback = () => {
    return new errors.TooManyRequestsError({
        message: messages.emailPreviewBlock
    });
};

const createMembersAuthFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });
};

const createMembersAuthEnumerationFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });
};

const createOtcVerificationEnumerationFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    });
};

const createOtcVerificationFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    });
};

const createUserLoginFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });
};

const createUserResetFailCallback = (nextValidRequestDate) => {
    return new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error,
            {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
        help: tpl(messages.forgottenPasswordEmail.context)
    });
};

const createUserVerificationFailCallback = () => {
    return new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });
};

const createSendVerificationCodeFailCallback = () => {
    return new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });
};

const createPrivateBlogFailCallback = (nextValidRequestDate) => {
    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error,
            {
                rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
            }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));

    return new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
    });
};

const createContentApiKeyFailCallback = () => {
    const err = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });

    logging.error(err);
    return err;
};

const globalBlock = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!globalBlockInstance) {
        globalBlockInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createGlobalBlockFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamGlobalBlock, spamConfigKeys))
        );
    }

    return globalBlockInstance;
};

const globalReset = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!globalResetInstance) {
        globalResetInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createGlobalResetFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamGlobalReset, spamConfigKeys))
        );
    }

    return globalResetInstance;
};

const webmentionsBlock = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next) {
                    return next(createWebmentionsBlockFailCallback());
                },
                handleStoreError
            }, pick(spamWebmentionsBlock, spamConfigKeys))
        );
    }

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next) {
                    return next(createEmailPreviewBlockFailCallback());
                },
                handleStoreError
            }, pick(spamEmailPreviewBlock, spamConfigKeys))
        );
    }

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!membersAuthInstance) {
        membersAuthInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createMembersAuthFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamUserLogin, spamConfigKeys))
        );
    }

    return membersAuthInstance;
};

/**
 * This one should have higher limits because it checks across all email addresses
 */
const membersAuthEnumeration = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createMembersAuthEnumerationFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamMemberLogin, spamConfigKeys))
        );
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createOtcVerificationEnumerationFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamOtcVerificationEnumeration, spamConfigKeys))
        );
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!otcVerificationInstance) {
        otcVerificationInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createOtcVerificationFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamOtcVerification, spamConfigKeys))
        );
    }

    return otcVerificationInstance;
};

const userLogin = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!userLoginInstance) {
        userLoginInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createUserLoginFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamUserLogin, spamConfigKeys))
        );
    }

    return userLoginInstance;
};

const userReset = function userReset() {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!userResetInstance) {
        userResetInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createUserResetFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamUserReset, spamConfigKeys))
        );
    }

    return userResetInstance;
};

const userVerification = function userVerification() {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!userVerificationInstance) {
        userVerificationInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next) {
                    return next(createUserVerificationFailCallback());
                },
                handleStoreError
            }, pick(spamUserVerification, spamConfigKeys))
        );
    }

    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next) {
                    return next(createSendVerificationCodeFailCallback());
                },
                handleStoreError
            }, pick(spamSendVerificationCode, spamConfigKeys))
        );
    }

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    if (!privateBlogInstance) {
        privateBlogInstance = new ExpressBrute(store,
            extend({
                attachResetToRequest: false,
                failCallback(req, res, next, nextValidRequestDate) {
                    return next(createPrivateBlogFailCallback(nextValidRequestDate));
                },
                handleStoreError
            }, pick(spamPrivateBlock, spamConfigKeys))
        );
    }

    return privateBlogInstance;
};

const contentApiKey = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    if (!contentApiKeyInstance) {
        contentApiKeyInstance = new ExpressBrute(memoryStore,
            extend({
                attachResetToRequest: true,
                failCallback(req, res, next) {
                    return next(createContentApiKeyFailCallback());
                },
                handleStoreError
            }, pick(spamContentApiKey, spamConfigKeys))
        );
    }

    return contentApiKeyInstance;
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