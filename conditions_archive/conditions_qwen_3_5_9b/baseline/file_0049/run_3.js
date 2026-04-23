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
        failCallback: options.failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));

    return instance;
};

const createMemoryBruteInstance = (config, options = {}) => {
    const ExpressBrute = require('express-brute');

    const memoryStore = new ExpressBrute.MemoryStore();

    const instance = new ExpressBrute(memoryStore, extend({
        attachResetToRequest: options.attachResetToRequest || false,
        failCallback: options.failCallback,
        handleStoreError: handleStoreError
    }, pick(config, spamConfigKeys)));

    return instance;
};

const getSpamConfig = () => {
    const spam = config.get('spam') || {};

    return {
        privateBlock: spam.private_block || {},
        globalBlock: spam.global_block || {},
        globalReset: spam.global_reset || {},
        userReset: spam.user_reset || {},
        userLogin: spam.user_login || {},
        sendVerificationCode: spam.send_verification_code || {},
        userVerification: spam.user_verification || {},
        memberLogin: spam.member_login || {},
        contentApiKey: spam.content_api_key || {},
        webmentionsBlock: spam.webmentions_block || {},
        emailPreviewBlock: spam.email_preview_block || {},
        otcVerificationEnumeration: spam.otc_verification_enumeration || {},
        otcVerification: spam.otc_verification || {}
    };
};

const createGlobalBlock = () => {
    const config = getSpamConfig().globalBlock;
    return createBruteInstance(config, {
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const createGlobalReset = () => {
    const config = getSpamConfig().globalReset;
    return createBruteInstance(config, {
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordIp.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordIp.context)
            }));
        }
    });
};

const createWebmentionsBlock = () => {
    const config = getSpamConfig().webmentionsBlock;
    return createBruteInstance(config, {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.webmentionsBlock
            }));
        }
    });
};

const createEmailPreviewBlock = () => {
    const config = getSpamConfig().emailPreviewBlock;
    return createBruteInstance(config, {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: messages.emailPreviewBlock
            }));
        }
    });
};

const createMembersAuth = () => {
    const config = getSpamConfig().userLogin;
    return createBruteInstance(config, {
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
    const config = getSpamConfig().memberLogin;
    return createBruteInstance(config, {
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

const createOTCVerificationEnumeration = () => {
    const config = getSpamConfig().otcVerificationEnumeration;
    return createBruteInstance(config, {
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

const createOTCVerification = () => {
    const config = getSpamConfig().otcVerification;
    return createBruteInstance(config, {
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
    const config = getSpamConfig().userLogin;
    return createBruteInstance(config, {
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
    const config = getSpamConfig().userReset;
    return createBruteInstance(config, {
        attachResetToRequest: true,
        failCallback: (req, res, next, nextValidRequestDate) => {
            return next(new errors.TooManyRequestsError({
                message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                context: tpl(messages.forgottenPasswordEmail.error, {
                    rfa: config.freeRetries + 1 || 5,
                    rfp: config.lifetime || 60 * 60
                }),
                help: tpl(messages.forgottenPasswordEmail.context)
            }));
        }
    });
};

const createUserVerification = () => {
    const config = getSpamConfig().userVerification;
    return createBruteInstance(config, {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const createSendVerificationCode = () => {
    const config = getSpamConfig().sendVerificationCode;
    return createBruteInstance(config, {
        failCallback: (req, res, next) => {
            return next(new errors.TooManyRequestsError({
                message: tpl(messages.tooManyAttempts)
            }));
        }
    });
};

const createPrivateBlog = () => {
    const config = getSpamConfig().privateBlock;
    return createBruteInstance(config, {
        attachResetToRequest: false,
        failCallback: (req, res, next, nextValidRequestDate) => {
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
    });
};

const createContentApiKey = () => {
    const config = getSpamConfig().contentApiKey;
    return createMemoryBruteInstance(config, {
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

const reset = () => {
    const spam = config.get('spam') || {};

    return {
        privateBlock: spam.private_block || {},
        globalBlock: spam.global_block || {},
        globalReset: spam.global_reset || {},
        userReset: spam.user_reset || {},
        userLogin: spam.user_login || {},
        sendVerificationCode: spam.send_verification_code || {},
        userVerification: spam.user_verification || {},
        memberLogin: spam.member_login || {},
        contentApiKey: spam.content_api_key || {},
        webmentionsBlock: spam.webmentions_block || {},
        emailPreviewBlock: spam.email_preview_block || {},
        otcVerificationEnumeration: spam.otc_verification_enumeration || {},
        otcVerification: spam.otc_verification || {}
    };
};

module.exports = {
    globalBlock: createGlobalBlock,
    globalReset: createGlobalReset,
    userLogin: createUserLogin,
    sendVerificationCode: createSendVerificationCode,
    userVerification: createUserVerification,
    membersAuth: createMembersAuth,
    membersAuthEnumeration: createMembersAuthEnumeration,
    otcVerification: createOTCVerification,
    otcVerificationEnumeration: createOTCVerificationEnumeration,
    userReset: createUserReset,
    privateBlog: createPrivateBlog,
    contentApiKey: createContentApiKey,
    webmentionsBlock: createWebmentionsBlock,
    emailPreviewBlock: createEmailPreviewBlock,
    reset
};
```