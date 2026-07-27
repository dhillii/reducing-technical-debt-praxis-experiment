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
 * Checks if the local provider is enabled.
 * @param {Object} store - Strapi store instance.
 * @returns {Promise<boolean>}
 */
async function isLocalProviderEnabled(store) {
  const grantConfig = await store.get({ key: 'grant' });
  return _.get(grantConfig, 'email.enabled', false);
}

/**
 * Checks if a third‑party provider is enabled.
 * @param {Object} store - Strapi store instance.
 * @param {string} provider - Provider name.
 * @returns {Promise<boolean>}
 */
async function isProviderEnabled(store, provider) {
  const grantConfig = await store.get({ key: 'grant' });
  return _.get(grantConfig, [provider, 'enabled'], false);
}

/**
 * Validates that required fields exist.
 * @param {Object} ctx - Koa context.
 * @param {Object} params - Request body.
 * @returns {boolean} true if validation passed, otherwise response already sent.
 */
function validateLocalCredentials(ctx, params) {
  if (!params.identifier) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      })
    );
    return false;
  }
  if (!params.password) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      })
    );
    return false;
  }
  return true;
}

/**
 * Builds a query object based on identifier type.
 * @param {string} identifier - User supplied identifier.
 * @returns {Object}
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
 * Checks if email confirmation is required and user is not confirmed.
 * @param {Object} store - Strapi store instance.
 * @param {Object} user - User entity.
 * @returns {Promise<boolean>}
 */
async function isEmailConfirmationPending(store, user) {
  const advanced = await store.get({ key: 'advanced' });
  return _.get(advanced, 'email_confirmation') && user.confirmed !== true;
}

/**
 * Sends JWT and sanitized user payload.
 * @param {Object} ctx - Koa context.
 * @param {Object} user - User entity.
 */
function sendAuthResponse(ctx, user) {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
}

/**
 * Handles local authentication flow.
 * @param {Object} ctx - Koa context.
 * @param {Object} params - Request body.
 * @param {Object} store - Strapi store instance.
 */
async function handleLocalAuth(ctx, params, store) {
  if (!await isLocalProviderEnabled(store)) {
    ctx.badRequest(null, 'This provider is disabled.');
    return;
  }

  if (!validateLocalCredentials(ctx, params)) {
    return;
  }

  const query = buildUserQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  if (!user) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
    return;
  }

  if (await isEmailConfirmationPending(store, user)) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      })
    );
    return;
  }

  if (user.blocked === true) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      })
    );
    return;
  }

  if (!user.password) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      })
    );
    return;
  }

  const validPassword = await strapi.plugins[
    'users-permissions'
  ].services.user.validatePassword(params.password, user.password);

  if (!validPassword) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
    return;
  }

  sendAuthResponse(ctx, user);
}

/**
 * Handles third‑party provider authentication flow.
 * @param {Object} ctx - Koa context.
 * @param {string} provider - Provider name.
 * @param {Object} store - Strapi store instance.
 */
async function handleProviderAuth(ctx, provider, store) {
  if (!await isProviderEnabled(store, provider)) {
    ctx.badRequest(
      null,
      formatError({
        id: 'provider.disabled',
        message: 'This provider is disabled.',
      })
    );
    return;
  }

  let user;
  let error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      ctx.query
    );
  } catch (e) {
    ctx.badRequest(null, e === 'array' ? e[0] : e);
    return;
  }

  if (!user) {
    ctx.badRequest(null, error === 'array' ? error[0] : error);
    return;
  }

  sendAuthResponse(ctx, user);
}

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
      await handleLocalAuth(ctx, params, store);
    } else {
      await handleProviderAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const hasValidPasswordParams =
      params.password &&
      params.passwordConfirmation &&
      params.password === params.passwordConfirmation &&
      params.code;

    if (hasValidPasswordParams) {
      const user = await strapi
        .query('user', 'users-permissions')
        .findOne({ resetPasswordToken: `${params.code}` });

      if (!user) {
        ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.code.provide',
            message: 'Incorrect code provided.',
          })
        );
        return;
      }

      const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
        password: params.password,
      });

      await strapi
        .query('user', 'users-permissions')
        .update({ id: user.id }, { resetPasswordToken: null, password });

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
      return;
    }

    const passwordsMismatch =
      params.password &&
      params.passwordConfirmation &&
      params.password !== params.passwordConfirmation;

    if (passwordsMismatch) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
      return;
    }

    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.params.provide',
        message: 'Incorrect params provided.',
      })
    );
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
      ctx.badRequest(null, 'This provider is disabled.');
      return;
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

    const isValidEmail = emailRegExp.test(email);
    if (!isValidEmail) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
      return;
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
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.user.not-exist',
          message: 'This email does not exist.',
        })
      );
      return;
    }

    if (user.blocked) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.user.blocked',
          message: 'This user is disabled.',
        })
      );
      return;
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

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
      ctx.badRequest(null, err);
      return;
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

    const settings = await pluginStore.get({ key: 'advanced' });

    if (!settings.allow_register) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.advanced.allow_register',
          message: 'Register action is currently disabled.',
        })
      );
      return;
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    if (!params.password) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.provide',
          message: 'Please provide your password.',
        })
      );
      return;
    }

    if (!params.email) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.provide',
          message: 'Please provide your email.',
        })
      );
      return;
    }

    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.format',
          message: 'Your password cannot contain more than three times the symbol `$`.',
        })
      );
      return;
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
      return;
    }

    const isValidEmail = emailRegExp.test(params.email);
    if (!isValidEmail) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
      return;
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (existingUser && existingUser.provider === params.provider) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
      return;
    }

    if (existingUser && existingUser.provider !== params.provider && settings.unique_email) {
      ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
      return;
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
          ctx.badRequest(null, err);
          return;
        }
        ctx.send({ user: sanitizedUser });
        return;
      }

      const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

      ctx.send({
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

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

    if (_.isEmpty(confirmationToken)) {
      ctx.badRequest('token.invalid');
      return;
    }

    const user = await userService.fetch({ confirmationToken }, []);

    if (!user) {
      ctx.badRequest('token.invalid');
      return;
    }

    await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

    if (returnUser) {
      ctx.send({
        jwt: jwtService.issue({ id: user.id }),
        user: sanitizeEntity(user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
      return;
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
      ctx.badRequest('missing.email');
      return;
    }

    const isValidEmail = emailRegExp.test(params.email);
    if (!isValidEmail) {
      ctx.badRequest('wrong.email');
      return;
    }

    const email = params.email.toLowerCase();

    const user = await strapi.query('user', 'users-permissions').findOne({ email });

    if (user.confirmed) {
      ctx.badRequest('already.confirmed');
      return;
    }

    if (user.blocked) {
      ctx.badRequest('blocked.user');
      return;
    }

    try {
      await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
      ctx.send({
        email: user.email,
        sent: true,
      });
    } catch (err) {
      ctx.badRequest(null, err);
    }
  },
};