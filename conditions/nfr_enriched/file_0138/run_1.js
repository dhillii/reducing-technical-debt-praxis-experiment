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

// Helper: Sanitize and return user with JWT
const sendUserWithJwt = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
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
const buildLocalAuthQuery = (identifier) => {
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
const validateUserAccountStatus = async (user, store) => {
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

// Helper: Validate password for local authentication
const validateLocalPassword = async (inputPassword, userPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    inputPassword,
    userPassword
  );
};

// Helper: Handle local authentication flow
const handleLocalAuth = async (ctx, params, store) => {
  const isEnabled = await validateLocalProviderEnabled(store);
  if (!isEnabled) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const paramValidation = validateLocalAuthParams(params);
  if (!paramValidation.valid) {
    return ctx.badRequest(null, paramValidation.error);
  }

  const query = buildLocalAuthQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const accountValidation = await validateUserAccountStatus(user, store);
  if (!accountValidation.valid) {
    return ctx.badRequest(null, accountValidation.error);
  }

  const isValidPassword = await validateLocalPassword(params.password, user.password);
  if (!isValidPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  return sendUserWithJwt(ctx, user);
};

// Helper: Handle third-party provider authentication
const handleProviderAuth = async (ctx, provider, store) => {
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

  return sendUserWithJwt(ctx, user);
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

// Helper: Process password reset
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

  return sendUserWithJwt(ctx, user);
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

// Helper: Validate email format and return normalized email
const normalizeAndValidateEmail = (email) => {
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

// Helper: Get default role for registration
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

// Helper: Create user and handle confirmation
const createUserAndHandleConfirmation = async (ctx, params, settings) => {
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

    return ctx.badRequest(null, formatError(adminError));
  }
};

// Helper: Prepare forgot password email settings
const prepareForgotPasswordEmailSettings = async (pluginStore, user, resetPasswordToken) => {
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

  return settings;
};

// Helper: Send forgot password email
const sendForgotPasswordEmail = async (user, settings) => {
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

// Helper: Validate forgot password email
const validateForgotPasswordEmail = (email) => {
  if (!validateEmailFormat(email)) {
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

// Helper: Validate user exists and is not blocked
const validateUserForForgotPassword = async (email) => {
  const user = await strapi
    .query('user', 'users-permissions')
    .findOne({ email: email.toLowerCase() });

  if (!user) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.user.not-exist',
        message: 'This email does not exist.',
      }),
    };
  }

  if (user.blocked) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.user.blocked',
        message: 'This user is disabled.',
      }),
    };
  }

  return { valid: true, user };
};

// Helper: Validate email confirmation token
const validateConfirmationToken = (confirmationToken) => {
  if (_.isEmpty(confirmationToken)) {
    return false;
  }
  return true;
};

// Helper: Fetch and confirm user
const fetchAndConfirmUser = async (confirmationToken) => {
  const { user: userService } = strapi.plugins['users-permissions'].services;
  const user = await userService.fetch({ confirmationToken }, []);

  if (!user) {
    return { found: false };
  }

  await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });
  return { found: true, user };
};

// Helper: Handle email confirmation redirect
const handleEmailConfirmationRedirect = async (ctx) => {
  const settings = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    })
    .get();

  ctx.redirect(settings.email_confirmation_redirection || '/');
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
  if (!user) {
    return { valid: false, error: 'user.not.found' };
  }

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
      return handleLocalAuth(ctx, params, store);
    } else {
      return handleProviderAuth(ctx, provider, store);
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

    const emailValidation = validateForgotPasswordEmail(email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    email = emailValidation.email;
    const pluginStore = await getPluginStore();

    const userValidation = await validateUserForForgotPassword(email);
    if (!userValidation.valid) {
      return ctx.badRequest(null, userValidation.error);
    }

    const user = userValidation.user;
    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    const settings = await prepareForgotPasswordEmailSettings(
      pluginStore,
      user,
      resetPasswordToken
    );

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

    const roleResult = await getDefaultRole(settings.default_role);
    if (!roleResult.found) {
      return ctx.badRequest(null, roleResult.error);
    }

    const emailValidation = normalizeAndValidateEmail(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    params.email = emailValidation.email;
    params.role = roleResult.role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUserCheck = await checkExistingUser(params.email, params.provider, settings);
    if (existingUserCheck.exists) {
      return ctx.badRequest(null, existingUserCheck.error);
    }

    return createUserAndHandleConfirmation(ctx, params, settings);
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    if (!validateConfirmationToken(confirmationToken)) {
      return ctx.badRequest('token.invalid');
    }

    const userResult = await fetchAndConfirmUser(confirmationToken);
    if (!userResult.found) {
      return ctx.badRequest('token.invalid');
    }

    const { user } = userResult;
    const { jwt: jwtService } = strapi.plugins['users-permissions'].services;

    if (returnUser) {
      ctx.send({
        jwt: jwtService.issue({ id: user.id }),
        user: sanitizeEntity(user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    } else {
      return handleEmailConfirmationRedirect(ctx);
    }
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    const paramValidation = validateSendEmailConfirmationParams(params.email);
    if (!paramValidation.valid) {
      return ctx.badRequest(paramValidation.error);
    }

    params.email = paramValidation.email;

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