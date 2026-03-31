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

const createError = (id, message, field) => ({
  messages: [{ id, message, field }],
});

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

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: getJwtService().issue({ id: user.id }),
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
    return createError(
      'Auth.form.error.email.provide',
      'Please provide your username or your e-mail.'
    );
  }
  if (!params.password) {
    return createError(
      'Auth.form.error.password.provide',
      'Please provide your password.'
    );
  }
  return null;
};

const validateResetPasswordInput = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return createError(
      'Auth.form.error.params.provide',
      'Incorrect params provided.'
    );
  }
  if (params.password !== params.passwordConfirmation) {
    return createError(
      'Auth.form.error.password.matching',
      'Passwords do not match.'
    );
  }
  return null;
};

const validateRegisterInput = (params) => {
  if (!params.password) {
    return createError(
      'Auth.form.error.password.provide',
      'Please provide your password.'
    );
  }
  if (!params.email) {
    return createError(
      'Auth.form.error.email.provide',
      'Please provide your email.'
    );
  }
  if (!isValidEmail(params.email)) {
    return createError(
      'Auth.form.error.email.format',
      'Please provide valid email address.'
    );
  }
  return null;
};

// ============================================================================
// USER LOOKUP HELPERS
// ============================================================================

const findUserByIdentifier = async (identifier, provider = 'local') => {
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
  strapi.query('user', 'users-permissions').findOne({ resetPasswordToken: token });

// ============================================================================
// USER STATE VALIDATION
// ============================================================================

const validateUserState = async (user, store) => {
  if (!user) {
    return createError(
      'Auth.form.error.invalid',
      'Identifier or password invalid.'
    );
  }

  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return createError(
      'Auth.form.error.confirmed',
      'Your account email is not confirmed'
    );
  }

  if (user.blocked === true) {
    return createError(
      'Auth.form.error.blocked',
      'Your account has been blocked by an administrator'
    );
  }

  return null;
};

const validateUserPassword = async (user) => {
  if (!user.password) {
    return createError(
      'Auth.form.error.password.local',
      'This user never set a local password, please login with the provider used during account creation.'
    );
  }
  return null;
};

// ============================================================================
// LOCAL AUTH
// ============================================================================

const handleLocalAuth = async (ctx, params, store) => {
  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return ctx.badRequest(null, [createError('provider.disabled', 'This provider is disabled.')]);
  }

  const inputError = validateLocalAuthInput(params);
  if (inputError) {
    return ctx.badRequest(null, [inputError]);
  }

  const user = await findUserByIdentifier(params.identifier);
  const stateError = await validateUserState(user, store);
  if (stateError) {
    return ctx.badRequest(null, [stateError]);
  }

  const passwordError = await validateUserPassword(user);
  if (passwordError) {
    return ctx.badRequest(null, [passwordError]);
  }

  const validPassword = await getUserService().validatePassword(
    params.password,
    user.password
  );

  if (!validPassword) {
    return ctx.badRequest(null, [
      createError('Auth.form.error.invalid', 'Identifier or password invalid.'),
    ]);
  }

  sendAuthResponse(ctx, user);
};

// ============================================================================
// OAUTH AUTH
// ============================================================================

const handleOAuthAuth = async (ctx, provider, store) => {
  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    return ctx.badRequest(null, [
      createError('provider.disabled', 'This provider is disabled.'),
    ]);
  }

  try {
    const [user, error] = await getProvidersService().connect(provider, ctx.query);

    if (!user) {
      const errorMsg = Array.isArray(error) ? error[0] : error;
      return ctx.badRequest(null, errorMsg);
    }

    sendAuthResponse(ctx, user);
  } catch (err) {
    const errorMsg = Array.isArray(err) ? err[0] : err;
    return ctx.badRequest(null, errorMsg);
  }
};

// ============================================================================
// EMAIL HELPERS
// ============================================================================

