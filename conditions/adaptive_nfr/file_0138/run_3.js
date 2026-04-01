```javascript
'use strict';

/**
 * Auth.js controller
 *
 * @description: A set of functions called "actions" for managing `Auth`.
 */

/* eslint-disable no-useless-escape */
const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Formats error into standardized response structure
 */
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

/**
 * Checks if email provider is enabled
 */
const isEmailProviderEnabled = async (store) => {
  return _.get(await store.get({ key: 'grant' }), 'email.enabled');
};

/**
 * Checks if third-party provider is enabled
 */
const isProviderEnabled = async (store, provider) => {
  return _.get(await store.get({ key: 'grant' }), [provider, 'enabled']);
};

/**
 * Validates email format
 */
const isValidEmail = (email) => {
  return emailRegExp.test(email);
};

/**
 * Checks if user account is confirmed
 */
const isAccountConfirmed = (user, emailConfirmationRequired) => {
  return !emailConfirmationRequired || user.confirmed === true;
};

/**
 * Checks if user account is not blocked
 */
const isAccountNotBlocked = (user) => {
  return user.blocked !== true;
};

/**
 * Checks if user has local password set
 */
const hasLocalPassword = (user) => {
  return !!user.password;
};

/**
 * Builds user query based on identifier type
 */
const buildUserQuery = (identifier, provider) => {
  const query = { provider };
  if (isValidEmail(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

/**
 * Sanitizes user entity for response
 */
const sanitizeUser = (user) => {
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });
};

/**
 * Sends successful authentication response
 */
const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeUser(user),
  });
};

/**
 * Validates local authentication credentials
 */
const validateLocalAuth = async (ctx, params, store) => {
  if (!await isEmailProviderEnabled(store)) {
    return { error: 'This provider is disabled.' };
  }

  if (!params.identifier) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      }),
    };
  }

  if (!params.password) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }

  return { valid: true };
};

/**
 * Validates user existence and status
 */
const validateUserStatus = async (user, store) => {
  if (!user) {
    return {
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  const emailConfirmationRequired = _.get(await store.get({ key: 'advanced' }), 'email_confirmation');
  if (!isAccountConfirmed(user, emailConfirmationRequired)) {
    return {
      error: formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      }),
    };
  }

  if (!isAccountNotBlocked(user)) {
    return {
      error: formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      }),
    };
  }

  if (!hasLocalPassword(user)) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.local',
        message: 'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }

  return { valid: true };
};

/**
 * Validates password correctness
 */
const validatePassword = async (inputPassword, storedPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(inputPassword, storedPassword);
};

/**
 * Handles local provider authentication flow
 */
const handleLocalAuth = async (ctx, params, store) => {
  const validation = await validateLocalAuth(ctx, params, store);
  if (validation.error) {
    return ctx.badRequest(null, validation.error);
  }

  const query = buildUserQuery(params.identifier, 'local');
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const statusValidation = await validateUserStatus(user, store);
  if (statusValidation.error) {
    return ctx.badRequest(null, statusValidation.error);
  }

  const isValidPassword = await validatePassword(params.password, user.password);
  if (!isValidPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  sendAuthResponse(ctx, user);
};

/**
 * Handles third-party provider authentication flow
 */
const handleProviderAuth = async (ctx, provider, store) => {
  if (!await isProviderEnabled(store, provider)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'provider.disabled',
        message: 'This provider is disabled.',
      })
    );
  }

  let user;
  let error;

  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      ctx.query
    );
  } catch ([catchUser, catchError]) {
    return ctx.badRequest(null, catchError === 'array' ? catchError[0] : catchError);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  sendAuthResponse(ctx, user);
};

/**
 * Validates reset password parameters
 */
const isValidResetPasswordRequest = (params) => {
  return params.password && params.passwordConfirmation && params.code;
};

/**
 * Checks if passwords match
 */
const doPasswordsMatch = (password, confirmation) => {
  return password === confirmation;
};

/**
 * Validates email format and returns normalized email
 */
const validateAndNormalizeEmail = (email) => {
  if (!isValidEmail(email)) {
    return { error: true };
  }
  return { email: email.toLowerCase() };
};

/**
 * Checks if user is blocked
 */
const isUserBlocked = (user) => {
  return user.blocked === true;
};

/**
 * Handles email sending with error handling
 */
const sendEmailSafely = async (emailConfig) => {
  try {
    await strapi.plugins['email'].services.email.send(emailConfig);
    return { success: true };
  } catch (err) {
    return { error: err };
  }
};

/**
 * Builds email from address
 */
const buildFromAddress = (settings) => {
  if (settings.from.email || settings.from.name) {
    return `${settings.from.name} <${settings.from.email}>`;
  }
  return undefined;
};

/**
 * Checks if email is already taken by same provider
 */
const isEmailTakenBySameProvider = (user, provider) => {
  return user && user.provider === provider;
};

/**
 * Checks if email is already taken by different provider
 */
const isEmailTakenByDifferentProvider = (user, provider, uniqueEmailRequired) => {
  return user && user.provider !== provider && uniqueEmailRequired;
};

/**
 * Checks if username is mentioned in error
 */
const isUsernameTakenError = (error) => {
  return _.includes(error.message, 'username');
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    const store = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    if (provider === 'local') {
      return handleLocalAuth(ctx, params, store);
    }

    return handleProviderAuth(ctx, provider, store);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (!isValidResetPasswordRequest(params)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.params.provide',
          message: 'Incorrect params provided.',
        })
      );
    }

    if (!doPasswordsMatch(params.password, params.passwordConfirmation)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    }

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ resetPasswordToken: `${params.code}` });

    if (!user) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.code.provide',
          message: 'Incorrect code provided.',
        })
      );
    }

    const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
      password: params.password,
    });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password });

    sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const grantConfig = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'grant',
      })
      .get();

    const [requestPath] = ctx.request.url.split('?');
    const provider = requestPath.split('/')[2];

    if (!_.get(grantConfig[provider], 'enabled')) {
      return ctx.badRequest(null, 'This provider is disabled.');
    }

    if (!strapi.config.server.url.startsWith('http')) {
      strapi.log.warn(
        'You are using a third party provider for login. Make sure to set an absolute url in config/server.js. More info here: https://strapi.io/documentation/developer-docs/latest/development/plugins/users-permissions.html#setting-up-the-server-url'
      );
    }

    grantConfig[provider].callback = _.get(ctx, 'query.callback') || grantConfig[provider].callback;
    grantConfig[provider].redirect_uri = strapi.plugins[
      'users-permissions'
    ].services.providers.buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    const emailValidation = validateAndNormalizeEmail(email);
    if (emailValidation.error) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }

    email = emailValidation.email;

    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email });

    if (!user) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.user.not-exist',
          message: 'This email does not exist.',
        })
      );
    }

    if (isUserBlocked(user)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.user.blocked',
          message: 'This user is disabled.',
        })
      );
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    const settings = await pluginStore.get({ key: 'email' }).then(storeEmail => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

    const advanced = await pluginStore.get({
      key: 'advanced',
    });

    const userInfo = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    settings.message = await strapi.plugins['users-permissions'].services.userspermissions.template(
      settings.message,
      {
        URL: advanced.email_reset_password,
        USER: userInfo,
        TOKEN: resetPasswordToken,
      }
    );

    settings.object = await strapi.plugins['users-permissions'].services.userspermissions.template(
      settings.object,
      {
        USER: userInfo,
      }
    );

    const emailResult = await sendEmailSafely({
      to: user.email,
      from: buildFromAddress(settings.from),
      replyTo: settings.response_email,
      subject: settings.object,
      text: settings.message,
      html: settings.message,
    });

    if (emailResult.error) {
      return ctx.badRequest(null, emailResult.error);
    }

    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const settings = await pluginStore.get({
      key: 'advanced',
    });

    if (!settings.allow_register) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.advanced.allow_register',
          message: 'Register action is currently disabled.',
        })
      );
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    if (!params.password) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.provide',
          message: 'Please provide your password.',
        })
      );
    }

    if (!params.email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.