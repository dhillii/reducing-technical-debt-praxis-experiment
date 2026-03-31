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

const getUserQuery = () => strapi.query('user', 'users-permissions');

const getUserModel = () => getUserQuery().model;

const sanitizeUser = (user) =>
  sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: getUserModel(),
  });

const issueJwt = (userId) =>
  strapi.plugins['users-permissions'].services.jwt.issue({ id: userId });

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: issueJwt(user.id),
    user: sanitizeUser(user),
  });
};

const isValidEmail = (email) => EMAIL_REGEXP.test(email);

const normalizeEmail = (email) => email.toLowerCase();

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

const validateRegisterInput = (params) => {
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

  return { valid: true };
};

// ============================================================================
// USER VALIDATION HELPERS
// ============================================================================

const checkUserExists = async (query) => {
  return getUserQuery().findOne(query);
};

const checkUserConfirmed = async (user, store) => {
  const advanced = _.get(await store.get({ key: 'advanced' }), 'email_confirmation');
  if (advanced && user.confirmed !== true) {
    return {
      error: formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      }),
    };
  }
  return { valid: true };
};

const checkUserBlocked = (user) => {
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

const checkUserPassword = (user) => {
  if (!user.password) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }
  return { valid: true };
};

// ============================================================================
// LOCAL AUTH HANDLER
// ============================================================================

const handleLocalAuth = async (ctx, params, store) => {
  const validation = validateLocalAuthInput(params);
  if (validation.error) {
    return ctx.badRequest(null, validation.error);
  }

  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const query = { provider: 'local' };
  const isEmail = isValidEmail(params.identifier);

  if (isEmail) {
    query.email = normalizeEmail(params.identifier);
  } else {
    query.username = params.identifier;
  }

  const user = await checkUserExists(query);

  if (!user) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  const confirmedCheck = await checkUserConfirmed(user, store);
  if (confirmedCheck.error) {
    return ctx.badRequest(null, confirmedCheck.error);
  }

  const blockedCheck = checkUserBlocked(user);
  if (blockedCheck.error) {
    return ctx.badRequest(null, blockedCheck.error);
  }

  const passwordCheck = checkUserPassword(user);
  if (passwordCheck.error) {
    return ctx.badRequest(null, passwordCheck.error);
  }

  const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(
    params.password,
    user.password
  );

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

// ============================================================================
// OAUTH HANDLER
// ============================================================================

const handleOAuthAuth = async (ctx, provider, store) => {
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

  sendAuthResponse(ctx, user);
};

// ============================================================================
// REGISTRATION HELPERS
// ============================================================================

const validatePasswordFormat = (password) => {
  if (strapi.plugins['users-permissions'].services.user.isHashed(password)) {
    return {
      error: formatError({
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      }),
    };
  }
  return { valid: true };
};

const getDefaultRole = async (defaultRoleType) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRoleType }, []);

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

const checkEmailAvailability = async (email, provider, uniqueEmail) => {
  const existingUser = await checkUserExists({ email });

  if (existingUser && existingUser.provider === provider) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (existingUser && existingUser.provider !== provider && uniqueEmail) {
    return {
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  return { valid: true };
};

const createNewUser = async (params) => {
  try {
    return await getUserQuery().create(params);
  } catch (err) {
    const adminError = _.includes(err.message, 'username')
      ? {
          id: 'Auth.form.error.username.taken',
          message: 'Username already taken',
        }
      : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

    return { error: formatError(adminError) };
  }
};

// ============================================================================
// FORGOT PASSWORD HELPERS
// ============================================================================

const validateForgotPasswordEmail = (email) => {
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

const checkForgotPasswordUser = async (email) => {
  const user = await checkUserExists({ email: normalizeEmail(email) });

  if (!user) {
    return {
      error: formatError({
        id: 'Auth.form.error.user.not-exist',
        message: 'This email does not exist.',
      }),
    };
  }

  if (user.blocked) {
    return {
      error: formatError({
        id: 'Auth.form.error.user.blocked',
        message: 'This user is disabled.',
      }),
    };
  }

  return { user };
};

const sendResetPasswordEmail = async (user, resetPasswordToken, settings, pluginStore) => {
  const advanced = await pluginStore.get({ key: 'advanced' });
  const userInfo = sanitizeUser(user);

  const emailSettings = {
    ...settings,
    message: await strapi.plugins['users-permissions'].services.userspermissions.template(
      settings.message,
      {
        URL: advanced.email_reset_password,
        USER: userInfo,
        TOKEN: resetPasswordToken,
      }
    ),
    object: await strapi.plugins['users-permissions'].services.userspermissions.template(
      settings.object,
      {
        USER: userInfo,
      }
    ),
  };

  try {
    await strapi.plugins['email'].services.email.send({
      to: user.email,
      from:
        emailSettings.from.email || emailSettings.from.name
          ? `${emailSettings.from.name} <${emailSettings.from.email}>`
          : undefined,
      replyTo: emailSettings.response_email,
      subject: emailSettings.object,
      text: emailSettings.message,
      html: emailSettings.message,
    });
    return { sent: true };
  } catch (err) {
    return { error: err };
  }
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
      return handleLocalAuth(ctx, params, store);
    } else {
      return handleOAuthAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validation = validateResetPasswordInput(params);
    if (validation.error) {
      return ctx.badRequest(null, validation.error);
    }

    const user = await checkUserExists({ resetPasswordToken: `${params.code}` });

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

    await getUserQuery().update({ id: user.id }, { resetPasswordToken: null, password });

    sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const grantConfig = await getPluginStore().get({ key: 'grant' });

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
    if (emailValidation.error) {
      return ctx.badRequest(null, emailValidation.error);
    }

    email = normalizeEmail(email);

    const pluginStore = await getPluginStore();
    const userCheck = await checkForgotPasswordUser(email);
    if (userCheck.error) {
      return ctx.badRequest(null, userCheck.error);
    }

    const user = userCheck.user;
    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    const settings = await pluginStore.get({ key: 'email' }).then((storeEmail) => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

    const emailResult = await sendResetPasswordEmail(user, resetPasswordToken, settings, pluginStore);
    if (emailResult.error) {
      return ctx.badRequest(null, emailResult.error);
    }

    await getUserQuery().update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await getPluginStore();
    const settings =