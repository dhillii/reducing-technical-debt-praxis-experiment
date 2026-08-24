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

const createExpressBruteInstance = (store, options) => {
    const ExpressBrute = require('express-brute');
    return new ExpressBrute(store, options);
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

const createFailCallback = (message, context, help, code) => {
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

const createGlobalBlockFailCallback = (spamConfig) => {
    return createFailCallback(
        `Too many attempts try again in `,
        tpl(messages.forgottenPasswordIp.error, {
            rfa: spamConfig.freeRetries + 1 || 5,
            rfp: spamConfig.lifetime || 60 * 60
        }),
        tpl(messages.tooManyAttempts)
    );
};

const createGlobalResetFailCallback = (spamConfig) => {
    return createFailCallback(
        `Too many attempts try again in `,
        tpl(messages.forgottenPasswordIp.error, {
            rfa: spamConfig.freeRetries + 1 || 5,
            rfp: spamConfig.lifetime || 60 * 60
        }),
        tpl(messages.forgottenPasswordIp.context)
    );
};

const createWebmentionsBlockFailCallback = () => {
    return createFailCallback(messages.webmentionsBlock);
};

const createEmailPreviewBlockFailCallback = () => {
    return createFailCallback(messages.emailPreviewBlock);
};

const createMembersAuthFailCallback = () => {
    return createFailCallback(
        `Too many sign-in attempts try again in `,
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );
};

const createMembersAuthEnumerationFailCallback = () => {
    return createFailCallback(
        `Too many different sign-in attempts, try again in `,
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );
};

const createOtcVerificationEnumerationFailCallback = () => {
    return createFailCallback(
        `Too many verification attempts across multiple codes, try again in `,
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    );
};

const createOtcVerificationFailCallback = () => {
    return createFailCallback(
        `Too many attempts for this verification code, try again in `,
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    );
};

const createUserLoginFailCallback = () => {
    return createFailCallback(
        `Too many login attempts. Please wait `,
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context)
    );
};

const createUserResetFailCallback = (spamConfig) => {
    return createFailCallback(
        `Too many password reset attempts try again in `,
        tpl(messages.forgottenPasswordEmail.error, {
            rfa: spamConfig.freeRetries + 1 || 5,
            rfp: spamConfig.lifetime || 60 * 60
        }),
        tpl(messages.forgottenPasswordEmail.context)
    );
};

const createUserVerificationFailCallback = () => {
    return createFailCallback(tpl(messages.tooManyAttempts));
};

const createSendVerificationCodeFailCallback = () => {
    return createFailCallback(tpl(messages.tooManyAttempts));
};

const createPrivateBlogFailCallback = (spamConfig) => {
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

const createContentApiKeyFailCallback = () => {
    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

const createBruteKnexStoreInstance = (spamConfig, failCallback, attachResetToRequest) => {
    store = store || createBruteKnexStore();

    return createExpressBruteInstance(store, extend({
        attachResetToRequest: attachResetToRequest,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys)));
};

const createMemoryStoreInstance = (spamConfig, failCallback, attachResetToRequest) => {
    memoryStore = memoryStore || createMemoryStore();

    return createExpressBruteInstance(memoryStore, extend({
        attachResetToRequest: attachResetToRequest,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(spamConfig, spamConfigKeys)));
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createBruteKnexStoreInstance(
            spamGlobalBlock,
            createGlobalBlockFailCallback(spamGlobalBlock),
            false
        );
    }

    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createBruteKnexStoreInstance(
            spamGlobalReset,
            createGlobalResetFailCallback(spamGlobalReset),
            false
        );
    }

    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createBruteKnexStoreInstance(
            spamWebmentionsBlock,
            createWebmentionsBlockFailCallback(),
            false
        );
    }

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createBruteKnexStoreInstance(
            spamEmailPreviewBlock,
            createEmailPreviewBlockFailCallback(),
            false
        );
    }

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteKnexStoreInstance(
            spamUserLogin,
            createMembersAuthFailCallback(),
            true
        );
    }

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteKnexStoreInstance(
            spamMemberLogin,
            createMembersAuthEnumerationFailCallback(),
            true
        );
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteKnexStoreInstance(
            spamOtcVerificationEnumeration,
            createOtcVerificationEnumerationFailCallback(),
            false
        );
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteKnexStoreInstance(
            spamOtcVerification,
            createOtcVerificationFailCallback(),
            false
        );
    }

    return otcVerificationInstance;
};

const userLogin = () => {
    if (!userLoginInstance) {
        userLoginInstance = createBruteKnexStoreInstance(
            spamUserLogin,
            createUserLoginFailCallback(),
            true
        );
    }

    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createBruteKnexStoreInstance(
            spamUserReset,
            createUserResetFailCallback(spamUserReset),
            true
        );
    }

    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createBruteKnexStoreInstance(
            spamUserVerification,
            createUserVerificationFailCallback(),
            true
        );
    }

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createBruteKnexStoreInstance(
            spamSendVerificationCode,
            createSendVerificationCodeFailCallback(),
            true
        );
    }

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createBruteKnexStoreInstance(
            spamPrivateBlock,
            createPrivateBlogFailCallback(spamPrivateBlock),
            false
        );
    }

    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createMemoryStoreInstance(
            spamContentApiKey,
            createContentApiKeyFailCallback(),
            true
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