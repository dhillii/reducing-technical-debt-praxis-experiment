'use strict';

/* eslint-disable no-useless-escape */
const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

/**
 * Checks if the local provider is enabled.
 * @param {Object} store - Strapi store instance.
 * @returns {Promise<boolean>}
 */
async function isLocalProviderEnabled(store) {
  const grantConfig = await store.get({ key: 'grant' });
  return _.get(grantConfig, 'email.enabled');
}

/**
 * Checks if a third‑party provider is enabled.
 * @param {Object} store - Strapi store instance.
 * @param {string} provider - Provider name.
 * @returns {Promise<boolean>}
 */
async function isProviderEnabled(store, provider) {
  const grantConfig = await store.get({ key: 'grant' });
  return _.get(grantConfig, [provider, 'enabled']);
}

/**
 * Determines whether the identifier looks like an email.
 * @param {string} identifier
 * @returns {boolean}
 */
function isEmailIdentifier(identifier) {
  return emailRegExp.test(identifier);
}

/**
 * Returns true when email confirmation is required and the user is not confirmed.
 * @param {Object} store - Strapi store instance.
 * @param {Object} user - User entity.
 * @returns {Promise<boolean>}
 */
async function requiresEmailConfirmation(store, user) {
  const advanced = await store.get({ key: 'advanced' });
  return _.get(advanced, 'email_confirmation') && user.confirmed !== true;
}

/**
 * Returns true when the user is blocked.
 * @param {Object} user
 * @returns {boolean}
 */
function isUserBlocked(user) {
  return user.blocked === true;
}

/**
 * Returns true when the user has never set a local password.
 * @param {Object} user
 * @returns {boolean}
 */
function isUserPasswordMissing(user) {
  return !user.password;
}

/**
 * Sends JWT and sanitized user data.
 * @param {Object} ctx - Koa context.
 * @param {Object} user - User entity.
 */
function sendAuthResponse(ctx, user) {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
}

/**
 * Handles local authentication flow.
 * @param {Object} ctx
 * @param {Object} params
 * @param {Object} store
 */
async function handleLocalCallback(ctx, params, store) {
  if (!(await isLocalProviderEnabled(store))) {
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
  if (isEmailIdentifier(params.identifier)) {
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

  if (await requiresEmailConfirmation(store, user)) {
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

  if (isUserPasswordMissing(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      })
    );
  }

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

  return sendAuthResponse(ctx, user);
}

/**
 * Handles third‑party provider authentication flow.
 * @param {Object} ctx
 * @param {string} provider
 * @param {Object} store
 */
async function handleProviderCallback(ctx, provider, store) {
  if (!(await isProviderEnabled(store, provider))) {
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
  } catch (e) {
    return ctx.badRequest(null, e === 'array' ? e[0] : e);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  return sendAuthResponse(ctx, user);
}

/**
 * Validates reset‑password parameters.
 * @param {Object} params
 * @returns {boolean}
 */
function hasValidResetParams(params) {
  return (
    params.password &&
    params.passwordConfirmation &&
    params.password === params.passwordConfirmation &&
    params.code
  );
}

/**
 * Checks password mismatch.
 * @param {Object} params
 * @returns {boolean}
 */
function passwordsDoNotMatch(params) {
  return (
    params.password &&
    params.passwordConfirmation &&
    params.password !== params.passwordConfirmation
  );
}

/**
 * Handles password reset flow.
 * @param {Object} ctx
 */
async function resetPassword(ctx) {
  const params = _.assign({}, ctx.request.body, ctx.params);

  if (hasValidResetParams(params)) {
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

    return sendAuthResponse(ctx, user);
  }

  if (passwordsDoNotMatch(params)) {
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
}

/**
 * Validates registration parameters.
 * @param {Object} params
 * @returns {Array<{id:string,message:string}>}
 */
function validateRegistrationParams(params) {
  const errors = [];

  if (!params.password) {
    errors.push({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    });
  }

  if (!params.email) {
    errors.push({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your email.',
    });
  }

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    errors.push({
      id: 'Auth.form.error.password.format',
      message: 'Your password cannot contain more than three times the symbol `$`.',
    });
  }

  if (!emailRegExp.test(params.email)) {
    errors.push({
      id: 'Auth.form.error.email.format',
      message: 'Please provide valid email address.',
    });
  }

  return errors;
}

/**
 * Handles user registration flow.
 * @param {Object} ctx
 */
async function register(ctx) {
  const pluginStore = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  const settings = await pluginStore.get({ key: 'advanced' });

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

  const validationErrors = validateRegistrationParams(params);
  if (validationErrors.length) {
    const error = validationErrors[0];
    return ctx.badRequest(null, formatError(error));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: settings.default_role }, []);

  if (!role) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.role.notFound',
        message: 'Impossible to find the default role.',
      })
    );
  }

  params.email = params.email.toLowerCase();
  params.role = role.id;
  params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

  const existingUser = await strapi.query('user', 'users-permissions').findOne({
    email: params.email,
  });

  if (existingUser && existingUser.provider === params.provider) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      })
    );
  }

  if (existingUser && existingUser.provider !== params.provider && settings.unique_email) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      })
    );
  }

  try {
    if (!settings.email_confirmation) {
      params.confirmed = true;
    }

    const user = await strapi.query('user', 'users-permissions').create(params);
    const sanitizedUser = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    if (settings.email_confirmation) {
      try {
        await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
      } catch (err) {
        return ctx.badRequest(null, err);
      }
      return ctx.send({ user: sanitizedUser });
    }

    const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
    return ctx.send({ jwt, user: sanitizedUser });
  } catch (err) {
    const adminError = _.includes(err.message, 'username')
      ? { id: 'Auth.form.error.username.taken', message: 'Username already taken' }
      : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };
    return ctx.badRequest(null, formatError(adminError));
  }
}

