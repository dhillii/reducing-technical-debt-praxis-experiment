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

// Helper: Validate local provider is enabled
const isLocalProviderEnabled = async (store) => {
  return _.get(await store.get({ key: 'grant' }), 'email.enabled');
};

// Helper: Validate identifier and password are provided
const validateLocalCredentials = (params) => {
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

// Helper: Build query for user lookup
const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  const isEmail = emailRegExp.test(identifier);

  if (isEmail) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }

  return query;
};

// Helper: Validate user exists and is active
const validateUserStatus = async (user, store) => {
  if (!user) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  if (_.get(await store.get({ key: 'advanced' }), 'email_confirmation') && user.confirmed !== true) {
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
const validatePasswordAndRespond = async (ctx, password, userPassword, user) => {
  const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(password, userPassword);

  if (!validPassword) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });

  return { valid: true };
};

// Helper: Handle local provider authentication
const handleLocalAuth = async (ctx, params, store) => {
  const credentialsValid = validateLocalCredentials(params);
  if (!credentialsValid.valid) {
    return ctx.badRequest(null, credentialsValid.error);
  }

  const query = buildUserQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const userStatusValid = await validateUserStatus(user, store);
  if (!userStatusValid.valid) {
    return ctx.badRequest(null, userStatusValid.error);
  }

  return validatePasswordAndRespond(ctx, params.password, user.password, user);
};

// Helper: Handle third-party provider authentication
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

  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
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
      type: 'missing',
      error: formatError({
        id: 'Auth.form.error.params.provide',
        message: 'Incorrect params provided.',
      }),
    };
  }

  if (params.password !== params.passwordConfirmation) {
    return {
      valid: false,
      type: 'mismatch',
      error: formatError({
        id: 'Auth.form.error.password.matching',
        message: 'Passwords do not match.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate email format
const validateEmailFormat = (email) => {
  const isEmail = emailRegExp.test(email);
  return {
    valid: isEmail,
    normalizedEmail: isEmail ? email.toLowerCase() : null,
  };
};

// Helper: Sanitize user response
const sanitizeUserResponse = (user) => {
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });
};

// Helper: Get plugin store
const getPluginStore = () => {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

// Helper: Prepare email settings for reset password
const prepareResetPasswordEmailSettings = async (pluginStore, user, resetPasswordToken, advanced) => {
  const settings = await pluginStore.get({ key: 'email' }).then(storeEmail => {
    try {
      return storeEmail['reset_password'].options;
    } catch (error) {
      return {};
    }
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

  return settings;
};

// Helper: Send reset password email
const sendResetPasswordEmail = async (settings, user) => {
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
    return { success: true };
  } catch (err) {
    return { success: false, error: err };
  }
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

// Helper: Validate password format
const validatePasswordFormat = (password) => {
  if (strapi.plugins['users-permissions'].services.user.isHashed(password)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Get default role
const getDefaultRole = async (defaultRoleType) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRoleType }, []);

  if (!role) {
    return {
      found: false,
      error: formatError({
        id: 'Auth.form.error.role.notFound',
        message: 'Impossible to find the default role.',
      }),
    };
  }

  return { found: true, role };
};

// Helper: Check if email is already taken
const checkEmailExists = async (email, provider, uniqueEmail) => {
  const user = await strapi.query('user', 'users-permissions').findOne({
    email: email,
  });

  if (user && user.provider === provider) {
    return {
      exists: true,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (user && user.provider !== provider && uniqueEmail) {
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

// Helper: Handle registration with email confirmation
const handleRegistrationWithConfirmation = async (ctx, user) => {
  const sanitizedUser = sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

  try {
    await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
  } catch (err) {
    return ctx.badRequest(null, err);
  }

  return ctx.send({ user: sanitizedUser });
};

// Helper: Handle registration without email confirmation
const handleRegistrationWithoutConfirmation = async (ctx, user) => {
  const sanitizedUser = sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

  const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

  return ctx.send({
    jwt,
    user: sanitizedUser,
  });
};

// Helper: Handle registration error
const handleRegistrationError = (err) => {
  const adminError = _.includes(err.message, 'username')
    ? {
        id: 'Auth.form.error.username.taken',
        message: 'Username already taken',
      }
    : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

  return formatError(adminError);
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    const store = await getPluginStore();

    if (provider === 'local') {
      if (!await isLocalProviderEnabled(store)) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      return handleLocalAuth(ctx, params, store);
    } else {
      return handleProviderAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validation = validateResetPasswordParams(params);
    if (!validation.valid) {
      return ctx.badRequest(null, validation.error);
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

    ctx.send({
      jwt: strapi.plugins['users-permissions'].services.jwt.issue({
        id: user.id,
      }),
      user: sanitizeUserResponse(user),
    });
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

    const emailValidation = validateEmailFormat(email);
    if (!emailValidation.valid) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }

    email = emailValidation.normalizedEmail;
    const pluginStore = await getPluginStore();

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: email });

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
    const advanced = await pluginStore.get({ key: 'advanced' });

    const settings = await prepareResetPasswordEmailSettings(pluginStore, user, resetPasswordToken, advanced);

    const emailResult = await sendResetPasswordEmail(settings, user);
    if (!emailResult.success) {
      return ctx.badRequest(null, emailResult.error);
    }

    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await getPluginStore();

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

    const paramsValidation = validateRegistrationParams(params);
    if (!paramsValidation.valid) {
      return ctx.badRequest(null, paramsValidation.error);
    }

    const passwordValidation = validatePasswordFormat(params.password);
    if (!passwordValidation.valid) {
      return ctx.badRequest(null, passwordValidation.error);
    }

    const roleResult = await getDefaultRole(settings.default_role);
    if (!roleResult.found) {
      return ctx.badRequest(null, roleResult.error);
    }

    const emailValidation = validateEmailFormat(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    params.email = emailValidation.normalizedEmail;
    params.role = roleResult.role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const emailCheck = await checkEmailExists(params.email, params.provider, settings.unique_email);
    if (emailCheck.exists) {
      return ctx.badRequest(null, emailCheck.error);
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);

      if (settings.email_confirmation) {
        return handleRegistrationWithConfirmation(ctx, user);
      }

      return handleRegistrationWithoutConfirmation(ctx, user);
    } catch (err) {
      const adminError = handleRegistrationError(err);
      return ctx.badRequest(null, adminError);
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
      ctx.send({
        jwt: jwtService.issue({ id: user.id }),
        user: sanitizeUserResponse(user),
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
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    if (!params.email) {
      return ctx.badRequest('missing.email');
    }

    const emailValidation = validateEmailFormat(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest('wrong.email');
    }

    params.email = emailValidation.normalizedEmail;

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