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

/**
 * Checks if email confirmation is required and user is not confirmed
 */
const isEmailConfirmationRequired = async (store, user) => {
  const advanced = await store.get({ key: 'advanced' });
  return _.get(advanced, 'email_confirmation') && user.confirmed !== true;
};

/**
 * Checks if user account is blocked
 */
const isUserBlocked = (user) => user.blocked === true;

/**
 * Checks if user has no local password set
 */
const hasNoLocalPassword = (user) => !user.password;

/**
 * Validates local provider is enabled
 */
const isLocalProviderEnabled = async (store) => {
  const grant = await store.get({ key: 'grant' });
  return _.get(grant, 'email.enabled');
};

/**
 * Validates third-party provider is enabled
 */
const isProviderEnabled = async (store, provider) => {
  const grant = await store.get({ key: 'grant' });
  return _.get(grant, [provider, 'enabled']);
};

/**
 * Determines if identifier is an email address
 */
const isEmailIdentifier = (identifier) => emailRegExp.test(identifier);

/**
 * Builds query object for user lookup based on identifier type
 */
const buildUserQuery = (identifier, provider) => {
  const query = { provider };
  if (isEmailIdentifier(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

/**
 * Sanitizes user entity for response
 */
const sanitizeUser = (user) => sanitizeEntity(user.toJSON ? user.toJSON() : user, {
  model: strapi.query('user', 'users-permissions').model,
});

/**
 * Sends successful authentication response
 */
const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeUser(user),
  });
};

/**
 * Validates local authentication credentials
 */
const validateLocalAuth = async (ctx, store, params) => {
  if (!params.identifier) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      })
    );
  }

  if (!params.password) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      })
    );
  }

  return null;
};

/**
 * Handles local provider authentication flow
 */
const handleLocalAuth = async (ctx, store, params) => {
  const validationError = await validateLocalAuth(ctx, store, params);
  if (validationError) return validationError;

  const query = buildUserQuery(params.identifier, 'local');
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  if (!user) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  if (await isEmailConfirmationRequired(store, user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      })
    );
  }

  if (isUserBlocked(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      })
    );
  }

  if (hasNoLocalPassword(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      })
    );
  }

  const validPassword = await strapi.plugins[
    'users-permissions'
  ].services.user.validatePassword(params.password, user.password);

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

/**
 * Handles third-party provider authentication flow
 */
const handleProviderAuth = async (ctx, store, provider) => {
  if (!await isProviderEnabled(store, provider)) {
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

/**
 * Validates reset password parameters
 */
const isValidResetPasswordRequest = (params) => {
  return params.password && params.passwordConfirmation && params.code;
};

/**
 * Checks if passwords match
 */
const doPasswordsMatch = (password, confirmation) => password === confirmation;

/**
 * Handles password reset validation errors
 */
const handleResetPasswordError = (ctx, params) => {
  if (!doPasswordsMatch(params.password, params.passwordConfirmation)) {
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
};

/**
 * Validates email format
 */
const isValidEmail = (email) => emailRegExp.test(email);

/**
 * Checks if registration is allowed
 */
const isRegistrationAllowed = async (pluginStore) => {
  const settings = await pluginStore.get({ key: 'advanced' });
  return settings.allow_register;
};

/**
 * Validates required registration fields
 */
const validateRegistrationFields = (ctx, params) => {
  if (!params.password) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      })
    );
  }

  if (!params.email) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      })
    );
  }

  return null;
};

/**
 * Checks if password has invalid format
 */
const hasInvalidPasswordFormat = (password) => {
  return strapi.plugins['users-permissions'].services.user.isHashed(password);
};

/**
 * Validates email format for registration
 */
const validateRegistrationEmail = (ctx, email) => {
  if (!isValidEmail(email)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      })
    );
  }
  return null;
};

/**
 * Checks if email is already taken
 */
const isEmailTaken = (user, provider, settings) => {
  if (!user) return false;
  if (user.provider === provider) return true;
  return settings.unique_email;
};

/**
 * Handles user creation and response
 */
const handleUserCreation = async (ctx, params, settings) => {
  try {
    if (!settings.email_confirmation) {
      params.confirmed = true;
    }

    const user = await strapi.query('user', 'users-permissions').create(params);
    const sanitizedUser = sanitizeUser(user);

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

    ctx.badRequest(null, formatError(adminError));
  }
};

/**
 * Checks if confirmation token is empty
 */
const isEmptyToken = (token) => _.isEmpty(token);

/**
 * Checks if email is already confirmed
 */
const isAlreadyConfirmed = (user) => user.confirmed;

/**
 * Checks if user is blocked
 */
const isUserBlockedStatus = (user) => user.blocked;

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
      if (!await isLocalProviderEnabled(store)) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      return handleLocalAuth(ctx, store, params);
    }

    return handleProviderAuth(ctx, store, provider);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (!isValidResetPasswordRequest(params)) {
      return handleResetPasswordError(ctx, params);
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
      user: sanitizeUser(user),
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

    if (!isValidEmail(email)) {
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

    const settings = await pluginStore.get({ key: 'email' }).then(storeEmail => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

    const advanced = await pluginStore.get({
      key: 'advanced',
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
  },

  async register(ctx) {
    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    if (!await isRegistrationAllowed(pluginStore)) {
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

    const fieldError = validateRegistrationFields(ctx, params);
    if (fieldError) return fieldError;

    if (hasInvalidPasswordFormat(params.password)) {
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
      .findOne({ type: (await pluginStore.get({ key: 'advanced' })).default_role }, []);

    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
    }

    const emailError = validateRegistrationEmail(ctx, params.email);
    if (emailError) return emailError;

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    const settings = await pluginStore.get({ key: 'advanced' });

    if (isEmailTaken(user, params.provider, settings)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    return handleUserCreation(ctx, params, settings);
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

    if (isEmptyToken(confirmationToken)) {
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
        user: sanitizeUser(user),
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

    if (!isValidEmail(params.email)) {
      return ctx.badRequest('wrong.email');
    }

    params.email = params.email.toLowerCase();

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (isAlreadyConfirmed(user)) {
      return ctx.badRequest('already.confirmed');
    }

    if (isUserBlockedStatus(user)) {
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