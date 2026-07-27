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
    failCallback,
    store,
    instanceName,
    instanceVarName,
    isMemoryStore = false
) => {
    const BruteKnex = require('brute-knex');
    const ExpressBrute = require('express-brute');
    const db = require('../../../../data/db');

    const knexStore = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(
        isMemoryStore ? new ExpressBrute.MemoryStore() : knexStore,
        extend({
            attachResetToRequest: false,
            failCallback,
            handleStoreError: handleStoreError
        }, pick(configObj, spamConfigKeys))
    );

    return instance;
};

const createBruteInstanceWithReset = (
    configObj,
    failCallback,
    store,
    instanceName,
    instanceVarName,
    isMemoryStore = false
) => {
    const BruteKnex = require('brute-knex');
    const ExpressBrute = require('express-brute');
    const db = require('../../../../data/db');

    const knexStore = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(
        isMemoryStore ? new ExpressBrute.MemoryStore() : knexStore,
        extend({
            attachResetToRequest: true,
            failCallback,
            handleStoreError: handleStoreError
        }, pick(configObj, spamConfigKeys))
    );

    return instance;
};

const createGlobalBlock = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: configObj.freeRetries + 1 || 5,
                rfp: configObj.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts)
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'globalBlock', 'globalBlockInstance');
};

const createGlobalReset = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: configObj.freeRetries + 1 || 5,
                rfp: configObj.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context)
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'globalReset', 'globalResetInstance');
};

const createWebmentionsBlock = (configObj) => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'webmentionsBlock', 'webmentionsBlockInstance');
};

const createEmailPreviewBlock = (configObj) => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'emailPreviewBlock', 'emailPreviewBlockInstance');
};

const createMembersAuth = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    return createBruteInstanceWithReset(configObj, failCallback, null, 'membersAuth', 'membersAuthInstance');
};

const createMembersAuthEnumeration = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    return createBruteInstanceWithReset(configObj, failCallback, null, 'membersAuthEnumeration', 'membersAuthEnumerationInstance');
};

const createOTCVerificationEnumeration = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'otcVerificationEnumeration', 'otcVerificationEnumerationInstance');
};

const createOTCVerification = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'otcVerification', 'otcVerificationInstance');
};

const createUserLogin = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };

    return createBruteInstanceWithReset(configObj, failCallback, null, 'userLogin', 'userLoginInstance');
};

const createUserReset = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: configObj.freeRetries + 1 || 5,
                rfp: configObj.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };

    return createBruteInstanceWithReset(configObj, failCallback, null, 'userReset', 'userResetInstance');
};

const createUserVerification = (configObj) => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    return createBruteInstanceWithReset(configObj, failCallback, null, 'userVerification', 'userVerificationInstance');
};

const createSendVerificationCode = (configObj) => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };

    return createBruteInstanceWithReset(configObj, failCallback, null, 'sendVerificationCode', 'sendVerificationCodeInstance');
};

const createPrivateBlog = (configObj) => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: configObj.freeRetries + 1 || 5,
                rateSigninPeriod: configObj.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };

    return createBruteInstance(configObj, failCallback, null, 'privateBlog', 'privateBlogInstance');
};

const createContentApiKey = (configObj) => {
    const failCallback = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };

    return createBruteInstance(configObj, failCallback, null, 'contentApiKey', 'contentApiKeyInstance', true);
};

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

let spam = config.get('spam') || {};
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

module.exports = {
    globalBlock: () => {
        if (!globalBlockInstance) {
            globalBlockInstance = createGlobalBlock(spamGlobalBlock);
        }
        return globalBlockInstance;
    },
    globalReset: () => {
        if (!globalResetInstance) {
            globalResetInstance = createGlobalReset(spamGlobalReset);
        }
        return globalResetInstance;
    },
    webmentionsBlock: () => {
        if (!webmentionsBlockInstance) {
            webmentionsBlockInstance = createWebmentionsBlock(spamWebmentionsBlock);
        }
        return webmentionsBlockInstance;
    },
    emailPreviewBlock: () => {
        if (!emailPreviewBlockInstance) {
            emailPreviewBlockInstance = createEmailPreviewBlock(spamEmailPreviewBlock);
        }
        return emailPreviewBlockInstance;
    },
    membersAuth: () => {
        if (!membersAuthInstance) {
            membersAuthInstance = createMembersAuth(spamUserLogin);
        }
        return membersAuthInstance;
    },
    membersAuthEnumeration: () => {
        if (!membersAuthEnumerationInstance) {
            membersAuthEnumerationInstance = createMembersAuthEnumeration(spamMemberLogin);
        }
        return membersAuthEnumerationInstance;
    },
    otcVerificationEnumeration: () => {
        if (!otcVerificationEnumerationInstance) {
            otcVerificationEnumerationInstance = createOTCVerificationEnumeration(spamOtcVerificationEnumeration);
        }
        return otcVerificationEnumerationInstance;
    },
    otcVerification: () => {
        if (!otcVerificationInstance) {
            otcVerificationInstance = createOTCVerification(spamOtcVerification);
        }
        return otcVerificationInstance;
    },
    userLogin: () => {
        if (!userLoginInstance) {
            userLoginInstance = createUserLogin(spamUserLogin);
        }
        return userLoginInstance;
    },
    userReset: () => {
        if (!userResetInstance) {
            userResetInstance = createUserReset(spamUserReset);
        }
        return userResetInstance;
    },
    userVerification: () => {
        if (!userVerificationInstance) {
            userVerificationInstance = createUserVerification(spamUserVerification);
        }
        return userVerificationInstance;
    },
    sendVerificationCode: () => {
        if (!sendVerificationCodeInstance) {
            sendVerificationCodeInstance = createSendVerificationCode(spamSendVerificationCode);
        }
        return sendVerificationCodeInstance;
    },
    privateBlog: () => {
        if (!privateBlogInstance) {
            privateBlogInstance = createPrivateBlog(spamPrivateBlock);
        }
        return privateBlogInstance;
    },
    contentApiKey: () => {
        if (!contentApiKeyInstance) {
            contentApiKeyInstance = createContentApiKey(spamContentApiKey);
        }
        return contentApiKeyInstance;
    },
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
        spamWebmentionsBlock = spam.webmentions_block || {};
        spamEmailPreviewBlock = spam.email_preview_block || {};
        spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
        spamOtcVerification = spam.otc_verification || {};
    }
};