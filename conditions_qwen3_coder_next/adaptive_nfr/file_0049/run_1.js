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

const createBruteKnexStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    return new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });
};

const createMemoryStore = () => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute.MemoryStore();
};

const createExpressBruteInstance = (store, options) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(store, options);
};

const buildFailCallback = (message, context, help, code) => {
    return (req, res, next, nextValidRequestDate) => {
        const formattedMessage = nextValidRequestDate
            ? `${message} ${moment(nextValidRequestDate).fromNow(true)}`
            : message;

        const errorOptions = {
            message: formattedMessage,
            context: context,
            help: help
        };

        if (code) {
            errorOptions.code = code;
        }

        return next(new errors.TooManyRequestsError(errorOptions));
    };
};

const buildGlobalBlockFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many attempts try again in`,
        tpl(messages.forgottenPasswordIp.error, {
            rfa: spamConfig.freeRetries + 1 || 5,
            rfp: spamConfig.lifetime || 60 * 60
        }),
        tpl(messages.tooManyAttempts)
    );
};

const buildGlobalResetFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many attempts try again in`,
        tpl(messages.forgottenPasswordIp.error, {
            rfa: spamConfig.freeRetries + 1 || 5,
            rfp: spamConfig.lifetime || 60 * 60
        }),
        tpl(messages.forgottenPasswordIp.context)
    );
};

const buildWebmentionsBlockFailCallback = () => {
    return buildFailCallback(
        messages.webmentionsBlock,
        undefined,
        undefined
    );
};

const buildEmailPreviewBlockFailCallback = () => {
    return buildFailCallback(
        messages.emailPreviewBlock,
        undefined,
        undefined
    );
};

const buildMembersAuthFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many sign-in attempts try again in`,
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );
};

const buildMembersAuthEnumerationFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many different sign-in attempts, try again in`,
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );
};

const buildOtcVerificationEnumerationFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many verification attempts across multiple codes, try again in`,
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    );
};

const buildOtcVerificationFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many attempts for this verification code, try again in`,
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    );
};

const buildUserLoginFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many login attempts. Please wait`,
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );
};

const buildUserResetFailCallback = (spamConfig) => {
    return buildFailCallback(
        `Too many password reset attempts try again in`,
        tpl(messages.forgottenPasswordEmail.error, {
            rfa: spamConfig.freeRetries + 1 || 5,
            rfp: spamConfig.lifetime || 60 * 60
        }),
        tpl(messages.forgottenPasswordEmail.context)
    );
};

const buildUserVerificationFailCallback = () => {
    return buildFailCallback(
        tpl(messages.tooManyAttempts),
        undefined,
        undefined
    );
};

const buildSendVerificationCodeFailCallback = () => {
    return buildFailCallback(
        tpl(messages.tooManyAttempts),
        undefined,
        undefined
    );
};

const buildPrivateBlogFailCallback = (spamConfig) => {
    return (req, res, next, nextValidRequestDate) => {
        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts: spamConfig.freeRetries + 1 || 5,
                rateSigninPeriod: spamConfig.lifetime || 60 * 60
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
};

const buildContentApiKeyFailCallback = () => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

const createGlobalBlockInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildGlobalBlockFailCallback(spamGlobalBlock),
        handleStoreError: handleStoreError,
        ...pick(spamGlobalBlock, spamConfigKeys)
    });
};

const createGlobalResetInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildGlobalResetFailCallback(spamGlobalReset),
        handleStoreError: handleStoreError,
        ...pick(spamGlobalReset, spamConfigKeys)
    });
};

const createWebmentionsBlockInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildWebmentionsBlockFailCallback(),
        handleStoreError: handleStoreError,
        ...pick(spamWebmentionsBlock, spamConfigKeys)
    });
};

const createEmailPreviewBlockInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildEmailPreviewBlockFailCallback(),
        handleStoreError: handleStoreError,
        ...pick(spamEmailPreviewBlock, spamConfigKeys)
    });
};

const createMembersAuthInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildMembersAuthFailCallback(spamUserLogin),
        handleStoreError: handleStoreError,
        ...pick(spamUserLogin, spamConfigKeys)
    });
};

const createMembersAuthEnumerationInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildMembersAuthEnumerationFailCallback(spamMemberLogin),
        handleStoreError: handleStoreError,
        ...pick(spamMemberLogin, spamConfigKeys)
    });
};

const createOtcVerificationEnumerationInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildOtcVerificationEnumerationFailCallback(spamOtcVerificationEnumeration),
        handleStoreError: handleStoreError,
        ...pick(spamOtcVerificationEnumeration, spamConfigKeys)
    });
};

const createOtcVerificationInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildOtcVerificationFailCallback(spamOtcVerification),
        handleStoreError: handleStoreError,
        ...pick(spamOtcVerification, spamConfigKeys)
    });
};

const createUserLoginInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildUserLoginFailCallback(spamUserLogin),
        handleStoreError: handleStoreError,
        ...pick(spamUserLogin, spamConfigKeys)
    });
};

const createUserResetInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildUserResetFailCallback(spamUserReset),
        handleStoreError: handleStoreError,
        ...pick(spamUserReset, spamConfigKeys)
    });
};

const createUserVerificationInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildUserVerificationFailCallback(),
        handleStoreError: handleStoreError,
        ...pick(spamUserVerification, spamConfigKeys)
    });
};

const createSendVerificationCodeInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildSendVerificationCodeFailCallback(),
        handleStoreError: handleStoreError,
        ...pick(spamSendVerificationCode, spamConfigKeys)
    });
};

const createPrivateBlogInstance = () => {
    const store = createBruteKnexStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: false,
        failCallback: buildPrivateBlogFailCallback(spamPrivateBlock),
        handleStoreError: handleStoreError,
        ...pick(spamPrivateBlock, spamConfigKeys)
    });
};

const createContentApiKeyInstance = () => {
    const store = createMemoryStore();

    return createExpressBruteInstance(store, {
        attachResetToRequest: true,
        failCallback: buildContentApiKeyFailCallback(),
        handleStoreError: handleStoreError,
        ...pick(spamContentApiKey, spamConfigKeys)
    });
};

const globalBlock = () => {
    globalBlockInstance = globalBlockInstance || createGlobalBlockInstance();
    return globalBlockInstance;
};

const globalReset = () => {
    globalResetInstance = globalResetInstance || createGlobalResetInstance();
    return globalResetInstance;
};

const webmentionsBlock = () => {
    webmentionsBlockInstance = webmentionsBlockInstance || createWebmentionsBlockInstance();
    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    emailPreviewBlockInstance = emailPreviewBlockInstance || createEmailPreviewBlockInstance();
    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createMembersAuthInstance();
    }
    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createMembersAuthEnumerationInstance();
    }
    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createOtcVerificationEnumerationInstance();
    }
    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createOtcVerificationInstance();
    }
    return otcVerificationInstance;
};

const userLogin = () => {
    userLoginInstance = userLoginInstance || createUserLoginInstance();
    return userLoginInstance;
};

const userReset = function userReset() {
    userResetInstance = userResetInstance || createUserResetInstance();
    return userResetInstance;
};

const userVerification = function userVerification() {
    userVerificationInstance = userVerificationInstance || createUserVerificationInstance();
    return userVerificationInstance;
};

const sendVerificationCode = function sendVerificationCode() {
    sendVerificationCodeInstance = sendVerificationCodeInstance || createSendVerificationCodeInstance();
    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    privateBlogInstance = privateBlogInstance || createPrivateBlogInstance();
    return privateBlogInstance;
};

const contentApiKey = () => {
    contentApiKeyInstance = contentApiKeyInstance || createContentApiKeyInstance();
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