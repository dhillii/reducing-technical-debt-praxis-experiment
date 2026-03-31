```javascript
'use strict';

const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const EMAIL_REGEXP = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

// ============================================================================
// UTILITIES
// ============================================================================

const formatError = (error) => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

const getPluginStore = () =>
  strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

const getUserService = () => strapi.plugins['users-permissions'].services.user;
const getJwtService = () => strapi.plugins['users-permissions'].services.jwt;
const getProvidersService = () => strapi.plugins['users-permissions'].services.providers;
const getUsersPermissionsService = () =>
  strapi.plugins['users-permissions'].services.userspermissions;

const sanitizeUser = (user) =>
  sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });

const isValidEmail = (email) => EMAIL_REGEXP.test(email);

const normalizeEmail = (email) => email.toLowerCase();

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: getJwtService().issue({ id: user.id }),
    user: sanitizeUser(user),
  });
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const validateLocalAuthInput = (params) => {
  if (!params.identifier) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      }),
    };
  }

  if (!params.password) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }

  return { valid: true };
};

const validateResetPasswordInput = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return {
      error: formatError({
        id: 'Auth.form.error.params.provide',
        message: 'Incorrect params provided.',
      }),
    };
  }

  if (params.password !== params.passwordConfirmation) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.matching',
        message: 'Passwords do not match.',
      }),
    };
  }

  return { valid: true };
};

const validateEmailInput = (email) => {
  if (!isValidEmail(email)) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      }),
    };
  }

  return { valid: true };
};

const validateRegistrationInput = (params) => {
  if (!params.password) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }

  if (!params.email) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      }),
    };
  }

  if (!isValidEmail(params.email)) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      }),
    };
  }

  if (getUserService().isHashed(params.password)) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      }),
    };
  }

  return { valid: true };
};

// ============================================================================
// USER LOOKUP HELPERS
// ============================================================================

const findUserByIdentifier = async (identifier, provider) => {
  const query = { provider };

  if (isValidEmail(identifier)) {
    query.email = normalizeEmail(identifier);
  } else {
    query.username = identifier;
  }

  return strapi.query('user', 'users-permissions').findOne(query);
};

const findUserByEmail = async (email) =>
  strapi.query('user', 'users-permissions').findOne({ email: normalizeEmail(email) });

const findUserByResetToken = async (token) =>
  strapi.query('user', 'users-permissions').findOne({ resetPasswordToken: `${token}` });

const findUserByConfirmationToken = async (token) =>
  getUserService().fetch({ confirmationToken: token }, []);

// ============================================================================
// USER VALIDATION HELPERS
// ============================================================================

const validateUserStatus = async (user, store) => {
  const advanced = await store.get({ key: 'advanced' });

  if (advanced.email_confirmation && user.confirmed !== true) {
    return {
      error: formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      }),
    };
  }

  if (user.blocked === true) {
    return {
      error: formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      }),
    };
  }

  return { valid: true };
};

const validateUserPassword = async (user, password) => {
  if (!user.password) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }

  const isValid = await getUserService().validatePassword(password, user.password);

  if (!isValid) {
    return {
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  return { valid: true };
};

// ============================================================================
// LOCAL AUTH HANDLER
// ============================================================================

const handleLocalAuth = async (ctx, params, store) => {
  const grantSettings = await store.get({ key: 'grant' });

  if (!_.get(grantSettings, 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const validation = validateLocalAuthInput(params);
  if (validation.error) {
    return ctx.badRequest(null, validation.error);
  }

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

  const statusValidation = await validateUserStatus(user, store);
  if (statusValidation.error) {
    return ctx.badRequest(null, statusValidation.error);
  }

  const passwordValidation = await validateUserPassword(user, params.password);
  if (passwordValidation.error) {
    return ctx.badRequest(null, passwordValidation.error);
  }

  sendAuthResponse(ctx, user);
};

// ============================================================================
// OAUTH HANDLER
// ============================================================================

const handleOAuthAuth = async (ctx, provider, store) => {
  const grantSettings = await store.get({ key: 'grant' });

  if (!_.get(grantSettings, [provider, 'enabled'])) {
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
    [user, error] = await getProvidersService().connect(provider, ctx.query);
  } catch ([user, error]) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  sendAuthResponse(ctx, user);
};

// ============================================================================
// EMAIL HELPERS
// ============================================================================

const buildResetPasswordEmail = async (user, token, settings, pluginStore) => {
  const advanced = await pluginStore.get({ key: 'advanced' });
  const userInfo = sanitizeUser(user);

  const message = await getUsersPermissionsService().template(settings.message, {
    URL: advanced.email_reset_password,
    USER: userInfo,
    TOKEN: token,
  });

  const subject = await getUsersPermissionsService().template(settings.object, {
    USER: userInfo,
  });

  return { message, subject };
};

const sendResetPasswordEmail = async (user, token, settings, pluginStore) => {
  const { message, subject } = await buildResetPasswordEmail(user, token, settings, pluginStore);

  await strapi.plugins['email'].services.email.send({
    to: user.email,
    from:
      settings.from.email || settings.from.name
        ? `${settings.from.name} <${settings.from.email}>`
        : undefined,
    replyTo: settings.response_email,
    subject,
    text: message,
    html: message,
  });
};

// ============================================================================
// REGISTRATION HELPERS
// ============================================================================

const checkEmailAvailability = async (email, provider, uniqueEmailRequired) => {
  const existingUser = await findUserByEmail(email);

  if (existingUser && existingUser.provider === provider) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (existingUser && existingUser.provider !== provider && uniqueEmailRequired) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  return { available: true };
};

const getDefaultRole = async (roleType) => {
  const role = await strapi.query('role', 'users-permissions').findOne({ type: roleType }, []);

  if (!role) {
    return {
      error: formatError({
        id: 'Auth.form.error.role.notFound',
        message: 'Impossible to find the default role.',
      }),
    };
  }

  return { role };
};

// ============================================================================
// MAIN CONTROLLER
// ============================================================================

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore();

    if (provider === 'local') {
      await handleLocalAuth(ctx, params, store);
    } else {
      await handleOAuthAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validation = validateResetPasswordInput(params);
    if (validation.error) {
      return ctx.badRequest(null, validation.error);
    }

    const user = await findUserByResetToken(params.code);

    if (!user) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.code.provide',
          message: 'Incorrect code provided.',
        })
      );
    }

    const hashedPassword = await getUserService().hashPassword({
      password: params.password,
    });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password: hashedPassword });

    sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const store = await getPluginStore();
    const grantConfig = await store.get({ key: 'grant' });

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
    grantConfig[provider].redirect_uri = getProvidersService().buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    const emailValidation = validateEmailInput(email);
    if (emailValidation.error) {
      return ctx.badRequest(null, emailValidation.error);
    }

    email = normalizeEmail(email);
    const pluginStore = await getPluginStore();
    const user = await findUserByEmail(email);

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

    const emailSettings = await pluginStore
      .get({ key: 'email' })
      .then((storeEmail) => {
        try {
          return storeEmail['reset_password'].options;
        } catch (error) {
          return {};
        }
      });

    try {
      await sendResetPasswordEmail(user, resetPasswordToken, emailSettings, pluginStore);
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken });

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

    const inputValidation = validateRegistrationInput(params);
    if (inputValidation.error) {
      return ctx.badRequest(null, inputValidation.error);
    }

    const roleResult =