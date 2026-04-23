const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const _ = require('lodash');

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

const createBruteInstance = (
    configObj,
    store,
    failCallback,
    instanceName,
    instanceVarName
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    return instance;
};

const createBruteInstanceWithReset = (
    configObj,
    store,
    failCallback,
    instanceName,
    instanceVarName
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, spamConfigKeys)));

    return instance;
};

const createGlobalBlock = () => {
    const spamGlobalBlock = config.get('spam')?.global_block || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: (spamGlobalBlock.freeRetries + 1) || 5,
                rfp: (spamGlobalBlock.lifetime || 60 * 60)
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    };

    return createBruteInstance(spamGlobalBlock, undefined, failCallback, 'globalBlock', 'globalBlockInstance');
};

const createGlobalReset = () => {
    const spamGlobalReset = config.get('spam')?.global_reset || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: (spamGlobalReset.freeRetries + 1) || 5,
                rfp: (spamGlobalReset.lifetime || 60 * 60)
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };

    return createBruteInstance(spamGlobalReset, undefined, failCallback, 'globalReset', 'globalResetInstance');
};

const createWebmentionsBlock = () => {
    const spamWebmentionsBlock = config.get('spam')?.webmentions_block || {};
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };

    return createBruteInstance(spamWebmentionsBlock, undefined, failCallback, 'webmentionsBlock', 'webmentionsBlockInstance');
};

const createEmailPreviewBlock = () => {
    const spamEmailPreviewBlock = config.get('spam')?.email_preview_block || {};
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };

    return createBruteInstance(spamEmailPreviewBlock, undefined, failCallback, 'emailPreviewBlock', 'emailPreviewBlockInstance');
};

const createMembersAuth = () => {
    const spamUserLogin = config.get('spam')?.user_login || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    return createBruteInstanceWithReset(spamUserLogin, undefined, failCallback, 'membersAuth', 'membersAuthInstance');
};

const createMembersAuthEnumeration = () => {
    const spamMemberLogin = config.get('spam')?.member_login || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    return createBruteInstanceWithReset(spamMemberLogin, undefined, failCallback, 'membersAuthEnumeration', 'membersAuthEnumerationInstance');
};

const createOtcVerificationEnumeration = () => {
    const spamOtcVerificationEnumeration = config.get('spam')?.otc_verification_enumeration || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };

    return createBruteInstance(spamOtcVerificationEnumeration, undefined, failCallback, 'otcVerificationEnumeration', 'otcVerificationEnumerationInstance');
};

const createOtcVerification = () => {
    const spamOtcVerification = config.get('spam')?.otc_verification || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };

    return createBruteInstance(spamOtcVerification, undefined, failCallback, 'otcVerification', 'otcVerificationInstance');
};

const createUserLogin = () => {
    const spamUserLogin = config.get('spam')?.user_login || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    return createBruteInstanceWithReset(spamUserLogin, undefined, failCallback, 'userLogin', 'userLoginInstance');
};

const createUserReset = () => {
    const spamUserReset = config.get('spam')?.user_reset || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: (spamUserReset.freeRetries + 1) || 5,
                rfp: (spamUserReset.lifetime || 60 * 60)
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };

    return createBruteInstanceWithReset(spamUserReset, undefined, failCallback, 'userReset', 'userResetInstance');
};

const createUserVerification = () => {
    const spamUserVerification = config.get('spam')?.user_verification || {};
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    return createBruteInstanceWithReset(spamUserVerification, undefined, failCallback, 'userVerification', 'userVerificationInstance');
};

const createSendVerificationCode = () => {
    const spamSendVerificationCode = config.get('spam')?.send_verification_code || {};
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    return createBruteInstanceWithReset(spamSendVerificationCode, undefined, failCallback, 'sendVerificationCode', 'sendVerificationCodeInstance');
};

const createPrivateBlog = () => {
    const spamPrivateBlock = config.get('spam')?.private_block || {};
    const failCallback = (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: (spamPrivateBlock.freeRetries + 1) || 5,
                rateSigninPeriod: (spamPrivateBlock.lifetime || 60 * 60)
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };

    return createBruteInstance(spamPrivateBlock, undefined, failCallback, 'privateBlog', 'privateBlogInstance');
};

const createContentApiKey = () => {
    const spamContentApiKey = config.get('spam')?.content_api_key || {};
    const memoryStore = new (require('express-brute').MemoryStore)();
    const failCallback = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };

    return createBruteInstance(spamContentApiKey, memoryStore, failCallback, 'contentApiKey', 'contentApiKeyInstance');
};

const reset = () => {
    const config = require('../../../../../shared/config');
    const spam = config.get('spam') || {};

    const spamPrivateBlock = spam.private_block || {};
    const spamGlobalBlock = spam.global_block || {};
    const spamGlobalReset = spam.global_reset || {};
    const spamUserReset = spam.user_reset || {};
    const spamUserLogin = spam.user_login || {};
    const spamSendVerificationCode = spam.send_verification_code || {};
    const spamUserVerification = spam.user_verification || {};
    const spamMemberLogin = spam.member_login || {};
    const spamContentApiKey = spam.content_api_key || {};
    const spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
    const spamOtcVerification = spam.otc_verification || {};

    const store = undefined;
    const memoryStore = undefined;
    const privateBlogInstance = undefined;
    const globalResetInstance = undefined;
    const globalBlockInstance = undefined;
    const webmentionsBlockInstance = undefined;
    const userLoginInstance = undefined;
    const membersAuthInstance = undefined;
    const membersAuthEnumerationInstance = undefined;
    const userResetInstance = undefined;
    const sendVerificationCodeInstance = undefined;
    const userVerificationInstance = undefined;
    const contentApiKeyInstance = undefined;
    const emailPreviewBlockInstance = undefined;
    const otcVerificationEnumerationInstance = undefined;
    const otcVerificationInstance = undefined;
};

module.exports = {
    globalBlock: createGlobalBlock,
    globalReset: createGlobalReset,
    userLogin: createUserLogin,
    sendVerificationCode: createSendVerificationCode,
    userVerification: createUserVerification,
    membersAuth: createMembersAuth,
    membersAuthEnumeration: createMembersAuthEnumeration,
    otcVerification: createOtcVerification,
    otcVerificationEnumeration: createOtcVerificationEnumeration,
    userReset: createUserReset,
    privateBlog: createPrivateBlog,
    contentApiKey: createContentApiKey,
    webmentionsBlock: createWebmentionsBlock,
    emailPreviewBlock: createEmailPreviewBlock,
    reset
};