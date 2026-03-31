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

const validateUserStatus = (user, store) => {
  if (!user) {
    return {
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  const emailConfirmationRequired =
    _.get(store, 'advanced.email_confirmation') && user.confirmed !== true;
  if (emailConfirmationRequired) {
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
  if (!_.get(store, 'grant.email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const validation = validateLocalAuthInput(params);
  if (validation.error) {
    return ctx.badRequest(null, validation.error);
  }

  const user = await findUserByIdentifier(params.identifier, 'local');
  const userValidation = validateUserStatus(user, store);
  if (userValidation.error) {
    return ctx.badRequest(null, userValidation.error);
  }

  const validPassword = await getUserService().validatePassword(params.password, user.password);

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
  if (!_.get(store, [provider, 'enabled'])) {
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
// EXPORTS
// ============================================================================

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore().get({ key: 'grant' });

    if (provider === 'local') {
      return handleLocalAuth(ctx, params, store);
    }

    return handleOAuthAuth(ctx, provider, store);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);
    const validation = validateResetPasswordInput(params);

    if (validation.error) {
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

    const password = await getUserService().hashPassword({ password: params.password });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password });

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

    grantConfig[provider].callback =
      _.get(ctx, 'query.callback') || grantConfig[provider].callback;
    grantConfig[provider].redirect_uri = getProvidersService().buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    if (!isValidEmail(email)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }

    email = normalizeEmail(email);
    const pluginStore = getPluginStore();
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

    const settings = await pluginStore
      .get({ key: 'email' })
      .then((storeEmail) => {
        try {
          return storeEmail['reset_password'].options;
        } catch (error) {
          return {};
        }
      });

    const advanced = await pluginStore.get({ key: 'advanced' });
    const userInfo = sanitizeUser(user);

    settings.message = await getUsersPermissionsService().template(settings.message, {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetPasswordToken,
    });

    settings.object = await getUsersPermissionsService().template(settings.object, {
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

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = getPluginStore();
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

    const validation = validateRegisterInput(params);
    if (validation.error) {
      return ctx.badRequest(null, validation.error);
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

    params.email = normalizeEmail(params.email);
    params.role = role.id;
    params.password = await getUserService().hashPassword(params);

    const existingUser = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: params.email });

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
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;
    const userService = getUserService();
    const jwtService = getJwtService();

    if (_.isEmpty(confirmationToken)) {
      return ctx.badRequest('token.invalid');
    }

    const user = await userService.fetch({ confirmationToken