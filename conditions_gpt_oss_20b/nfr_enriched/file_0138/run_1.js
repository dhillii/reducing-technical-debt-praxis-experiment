'use strict';

/**
 * Auth.js controller
 *
 * @description: A set of functions called "actions" for managing `Auth`.
 */

const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

/**
 * Helper: Check if a provider is enabled in the store.
 */
const isProviderEnabled = async (store, provider) => {
  const grantConfig = await store.get({ key: 'grant' });
  return _.get(grantConfig, [provider, 'enabled']);
};

/**
 * Helper: Validate local provider parameters.
 */
const validateLocalParams = (ctx, params) => {
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
 * Helper: Find user by identifier (email or username).
 */
const findUserByIdentifier = async (identifier, provider) => {
  const query = { provider };
  const isEmail = emailRegExp.test(identifier);
  if (isEmail) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return strapi.query('user', 'users-permissions').findOne(query);
};

/**
 * Helper: Check email confirmation requirement.
 */
const checkEmailConfirmation = async (user, store) => {
  const advanced = await store.get({ key: 'advanced' });
  if (advanced.email_confirmation && user.confirmed !== true) {
    return formatError({
      id: 'Auth.form.error.confirmed',
      message: 'Your account email is not confirmed',
    });
  }
  return null;
};

/**
 * Helper: Check if user is blocked.
 */
const checkUserBlocked = user => {
  if (user.blocked === true) {
    return formatError({
      id: 'Auth.form.error.blocked',
      message: 'Your account has been blocked by an administrator',
    });
  }
  return null;
};

/**
 * Helper: Check if user has a local password.
 */
const checkPasswordExists = user => {
  if (!user.password) {
    return formatError({
      id: 'Auth.form.error.password.local',
      message:
        'This user never set a local password, please login with the provider used during account creation.',
    });
  }
  return null;
};

/**
 * Helper: Validate password against stored hash.
 */
const validatePassword = async (inputPassword, storedHash) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    inputPassword,
    storedHash
  );
};

/**
 * Helper: Send authentication response.
 */
const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

/**
 * Handle local provider authentication.
 */
const handleLocalProvider = async (ctx, params, store) => {
  if (!(await isProviderEnabled(store, 'local'))) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const errorResponse = validateLocalParams(ctx, params);
  if (errorResponse) return errorResponse;

  const user = await findUserByIdentifier(params.identifier, 'local');
  if (!user) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  const emailError = await checkEmailConfirmation(user, store);
  if (emailError) return ctx.badRequest(null, emailError);

  const blockedError = checkUserBlocked(user);
  if (blockedError) return ctx.badRequest(null, blockedError);

  const passwordMissingError = checkPasswordExists(user);
  if (passwordMissingError) return ctx.badRequest(null, passwordMissingError);

  const validPassword = await validatePassword(params.password, user.password);
  if (!validPassword) {
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
 * Handle third-party provider authentication.
 */
const handleThirdPartyProvider = async (ctx, provider, store) => {
  if (!(await isProviderEnabled(store, provider))) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'provider.disabled',
        message: 'This provider is disabled.',
      })
    );
  }

  let user, error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      ctx.query
    );
  } catch (caught) {
    return ctx.badRequest(null, caught === 'array' ? caught[0] : caught);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  sendAuthResponse(ctx, user);
};

/**
 * Validate reset password parameters.
 */
const validateResetParams = params => {
  if (
    params.password &&
    params.passwordConfirmation &&
    params.password === params.passwordConfirmation &&
    params.code
  ) {
    return null;
  }
  if (
    params.password &&
    params.passwordConfirmation &&
    params.password !== params.passwordConfirmation
  ) {
    return formatError({
      id: 'Auth.form.error.password.matching',
      message: 'Passwords do not match.',
    });
  }
  return formatError({
    id: 'Auth.form.error.params.provide',
    message: 'Incorrect params provided.',
  });
};

/**
 * Reset password handler.
 */
const resetPasswordHandler = async (ctx) => {
  const params = _.assign({}, ctx.request.body, ctx.params);
  const error = validateResetParams(params);
  if (error) return ctx.badRequest(null, error);

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
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

/**
 * Validate email format.
 */
const validateEmailFormat = email => {
  const isEmail = emailRegExp.test(email);
  if (!isEmail) {
    return formatError({
      id: 'Auth.form.error.email.format',
      message: 'Please provide a valid email address.',
    });
  }
  return null;
};

/**
 * Forgot password handler.
 */
const forgotPasswordHandler = async (ctx) => {
  let { email } = ctx.request.body;
  const emailError = validateEmailFormat(email);
  if (emailError) return ctx.badRequest(null, emailError);

  email = email.toLowerCase();

  const pluginStore = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  const user = await strapi
    .query('user', 'users-permissions')
    .findOne({ email: email.toLowerCase() });

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
};

/**
 * Register handler.
 */
const registerHandler = async (ctx) => {
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

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      })
    );
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

  const isEmail = emailRegExp.test(params.email);
  if (!isEmail) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
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

    return ctx.send({
      jwt,
      user: sanitizedUser,
    });
  } catch (err) {
    const adminError = _.includes(err.message, 'username')
      ? {
          id: 'Auth.form.error.username.taken',
          message: 'Username already taken',
        }
      : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

    ctx.badRequest(null, formatError(adminError));
  }
};

/**
 * Email confirmation handler.
 */
const emailConfirmationHandler = async (ctx, next, returnUser) => {
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
 * Send email confirmation handler.
 */
const sendEmailConfirmationHandler = async (ctx) => {
  const params = _.assign(ctx.request.body);

  if (!params.email) {
    return ctx.badRequest('missing.email');
  }

  const isEmail = emailRegExp.test(params.email);
  if (!isEmail) {
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
    ctx.send({
      email: user.email,
      sent: true,
    });
  } catch (err) {
    return ctx.badRequest(null, err);
  }
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
      await handleLocalProvider(ctx, params, store);
    } else {
      await handleThirdPartyProvider(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    await resetPasswordHandler(ctx);
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
    await forgotPasswordHandler(ctx);
  },

  async register(ctx) {
    await registerHandler(ctx);
  },

  async emailConfirmation(ctx, next, returnUser) {
    await emailConfirmationHandler(ctx, next, returnUser);
  },

  async sendEmailConfirmation(ctx) {
    await sendEmailConfirmationHandler(ctx);
  },
};