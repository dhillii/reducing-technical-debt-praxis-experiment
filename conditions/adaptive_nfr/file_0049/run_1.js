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

class SpamProtectionManager {
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

    createBruteInstance(configKey, options = {}) {
        const ExpressBrute = require('express-brute');
        const store = options.useMemoryStore ? this.getMemoryStore() : this.getStore();
        const spamConfig = this.spamConfig[configKey];

        return new ExpressBrute(store,
            extend({
                attachResetToRequest: options.attachResetToRequest !== false,
                failCallback: options.failCallback,
                handleStoreError: this.handleStoreError.bind(this)
            }, pick(spamConfig, SPAM_CONFIG_KEYS))
        );
    }

    getInstance(key, configKey, options) {
        if (!this.instances[key]) {
            this.instances[key] = this.createBruteInstance(configKey, options);
        }
        return this.instances[key];
    }

    globalBlock() {
        return this.getInstance('globalBlock', 'globalBlock', {
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
        return this.getInstance('globalReset', 'globalReset', {
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
        return this.getInstance('webmentionsBlock', 'webmentionsBlock', {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            }
        });
    }

    emailPreviewBlock() {
        return this.getInstance('emailPreviewBlock', 'emailPreviewBlock', {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            }
        });
    }

    membersAuth() {
        return this.getInstance('membersAuth', 'userLogin', {
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
        return this.getInstance('membersAuthEnumeration', 'memberLogin', {
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
        return this.getInstance('otcVerificationEnumeration', 'otcVerificationEnumeration', {
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
        return this.getInstance('otcVerification', 'otcVerification', {
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
        return this.getInstance('userLogin', 'userLogin', {
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
        return this.getInstance('userReset', 'userReset', {
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
        return this.getInstance('userVerification', 'userVerification', {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }

    sendVerificationCode() {
        return this.getInstance('sendVerificationCode', 'sendVerificationCode', {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            }
        });
    }

    privateBlog() {
        return this.getInstance('privateBlog', 'privateBlock', {
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
        return this.getInstance('contentApiKey', 'contentApiKey', {
            attachResetToRequest: true,
            useMemoryStore: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            }
        });
    }

    reset() {
        this.store = null;
        this.memoryStore = null;
        this.instances = {};
        this.loadConfig();
    }
}

const manager = new SpamProtectionManager();

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