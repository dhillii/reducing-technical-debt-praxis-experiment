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

let spam = config.get('spam') || {};

const getSpamSection = (key) => spam[key] || {};

let store;
let memoryStore;

const getKnexStore = () => {
    if (store) return store;
    const BruteKnex = require('brute-knex');
    const db = require('../../../../data/db');
    store = new BruteKnex({tablename: 'brute', createTable: false, knex: db.knex});
    return store;
};

const getMemoryStore = () => {
    if (memoryStore) return memoryStore;
    const ExpressBrute = require('express-brute');
    memoryStore = new ExpressBrute.MemoryStore();
    return memoryStore;
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

const createInstance = (type, spamSection, failCallback) => {
    const ExpressBrute = require('express-brute');
    const storeInstance = type === 'memory' ? getMemoryStore() : getKnexStore();

    const options = extend({
        attachResetToRequest: type !== 'memory',
        failCallback,
        handleStoreError
    }, pick(spamSection, spamConfigKeys));

    return new ExpressBrute(storeInstance, options);
};

const instances = {};

const getOrCreate = (name, creator) => {
    if (!instances[name]) {
        instances[name] = creator();
    }
    return instances[name];
};

const globalBlock = () => getOrCreate('globalBlock', () => createInstance('knex', getSpamSection('global_block'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: (spam.global_block?.freeRetries ?? 5) + 1,
            rfp: spam.global_block?.lifetime ?? 3600
        }),
        help: tpl(messages.tooManyAttempts)
    }));
}));

const globalReset = () => getOrCreate('globalReset', () => createInstance('knex', getSpamSection('global_reset'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordIp.error, {
            rfa: (spam.global_reset?.freeRetries ?? 5) + 1,
            rfp: spam.global_reset?.lifetime ?? 3600
        }),
        help: tpl(messages.forgottenPasswordIp.context)
    }));
}));

const webmentionsBlock = () => getOrCreate('webmentionsBlock', () => createInstance('knex', getSpamSection('webmentions_block'), (req, res, next) => {
    return next(new errors.TooManyRequestsError({message: messages.webmentionsBlock}));
}));

const emailPreviewBlock = () => getOrCreate('emailPreviewBlock', () => createInstance('knex', getSpamSection('email_preview_block'), (req, res, next) => {
    return next(new errors.TooManyRequestsError({message: messages.emailPreviewBlock}));
}));

const membersAuth = () => getOrCreate('membersAuth', () => createInstance('knex', getSpamSection('user_login'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}));

const membersAuthEnumeration = () => getOrCreate('membersAuthEnumeration', () => createInstance('knex', getSpamSection('member_login'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many different sign-in attempts, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}));

const otcVerificationEnumeration = () => getOrCreate('otcVerificationEnumeration', () => createInstance('knex', getSpamSection('otc_verification_enumeration'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many verification attempts across multiple codes, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_TOTAL_ATTEMPTS_RATE_LIMITED'
    }));
}));

const otcVerification = () => getOrCreate('otcVerification', () => createInstance('knex', getSpamSection('otc_verification'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many attempts for this verification code, try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.tooManyOTCVerificationAttempts.context),
        help: tpl(messages.tooManyOTCVerificationAttempts.context),
        code: 'OTC_CODE_ATTEMPTS_RATE_LIMITED'
    }));
}));

const userLogin = () => getOrCreate('userLogin', () => createInstance('knex', getSpamSection('user_login'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many login attempts. Please wait ${moment(nextValidRequestDate).fromNow(true)} before trying again, or reset your password.`,
        context: tpl(messages.tooManySigninAttempts.context),
        help: tpl(messages.tooManySigninAttempts.context)
    }));
}));

const userReset = () => getOrCreate('userReset', () => createInstance('knex', getSpamSection('user_reset'), (req, res, next, nextValidRequestDate) => {
    return next(new errors.TooManyRequestsError({
        message: `Too many password reset attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`,
        context: tpl(messages.forgottenPasswordEmail.error, {
            rfa: (spam.user_reset?.freeRetries ?? 5) + 1,
            rfp: spam.user_reset?.lifetime ?? 3600
        }),
        help: tpl(messages.forgottenPasswordEmail.context)
    }));
}));

const userVerification = () => getOrCreate('userVerification', () => createInstance('knex', getSpamSection('user_verification'), (req, res, next) => {
    return next(new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)}));
}));

const sendVerificationCode = () => getOrCreate('sendVerificationCode', () => createInstance('knex', getSpamSection('send_verification_code'), (req, res, next) => {
    return next(new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)}));
}));

const privateBlog = () => getOrCreate('privateBlog', () => createInstance('knex', getSpamSection('private_block'), (req, res, next, nextValidRequestDate) => {
    logging.error(new errors.TooManyRequestsError({
        message: tpl(messages.tooManySigninAttempts.error, {
            rateSigninAttempts: (spam.private_block?.freeRetries ?? 5) + 1,
            rateSigninPeriod: spam.private_block?.lifetime ?? 3600
        }),
        context: tpl(messages.tooManySigninAttempts.context)
    }));
    return next(new errors.TooManyRequestsError({
        message: `Too many private sign-in attempts try again in ${moment(nextValidRequestDate).fromNow(true)}`
    }));
}));

const contentApiKey = () => getOrCreate('contentApiKey', () => createInstance('memory', getSpamSection('content_api_key'), (req, res, next) => {
    const err = new errors.TooManyRequestsError({message: tpl(messages.tooManyAttempts)});
    logging.error(err);
    return next(err);
}));

const reset = () => {
    store = undefined;
    memoryStore = undefined;
    Object.keys(instances).forEach(key => delete instances[key]);
    spam = config.get('spam') || {};
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