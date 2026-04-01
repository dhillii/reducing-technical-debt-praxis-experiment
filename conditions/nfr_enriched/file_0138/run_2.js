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

// Helper: Build user query for local auth
const buildLocalAuthQuery = (identifier) => {
  const query = { provider: 'local' };
  if (validateEmailFormat(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

// Helper: Validate local auth parameters
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
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate user password
const validateUserPassword = async (inputPassword, userPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    inputPassword,
    userPassword
  );
};

// Helper: Handle local authentication
const handleLocalAuth = async (ctx, params, store) => {
  const paramValidation = validateLocalAuthParams(params);
  if (!paramValidation.valid) {
    return ctx.badRequest(null, paramValidation.error);
  }

  const grant = await store.get({ key: 'grant' });
  if (!_.get(grant, 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const query = buildLocalAuthQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const statusCheck = await checkUserAccountStatus(user, store);
  if (!statusCheck.valid) {
    return ctx.badRequest(null, statusCheck.error);
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

  sendUserWithJwt(ctx, user);
};

// Helper: Handle third-party provider authentication
const handleProviderAuth = async (ctx, provider, store) => {
  const grant = await store.get({ key: 'grant' });
  if (!_.get(grant, [provider, 'enabled'])) {
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

  sendUserWithJwt(ctx, user);
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

// Helper: Hash and update user password
const updateUserPassword = async (userId, newPassword) => {
  const hashedPassword = await strapi.plugins['users-permissions'].services.user.hashPassword({
    password: newPassword,
  });

  await strapi
    .query('user', 'users-permissions')
    .update({ id: userId }, { resetPasswordToken: null, password: hashedPassword });
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

// Helper: Check email availability
const checkEmailAvailability = async (email, provider, settings) => {
  const existingUser = await strapi.query('user', 'users-permissions').findOne({
    email: email,
  });

  if (existingUser && existingUser.provider === provider) {
    return {
      available: false,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (existingUser && existingUser.provider !== provider && settings.unique_email) {
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

// Helper: Get default role
const getDefaultRole = async (defaultRoleType) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRoleType }, []);
};

// Helper: Create and send confirmation email
const createUserWithConfirmation = async (params, settings) => {
  if (!settings.email_confirmation) {
    params.confirmed = true;
  }

  const user = await strapi.query('user', 'users-permissions').create(params);
  const sanitizedUser = sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

  if (settings.email_confirmation) {
    await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
  }

  return { user, sanitizedUser };
};

// Helper: Prepare forgot password email
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

  settings.message = await strapi.plugins['users-permissions'].services.userspermissions.template(
    settings.message,
    {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetToken,
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

// Helper: Validate email confirmation token
const validateConfirmationToken = (token) => {
  return !_.isEmpty(token);
};

// Helper: Handle email confirmation response
const handleEmailConfirmationResponse = async (ctx, user, returnUser) => {
  if (returnUser) {
    sendUserWithJwt(ctx, user);
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

  if (!validateEmailFormat(email)) {
    return { valid: false, error: 'wrong.email' };
  }

  return { valid: true, email: email.toLowerCase() };
};

// Helper: Check user confirmation status
const checkUserConfirmationStatus = (user) => {
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

    await updateUserPassword(user.id, params.password);
    sendUserWithJwt(ctx, user);
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
    let { email } = ctx.request.