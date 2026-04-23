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
  try {
    const [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      ctx.query
    );

    if (!user) {
      return ctx.badRequest(null, error === 'array' ? error[0] : error);
    }

    const jwtService = strapi.plugins['users-permissions'].services.jwt;
    ctx.send({
      jwt: jwtService.issue({ id: user.id }),
      user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
        model: strapi.query('user', 'users-permissions').model,
      }),
    });
  } catch ([user, error]) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }
};

// Helper: Validate reset password parameters
const validateResetPasswordParams = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return {
      valid: false,
      type: 'missing',
    };
  }

  if (params.password !== params.passwordConfirmation) {
    return {
      valid: false,
      type: 'mismatch',
    };
  }

  return { valid: true };
};

// Helper: Send sanitized user response
const sendUserResponse = (ctx, user, includeJwt = true) => {
  const jwtService = strapi.plugins['users-permissions'].services.jwt;
  const response = {
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  };

  if (includeJwt) {
    response.jwt = jwtService.issue({ id: user.id });
  }

  ctx.send(response);
};

// Helper: Validate email format and return normalized email
const validateAndNormalizeEmail = (email) => {
  if (!isValidEmail(email)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      }),
    };
  }
  return { valid: true, email: email.toLowerCase() };
};

// Helper: Check if user exists and is available for registration
const checkUserEmailAvailability = async (email, provider, uniqueEmailRequired) => {
  const user = await strapi.query('user', 'users-permissions').findOne({ email });

  if (user && user.provider === provider) {
    return {
      available: false,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (user && user.provider !== provider && uniqueEmailRequired) {
    return {
      available: false,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  return { available: true };
};

// Helper: Prepare email settings for password reset
const prepareResetPasswordEmailSettings = async (pluginStore, user, resetPasswordToken) => {
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

  const templateService = strapi.plugins['users-permissions'].services.userspermissions;

  settings.message = await templateService.template(settings.message, {
    URL: advanced.email_reset_password,
    USER: userInfo,
    TOKEN: resetPasswordToken,
  });

  settings.object = await templateService.template(settings.object, {
    USER: userInfo,
  });

  return settings;
};

// Helper: Send reset password email
const sendResetPasswordEmail = async (settings, user) => {
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

// Helper: Check if password has invalid format
const isInvalidPasswordFormat = (password) => {
  return strapi.plugins['users-permissions'].services.user.isHashed(password);
};

// Helper: Get default role for registration
const getDefaultRole = async (defaultRoleType) => {
  return strapi.query('role', 'users-permissions').findOne({ type: defaultRoleType }, []);
};

// Helper: Handle registration email confirmation flow
const handleRegistrationEmailConfirmation = async (ctx, user, settings) => {
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

  const jwtService = strapi.plugins['users-permissions'].services.jwt;
  const jwt = jwtService.issue(_.pick(user, ['id']));

  return ctx.send({
    jwt,
    user: sanitizedUser,
  });
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
      if (!await isProviderEnabled(store, provider)) {
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
      if (!await isProviderEnabled(store, provider)) {
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
      if (validation.type === 'mismatch') {
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
    const password = await userService.hashPassword({ password: params.password });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password });

    return sendUserResponse(ctx, user);
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
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
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

    try {
      const settings = await prepareResetPasswordEmailSettings(
        pluginStore,
        user,
        resetPasswordToken
      );
      await sendResetPasswordEmail(settings, user);
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { resetPasswordToken }
    );

    ctx.send({ ok: true });
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

    if (isInvalidPasswordFormat(params.password)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.format',
          message: 'Your password cannot contain more than three times the symbol `$`.',
        })
      );
    }

    const role = await getDefaultRole(settings.default_role);

    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
    }

    const emailValidation = validateAndNormalizeEmail(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    params.email = emailValidation.email;

    const emailAvailability = await checkUserEmailAvailability(
      params.email,
      params.provider,
      settings.unique_email
    );
    if (!emailAvailability.available) {
      return ctx.badRequest(null, emailAvailability.error);
    }

    try {
      const userService = strapi.plugins['users-permissions'].services.user;
      params.role = role.id;
      params.password = await userService.hashPassword(params);

      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);

      return handleRegistrationEmailConfirmation(ctx, user, settings);
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? {
            id: 'Auth.form.error.username.taken',
            message: 'Username already taken',
          }
        : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

      return ctx.badRequest(null, formatError(adminError));
    }
  },

  async emailConfirmation(ctx, next, returnUser) {
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
      return sendUserResponse(ctx, user);
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
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    if (!params.email) {
      return ctx.badRequest('missing.email');
    }

    const emailValidation = validateAndNormalizeEmail(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest('wrong.email');
    }

    params.email = emailValidation.email;

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
  },
};