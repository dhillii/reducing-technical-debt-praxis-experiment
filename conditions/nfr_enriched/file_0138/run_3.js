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

const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

// Helper: Get plugin store
const getPluginStore = async () => {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

// Helper: Validate email format
const validateEmailFormat = (email) => {
  return emailRegExp.test(email);
};

// Helper: Sanitize user response
const sanitizeUserResponse = (user) => {
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });
};

// Helper: Issue JWT and return user response
const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeUserResponse(user),
  });
};

// Helper: Validate local provider is enabled
const validateLocalProviderEnabled = async (store) => {
  return _.get(await store.get({ key: 'grant' }), 'email.enabled');
};

// Helper: Validate third-party provider is enabled
const validateProviderEnabled = async (store, provider) => {
  return _.get(await store.get({ key: 'grant' }), [provider, 'enabled']);
};

// Helper: Build user query for local authentication
const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  const isEmail = validateEmailFormat(identifier);
  
  if (isEmail) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  
  return query;
};

// Helper: Validate local authentication parameters
const validateLocalAuthParams = (params) => {
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

// Helper: Validate user account status
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

// Helper: Validate password
const validatePassword = async (inputPassword, userPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(inputPassword, userPassword);
};

// Helper: Handle local authentication
const handleLocalAuth = async (ctx, store, params) => {
  const paramValidation = validateLocalAuthParams(params);
  if (!paramValidation.valid) {
    return ctx.badRequest(null, paramValidation.error);
  }

  const query = buildUserQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const statusValidation = await validateUserStatus(user, store);
  if (!statusValidation.valid) {
    return ctx.badRequest(null, statusValidation.error);
  }

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

// Helper: Handle third-party provider authentication
const handleProviderAuth = async (ctx, store, provider) => {
  const isEnabled = await validateProviderEnabled(store, provider);
  if (!isEnabled) {
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

  sendAuthResponse(ctx, user);
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

// Helper: Hash and update password
const updateUserPassword = async (userId, newPassword) => {
  const hashedPassword = await strapi.plugins['users-permissions'].services.user.hashPassword({
    password: newPassword,
  });

  await strapi.query('user', 'users-permissions').update(
    { id: userId },
    { resetPasswordToken: null, password: hashedPassword }
  );
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

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
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

// Helper: Validate email and normalize
const validateAndNormalizeEmail = (email) => {
  if (!validateEmailFormat(email)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      }),
    };
  }

  return { valid: true, email: email.toLowerCase() };
};

// Helper: Check for existing user with email
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

// Helper: Get default role
const getDefaultRole = async (defaultRoleType) => {
  return strapi.query('role', 'users-permissions').findOne({ type: defaultRoleType }, []);
};

// Helper: Create and send confirmation email
const createUserWithConfirmation = async (params, settings) => {
  if (!settings.email_confirmation) {
    params.confirmed = true;
  }

  const user = await strapi.query('user', 'users-permissions').create(params);
  const sanitizedUser = sanitizeUserResponse(user);

  if (settings.email_confirmation) {
    await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
    return { user: sanitizedUser, requiresConfirmation: true };
  }

  const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
  return { jwt, user: sanitizedUser, requiresConfirmation: false };
};

// Helper: Prepare forgot password email settings
const prepareForgotPasswordEmail = async (user, resetToken, pluginStore) => {
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
    TOKEN: resetToken,
  });

  settings.object = await usersPermissionsService.template(settings.object, {
    USER: userInfo,
  });

  return settings;
};

// Helper: Send forgot password email
const sendForgotPasswordEmail = async (user, settings) => {
  await strapi.plugins['email'].services.email.send({
    to: user.email,
    from: settings.from.email || settings.from.name
      ? `${settings.from.name} <${settings.from.email}>`
      : undefined,
    replyTo: settings.response_email,
    subject: settings.object,
    text: settings.message,
    html: settings.message,
  });
};

// Helper: Validate email confirmation token
const validateConfirmationToken = (token) => {
  return !_.isEmpty(token);
};

// Helper: Validate send email confirmation parameters
const validateSendEmailConfirmationParams = (email) => {
  if (!email) {
    return { valid: false, error: 'missing.email' };
  }

  if (!validateEmailFormat(email)) {
    return { valid: false, error: 'wrong.email' };
  }

  return { valid: true, email: email.toLowerCase() };
};

// Helper: Validate user for email confirmation
const validateUserForEmailConfirmation = (user) => {
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
    const store = await getPluginStore();

    if (provider === 'local') {
      const isEnabled = await validateLocalProviderEnabled(store);
      if (!isEnabled) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      return handleLocalAuth(ctx, store, params);
    }

    return handleProviderAuth(ctx, store, provider);
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

    const user = await strapi.query('user', 'users-permissions').findOne({
      resetPasswordToken: `${params.code}`,
    });

    if (!user) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.code.provide',
          message: 'Incorrect code provided.',
        })
      );
    }

    await updateUserPassword(user.id, params.password);
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
    grantConfig[provider].redirect_uri = strapi.plugins['users-permissions'].services.providers.buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    const emailValidation = validateAndNormalizeEmail(email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    email = emailValidation.email;
    const pluginStore = await getPluginStore();

    const user = await strapi.query('user', 'users-permissions').findOne({ email });

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
    const settings = await prepareForgotPasswordEmail(user, resetPasswordToken, pluginStore);

    try {
      await sendForgotPasswordEmail(user, settings);
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
    const pluginStore = await getPluginStore();
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

    const existingUserCheck = await checkExistingUser(params.email, params.provider, settings);
    if (existingUserCheck.exists) {
      return ctx.badRequest(null, existingUserCheck.error);
    }

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    try {
      const result = await createUserWithConfirmation(params, settings);

      if (result.requiresConfirmation) {
        return ctx.send({ user: result.user });
      }

      return ctx.send({
        jwt: result.jwt,
        user: result.user,
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
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;
    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

    if (!validateConfirmationToken(confirmationToken)) {
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

    const validation = validateSendEmailConfirmationParams(params.email);
    if (!validation.valid) {
      return ctx.badRequest(validation.error);
    }

    params.email = validation.email;

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    const userValidation = validateUserForEmailConfirmation(user);
    if (!userValidation.valid) {
      return ctx.badRequest(userValidation.error);
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
```