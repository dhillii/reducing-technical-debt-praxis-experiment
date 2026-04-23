'use strict';

/* eslint-disable no-useless-escape */
const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [{ messages: [{ id: error.id, message: error.message, field: error.field }] }];

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const store = await getStore();

    if (provider === 'local') {
      return await handleLocalCallback(ctx, store);
    }

    return await handleThirdPartyCallback(ctx, provider, store);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (!isValidResetParams(params)) {
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

    const hashed = await strapi.plugins['users-permissions'].services.user.hashPassword({
      password: params.password,
    });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password: hashed });

    return sendJwtAndUser(ctx, user);
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

    const pluginStore = await getStore();

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

    const settings = await getEmailSettings(pluginStore);
    const advanced = await pluginStore.get({ key: 'advanced' });

    const userInfo = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    settings.message = await strapi.plugins['users-permissions'].services.userspermissions.template(
      settings.message,
      { URL: advanced.email_reset_password, USER: userInfo, TOKEN: resetPasswordToken }
    );

    settings.object = await strapi.plugins['users-permissions'].services.userspermissions.template(
      settings.object,
      { USER: userInfo }
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
    const pluginStore = await getStore();
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

    const validationError = validateRegistrationParams(params);
    if (validationError) {
      return ctx.badRequest(null, formatError(validationError));
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

    if (!isValidEmail(params.email)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (existingUser && (existingUser.provider === params.provider || settings.unique_email)) {
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
      return ctx.send({ jwt, user: sanitizedUser });
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? { id: 'Auth.form.error.username.taken', message: 'Username already taken' }
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
      return ctx.send({
        jwt: jwtService.issue({ id: user.id }),
        user: sanitizeEntity(user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
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

    if (!isValidEmail(params.email)) {
      return ctx.badRequest('wrong.email');
    }

    const email = params.email.toLowerCase();

    const user = await strapi.query('user', 'users-permissions').findOne({ email });

    if (user.confirmed) {
      return ctx.badRequest('already.confirmed');
    }

    if (user.blocked) {
      return ctx.badRequest('blocked.user');
    }

    try {
      await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
      ctx.send({ email: user.email, sent: true });
    } catch (err) {
      return ctx.badRequest(null, err);
    }
  },
};

/* Helper Functions */

/**
 * Retrieves the plugin store.
 */
async function getStore() {
  return await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
}

/**
 * Handles local provider authentication.
 */
async function handleLocalCallback(ctx, store) {
  const params = ctx.request.body;

  if (!isLocalProviderEnabled(store)) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const missingFieldError = getMissingFieldError(params);
  if (missingFieldError) {
    return ctx.badRequest(null, formatError(missingFieldError));
  }

  const query = buildUserQuery(params.identifier);
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

  const statusError = await checkUserStatus(user, store);
  if (statusError) {
    return ctx.badRequest(null, formatError(statusError));
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

  return sendJwtAndUser(ctx, user);
}

/**
 * Handles third‑party provider authentication.
 */
async function handleThirdPartyCallback(ctx, provider, store) {
  if (!isProviderEnabled(store, provider)) {
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
  } catch (e) {
    return ctx.badRequest(null, e);
  }

  if (!user) {
    return ctx.badRequest(null, error);
  }

  return sendJwtAndUser(ctx, user);
}

/**
 * Sends JWT and sanitized user data.
 */
function sendJwtAndUser(ctx, user) {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
}

/**
 * Checks if local provider is enabled.
 */
function isLocalProviderEnabled(store) {
  const grant = store.get ? store.get({ key: 'grant' }) : null;
  return _.get(grant, 'email.enabled');
}

/**
 * Checks if a specific provider is enabled.
 */
function isProviderEnabled(store, provider) {
  const grant = store.get ? store.get({ key: 'grant' }) : null;
  return _.get(grant, [provider, 'enabled']);
}

/**
 * Returns missing field error if identifier or password is absent.
 */
function getMissingFieldError(params) {
  if (!params.identifier) {
    return {
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    };
  }
  if (!params.password) {
    return {
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    };
  }
  return null;
}

/**
 * Builds a query object based on identifier type.
 */
function buildUserQuery(identifier) {
  const query = { provider: 'local' };
  if (emailRegExp.test(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
}

/**
 * Checks user status (confirmation, blocked, password set).
 */
async function checkUserStatus(user, store) {
  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return {
      id: 'Auth.form.error.confirmed',
      message: 'Your account email is not confirmed',
    };
  }
  if (user.blocked === true) {
    return {
      id: 'Auth.form.error.blocked',
      message: 'Your account has been blocked by an administrator',
    };
  }
  if (!user.password) {
    return {
      id: 'Auth.form.error.password.local',
      message:
        'This user never set a local password, please login with the provider used during account creation.',
    };
  }
  return null;
}

/**
 * Validates reset password parameters.
 */
function isValidResetParams(params) {
  return (
    params.password &&
    params.passwordConfirmation &&
    params.password === params.passwordConfirmation &&
    params.code
  );
}

/**
 * Validates email format.
 */
function isValidEmail(email) {
  return emailRegExp.test(email);
}

/**
 * Retrieves email settings safely.
 */
async function getEmailSettings(pluginStore) {
  const storeEmail = await pluginStore.get({ key: 'email' });
  try {
    return storeEmail['reset_password'].options;
  } catch (e) {
    return {};
  }
}

/**
 * Validates registration parameters.
 */
function validateRegistrationParams(params) {
  if (!params.password) {
    return {
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    };
  }
  if (!params.email) {
    return {
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your email.',
    };
  }
  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    return {
      id: 'Auth.form.error.password.format',
      message: 'Your password cannot contain more than three times the symbol `$`.',
    };
  }
  return null;
}