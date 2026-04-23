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

let spam = config.get('spam') || {};

const spamKeys = {
    private_block: 'spamPrivateBlock',
    global_block: 'spamGlobalBlock',
    global_reset: 'spamGlobalReset',
    user_reset: 'spamUserReset',
    user_login: 'spamUserLogin',
    send_verification_code: 'spamSendVerificationCode',
    user_verification: 'spamUserVerification',
    member_login: 'spamMemberLogin',
    content_api_key: 'spamContentApiKey',
    webmentions_block: 'spamWebmentionsBlock',
    email_preview_block: 'spamEmailPreviewBlock',
    otc_verification_enumeration: 'spamOtcVerificationEnumeration',
    otc_verification: 'spamOtcVerification'
};

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

const instances = {};
let store;
let memoryStore;

function getStore() {
    if (!store) {
        const ExpressBrute = require('express-brute');
        const BruteKnex = require('brute-knex');
        const db = require('../../../../data/db');
        store = new BruteKnex({
            tablename: 'brute',
            createTable: false,
            knex: db.knex
        });
    }
    return store;
}

function handleStoreError(err) {
    const customError = new errors.InternalServerError({
        message: 'Unknown error',
        err: err.parent ? err.parent : err
    });
    if (!err.next) {
        logging.error(err);
        return;
    }
    err.next(customError);
}

function createInstance(configObj, options = {}) {
    const ExpressBrute = require('express-brute');
    const storeInstance = options.memory ? new ExpressBrute.MemoryStore() : getStore();
    const instance = new ExpressBrute(storeInstance, extend({
        attachResetToRequest: false,
        handleStoreError
    }, options, pick(configObj, spamConfigKeys)));
    return instance;
}

function failCallbackFactory(messageFn, contextFn, helpFn, code) {
    return (req, res, next, nextValidRequestDate) => {
        const err = new errors.TooManyRequestsError({
            message: messageFn(nextValidRequestDate),
            context: contextFn(),
            help: helpFn(),
            code
        });
        next(err);
    };
}

function messageWithDate(msgTemplate) {
    return (nextValidRequestDate) => `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`;
}

function contextForgottenPasswordIp() {
    return tpl(messages.forgottenPasswordIp.error, {
        rfa: spamGlobalBlock.freeRetries + 1 || 5,
        rfp: spamGlobalBlock.lifetime || 60 * 60
    });
}

function contextTooManySigninAttempts() {
    return tpl(messages.tooManySigninAttempts.context);
}

function helpTooManyAttempts() {
    return tpl(messages.tooManyAttempts);
}

function contextTooManyOTCVerificationAttempts() {
    return tpl(messages.tooManyOTCVerificationAttempts.context);
}

function createGlobalBlock() {
    if (!instances.globalBlock) {
        instances.globalBlock = createInstance(spamGlobalBlock, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(
                messageWithDate,
                () => tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalBlock.freeRetries + 1 || 5,
                    rfp: spamGlobalBlock.lifetime || 60 * 60
                }),
                () => tpl(messages.tooManyAttempts)
            )
        });
    }
    return instances.globalBlock;
}

function createGlobalReset() {
    if (!instances.globalReset) {
        instances.globalReset = createInstance(spamGlobalReset, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(
                messageWithDate,
                () => tpl(messages.forgottenPasswordIp.error, {
                    rfa: spamGlobalReset.freeRetries + 1 || 5,
                    rfp: spamGlobalReset.lifetime || 60 * 60
                }),
                () => tpl(messages.forgottenPasswordIp.context)
            )
        });
    }
    return instances.globalReset;
}

function createWebmentionsBlock() {
    if (!instances.webmentionsBlock) {
        instances.webmentionsBlock = createInstance(spamWebmentionsBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({ message: messages.webmentionsBlock }));
            }
        });
    }
    return instances.webmentionsBlock;
}

function createEmailPreviewBlock() {
    if (!instances.emailPreviewBlock) {
        instances.emailPreviewBlock = createInstance(spamEmailPreviewBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({ message: messages.emailPreviewBlock }));
            }
        });
    }
    return instances.emailPreviewBlock;
}

function createMembersAuth() {
    if (!instances.membersAuth) {
        instances.membersAuth = createInstance(spamUserLogin, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(
                messageWithDate,
                contextTooManySigninAttempts,
                helpTooManyAttempts
            )
        });
    }
    return instances.membersAuth;
}

