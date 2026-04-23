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

const createBruteInstance = (store, config, options = {}) => {
    const ExpressBrute = require('express-brute');

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        handleStoreError: handleStoreError
    }, config));

    if (options.failCallback) {
        instance.failCallback = options.failCallback;
    }

    return instance;
};

const createGlobalBlock = () => {
    const store = createBruteKnexStore();
    const config = pick(spamGlobalBlock, spamConfigKeys);

    return createBruteInstance(store, config, {
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalBlock.freeRetries + 1 || 5, rfp: spamGlobalBlock.lifetime || 60 * 60}),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const createGlobalReset = () => {
    const store = createBruteKnexStore();
    const config = pick(spamGlobalReset, spamConfigKeys);

    return createBruteInstance(store, config, {
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error,
                    {rfa: spamGlobalReset.freeRetries + 1 || 5, rfp: spamGlobalReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    });
};

const createWebmentionsBlock = () => {
    const store = createBruteKnexStore();
    const config = pick(spamWebmentionsBlock, spamConfigKeys);

    return createBruteInstance(store, config, {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    });
};

const createEmailPreviewBlock = () => {
    const store = createBruteKnexStore();
    const config = pick(spamEmailPreviewBlock, spamConfigKeys);

    return createBruteInstance(store, config, {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    });
};

const createMembersAuth = () => {
    const store = createBruteKnexStore();
    const config = pick(spamUserLogin, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });
};

const createMembersAuthEnumeration = () => {
    const store = createBruteKnexStore();
    const config = pick(spamMemberLogin, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });
};

const createOtcVerificationEnumeration = () => {
    const store = createBruteKnexStore();
    const config = pick(spamOtcVerificationEnumeration, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            }));
        }
    });
};

const createOtcVerification = () => {
    const store = createBruteKnexStore();
    const config = pick(spamOtcVerification, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.tooManyOTCVerificationAttempts.context),
                help: tpl(messages.tooManyOTCVerificationAttempts.context),
                code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            }));
        }
    });
};

const createUserLogin = () => {
    const store = createBruteKnexStore();
    const config = pick(spamUserLogin, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                context: tpl(messages.tooManySigninAttempts.context),
                help: tpl(messages.tooManySigninAttempts.context)
            }));
        }
    });
};

const createUserReset = () => {
    const store = createBruteKnexStore();
    const config = pick(spamUserReset, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error,
                    {rfa: spamUserReset.freeRetries + 1 || 5, rfp: spamUserReset.lifetime || 60 * 60}),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    });
};

const createUserVerification = () => {
    const store = createBruteKnexStore();
    const config = pick(spamUserVerification, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const createSendVerificationCode = () => {
    const store = createBruteKnexStore();
    const config = pick(spamSendVerificationCode, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const createPrivateBlog = () => {
    const store = createBruteKnexStore();
    const config = pick(spamPrivateBlock, spamConfigKeys);

    return createBruteInstance(store, config, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
            logging.error(new errors.TooManyRequestsError({
                message: tpl(messages.tooManySigninAttempts.error, {
                    rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                    rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                }),
                context: tpl(messages.tooManySigninAttempts.context)
            }));

            return next(new errors.TooManyRequestsError({
                message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
            }));
        }
    });
};

const createContentApiKey = () => {
    const memoryStore = createBruteMemoryStore();
    const config = pick(spamContentApiKey, spamConfigKeys);

    return createBruteInstance(memoryStore, config, {
        attachResetToRequest: true,
        failCallback: (req, res, next) => {
            const err = new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            });

            logging.error(err);
            return next(err);
        }
    });
};

module.exports = {
    globalBlock: () => {
        if (!globalBlockInstance) {
            globalBlockInstance = createGlobalBlock();
        }
        return globalBlockInstance;
    },
    globalReset: () => {
        if (!globalResetInstance) {
            globalResetInstance = createGlobalReset();
        }
        return globalResetInstance;
    },
    webmentionsBlock: () => {
        if (!webmentionsBlockInstance) {
            webmentionsBlockInstance = createWebmentionsBlock();
        }
        return webmentionsBlockInstance;
    },
    emailPreviewBlock: () => {
        if (!emailPreviewBlockInstance) {
            emailPreviewBlockInstance = createEmailPreviewBlock();
        }
        return emailPreviewBlockInstance;
    },
    membersAuth: () => {
        if (!membersAuthInstance) {
            membersAuthInstance = createMembersAuth();
        }
        return membersAuthInstance;
    },
    membersAuthEnumeration: () => {
        if (!membersAuthEnumerationInstance) {
            membersAuthEnumerationInstance = createMembersAuthEnumeration();
        }
        return membersAuthEnumerationInstance;
    },
    otcVerificationEnumeration: () => {
        if (!otcVerificationEnumerationInstance) {
            otcVerificationEnumerationInstance = createOtcVerificationEnumeration();
        }
        return otcVerificationEnumerationInstance;
    },
    otcVerification: () => {
        if (!otcVerificationInstance) {
            otcVerificationInstance = createOtcVerification();
        }
        return otcVerificationInstance;
    },
    userLogin: () => {
        if (!userLoginInstance) {
            userLoginInstance = createUserLogin();
        }
        return userLoginInstance;
    },
    userReset: () => {
        if (!userResetInstance) {
            userResetInstance = createUserReset();
        }
        return userResetInstance;
    },
    userVerification: () => {
        if (!userVerificationInstance) {
            userVerificationInstance = createUserVerification();
        }
        return userVerificationInstance;
    },
    sendVerificationCode: () => {
        if (!sendVerificationCodeInstance) {
            sendVerificationCodeInstance = createSendVerificationCode();
        }
        return sendVerificationCodeInstance;
    },
    privateBlog: () => {
        if (!privateBlogInstance) {
            privateBlogInstance = createPrivateBlog();
        }
        return privateBlogInstance;
    },
    contentApiKey: () => {
        if (!contentApiKeyInstance) {
            contentApiKeyInstance = createContentApiKey();
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
        spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
        spamOtcVerification = spam.otc_verification || {};
    }
};