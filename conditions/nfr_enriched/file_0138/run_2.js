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

const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

// Helper: Validate email format
const isValidEmail = email => emailRegExp.test(email);

// Helper: Get user query based on identifier type
const buildUserQuery = (identifier, provider) => {
  const query = { provider };
  if (isValidEmail(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

// Helper: Check if provider is enabled in store
const isProviderEnabled = async (store, provider) => {
  if (provider === 'local') {
    return _.get(await store.get({ key: 'grant' }), 'email.enabled');
  }
  return _.get(await store.get({ key: 'grant' }), [provider, 'enabled']);
};

// Helper: Validate local login parameters
const validateLocalLoginParams = (params) => {
  if (!params.identifier) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      }),
    };
  }
  if (!params.password) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }
  return { valid: true };
};

// Helper: Check user account status
const checkUserAccountStatus = async (user, store) => {
  if (!user) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      }),
    };
  }

  if (user.blocked === true) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      }),
    };
  }

  if (!user.password) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.local',
        message: 'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate password and return user response
const validateAndRespondLocalLogin = async (ctx, params, user) => {
  const userService = strapi.plugins['users-permissions'].services.user;
  const jwtService = strapi.plugins['users-permissions'].services.jwt;

  const validPassword = await userService.validatePassword(params.password, user.password);

  if (!validPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  ctx.send({
    jwt: jwtService.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

// Helper: Handle third-party provider authentication
const handleProviderAuth = async (ctx, provider) => {
  const providerService = strapi.plugins['users-permissions'].services.providers;
  const jwtService = strapi.plugins['users-permissions'].services.jwt;

  let user;
  let error;

  try {
    [user, error] = await providerService.connect(provider, ctx.query);
  } catch ([catchUser, catchError]) {
    return ctx.badRequest(null, catchError === 'array' ? catchError[0] : catchError);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  ctx.send({
    jwt: jwtService.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

// Helper: Validate reset password parameters
const validateResetPasswordParams = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.params.provide',
        message: 'Incorrect params provided.',
      }),
    };
  }

  if (params.password !== params.passwordConfirmation) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.matching',
        message: 'Passwords do not match.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Process reset password token and update user
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

  const userService = strapi.plugins['users-permissions'].services.user;
  const jwtService = strapi.plugins['users-permissions'].services.jwt;

  const password = await userService.hashPassword({ password: params.password });

  await strapi
    .query('user', 'users-permissions')
    .update({ id: user.id }, { resetPasswordToken: null, password });

  ctx.send({
    jwt: jwtService.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

// Helper: Validate registration parameters
const validateRegistrationParams = (params) => {
  if (!params.password) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }

  if (!params.email) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate email format for registration
const validateRegistrationEmail = (email) => {
  if (!isValidEmail(email)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      }),
    };
  }
  return { valid: true };
};

// Helper: Check for existing user and email conflicts
const checkExistingUser = async (email, provider, settings) => {
  const user = await strapi.query('user', 'users-permissions').findOne({ email });

  if (user && user.provider === provider) {
    return {
      exists: true,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (user && user.provider !== provider && settings.unique_email) {
    return {
      exists: true,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  return { exists: false };
};

// Helper: Create user and handle confirmation flow
const createUserAndRespond = async (ctx, params, settings) => {
  const userService = strapi.plugins['users-permissions'].services.user;
  const jwtService = strapi.plugins['users-permissions'].services.jwt;

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
        await userService.sendConfirmationEmail(user);
      } catch (err) {
        return ctx.badRequest(null, err);
      }
      return ctx.send({ user: sanitizedUser });
    }

    const jwt = jwtService.issue(_.pick(user, ['id']));
    return ctx.send({ jwt, user: sanitizedUser });
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

// Helper: Prepare and send forgot password email
const sendForgotPasswordEmail = async (ctx, user, pluginStore, resetPasswordToken) => {
  const userService = strapi.plugins['users-permissions'].services.user;

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

  const usersPermissionsService = strapi.plugins['users-permissions'].services.userspermissions;

  settings.message = await usersPermissionsService.template(settings.message, {
    URL: advanced.email_reset_password,
    USER: userInfo,
    TOKEN: resetPasswordToken,
  });

  settings.object = await usersPermissionsService.template(settings.object, {
    USER: userInfo,
  });

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

// Helper: Validate email confirmation token
const validateConfirmationToken = (confirmationToken) => {
  if (_.isEmpty(confirmationToken)) {
    return { valid: false };
  }
  return { valid: true };
};

// Helper: Handle email confirmation response
const handleEmailConfirmationResponse = async (ctx, user, returnUser) => {
  const jwtService = strapi.plugins['users-permissions'].services.jwt;

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

// Helper: Validate send email confirmation parameters
const validateSendEmailConfirmationParams = (email) => {
  if (!email) {
    return { valid: false, error: 'missing.email' };
  }

  if (!isValidEmail(email)) {
    return { valid: false, error: 'wrong.email' };
  }

  return { valid: true };
};

// Helper: Check user status for email confirmation
const checkUserStatusForEmailConfirmation = (user) => {
  if (user.confirmed) {
    return { valid: false, error: 'already.confirmed' };
  }

  if (user.blocked) {
    return { valid: false, error: 'blocked.user' };
  }

  return { valid: true };
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
      const providerEnabled = await isProviderEnabled(store, provider);
      if (!providerEnabled) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      const paramValidation = validateLocalLoginParams(params);
      if (!paramValidation.valid) {
        return ctx.badRequest(null, paramValidation.error);
      }

      const query = buildUserQuery(params.identifier, provider);
      const user = await strapi.query('user', 'users-permissions').findOne(query);

      const accountStatus = await checkUserAccountStatus(user, store);
      if (!accountStatus.valid) {
        return ctx.badRequest(null, accountStatus.error);
      }

      return validateAndRespondLocalLogin(ctx, params, user);
    } else {
      const providerEnabled = await isProviderEnabled(store, provider);
      if (!providerEnabled) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'provider.disabled',
            message: 'This provider is disabled.',
          })
        );
      }

      return handleProviderAuth(ctx, provider);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validation = validateResetPasswordParams(params);
    if (!validation.valid) {
      return ctx.badRequest(null, validation.error);
    }

    return processPasswordReset(ctx, params);
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

    const emailValidation = isValidEmail(email);
    if (!emailValidation) {
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

    return sendForgotPasswordEmail(ctx, user, pluginStore, resetPasswordToken);
  },

  async register(ctx) {
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

    const paramValidation = validateRegistrationParams(params);
    if (!paramValidation.valid) {
      return ctx.badRequest(null, paramValidation.error);
    }

    const userService = strapi.plugins['users-permissions'].services.user;

    if (userService.isHashed(params.password)) {
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

    const emailValidation = validateRegistrationEmail(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await userService.hashPassword(params);

    const existingUserCheck = await checkExistingUser(params.email, params.provider, settings);
    if (existingUserCheck.exists) {
      return ctx.badRequest(null, existingUserCheck.error);
    }

    return createUserAndRespond(ctx, params, settings);
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    const tokenValidation = validateConfirmationToken(confirmationToken);
    if (!tokenValidation.valid) {
      return ctx.badRequest('token.invalid');
    }

    const { user: userService } = strapi.plugins['users-permissions'].services;

    const user = await userService.fetch({ confirmationToken }, []);

    if (!user) {
      return ctx.badRequest('token.invalid');
    }

    await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

    return handleEmailConfirmationResponse(ctx, user, returnUser);
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    const paramValidation = validateSendEmailConfirmationParams(params.email);
    if (!paramValidation.valid) {
      return ctx.badRequest(paramValidation.error);
    }

    const email = params.email.toLowerCase();

    const user = await strapi.query('user', 'users-permissions').findOne({ email });

    const userStatusCheck = checkUserStatusForEmailConfirmation(user);
    if (!userStatusCheck.valid) {
      return ctx.badRequest(userStatusCheck.error);
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
  },
};