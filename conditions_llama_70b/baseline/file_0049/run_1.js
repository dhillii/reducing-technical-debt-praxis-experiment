const moment = require('moment');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const errors = require('@tryghost/errors');
const config = require('../../../../../shared/config');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const spamConfigKeys = ['freeRetries', 'minWait', 'maxWait', 'lifetime'];

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

class SpamPrevention {
    constructor() {
        this.spam = config.get('spam') || {};
        this.store = null;
        this.memoryStore = null;
        this.instances = {};
    }

    getStore() {
        if (!this.store) {
            const db = require('../../../../data/db');
            this.store = new (require('brute-knex'))({
                tablename: 'brute',
                createTable: false,
                knex: db.knex
            });
        }
        return this.store;
    }

    getMemoryStore() {
        if (!this.memoryStore) {
            this.memoryStore = new (require('express-brute')).MemoryStore();
        }
        return this.memoryStore;
    }

    createInstance(options) {
        const ExpressBrute = require('express-brute');
        const store = options.useMemoryStore ? this.getMemoryStore() : this.getStore();
        const instance = new ExpressBrute(store, options);
        return instance;
    }

    getInstance(type, options) {
        if (!this.instances[type]) {
            this.instances[type] = this.createInstance(options);
        }
        return this.instances[type];
    }

    getGlobalBlock() {
        return this.getInstance('globalBlock', {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error,
                        {rfa: this.spam.global_block.freeRetries + 1 || 5, rfp: this.spam.global_block.lifetime || 60 * 60}),
                    help: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getGlobalReset() {
        return this.getInstance('globalReset', {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordIp.error,
                        {rfa: this.spam.global_reset.freeRetries + 1 || 5, rfp: this.spam.global_reset.lifetime || 60 * 60}),
                    help: tpl(messages.forgottenPasswordIp.context)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getWebmentionsBlock() {
        return this.getInstance('webmentionsBlock', {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.webmentionsBlock
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getEmailPreviewBlock() {
        return this.getInstance('emailPreviewBlock', {
            attachResetToRequest: false,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: messages.emailPreviewBlock
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getMembersAuth() {
        return this.getInstance('membersAuth', {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getMembersAuthEnumeration() {
        return this.getInstance('membersAuthEnumeration', {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getOtcVerificationEnumeration() {
        return this.getInstance('otcVerificationEnumeration', {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getOtcVerification() {
        return this.getInstance('otcVerification', {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.tooManyOTCVerificationAttempts.context),
                    help: tpl(messages.tooManyOTCVerificationAttempts.context),
                    code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getUserLogin() {
        return this.getInstance('userLogin', {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
                    context: tpl(messages.tooManySigninAttempts.context),
                    help: tpl(messages.tooManySigninAttempts.context)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getUserReset() {
        return this.getInstance('userReset', {
            attachResetToRequest: true,
            failCallback: (req, res, next, nextValidRequestDate) => {
                return next(new errors.TooManyRequestsError({
                    message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                    context: tpl(messages.forgottenPasswordEmail.error,
                        {rfa: this.spam.user_reset.freeRetries + 1 || 5, rfp: this.spam.user_reset.lifetime || 60 * 60}),
                    help: tpl(messages.forgottenPasswordEmail.context)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getUserVerification() {
        return this.getInstance('userVerification', {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getSendVerificationCode() {
        return this.getInstance('sendVerificationCode', {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                return next(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getPrivateBlog() {
        return this.getInstance('privateBlog', {
            attachResetToRequest: false,
            failCallback: (req, res, next, nextValidRequestDate) => {
                logging.error(new errors.TooManyRequestsError({
                    message: tpl(messages.tooManySigninAttempts.error,
                        {
                            rateSigninAttempts: this.spam.private_block.freeRetries + 1 || 5,
                            rateSigninPeriod: this.spam.private_block.lifetime || 60 * 60
                        }),
                    context: tpl(messages.tooManySigninAttempts.context)
                }));

                return next(new errors.TooManyRequestsError({
                    message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
                }));
            },
            handleStoreError: handleStoreError
        });
    }

    getContentApiKey() {
        return this.getInstance('contentApiKey', {
            attachResetToRequest: true,
            failCallback: (req, res, next) => {
                const err = new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyAttempts)
                });

                logging.error(err);
                return next(err);
            },
            handleStoreError: handleStoreError,
            useMemoryStore: true
        });
    }

    reset() {
        this.store = null;
        this.memoryStore = null;
        this.instances = {};
        this.spam = config.get('spam') || {};
    }
}

module.exports = new SpamPrevention();