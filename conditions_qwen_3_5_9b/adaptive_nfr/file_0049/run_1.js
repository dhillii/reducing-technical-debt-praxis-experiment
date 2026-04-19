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

const createBruteStore = () => {
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    store = store || new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    return store;
};

const createMemoryStore = () => {
    const ExpressBrute = require('express-brute');

    memoryStore = memoryStore || new ExpressBrute.MemoryStore();

    return memoryStore;
};

const createFailCallback = (config, message, context, code) => {
    const ExpressBrute = require('express-brute');
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        const formattedMessage = message;
        const formattedContext = context;
        const formattedHelp = context;

        const errorOptions = {
            message: formattedMessage,
            context: formattedContext,
            help: formattedHelp
        };

        if (code) {
            errorOptions.code = code;
        }

        const error = new errors.TooManyRequestsError(errorOptions);

        if (nextValidRequestDate) {
            errorOptions.message = `${formattedMessage} try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        }

        return next(error);
    };
};

const createSimpleFailCallback = (message) => {
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next) => {
        const formattedMessage = message;
        const error = new errors.TooManyRequestsError({
            message: formattedMessage
        });

        return next(error);
    };
};

const createPrivateBlogFailCallback = (config) => {
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');
    const moment = require('moment');
    const logging = require('@tryghost/logging');

    return (req, res, next, nextValidRequestDate) => {
        const rateSigninAttempts = config.freeRetries + 1 || 5;
        const rateSigninPeriod = config.lifetime || 60 * 60;

        logging.error(new errors.TooManyRequestsError({
            message: tpl(messages.tooManySigninAttempts.error, {
                rateSigninAttempts,
                rateSigninPeriod
            }),
            context: tpl(messages.tooManySigninAttempts.context)
        }));

        return next(new errors.TooManyRequestsError({
            message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
        }));
    };
};

const createContentApiKeyFailCallback = () => {
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');
    const logging = require('@tryghost/logging');

    return (req, res, next) => {
        const err = new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        });

        logging.error(err);
        return next(err);
    };
};

const createGlobalBlockInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamGlobalBlock = config.get('spam')?.global_block || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(spamGlobalBlock, messages.forgottenPasswordIp.error, messages.forgottenPasswordIp.context),
            handleStoreError: handleStoreError
        }, pick(spamGlobalBlock, spamConfigKeys))
    );
};

const createGlobalResetInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamGlobalReset = config.get('spam')?.global_reset || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(spamGlobalReset, messages.forgottenPasswordIp.error, messages.forgottenPasswordIp.context),
            handleStoreError: handleStoreError
        }, pick(spamGlobalReset, spamConfigKeys))
    );
};

const createWebmentionsBlockInstance = () => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createSimpleFailCallback(messages.webmentionsBlock),
            handleStoreError: handleStoreError
        }, pick(spamWebmentionsBlock, spamConfigKeys))
    );
};

const createEmailPreviewBlockInstance = () => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createSimpleFailCallback(messages.emailPreviewBlock),
            handleStoreError: handleStoreError
        }, pick(spamEmailPreviewBlock, spamConfigKeys))
    );
};

const createMembersAuthInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamUserLogin = config.get('spam')?.user_login || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(spamUserLogin, messages.tooManySigninAttempts.error, messages.tooManySigninAttempts.context),
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys))
    );
};

const createMembersAuthEnumerationInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamMemberLogin = config.get('spam')?.member_login || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(spamMemberLogin, messages.tooManySigninAttempts.error, messages.tooManySigninAttempts.context),
            handleStoreError: handleStoreError
        }, pick(spamMemberLogin, spamConfigKeys))
    );
};

const createOtcVerificationEnumerationInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamOtcVerificationEnumeration = config.get('spam')?.otc_verification_enumeration || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(spamOtcVerificationEnumeration, messages.tooManyOTCVerificationAttempts.error, messages.tooManyOTCVerificationAttempts.context, 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerificationEnumeration, spamConfigKeys))
    );
};

const createOtcVerificationInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamOtcVerification = config.get('spam')?.otc_verification || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createFailCallback(spamOtcVerification, messages.tooManyOTCVerificationAttempts.error, messages.tooManyOTCVerificationAttempts.context, 'OTC_CODE_ATTEMPTS_RATE_LIMITED'),
            handleStoreError: handleStoreError
        }, pick(spamOtcVerification, spamConfigKeys))
    );
};

const createUserLoginInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamUserLogin = config.get('spam')?.user_login || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(spamUserLogin, messages.tooManySigninAttempts.error, messages.tooManySigninAttempts.context),
            handleStoreError: handleStoreError
        }, pick(spamUserLogin, spamConfigKeys))
    );
};

const createUserResetInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamUserReset = config.get('spam')?.user_reset || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createFailCallback(spamUserReset, messages.forgottenPasswordEmail.error, messages.forgottenPasswordEmail.context),
            handleStoreError: handleStoreError
        }, pick(spamUserReset, spamConfigKeys))
    );
};

const createUserVerificationInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamUserVerification = config.get('spam')?.user_verification || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createSimpleFailCallback(messages.tooManyAttempts),
            handleStoreError: handleStoreError
        }, pick(spamUserVerification, spamConfigKeys))
    );
};

const createSendVerificationCodeInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamSendVerificationCode = config.get('spam')?.send_verification_code || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createSimpleFailCallback(messages.tooManyAttempts),
            handleStoreError: handleStoreError
        }, pick(spamSendVerificationCode, spamConfigKeys))
    );
};

const createPrivateBlogInstance = () => {
    const ExpressBrute = require('express-brute');
    const config = require('../../../../../shared/config');
    const spamPrivateBlock = config.get('spam')?.private_block || {};

    return new ExpressBrute(createBruteStore(),
        extend({
            attachResetToRequest: false,
            failCallback: createPrivateBlogFailCallback(spamPrivateBlock),
            handleStoreError: handleStoreError
        }, pick(spamPrivateBlock, spamConfigKeys))
    );
};

const createContentApiKeyInstance = () => {
    const ExpressBrute = require('express-brute');

    return new ExpressBrute(createMemoryStore(),
        extend({
            attachResetToRequest: true,
            failCallback: createContentApiKeyFailCallback(),
            handleStoreError: handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys))
    );
};

const globalBlock = () => {
    if (!globalBlockInstance) {
        globalBlockInstance = createGlobalBlockInstance();
    }

    return globalBlockInstance;
};

const globalReset = () => {
    if (!globalResetInstance) {
        globalResetInstance = createGlobalResetInstance();
    }

    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (!webmentionsBlockInstance) {
        webmentionsBlockInstance = createWebmentionsBlockInstance();
    }

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (!emailPreviewBlockInstance) {
        emailPreviewBlockInstance = createEmailPreviewBlockInstance();
    }

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
    if (!userLoginInstance) {
        userLoginInstance = createUserLoginInstance();
    }

    return userLoginInstance;
};

const userReset = () => {
    if (!userResetInstance) {
        userResetInstance = createUserResetInstance();
    }

    return userResetInstance;
};

const userVerification = () => {
    if (!userVerificationInstance) {
        userVerificationInstance = createUserVerificationInstance();
    }

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (!sendVerificationCodeInstance) {
        sendVerificationCodeInstance = createSendVerificationCodeInstance();
    }

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (!privateBlogInstance) {
        privateBlogInstance = createPrivateBlogInstance();
    }

    return privateBlogInstance;
};

const contentApiKey = () => {
    if (!contentApiKeyInstance) {
        contentApiKeyInstance = createContentApiKeyInstance();
    }

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