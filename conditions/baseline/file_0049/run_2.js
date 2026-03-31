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

const SPAM_CONFIG_KEYS = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

class SpamManager {
    constructor() {
        this.store = null;
        this.memoryStore = null;
        this.instances = {};
        this.spamConfig = {};
        this.loadConfig();
    }

    loadConfig() {
        const spam = config.get('spam') || {};
        this.spamConfig = {
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
    }

    getStore() {
        if (!this.store) {
            const BruteKnex = require('brute-knex');
            const db = require('../../../../data/db');
            this.store = new BruteKnex({
                tablename: 'brute',
                createTable: false,
                knex: db.knex
            });
        }
        return this.store;
    }

    getMemoryStore() {
        if (!this.memoryStore) {
            const ExpressBrute = require('express-brute');
            this.memoryStore = new ExpressBrute.MemoryStore();
        }
        return this.memoryStore;
    }

    createBruteInstance(key, config, failCallback, useMemoryStore = false) {
        if (this.instances[key]) {
            return this.instances[key];
        }

        const ExpressBrute = require('express-brute');
        const storeToUse = useMemoryStore ? this.getMemoryStore() : this.getStore();

        this.instances[key] = new ExpressBrute(
            storeToUse,
            extend({
                handleStoreError: this.handleStoreError
            }, failCallback, pick(config, SPAM_CONFIG_KEYS))
        );

        return this.instances[key];
    }

    handleStoreError(err) {
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

    createFailCallback(messageKey, configKey, includeTime = true, customCode = null) {
        return (req, res, next, nextValidRequestDate) => {
            const errorObj = {
                message: includeTime 
                    ? `${messages[messageKey]} try again in ${moment(nextValidRequestDate).fromNow(true)}`
                    : messages[messageKey],
                context: messages[messageKey]?.context || messages[messageKey]
            };

            if (customCode) {
                errorObj.code = customCode;
            }

            return next(new errors.TooManyRequestsError(errorObj));
        };
    }

    globalBlock() {
        return this.createBruteInstance('globalBlock', this.spamConfig.globalBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: this.spamConfig.globalBlock.freeRetries + 1 || 5,
                        rfp: this.spamConfig.globalBlock.lifetime || 60 * 60
                    }),
                    help: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }

    globalReset() {
        return this.createBruteInstance('globalReset', this.spamConfig.globalReset, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error, {
                        rfa: this.spamConfig.globalReset.freeRetries + 1 || 5,
                        rfp: this.spamConfig.globalReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            }
        });
    }

    webmentionsBlock() {
        return this.createBruteInstance('webmentionsBlock', this.spamConfig.webmentionsBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            }
        });
    }

    emailPreviewBlock() {
        return this.createBruteInstance('emailPreviewBlock', this.spamConfig.emailPreviewBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            }
        });
    }

    membersAuth() {
        return this.createBruteInstance('membersAuth', this.spamConfig.userLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }

    membersAuthEnumeration() {
        return this.createBruteInstance('membersAuthEnumeration', this.spamConfig.memberLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }

    otcVerificationEnumeration() {
        return this.createBruteInstance('otcVerificationEnumeration', this.spamConfig.otcVerificationEnumeration, {
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
    }

    otcVerification() {
        return this.createBruteInstance('otcVerification', this.spamConfig.otcVerification, {
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
    }

    userLogin() {
        return this.createBruteInstance('userLogin', this.spamConfig.userLogin, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            }
        });
    }

    userReset() {
        return this.createBruteInstance('userReset', this.spamConfig.userReset, {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error, {
                        rfa: this.spamConfig.userReset.freeRetries + 1 || 5,
                        rfp: this.spamConfig.userReset.lifetime || 60 * 60
                    }),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            }
        });
    }

    userVerification() {
        return this.createBruteInstance('userVerification', this.spamConfig.userVerification, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }

    sendVerificationCode() {
        return this.createBruteInstance('sendVerificationCode', this.spamConfig.sendVerificationCode, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }

    privateBlog() {
        return this.createBruteInstance('privateBlog', this.spamConfig.privateBlock, {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error, {
                        rateSigninAttempts: this.spamConfig.privateBlock.freeRetries + 1 || 5,
                        rateSigninPeriod: this.spamConfig.privateBlock.lifetime || 60 * 60
                    }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            }
        });
    }

    contentApiKey() {
        return this.createBruteInstance('contentApiKey', this.spamConfig.contentApiKey, {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            }
        }, true);
    }

    reset() {
        this.store = null;
        this.memoryStore = null;
        this.instances = {};
        this.loadConfig();
    }
}

const manager = new SpamManager();

module.exports = {
    globalBlock: () => manager.globalBlock(),
    globalReset: () => manager.globalReset(),
    userLogin: () => manager.userLogin(),
    sendVerificationCode: () => manager.sendVerificationCode(),
    userVerification: () => manager.userVerification(),
    membersAuth: () => manager.membersAuth(),
    membersAuthEnumeration: () => manager.membersAuthEnumeration(),
    otcVerification: () => manager.otcVerification(),
    otcVerificationEnumeration: () => manager.otcVerificationEnumeration(),
    userReset: () => manager.userReset(),
    privateBlog: () => manager.privateBlog(),
    contentApiKey: () => manager.contentApiKey(),
    webmentionsBlock: () => manager.webmentionsBlock(),
    emailPreviewBlock: () => manager.emailPreviewBlock(),
    reset: () => manager.reset()
};
```