const sendPasswordResetEmail = async (user, resetPasswordToken, settings, advanced) => {
  const userInfo = sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

  const message = await getUsersPermissionsService().template(settings.message, {
    URL: advanced.email_reset_password,
    USER: userInfo,
    TOKEN: resetPasswordToken,
  });

  const subject = await getUsersPermissionsService().template(settings.object, {
    USER: userInfo,
  });

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
// CONTROLLERS
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

    const inputError = validateResetPasswordInput(params);
    if (inputError) {
      return ctx.badRequest(null, [inputError]);
    }

    const user = await findUserByResetToken(params.code);
    if (!user) {
      return ctx.badRequest(null, [
        createError('Auth.form.error.code.provide', 'Incorrect code provided.'),
      ]);
    }

    const password = await getUserService().hashPassword({ password: params.password });
    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password });

    sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const grantConfig = await getPluginStore().then((store) =>
      store.get({ key: 'grant' })
    );

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

    grantConfig[provider].callback =
      _.get(ctx, 'query.callback') || grantConfig[provider].callback;
    grantConfig[provider].redirect_uri = getProvidersService().buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    if (!isValidEmail(email)) {
      return ctx.badRequest(null, [
        createError(
          'Auth.form.error.email.format',
          'Please provide a valid email address.'
        ),
      ]);
    }

    email = normalizeEmail(email);
    const user = await findUserByEmail(email);

    if (!user) {
      return ctx.badRequest(null, [
        createError('Auth.form.error.user.not-exist', 'This email does not exist.'),
      ]);
    }

    if (user.blocked) {
      return ctx.badRequest(null, [
        createError('Auth.form.error.user.blocked', 'This user is disabled.'),
      ]);
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');
    const pluginStore = await getPluginStore();

    const settings = await pluginStore
      .get({ key: 'email' })
      .then((storeEmail) => {
        try {
          return storeEmail['reset_password'].options;
        } catch {
          return {};
        }
      });

    const advanced = await pluginStore.get({ key: 'advanced' });

    try {
      await sendPasswordResetEmail(user, resetPasswordToken, settings, advanced);
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
      return ctx.badRequest(null, [
        createError(
          'Auth.advanced.allow_register',
          'Register action is currently disabled.'
        ),
      ]);
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    const inputError = validateRegisterInput(params);
    if (inputError) {
      return ctx.badRequest(null, [inputError]);
    }

    if (getUserService().isHashed(params.password)) {
      return ctx.badRequest(null, [
        createError(
          'Auth.form.error.password.format',
          'Your password cannot contain more than three times the symbol `$`.'
        ),
      ]);
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(null, [
        createError(
          'Auth.form.error.role.notFound',
          'Impossible to find the default role.'
        ),
      ]);
    }

    params.email = normalizeEmail(params.email);
    params.role = role.id;
    params.password = await getUserService().hashPassword(params);

    const existingUser = await findUserByEmail(params.email);

    if (existingUser && existingUser.provider === params.provider) {
      return ctx.badRequest(null, [
        createError('Auth.form.error.email.taken', 'Email is already taken.'),
      ]);
    }

    if (existingUser && existingUser.provider !== params.provider && settings.unique_email) {
      return ctx.badRequest(null, [
        createError('Auth.form.error.email.taken', 'Email is already taken.'),
      ]);
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);
      const sanitizedUser = sanitizeUser(user);

      if (settings.email_confirmation) {
        try {
          await getUserService().sendConfirmationEmail(user);
        } catch (err) {
          return ctx.badRequest(null, err);
        }
        return ctx.send({ user: sanitizedUser });
      }

      const jwt = getJwtService().issue(_.pick(user, ['id']));
      return ctx.send({ jwt, user: sanitizedUser });
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? createError('Auth.form.error.username.taken', 'Username already taken')
        : createError('Auth.form.error.email.taken', 'Email already taken');

      ctx.badRequest(null, [adminError]);
    }
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;
    const userService = getUserService();

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
        jwt: getJwtService().issue({ id: user.id }),
        user: sanitizeUser(user),
      });
    } else {