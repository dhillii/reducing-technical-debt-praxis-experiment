```javascript
const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

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

const createBruteInstance = (config, options = {}) => {
    const ExpressBrute = require('express-brute');
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');

    const store = new BruteKnex({
        tablename: 'brute',
        createTable: false,
        knex: db.knex
    });

    const instance = new ExpressBrute(store, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));

    return instance;
};

const createMemoryBruteInstance = (config, options = {}) => {
    const ExpressBrute = require('express-brute');

    const memoryStore = new ExpressBrute.MemoryStore();

    const instance = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));

    return instance;
};

const createFailCallback = (config, type) => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    const nextValidRequestDate = (req, res, next) => {
        const nextValidRequestDate = new Date();
        nextValidRequestDate.setSeconds(nextValidRequestDate.getSeconds() + config.lifetime || 60 * 60);
        return nextValidRequestDate;
    };

    const failCallback = (req, res, next, nextValidRequestDate) => {
        const message = `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const context = messages[type]?.context || messages.tooManyAttempts;
        const help = messages[type]?.error || messages.tooManyAttempts;

        return next(new errors.TooManyRequestsError({
            message,
            context: tpl(context),
            help: tpl(help)
        }));
    };

    return failCallback;
};

const createPrivateFailCallback = (config, type) => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');
    const logging = require('@tryghost/logging');

    const failCallback = (req, res, next, nextValidRequestDate) => {
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

    return failCallback;
};

