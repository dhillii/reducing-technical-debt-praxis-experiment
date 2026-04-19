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
    configKeys,
    failCallback,
    attachResetToRequest = false,
    useMemoryStore = false
) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brane-knex');
    const db = require('../../../../data/db');

    const storeInstance = useMemoryStore
        ? memoryStore || new ExpressBrute.MemoryStore()
        : store || new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });

    const instance = new ExpressBrute(storeInstance, extend({
        attachResetToRequest: attachResetToRequest,
        failCallback,
        handleStoreError
    }, pick(configObj, configKeys)));

    return instance;
};

const createErrorWithRateLimit = (
    message,
    context,
    help,
    code,
    nextValidRequestDate,
    rateSigninAttempts,
    rateSigninPeriod
) => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message,
        context,
        help
    });

    if (code) {
        tooManyRequestsError.code = code;
    }

    if (rateSigninAttempts && rateSigninPeriod) {
        tooManyRequestsError.message = message.replace(
            '{rateSigninAttempts}',
            rateSigninAttempts
        ).replace(
            '{rateSigninPeriod}',
            rateSigninPeriod
        );
    }

    if (nextValidRequestDate) {
        tooManyRequestsError.message = `${message} try again in ${moment(nextValidRequestDate).fromNow(true)}`;
    }

    return tooManyRequestsError;
};

const createForgottenPasswordError = (
    nextValidRequestDate,
    freeRetries,
    lifetime
) => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: freeRetries + 1 || 5,
            rfp: lifetime || 60 * 60
        }),
        help: tpl(messages.tooManyAttempts)
    });

    return tooManyRequestsError;
};

const createSigninAttemptsError = (
    nextValidRequestDate,
    rateSigninAttempts,
    rateSigninPeriod
) => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    });

    return tooManyRequestsError;
};

const createOtcVerificationError = (
    nextValidRequestDate,
    code
) => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: code || 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    });

    return tooManyRequestsError;
};

const createOtcCodeVerificationError = (
    nextValidRequestDate
) => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    });

    return tooManyRequestsError;
};

const createPrivateBlogError = (
    nextValidRequestDate,
    rateSigninAttempts,
    rateSigninPeriod
) => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context)
    });

    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: rateSigninAttempts + 1 || 5,
            rateSigninPeriod: rateSigninPeriod || 60 * 60
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));

    return tooManyRequestsError;
};

const createContentApiKeyError = () => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });

    logging.error(tooManyRequestsError);
    return tooManyRequestsError;
};

const createVerificationError = () => {
    const tooManyRequestsError = new errors.TooManyRequestsError({
        message: tpl(messages.tooManyAttempts)
    });

    return tooManyRequestsError;
};

const globalBlock = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createForgottenPasswordError(
            nextValidRequestDate,
            spamGlobalBlock.freeRetries,
            spamGlobalBlock.lifetime
        ));
    };

    return createBruteInstance(
        spamGlobalBlock,
        spamConfigKeys,
        failCallback,
        false
    );
};

const globalReset = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createForgottenPasswordError(
            nextValidRequestDate,
            spamGlobalReset.freeRetries,
            spamGlobalReset.lifetime
        ));
    };

    return createBruteInstance(
        spamGlobalReset,
        spamConfigKeys,
        failCallback,
        false
    );
};

const webmentionsBlock = () => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };

    return createBruteInstance(
        spamWebmentionsBlock,
        spamConfigKeys,
        failCallback,
        false
    );
};

const emailPreviewBlock = () => {
    const failCallback = (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
        }));
    };

    return createBruteInstance(
        spamEmailPreviewBlock,
        spamConfigKeys,
        failCallback,
        false
    );
};

const membersAuth = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createSigninAttemptsError(
            nextValidRequestDate,
            spamUserLogin.freeRetries,
            spamUserLogin.lifetime
        ));
    };

    return createBruteInstance(
        spamUserLogin,
        spamConfigKeys,
        failCallback,
        true
    );
};

const membersAuthEnumeration = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createSigninAttemptsError(
            nextValidRequestDate,
            spamMemberLogin.freeRetries,
            spamMemberLogin.lifetime
        ));
    };

    return createBruteInstance(
        spamMemberLogin,
        spamConfigKeys,
        failCallback,
        true
    );
};

const otcVerificationEnumeration = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createOtcVerificationError(
            nextValidRequestDate,
            'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        ));
    };

    return createBruteInstance(
        spamOtcVerificationEnumeration,
        spamConfigKeys,
        failCallback,
        false
    );
};

const otcVerification = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createOtcCodeVerificationError(
            nextValidRequestDate
        ));
    };

    return createBruteInstance(
        spamOtcVerification,
        spamConfigKeys,
        failCallback,
        false
    );
};

const userLogin = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createSigninAttemptsError(
            nextValidRequestDate,
            spamUserLogin.freeRetries,
            spamUserLogin.lifetime
        ));
    };

    return createBruteInstance(
        spamUserLogin,
        spamConfigKeys,
        failCallback,
        true
    );
};

const userReset = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createForgottenPasswordError(
            nextValidRequestDate,
            spamUserReset.freeRetries,
            spamUserReset.lifetime
        ));
    };

    return createBruteInstance(
        spamUserReset,
        spamConfigKeys,
        failCallback,
        true
    );
};

const userVerification = () => {
    const failCallback = (req, res, next) => {
        return next(createVerificationError());
    };

    return createBruteInstance(
        spamUserVerification,
        spamConfigKeys,
        failCallback,
        true
    );
};

const sendVerificationCode = () => {
    const failCallback = (req, res, next) => {
        return next(createVerificationError());
    };

    return createBruteInstance(
        spamSendVerificationCode,
        spamConfigKeys,
        failCallback,
        true
    );
};

const privateBlog = () => {
    const failCallback = (req, res, next, nextValidRequestDate) => {
        return next(createPrivateBlogError(
            nextValidRequestDate,
            spamPrivateBlock.freeRetries,
            spamPrivateBlock.lifetime
        ));
    };

    return createBruteInstance(
        spamPrivateBlock,
        spamConfigKeys,
        failCallback,
        false
    );
};

const contentApiKey = () => {
    const failCallback = (req, res, next) => {
        return next(createContentApiKeyError());
    };

    return createBruteInstance(
        spamContentApiKey,
        spamConfigKeys,
        failCallback,
        true,
        true
    );
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
```