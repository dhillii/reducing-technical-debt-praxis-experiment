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

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return store;
};

const createBruteMemoryStore = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return memoryStore;
};

const createBruteInstance = (store, config, failCallback) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(store, extend({
        attachResetToRequest: false,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const createBruteInstanceWithReset = (store, config, failCallback) => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(store, extend({
        attachResetToRequest: true,
        failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));
};

const globalBlock = () => {
    const store = createBruteKnexStore();
    const config = spamGlobalBlock;

    globalBlockInstance = globalBlockInstance || createBruteInstance(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    );

    return globalBlockInstance;
};

const globalReset = () => {
    const store = createBruteKnexStore();
    const config = spamGlobalReset;

    globalResetInstance = globalResetInstance || createBruteInstance(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    );

    return globalResetInstance;
};

const webmentionsBlock = () => {
    const store = createBruteKnexStore();
    const config = spamWebmentionsBlock;

    webmentionsBlockInstance = webmentionsBlockInstance || createBruteInstance(
        store,
        config,
        () => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    );

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    const store = createBruteKnexStore();
    const config = spamEmailPreviewBlock;

    emailPreviewBlockInstance = emailPreviewBlockInstance || createBruteInstance(
        store,
        config,
        () => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    );

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    const store = createBruteKnexStore();
    const config = spamUserLogin;

    membersAuthInstance = membersAuthInstance || createBruteInstanceWithReset(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    );

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    const store = createBruteKnexStore();
    const config = spamMemberLogin;

    membersAuthEnumerationInstance = membersAuthEnumerationInstance || createBruteInstanceWithReset(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    );

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    const store = createBruteKnexStore();
    const config = spamOtcVerificationEnumeration;

    otcVerificationEnumerationInstance = otcVerificationEnumerationInstance || createBruteInstance(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    );

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    const store = createBruteKnexStore();
    const config = spamOtcVerification;

    otcVerificationInstance = otcVerificationInstance || createBruteInstance(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    );

    return otcVerificationInstance;
};

const userLogin = () => {
    const store = createBruteKnexStore();
    const config = spamUserLogin;

    userLoginInstance = userLoginInstance || createBruteInstanceWithReset(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    );

    return userLoginInstance;
};

const userReset = () => {
    const store = createBruteKnexStore();
    const config = spamUserReset;

    userResetInstance = userResetInstance || createBruteInstanceWithReset(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    );

    return userResetInstance;
};

const userVerification = () => {
    const store = createBruteKnexStore();
    const config = spamUserVerification;

    userVerificationInstance = userVerificationInstance || createBruteInstanceWithReset(
        store,
        config,
        () => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    );

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    const store = createBruteKnexStore();
    const config = spamSendVerificationCode;

    sendVerificationCodeInstance = sendVerificationCodeInstance || createBruteInstanceWithReset(
        store,
        config,
        () => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    );

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    const store = createBruteKnexStore();
    const config = spamPrivateBlock;

    privateBlogInstance = privateBlogInstance || createBruteInstance(
        store,
        config,
        (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: config.freeRetries + 1 || 5,
                    rateSigninPeriod: config.lifetime || 60 * 60
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        }
    );

    return privateBlogInstance;
};

const contentApiKey = () => {
    const store = createBruteMemoryStore();
    const config = spamContentApiKey;

    contentApiKeyInstance = contentApiKeyInstance || createBruteInstanceWithReset(
        store,
        config,
        (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        }
    );

    return contentApiKeyInstance;
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