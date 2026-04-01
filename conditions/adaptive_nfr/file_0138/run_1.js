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
  if (!isEmailProviderEnabled(await store.get({ key: 'grant' }))) {
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

  return null;
};

/**
 * Validates user existence and status
 */
const validateUserStatus = async (ctx, user, store) => {
  if (!user) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  const advanced = await store.get({ key: 'advanced' });
  const emailConfirmationRequired = _.get(advanced, 'email_confirmation');

  if (!isAccountConfirmed(user, emailConfirmationRequired)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      })
    );
  }

  if (!isAccountNotBlocked(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      })
    );
  }

  if (!hasLocalPassword(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      })
    );
  }

  return null;
};

/**
 * Validates password correctness
 */
const validatePassword = async (ctx, params, user) => {
  const validPassword = await strapi.plugins[
    'users-permissions'
  ].services.user.validatePassword(params.password, user.password);

  if (!validPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  return null;
};

/**
 * Handles third-party provider authentication
 */
const handleProviderAuth = async (ctx, provider, store) => {
  if (!isProviderEnabled(await store.get({ key: 'grant' }), provider)) {
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

  return null;
};

/**
 * Validates reset password parameters
 */
const arePasswordsValid = (password, passwordConfirmation) => {
  return password && passwordConfirmation && password === passwordConfirmation;
};

/**
 * Validates password mismatch
 */
const doPasswordsMismatch = (password, passwordConfirmation) => {
  return password && passwordConfirmation && password !== passwordConfirmation;
};

/**
 * Handles reset password logic
 */
const processPasswordReset = async (ctx, params) => {
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

  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeUser(user),
  });
};

/**
 * Validates email format and returns error if invalid
 */
const validateEmailFormat = (ctx, email) => {
  if (!isValidEmail(email)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      })
    );
  }
  return null;
};

/**
 * Checks if user is blocked
 */
const isUserBlocked = (user) => {
  return user && user.blocked;
};

/**
 * Validates registration parameters
 */
const validateRegistrationParams = (ctx, params) => {
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
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      })
    );
  }

  return null;
};

/**
 * Checks if password is hashed
 */
const isPasswordHashed = (password) => {
  return strapi.plugins['users-permissions'].services.user.isHashed(password);
};

/**
 * Validates email uniqueness for registration
 */
const validateEmailUniqueness = (ctx, user, provider, uniqueEmailRequired) => {
  if (user && user.provider === provider) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      })
    );
  }

  if (user && user.provider !== provider && uniqueEmailRequired) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      })
    );
  }

  return null;
};

/**
 * Handles user creation and response
 */
const createUserAndRespond = async (ctx, params, settings) => {
  try {
    if (!settings.email_confirmation) {
      params.confirmed = true;
    }

    const user = await strapi.query('user', 'users-permissions').create(params);
    const sanitizedUser = sanitizeUser(user);

    if (settings.email_confirmation) {
      await sendConfirmationEmailSafely(ctx, user);
      return ctx.send({ user: sanitizedUser });
    }

    const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
    return ctx.send({
      jwt,
      user: sanitizedUser,
    });
  } catch (err) {
    handleUserCreationError(ctx, err);
  }
};

/**
 * Sends confirmation email with error handling
 */
const sendConfirmationEmailSafely = async (ctx, user) => {
  try {
    await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
  } catch (err) {
    return ctx.badRequest(null, err);
  }
};

/**
 * Handles user creation errors
 */
const handleUserCreationError = (ctx, err) => {
  const adminError = _.includes(err.message, 'username')
    ? {
        id: 'Auth.form.error.username.taken',
        message: 'Username already taken',
      }
    : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

  ctx.badRequest(null, formatError(adminError));
};

/**
 * Validates confirmation token
 */
const isConfirmationTokenValid = (confirmationToken) => {
  return !_.isEmpty(confirmationToken);
};

/**
 * Handles email confirmation response
 */
const handleEmailConfirmationResponse = async (ctx, user, returnUser) => {
  if (returnUser) {
    ctx.send({
      jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
      user: sanitizeUser(user),
    });
  } else {
    const settings = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    ctx.redirect(settings.email_confirmation_redirection || '/');
  }
};

/**
 * Validates send email confirmation parameters
 */
const validateSendEmailParams = (ctx, params) => {
  if (!params.email) {
    return ctx.badRequest('missing.email');
  }

  if (!isValidEmail(params.email)) {
    return ctx.badRequest('wrong.email');
  }

  return null;
};

/**
 * Validates user state for email confirmation
 */
const validateUserStateForConfirmation = (ctx, user) => {
  if (user.confirmed) {
    return ctx.badRequest('already.confirmed');
  }

  if (user.blocked) {
    return ctx.badRequest('blocked.user');
  }

  return null;
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
      const validationError = await validateLocalAuth(ctx, params, store);
      if (validationError) return validationError;

      const query = buildUserQuery(params.identifier, provider);
      const user = await strapi.query('user', 'users-permissions').findOne(query);

      const userStatusError = await validateUserStatus(ctx, user, store);
      if (userStatusError) return userStatusError;

      const passwordError = await validatePassword(ctx, params, user);
      if (passwordError) return passwordError;

      sendAuthResponse(ctx, user);
    } else {
      const providerError = await handleProviderAuth(ctx, provider, store);
      if (providerError) return providerError;

      const user = await strapi.plugins['users-permissions'].services.providers.connect(
        provider,
        ctx.query
      );

      sendAuthResponse(ctx, user[0]);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (arePasswordsValid(params.password, params.passwordConfirmation) && params.code) {
      return processPasswordReset(ctx, params);
    }

    if (doPasswordsMismatch(params.password, params.passwordConfirmation)) {
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
        'You are using a third party provider for login. Make sure to set an absolute url in config/server.js. More info here: https://strapi.io/documentation/developer-docs/