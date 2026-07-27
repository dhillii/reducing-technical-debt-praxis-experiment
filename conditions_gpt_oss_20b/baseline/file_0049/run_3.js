const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const ExpressBrute = require('express-brute');
const BruteKnex = require('brute-knex');
const db = require('../../../../data/db');

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

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

const spamPrivateBlock = spam.private_block || {};
const spamGlobalBlock = spam.global_block || {};
const spamGlobalReset = spam.global_reset || {};
const spamUserReset = spam.user_reset || {};
const spamUserLogin = spam.user_login || {};
const spamSendVerificationCode = spam.send_verification_code || {};
const spamUserVerification = spam.user_verification || {};
const spamMemberLogin = spam.member_login || {};
const spamContentApiKey = spam.content_api_key || {};
const spamWebmentionsBlock = spam.webmentions_block || {};
const spamEmailPreviewBlock = spam.email_preview_block || {};
const spamOtcVerificationEnumeration = spam.otc_verification_enumeration || {};
const spamOtcVerification = spam.otc_verification || {};

let store;
let memoryStore;
const instances = {};

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

const getStore = () => {
    if (!store) {
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
};

const getMemoryStore = () => {
    if (!memoryStore) memoryStore = new ExpressBrute.MemoryStore();
    return memoryStore;
};

const createInstance = (name, configObj, customOptions, useMemory = false) => {
    if (instances[name]) return instances[name];
    const storeInstance = useMemory ? getMemoryStore() : getStore();
    const options = extend(
        {
            attachResetToRequest: false,
            handleStoreError: handleStoreError
        },
        customOptions,
        pick(configObj, spamConfigKeys)
    );
    instances[name] = new ExpressBrute(storeInstance, options);
    return instances[name];
};

const buildFailCallback = ({message, context, help, code, useNextValidDate = false}) => {
    return (req, res, next, nextValidRequestDate) => {
        const msg = useNextValidDate
            ? message(moment(nextValidRequestDate).fromNow(true))
            : message;
        const err = new errors.TooManyRequestsError({
            message: msg,
            context: context,
            help: help,
            code: code
        });
        return next(err);
    };
};

const globalBlock = () => {
    return createInstance('globalBlock', spamGlobalBlock, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: `Too many attempts try again in {time}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalBlock.freeRetries + 1 || 5,
                rfp: spamGlobalBlock.lifetime || 60 * 60
            }),
            help: tpl(messages.tooManyAttempts),
            useNextValidDate: true
        })
    });
};

const globalReset = () => {
    return createInstance('globalReset', spamGlobalReset, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: `Too many attempts try again in {time}`,
            context: tpl(messages.forgottenPasswordIp.error, {
                rfa: spamGlobalReset.freeRetries + 1 || 5,
                rfp: spamGlobalReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordIp.context),
            useNextValidDate: true
        })
    });
};

const webmentionsBlock = () => {
    return createInstance('webmentionsBlock', spamWebmentionsBlock, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: messages.webmentionsBlock,
            context: null,
            help: null
        })
    });
};

const emailPreviewBlock = () => {
    return createInstance('emailPreviewBlock', spamEmailPreviewBlock, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: messages.emailPreviewBlock,
            context: null,
            help: null
        })
    });
};

const membersAuth = () => {
    return createInstance('membersAuth', spamUserLogin, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: `Too many sign-in attempts try again in {time}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context),
            useNextValidDate: true
        })
    });
};

const membersAuthEnumeration = () => {
    return createInstance('membersAuthEnumeration', spamMemberLogin, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: `Too many different sign-in attempts, try again in {time}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context),
            useNextValidDate: true
        })
    });
};

const otcVerificationEnumeration = () => {
    return createInstance('otcVerificationEnumeration', spamOtcVerificationEnumeration, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: `Too many verification attempts across multiple codes, try again in {time}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED',
            useNextValidDate: true
        })
    });
};

const otcVerification = () => {
    return createInstance('otcVerification', spamOtcVerification, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: `Too many attempts for this verification code, try again in {time}`,
            context: tpl(messages.tooManyOTCVerificationAttempts.context),
            help: tpl(messages.tooManyOTCVerificationAttempts.context),
            code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED',
            useNextValidDate: true
        })
    });
};

const userLogin = () => {
    return createInstance('userLogin', spamUserLogin, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: `Too many login attempts. Please wait {time} before trying again, or reset your password.`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: tpl(messages.tooManySigninAttempts.context),
            useNextValidDate: true
        })
    });
};

const userReset = () => {
    return createInstance('userReset', spamUserReset, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: `Too many password reset attempts try again in {time}`,
            context: tpl(messages.forgottenPasswordEmail.error, {
                rfa: spamUserReset.freeRetries + 1 || 5,
                rfp: spamUserReset.lifetime || 60 * 60
            }),
            help: tpl(messages.forgottenPasswordEmail.context),
            useNextValidDate: true
        })
    });
};

const userVerification = () => {
    return createInstance('userVerification', spamUserVerification, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: tpl(messages.tooManyAttempts),
            context: null,
            help: null
        })
    });
};

const sendVerificationCode = () => {
    return createInstance('sendVerificationCode', spamSendVerificationCode, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: tpl(messages.tooManyAttempts),
            context: null,
            help: null
        })
    });
};

const privateBlog = () => {
    return createInstance('privateBlog', spamPrivateBlock, {
        attachResetToRequest: false,
        failCallback: buildFailCallback({
            message: `Too many private sign-in attempts try again in {time}`,
            context: tpl(messages.tooManySigninAttempts.context),
            help: null,
            useNextValidDate: true
        })
    });
};

const contentApiKey = () => {
    return createInstance('contentApiKey', spamContentApiKey, {
        attachResetToRequest: true,
        failCallback: buildFailCallback({
            message: tpl(messages.tooManyAttempts),
            context: null,
            help: null
        })
    }, true);
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
        Object.keys(instances).forEach(key => delete instances[key]);

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