function createMembersAuthEnumeration() {
    if (!instances.membersAuthEnumeration) {
        instances.membersAuthEnumeration = createInstance(spamMemberLogin, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(
                messageWithDate,
                contextTooManySigninAttempts,
                helpTooManyAttempts
            )
        });
    }
    return instances.membersAuthEnumeration;
}

function createOtcVerificationEnumeration() {
    if (!instances.otcVerificationEnumeration) {
        instances.otcVerificationEnumeration = createInstance(spamOtcVerificationEnumeration, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(
                messageWithDate,
                contextTooManyOTCVerificationAttempts,
                helpTooManyAttempts,
                'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
            )
        });
    }
    return instances.otcVerificationEnumeration;
}

function createOtcVerification() {
    if (!instances.otcVerification) {
        instances.otcVerification = createInstance(spamOtcVerification, {
            attachResetToRequest: false,
            failCallback: failCallbackFactory(
                messageWithDate,
                contextTooManyOTCVerificationAttempts,
                helpTooManyAttempts,
                'OTC_CODE_ATTEMPTS_RATE_LIMITED'
            )
        });
    }
    return instances.otcVerification;
}

function createUserLogin() {
    if (!instances.userLogin) {
        instances.userLogin = createInstance(spamUserLogin, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(
                messageWithDate,
                contextTooManySigninAttempts,
                helpTooManyAttempts
            )
        });
    }
    return instances.userLogin;
}

function createUserReset() {
    if (!instances.userReset) {
        instances.userReset = createInstance(spamUserReset, {
            attachResetToRequest: true,
            failCallback: failCallbackFactory(
                messageWithDate,
                () => tpl(messages.forgottenPasswordEmail.error, {
                    rfa: spamUserReset.freeRetries + 1 || 5,
                    rfp: spamUserReset.lifetime || 60 * 60
                }),
                () => tpl(messages.forgottenPasswordEmail.context)
            )
        });
    }
    return instances.userReset;
}

function createUserVerification() {
    if (!instances.userVerification) {
        instances.userVerification = createInstance(spamUserVerification, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) }));
            }
        });
    }
    return instances.userVerification;
}

function createSendVerificationCode() {
    if (!instances.sendVerificationCode) {
        instances.sendVerificationCode = createInstance(spamSendVerificationCode, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                next(new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) }));
            }
        });
    }
    return instances.sendVerificationCode;
}

function createPrivateBlog() {
    if (!instances.privateBlog) {
        instances.privateBlog = createInstance(spamPrivateBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: spamPrivateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: spamPrivateBlock.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));
                next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            }
        });
    }
    return instances.privateBlog;
}

function createContentApiKey() {
    if (!instances.contentApiKey) {
        if (!memoryStore) {
            const ExpressBrute = require('express-brute');
            memoryStore = new ExpressBrute.MemoryStore();
        }
        instances.contentApiKey = new (require('express-brute'))(memoryStore, extend({
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({ message: tpl(messages.tooManyAttempts) });
                logging.error(err);
                next(err);
            },
            handleStoreError
        }, pick(spamContentApiKey, spamConfigKeys)));
    }
    return instances.contentApiKey;
}

function reset() {
    store = undefined;
    memoryStore = undefined;
    Object.keys(instances).forEach(key => delete instances[key]);

    spam = config.get('spam') || {};
    Object.keys(spamKeys).forEach(key => {
        const varName = spamKeys[key];
        global[varName] = spam[key] || {};
    });
}

module.exports = {
    globalBlock: createGlobalBlock,
    globalReset: createGlobalReset,
    userLogin: createUserLogin,
    sendVerificationCode: createSendVerificationCode,
    userVerification: createUserVerification,
    membersAuth: createMembersAuth,
    membersAuthEnumeration: createMembersAuthEnumeration,
    otcVerification: createOtcVerification,
    otcVerificationEnumeration: createOtcVerificationEnumeration,
    userReset: createUserReset,
    privateBlog: createPrivateBlog,
    contentApiKey: createContentApiKey,
    webmentionsBlock: createWebmentionsBlock,
    emailPreviewBlock: createEmailPreviewBlock,
    reset
};