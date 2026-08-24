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
        let formattedMessage = message;

        if (nextValidRequestDate) {
            formattedMessage = message.replace('{fromNow}', moment(nextValidRequestDate).fromNow(true));
        }

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

const createBruteKnexFailCallback = (messageTemplate, context, help, code, configObj, configKeys) => {
    const freeRetries = configObj.freeRetries + 1 || 5;
    const lifetime = configObj.lifetime || 60 * 60;

    const message = tpl(messageTemplate, {
        rfa: freeRetries,
        rfp: lifetime
    });

    return createFailCallback(message, context, help, code);
};

const createBruteKnexOptions = (configObj, configKeys, failCallback, attachResetToRequest) => {
    return extend({
        attachResetToRequest: attachResetToRequest,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, configKeys));
};

const createMemoryStoreOptions = (configObj, configKeys, failCallback, attachResetToRequest) => {
    return extend({
        attachResetToRequest: attachResetToRequest,
        failCallback: failCallback,
        handleStoreError: handleStoreError
    }, pick(configObj, configKeys));
};

const createGlobalBlockInstance = () => {
    const failCallback = createBruteKnexFailCallback(
        messages.forgottenPasswordIp.error,
        tpl(messages.forgottenPasswordIp.context),
        tpl(messages.tooManyAttempts),
        null,
        spamGlobalBlock,
        spamConfigKeys
    );

    const options = createBruteKnexOptions(spamGlobalBlock, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createGlobalResetInstance = () => {
    const failCallback = createBruteKnexFailCallback(
        messages.forgottenPasswordIp.error,
        tpl(messages.forgottenPasswordIp.context),
        tpl(messages.forgottenPasswordIp.context),
        null,
        spamGlobalReset,
        spamConfigKeys
    );

    const options = createBruteKnexOptions(spamGlobalReset, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createWebmentionsBlockInstance = () => {
    const failCallback = createFailCallback(messages.webmentionsBlock, null, null, null);
    const options = createBruteKnexOptions(spamWebmentionsBlock, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createEmailPreviewBlockInstance = () => {
    const failCallback = createFailCallback(messages.emailPreviewBlock, null, null, null);
    const options = createBruteKnexOptions(spamEmailPreviewBlock, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createMembersAuthInstance = () => {
    const failCallback = createFailCallback(
        'Too many sign-in attempts try again in {fromNow}',
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context),
        null
    );

    const options = createBruteKnexOptions(spamUserLogin, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(store, options);
};

const createMembersAuthEnumerationInstance = () => {
    const failCallback = createFailCallback(
        'Too many different sign-in attempts, try again in {fromNow}',
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context),
        null
    );

    const options = createBruteKnexOptions(spamMemberLogin, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(store, options);
};

const createOtcVerificationEnumerationInstance = () => {
    const failCallback = createFailCallback(
        'Too many verification attempts across multiple codes, try again in {fromNow}',
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    );

    const options = createBruteKnexOptions(spamOtcVerificationEnumeration, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createOtcVerificationInstance = () => {
    const failCallback = createFailCallback(
        'Too many attempts for this verification code, try again in {fromNow}',
        tpl(messages.tooManyOTCVerificationAttempts.context),
        tpl(messages.tooManyOTCVerificationAttempts.context),
        'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    );

    const options = createBruteKnexOptions(spamOtcVerification, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createUserLoginInstance = () => {
    const failCallback = createFailCallback(
        'Too many login attempts. Please wait {fromNow} before trying again, or reset your password.',
        tpl(messages.tooManySigninAttempts.context),
        tpl(messages.tooManySigninAttempts.context),
        null
    );

    const options = createBruteKnexOptions(spamUserLogin, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(store, options);
};

const createUserResetInstance = () => {
    const failCallback = createBruteKnexFailCallback(
        messages.forgottenPasswordEmail.error,
        tpl(messages.forgottenPasswordEmail.context),
        tpl(messages.forgottenPasswordEmail.context),
        null,
        spamUserReset,
        spamConfigKeys
    );

    const options = createBruteKnexOptions(spamUserReset, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(store, options);
};

const createUserVerificationInstance = () => {
    const failCallback = createFailCallback(tpl(messages.tooManyAttempts), null, null, null);
    const options = createBruteKnexOptions(spamUserVerification, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(store, options);
};

const createSendVerificationCodeInstance = () => {
    const failCallback = createFailCallback(tpl(messages.tooManyAttempts), null, null, null);
    const options = createBruteKnexOptions(spamSendVerificationCode, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(store, options);
};

const createPrivateBlogInstance = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        const freeRetries = spamPrivateBlock.freeRetries + 1 || 5;
        const lifetime = spamPrivateBlock.lifetime || 60 * 60;

        const message = tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: freeRetries,
            rateSigninPeriod: lifetime
        });

        logging.error(new errors.TooManyRequestsError({
            message: message,
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };

    const options = createBruteKnexOptions(spamPrivateBlock, spamConfigKeys, failCallback, false);
    return createExpressBruteInstance(store, options);
};

const createContentApiKeyInstance = () => {
    const failCallback = (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };

    const options = createMemoryStoreOptions(spamContentApiKey, spamConfigKeys, failCallback, true);
    return createExpressBruteInstance(memoryStore, options);
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

    globalBlockInstance = globalBlockInstance || createGlobalBlockInstance();

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

    globalResetInstance = globalResetInstance || createGlobalResetInstance();

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

    webmentionsBlockInstance = webmentionsBlockInstance || createWebmentionsBlockInstance();

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

    emailPreviewBlockInstance = emailPreviewBlockInstance || createEmailPreviewBlockInstance();

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
        membersAuthInstance = createMembersAuthInstance();
    }

    return membersAuthInstance;
};

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
        membersAuthEnumerationInstance = createMembersAuthEnumerationInstance();
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
        otcVerificationEnumerationInstance = createOtcVerificationEnumerationInstance();
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
        otcVerificationInstance = createOtcVerificationInstance();
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

    userLoginInstance = userLoginInstance || createUserLoginInstance();

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

    userResetInstance = userResetInstance || createUserResetInstance();

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

    userVerificationInstance = userVerificationInstance || createUserVerificationInstance();

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

    sendVerificationCodeInstance = sendVerificationCodeInstance || createSendVerificationCodeInstance();

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

    privateBlogInstance = privateBlogInstance || createPrivateBlogInstance();

    return privateBlogInstance;
};

const contentApiKey = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || createMemoryStore();

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