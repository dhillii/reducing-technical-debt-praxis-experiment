```javascript
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

const handleStoreError = (err) => {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });

    // see https://github.com/AdamPflug/express-brute/issues/45
    // express-brute does not always forward a callback
    // we are using reset as synchronous call, so we have to log the error if it occurs
    // there is no way to try/catch, because the reset operation happens asynchronous
    if (!err.next) {
        logging.error(err);
        return;
    }

    err.next(customError);
};

const createBruteStore = (storeType) => {
    store = store || new storeType({
        tablename: 'brute',
        createTable: false,
        knex: require('../../../../data/db').knex
    });
    return store;
};

const createBruteInstance = (store, options) => {
    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest,
        failCallback: (req, res, next, nextValidRequestDate) => {
            const message = options.failCallback ? options.failCallback(req, res, next, nextValidRequestDate) : next(new errors.TooManyRequestsError({
                message: options.error || messages.tooManyAttempts,
                context: options.context || messages.tooManyAttempts,
                help: options.help || messages.tooManyAttempts
            }));
            return message;
        },
        handleStoreError: handleStoreError
    }, pick(options, spamConfigKeys)));
    return instance;
};

const globalBlock = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    globalBlockInstance = globalBlockInstance || createBruteInstance(store, {
        attachResetToRequest: false,
        error: messages.forgottenPasswordIp.error,
        context: messages.forgottenPasswordIp.context,
        help: messages.tooManyAttempts,
        freeRetries: spamGlobalBlock.freeRetries + 1 || 5,
        lifetime: spamGlobalBlock.lifetime || 60 * 60
    });

    return globalBlockInstance;
};

const globalReset = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    globalResetInstance = globalResetInstance || createBruteInstance(store, {
        attachResetToRequest: false,
        error: messages.forgottenPasswordEmail.error,
        context: messages.forgottenPasswordEmail.context,
        help: messages.forgottenPasswordEmail.context,
        freeRetries: spamGlobalReset.freeRetries + 1 || 5,
        lifetime: spamGlobalReset.lifetime || 60 * 60
    });

    return globalResetInstance;
};

const webmentionsBlock = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(store, {
        attachResetToRequest: false,
        error: messages.webmentionsBlock,
        context: messages.tooManyAttempts,
        help: messages.tooManyAttempts,
        freeRetries: spamWebmentionsBlock.freeRetries + 1 || 5,
        lifetime: spamWebmentionsBlock.lifetime || 60 * 60
    });

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(store, {
        attachResetToRequest: false,
        error: messages.emailPreviewBlock,
        context: messages.tooManyAttempts,
        help: messages.tooManyAttempts,
        freeRetries: spamEmailPreviewBlock.freeRetries + 1 || 5,
        lifetime: spamEmailPreviewBlock.lifetime || 60 * 60
    });

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    if (!membersAuthInstance) {
        membersAuthInstance = createBruteInstance(store, {
            attachResetToRequest: true,
            error: messages.tooManySigninAttempts.error,
            context: messages.tooManySigninAttempts.context,
            help: messages.tooManySigninAttempts.context,
            freeRetries: spamUserLogin.freeRetries + 1 || 5,
            lifetime: spamUserLogin.lifetime || 60 * 60
        });
    }

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    if (!membersAuthEnumerationInstance) {
        membersAuthEnumerationInstance = createBruteInstance(store, {
            attachResetToRequest: true,
            error: 'Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}',
            context: messages.tooManySigninAttempts.context,
            help: messages.tooManySigninAttempts.context,
            freeRetries: spamMemberLogin.freeRetries + 1 || 5,
            lifetime: spamMemberLogin.lifetime || 60 * 60
        });
    }

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    if (!otcVerificationEnumerationInstance) {
        otcVerificationEnumerationInstance = createBruteInstance(store, {
            attachResetToRequest: false,
            error: 'Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}',
            context: messages.tooManyOTCVerificationAttempts.context,
            help: messages.tooManyOTCVerificationAttempts.context,
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED',
            freeRetries: spamOtcVerificationEnumeration.freeRetries + 1 || 5,
            lifetime: spamOtcVerificationEnumeration.lifetime || 60 * 60
        });
    }

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    if (!otcVerificationInstance) {
        otcVerificationInstance = createBruteInstance(store, {
            attachResetToRequest: false,
            error: 'Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}',
            context: messages.tooManyOTCVerificationAttempts.context,
            help: messages.tooManyOTCVerificationAttempts.context,
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED',
            freeRetries: spamOtcVerification.freeRetries + 1 || 5,
            lifetime: spamOtcVerification.lifetime || 60 * 60
        });
    }

    return otcVerificationInstance;
};

const userLogin = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    userLoginInstance = userLoginInstance || createBruteInstance(store, {
        attachResetToRequest: true,
        error: 'Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.',
        context: messages.tooManySigninAttempts.context,
        help: messages.tooManySigninAttempts.context,
        freeRetries: spamUserLogin.freeRetries + 1 || 5,
        lifetime: spamUserLogin.lifetime || 60 * 60
    });

    return userLoginInstance;
};

const userReset = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    userResetInstance = userResetInstance || createBruteInstance(store, {
        attachResetToRequest: true,
        error: 'Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}',
        context: messages.forgottenPasswordEmail.error,
        help: messages.forgottenPasswordEmail.context,
        freeRetries: spamUserReset.freeRetries + 1 || 5,
        lifetime: spamUserReset.lifetime || 60 * 60
    });

    return userResetInstance;
};

const userVerification = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    userVerificationInstance = userVerificationInstance || createBruteInstance(store, {
        attachResetToRequest: true,
        error: tpl(messages.tooManyAttempts),
        context: messages.tooManyAttempts,
        help: messages.tooManyAttempts,
        freeRetries: spamUserVerification.freeRetries + 1 || 5,
        lifetime: spamUserVerification.lifetime || 60 * 60
    });

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstance(store, {
        attachResetToRequest: true,
        error: tpl(messages.tooManyAttempts),
        context: messages.tooManyAttempts,
        help: messages.tooManyAttempts,
        freeRetries: spamSendVerificationCode.freeRetries + 1 || 5,
        lifetime: spamSendVerificationCode.lifetime || 60 * 60
    });

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');

    store = createBruteStore(BruteKnex);
    privateBlogInstance = privateBlogInstance || createBruteInstance(store, {
        attachResetToRequest: false,
        error: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
            rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
        }),
        context: messages.tooManySigninAttempts.context,
        help: messages.tooManySigninAttempts.context,
        freeRetries: spamPrivateBlock.freeRetries + 1 || 5,
        lifetime: spamPrivateBlock.lifetime || 60 * 60
    });

    return privateBlogInstance;
};

const contentApiKey = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    contentApiKeyInstance = contentApiKeyInstance || createBruteInstance(memoryStore, {
        attachResetToRequest: true,
        error: tpl(messages.tooManyAttempts),
        context: messages.tooManyAttempts,
        help: messages.tooManyAttempts,
        freeRetries: spamContentApiKey.freeRetries + 1 || 5,
        lifetime: spamContentApiKey.lifetime || 60 * 60
    });

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
        webmentionsBlockInstance = undefined;
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