const createOtcFailCallback = (config, type, code) => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    const failCallback = (req, res, next, nextValidRequestDate) => {
        const message = `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
        const context = messages.tooManyOTCVerificationAttempts.context;
        const help = messages.tooManyOTCVerificationAttempts.context;

        return next(new errors.TooManyRequestsError({
            message,
            context: tpl(context),
            help: tpl(help),
            code
        }));
    };

    return failCallback;
};

const createWebmentionsFailCallback = () => {
    const errors = require('@tryghost/errors');

    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.webmentionsBlock
        }));
    };
};

const createEmailPreviewFailCallback = () => {
    const errors = require('@tryghost/errors');

    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: messages.emailPreviewBlock
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

const createVerificationFailCallback = () => {
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next) => {
        return next(new errors.TooManyRequestsError({
            message: tpl(messages.tooManyAttempts)
        }));
    };
};

const createLoginFailCallback = () => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

const createPasswordResetFailCallback = () => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        const rfa = 5;
        const rfp = 60 * 60;

        return next(new errors.TooManyRequestsError({
            message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.forgottenPasswordEmail.error, {rfa, rfp}),
            help: tpl(messages.forgottenPasswordEmail.context)
        }));
    };
};

const createSigninFailCallback = () => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

const createEnumerationFailCallback = () => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context)
        }));
    };
};

const createOtcEnumerationFailCallback = () => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

const createOtcCodeFailCallback = () => {
    const moment = require('moment');
    const tpl = require('@tryghost/tpl');
    const errors = require('@tryghost/errors');

    return (req, res, next, nextValidRequestDate) => {
        return next(new errors.TooManyRequestsError({
            message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
        }));
    };
};

const spamConfig = config.get('spam') || {};

const spamPrivateBlock = spamConfig.private_block || {};
const spamGlobalBlock = spamConfig.global_block || {};
const spamGlobalReset = spamConfig.global_reset || {};
const spamUserReset = spamConfig.user_reset || {};
const spamUserLogin = spamConfig.user_login || {};
const spamSendVerificationCode = spamConfig.send_verification_code || {};
const spamUserVerification = spamConfig.user_verification || {};
const spamMemberLogin = spamConfig.member_login || {};
const spamContentApiKey = spamConfig.content_api_key || {};
const spamWebmentionsBlock = spamConfig.webmentions_block || {};
const spamEmailPreviewBlock = spamConfig.email_preview_block || {};
const spamOtcVerificationEnumeration = spamConfig.otc_verification_enumeration || {};
const spamOtcVerification = spamConfig.otc_verification || {};

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

const globalBlock = () => {
    if (globalBlockInstance) return globalBlockInstance;

    globalBlockInstance = createBruteInstance(spamGlobalBlock, {
        failCallback: createFailCallback(spamGlobalBlock, 'forgottenPasswordIp')
    });

    return globalBlockInstance;
};

const globalReset = () => {
    if (globalResetInstance) return globalResetInstance;

    globalResetInstance = createBruteInstance(spamGlobalReset, {
        failCallback: createFailCallback(spamGlobalReset, 'forgottenPasswordIp')
    });

    return globalResetInstance;
};

const webmentionsBlock = () => {
    if (webmentionsBlockInstance) return webmentionsBlockInstance;

    webmentionsBlockInstance = createBruteInstance(spamWebmentionsBlock, {
        failCallback: createWebmentionsFailCallback()
    });

    return webmentionsBlockInstance;
};

const emailPreviewBlock = () => {
    if (emailPreviewBlockInstance) return emailPreviewBlockInstance;

    emailPreviewBlockInstance = createBruteInstance(spamEmailPreviewBlock, {
        failCallback: createEmailPreviewFailCallback()
    });

    return emailPreviewBlockInstance;
};

const membersAuth = () => {
    if (membersAuthInstance) return membersAuthInstance;

    membersAuthInstance = createBruteInstance(spamUserLogin, {
        attachResetToRequest: true,
        failCallback: createSigninFailCallback()
    });

    return membersAuthInstance;
};

const membersAuthEnumeration = () => {
    if (membersAuthEnumerationInstance) return membersAuthEnumerationInstance;

    membersAuthEnumerationInstance = createBruteInstance(spamMemberLogin, {
        attachResetToRequest: true,
        failCallback: createEnumerationFailCallback()
    });

    return membersAuthEnumerationInstance;
};

const otcVerificationEnumeration = () => {
    if (otcVerificationEnumerationInstance) return otcVerificationEnumerationInstance;

    otcVerificationEnumerationInstance = createBruteInstance(spamOtcVerificationEnumeration, {
        failCallback: createOtcEnumerationFailCallback()
    });

    return otcVerificationEnumerationInstance;
};

const otcVerification = () => {
    if (otcVerificationInstance) return otcVerificationInstance;

    otcVerificationInstance = createBruteInstance(spamOtcVerification, {
        failCallback: createOtcCodeFailCallback()
    });

    return otcVerificationInstance;
};

const userLogin = () => {
    if (userLoginInstance) return userLoginInstance;

    userLoginInstance = createBruteInstance(spamUserLogin, {
        attachResetToRequest: true,
        failCallback: createLoginFailCallback()
    });

    return userLoginInstance;
};

const userReset = () => {
    if (userResetInstance) return userResetInstance;

    userResetInstance = createBruteInstance(spamUserReset, {
        attachResetToRequest: true,
        failCallback: createPasswordResetFailCallback()
    });

    return userResetInstance;
};

const userVerification = () => {
    if (userVerificationInstance) return userVerificationInstance;

    userVerificationInstance = createBruteInstance(spamUserVerification, {
        failCallback: createVerificationFailCallback()
    });

    return userVerificationInstance;
};

const sendVerificationCode = () => {
    if (sendVerificationCodeInstance) return sendVerificationCodeInstance;

    sendVerificationCodeInstance = createBruteInstance(spamSendVerificationCode, {
        failCallback: createVerificationFailCallback()
    });

    return sendVerificationCodeInstance;
};

const privateBlog = () => {
    if (privateBlogInstance) return privateBlogInstance;

    privateBlogInstance = createBruteInstance(spamPrivateBlock, {
        attachResetToRequest: false,
        failCallback: createPrivateFailCallback(spamPrivateBlock, 'tooManySigninAttempts')
    });

    return privateBlogInstance;
};

const contentApiKey = () => {
    if (contentApiKeyInstance) return contentApiKeyInstance;

    contentApiKeyInstance = createMemoryBruteInstance(spamContentApiKey, {
        failCallback: createContentApiKeyFailCallback()
    });

    return contentApiKeyInstance;
};

const reset = () => {
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

    spamConfig = config.get('spam') || {};
    spamPrivateBlock = spamConfig.private_block || {};
    spamGlobalBlock = spamConfig.global_block || {};
    spamGlobalReset = spamConfig.global_reset || {};
    spamUserReset = spamConfig.user_reset || {};
    spamUserLogin = spamConfig.user_login || {};
    spamSendVerificationCode = spamConfig.send_verification_code || {};
    spamUserVerification = spamConfig.user_verification || {};
    spamMemberLogin = spamConfig.member_login || {};
    spamContentApiKey = spamConfig.content_api_key || {};
    spamOtcVerificationEnumeration = spamConfig.otc_verification_enumeration || {};
    spamOtcVerification = spamConfig.otc_verification || {};
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
    reset
};
```