/**
 * Handles email confirmation flow.
 * @param {Object} ctx
 * @param {Function} next
 * @param {boolean} returnUser
 */
async function emailConfirmation(ctx, next, returnUser) {
  const { confirmation: confirmationToken } = ctx.query;
  const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

  if (_.isEmpty(confirmationToken)) {
    return ctx.badRequest('token.invalid');
  }

  const user = await userService.fetch({ confirmationToken }, []);
  if (!user) {
    return ctx.badRequest('token.invalid');
  }

  await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

  if (returnUser) {
    ctx.send({
      jwt: jwtService.issue({ id: user.id }),
      user: sanitizeEntity(user, {
        model: strapi.query('user', 'users-permissions').model,
      }),
    });
    return;
  }

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

/**
 * Handles sending of a confirmation email.
 * @param {Object} ctx
 */
async function sendEmailConfirmation(ctx) {
  const params = _.assign(ctx.request.body);

  if (!params.email) {
    return ctx.badRequest('missing.email');
  }

  if (!emailRegExp.test(params.email)) {
    return ctx.badRequest('wrong.email');
  }

  params.email = params.email.toLowerCase();

  const user = await strapi.query('user', 'users-permissions').findOne({
    email: params.email,
  });

  if (user.confirmed) {
    return ctx.badRequest('already.confirmed');
  }

  if (user.blocked) {
    return ctx.badRequest('blocked.user');
  }

  try {
    await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
    ctx.send({ email: user.email, sent: true });
  } catch (err) {
    return ctx.badRequest(null, err);
  }
}

/**
 * Handles forgot‑password flow.
 * @param {Object} ctx
 */
async function forgotPassword(ctx) {
  let { email } = ctx.request.body;

  if (!emailRegExp.test(email)) {
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

  const settings = await pluginStore
    .get({ key: 'email' })
    .then(storeEmail => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

  const advanced = await pluginStore.get({ key: 'advanced' });

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

  let from;
  if (settings.from && (settings.from.email || settings.from.name)) {
    from = `${settings.from.name} <${settings.from.email}>`;
  }

  try {
    await strapi.plugins['email'].services.email.send({
      to: user.email,
      from,
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
}

/**
 * Handles OAuth connect flow.
 * @param {Object} ctx
 * @param {Function} next
 */
async function connect(ctx, next) {
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
}

/**
 * Main callback entry point.
 * @param {Object} ctx
 */
async function callback(ctx) {
  const provider = ctx.params.provider || 'local';
  const params = ctx.request.body;

  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  if (provider === 'local') {
    return handleLocalCallback(ctx, params, store);
  }

  return handleProviderCallback(ctx, provider, store);
}

module.exports = {
  callback,
  resetPassword,
  connect,
  forgotPassword,
  register,
  emailConfirmation,
  sendEmailConfirmation,
};