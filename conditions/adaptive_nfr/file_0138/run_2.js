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
 * Formats an error object into the expected response structure
 * @param {Object} error - Error object with id, message, and optional field
 * @returns {Array} Formatted error array
 */
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

/**
 * Checks if a string is a valid email format
 * @param {string} identifier - String to validate
 * @returns {boolean} True if valid email format
 */
const isValidEmail = identifier => emailRegExp.test(identifier);

/**
 * Checks if email confirmation is required and user is not confirmed
 * @param {Object} store - Plugin store instance
 * @param {Object} user - User object
 * @returns {Promise<boolean>} True if confirmation is required but not done
 */
const isEmailConfirmationRequired = async (store, user) => {
  const advanced = await store.get({ key: 'advanced' });
  return _.get(advanced, 'email_confirmation') && user.confirmed !== true;
};

/**
 * Checks if user account is blocked
 * @param {Object} user - User object
 * @returns {boolean} True if user is blocked
 */
const isUserBlocked = user => user.blocked === true;

/**
 * Checks if user has a local password set
 * @param {Object} user - User object
 * @returns {boolean} True if user has no password
 */
const hasNoLocalPassword = user => !user.password;

/**
 * Validates user password against stored hash
 * @param {string} inputPassword - Password to validate
 * @param {string} storedPassword - Stored password hash
 * @returns {Promise<boolean>} True if password is valid
 */
const validateUserPassword = async (inputPassword, storedPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    inputPassword,
    storedPassword
  );
};

/**
 * Builds sanitized user response object
 * @param {Object} user - User object
 * @returns {Object} Sanitized user data
 */
const buildSanitizedUser = user => {
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });
};

/**
 * Builds JWT and user response
 * @param {Object} user - User object
 * @returns {Object} Response with jwt and user
 */
const buildAuthResponse = user => {
  return {
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: buildSanitizedUser(user),
  };
};

/**
 * Handles local provider authentication
 * @param {Object} ctx - Koa context
 * @param {Object} params - Request parameters
 * @param {Object} store - Plugin store
 * @returns {Promise<void>}
 */
const handleLocalAuth = async (ctx, params, store) => {
  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  if (!params.identifier) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      })
    );
  }

  if (!params.password) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      })
    );
  }

  const query = { provider: 'local' };
  const isEmail = isValidEmail(params.identifier);

  if (isEmail) {
    query.email = params.identifier.toLowerCase();
  } else {
    query.username = params.identifier;
  }

  const user = await strapi.query('user', 'users-permissions').findOne(query);

  if (!user) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  if (await isEmailConfirmationRequired(store, user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      })
    );
  }

  if (isUserBlocked(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      })
    );
  }

  if (hasNoLocalPassword(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      })
    );
  }

  const validPassword = await validateUserPassword(params.password, user.password);

  if (!validPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  ctx.send(buildAuthResponse(user));
};

/**
 * Handles third-party provider authentication
 * @param {Object} ctx - Koa context
 * @param {string} provider - Provider name
 * @param {Object} store - Plugin store
 * @returns {Promise<void>}
 */
const handleProviderAuth = async (ctx, provider, store) => {
  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
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
  } catch ([user, error]) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  ctx.send(buildAuthResponse(user));
};

/**
 * Checks if password and confirmation match
 * @param {string} password - Password
 * @param {string} passwordConfirmation - Password confirmation
 * @returns {boolean} True if passwords match
 */
const passwordsMatch = (password, passwordConfirmation) => password === passwordConfirmation;

/**
 * Checks if reset password params are valid
 * @param {Object} params - Parameters object
 * @returns {boolean} True if all required params are present and valid
 */
const isValidResetPasswordRequest = params => {
  return (
    params.password &&
    params.passwordConfirmation &&
    passwordsMatch(params.password, params.passwordConfirmation) &&
    params.code
  );
};

/**
 * Checks if password confirmation params are provided but don't match
 * @param {Object} params - Parameters object
 * @returns {boolean} True if passwords don't match
 */
const isPasswordMismatch = params => {
  return (
    params.password &&
    params.passwordConfirmation &&
    !passwordsMatch(params.password, params.passwordConfirmation)
  );
};

/**
 * Checks if registration is allowed
 * @param {Object} settings - Advanced settings
 * @returns {boolean} True if registration is allowed
 */
const isRegistrationAllowed = settings => settings.allow_register;

/**
 * Checks if password contains invalid format
 * @param {string} password - Password to check
 * @returns {boolean} True if password is hashed or invalid
 */
const isInvalidPasswordFormat = password => {
  return strapi.plugins['users-permissions'].services.user.isHashed(password);
};

/**
 * Checks if email is already taken by another provider
 * @param {Object} user - Existing user
 * @param {string} provider - Current provider
 * @param {boolean} uniqueEmail - Whether unique email is enforced
 * @returns {boolean} True if email is taken
 */
const isEmailTakenByOtherProvider = (user, provider, uniqueEmail) => {
  return user && user.provider !== provider && uniqueEmail;
};

/**
 * Checks if email is taken by same provider
 * @param {Object} user - Existing user
 * @param {string} provider - Current provider
 * @returns {boolean} True if email is taken
 */
const isEmailTakenBySameProvider = (user, provider) => {
  return user && user.provider === provider;
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

    if (isValidResetPasswordRequest(params)) {
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

      ctx.send(buildAuthResponse(user));
      return;
    }

    if (isPasswordMismatch(params)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    }

    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.params.provide',
        message: 'Incorrect params provided.',
      })
    );
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

    const isEmail = isValidEmail(email);

    if (!isEmail) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }

    email = email.toLowerCase();

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

    if (user.blocked) {
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

    try {
      await strapi.plugins['email'].services.email.send({
        to: user.email,
        from:
          settings.from.email || settings.from.name
            ? `${settings.from.name} <${settings.from.email}>`
            : undefined,
        replyTo: settings.response_email,
        subject: settings.object,
        text: settings.message,
        html: settings.message,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
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
      key: 'advanced