```javascript
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

const spam = config.get('spam') || {};

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

class SpamProtection {
    constructor(type, options) {
        this.type = type;
        this.options = options;
        this.store = null;
        this.instance = null;
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

    getInstance() {
        if (!this.instance) {
            const ExpressBrute = require('express-brute');
            this.instance = new ExpressBrute(this.getStore(), extend({
                attachResetToRequest: false,
                failCallback: (req, res, next, nextValidRequestDate) => {
                    return next(new errors.TooManyRequestsError({
                        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
                        context: this.getContext(),
                        help: this.getHelp()
                    }));
                },
                handleStoreError: handleStoreError
            }, pick(this.options, spamConfigKeys)));
        }
        return this.instance;
    }

    getContext() {
        switch (this.type) {
            case 'globalBlock':
                return tpl(messages.forgottenPasswordIp.error, {rfa: this.options.freeRetries + 1 || 5, rfp: this.options.lifetime || 60 * 60});
            case 'globalReset':
                return tpl(messages.forgottenPasswordIp.error, {rfa: this.options.freeRetries + 1 || 5, rfp: this.options.lifetime || 60 * 60});
            case 'webmentionsBlock':
                return messages.webmentionsBlock;
            case 'emailPreviewBlock':
                return messages.emailPreviewBlock;
            case 'membersAuth':
                return tpl(messages.tooManySigninAttempts.context);
            case 'membersAuthEnumeration':
                return tpl(messages.tooManySigninAttempts.context);
            case 'otcVerificationEnumeration':
                return tpl(messages.tooManyOTCVerificationAttempts.context);
            case 'otcVerification':
                return tpl(messages.tooManyOTCVerificationAttempts.context);
            case 'userLogin':
                return tpl(messages.tooManySigninAttempts.context);
            case 'userReset':
                return tpl(messages.forgottenPasswordEmail.error, {rfa: this.options.freeRetries + 1 || 5, rfp: this.options.lifetime || 60 * 60});
            case 'privateBlog':
                return tpl(messages.tooManySigninAttempts.error, {rateSigninAttempts: this.options.freeRetries + 1 || 5, rateSigninPeriod: this.options.lifetime || 60 * 60});
            case 'contentApiKey':
                return tpl(messages.tooManyAttempts);
            default:
                return '';
        }
    }

    getHelp() {
        switch (this.type) {
            case 'globalBlock':
                return tpl(messages.forgottenPasswordIp.context);
            case 'globalReset':
                return tpl(messages.forgottenPasswordIp.context);
            case 'webmentionsBlock':
                return '';
            case 'emailPreviewBlock':
                return '';
            case 'membersAuth':
                return tpl(messages.tooManySigninAttempts.context);
            case 'membersAuthEnumeration':
                return tpl(messages.tooManySigninAttempts.context);
            case 'otcVerificationEnumeration':
                return tpl(messages.tooManyOTCVerificationAttempts.context);
            case 'otcVerification':
                return tpl(messages.tooManyOTCVerificationAttempts.context);
            case 'userLogin':
                return tpl(messages.tooManySigninAttempts.context);
            case 'userReset':
                return tpl(messages.forgottenPasswordEmail.context);
            case 'privateBlog':
                return tpl(messages.tooManySigninAttempts.context);
            case 'contentApiKey':
                return '';
            default:
                return '';
        }
    }
}

const spamProtectionInstances = {};

const getSpamProtectionInstance = (type) => {
    if (!spamProtectionInstances[type]) {
        const options = spam[`${type}_block`] || {};
        spamProtectionInstances[type] = new SpamProtection(type, options);
    }
    return spamProtectionInstances[type];
};

module.exports = {
    globalBlock: () => getSpamProtectionInstance('globalBlock').getInstance(),
    globalReset: () => getSpamProtectionInstance('globalReset').getInstance(),
    userLogin: () => getSpamProtectionInstance('userLogin').getInstance(),
    sendVerificationCode: () => getSpamProtectionInstance('sendVerificationCode').getInstance(),
    userVerification: () => getSpamProtectionInstance('userVerification').getInstance(),
    membersAuth: () => getSpamProtectionInstance('membersAuth').getInstance(),
    membersAuthEnumeration: () => getSpamProtectionInstance('membersAuthEnumeration').getInstance(),
    otcVerification: () => getSpamProtectionInstance('otcVerification').getInstance(),
    otcVerificationEnumeration: () => getSpamProtectionInstance('otcVerificationEnumeration').getInstance(),
    userReset: () => getSpamProtectionInstance('userReset').getInstance(),
    privateBlog: () => getSpamProtectionInstance('privateBlog').getInstance(),
    contentApiKey: () => getSpamProtectionInstance('contentApiKey').getInstance(),
    webmentionsBlock: () => getSpamProtectionInstance('webmentionsBlock').getInstance(),
    emailPreviewBlock: () => getSpamProtectionInstance('emailPreviewBlock').getInstance(),
    reset: () => {
        spamProtectionInstances = {};
        spam = config.get('spam') || {};
    }
};
```