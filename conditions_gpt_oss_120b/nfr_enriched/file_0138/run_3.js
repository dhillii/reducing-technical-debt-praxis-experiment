'use strict';

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
 * Retrieve the plugin store.
 */
async function getPluginStore() {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
}

/**
 * Validate that a provider is enabled in the grant configuration.
 */
async function isProviderEnabled(store, provider) {
  const grantConfig = await store.get({ key: 'grant' });
  return provider === 'local'
    ? _.get(grantConfig, 'email.enabled')
    : _.get(grantConfig, [provider, 'enabled']);
}

/**
 * Build a query object for local authentication based on identifier.
 */
function buildLocalQuery(identifier) {
  const query = { provider: 'local' };
  if (emailRegExp.test(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
}

/**
 * Send JWT and sanitized user response.
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
 * Handle local provider authentication.
 */
async function handleLocalCallback(ctx) {
  const store = await getPluginStore();
  if (!(await isProviderEnabled(store, 'local'))) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const params = ctx.request.body;

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

  const query = buildLocalQuery(params.identifier);
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

  const advanced = await store.get({ key: 'advanced' });
  if (advanced.email_confirmation && user.confirmed !== true) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      })
    );
  }

  if (user.blocked) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      })
    );
  }

  if (!user.password) {
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
}

/**
 * Handle third‑party provider authentication.
 */
async function handleProviderCallback(ctx, provider) {
  const store = await getPluginStore();
  if (!(await isProviderEnabled(store, provider))) {
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
    return ctx.badRequest(null, e === 'array' ? e[0] : e);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  sendAuthResponse(ctx, user);
}

/**
 * Validate reset password parameters.
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
 * Validate password match for reset flow.
 */
function passwordsDoNotMatch(params) {
  return (
    params.password &&
    params.passwordConfirmation &&
    params.password !== params.passwordConfirmation
  );
}

/**
 * Validate email format.
 */
function validateEmail(email) {
  if (!emailRegExp.test(email)) {
    return false;
  }
  return email.toLowerCase();
}

/**
 * Send email using the email plugin.
 */
async function sendEmail(emailOptions) {
  await strapi.plugins['email'].services.email.send(emailOptions);
}

/**
 * Build redirect URI for OAuth providers.
 */
function buildRedirectUri(provider, grantConfig) {
  grantConfig[provider].callback = _.get(grantConfig, `${provider}.callback`) || grantConfig[provider].callback;
  grantConfig[provider].redirect_uri = strapi.plugins[
    'users-permissions'
  ].services.providers.buildRedirectUri(provider);
}

/**
 * Main controller export.
 */
module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    if (provider === 'local') {
      return handleLocalCallback(ctx);
    }
    return handleProviderCallback(ctx, provider);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (isValidResetParams(params)) {
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

      sendAuthResponse(ctx, user);
      return;
    }

    if (passwordsDoNotMatch(params)) {
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

    buildRedirectUri(provider, grantConfig);
    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;
    const normalized = validateEmail(email);
    if (!normalized) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }
    email = normalized;

    const pluginStore = await getPluginStore();

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

    const emailSettings = await pluginStore
      .get({ key: 'email' })
      .then(storeEmail => {
        try {
          return storeEmail['reset_password'].options;
        } catch {
          return {};
        }
      });

    const advanced = await pluginStore.get({ key: 'advanced' });

    const userInfo = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    emailSettings.message = await strapi.plugins[
      'users-permissions'
    ].services.userspermissions.template(emailSettings.message, {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetPasswordToken,
    });

    emailSettings.object = await strapi.plugins[
      'users-permissions'
    ].services.userspermissions.template(emailSettings.object, {
      USER: userInfo,
    });

    try {
      await sendEmail({
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
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });
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

    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
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

    const normalizedEmail = validateEmail(params.email);
    if (!normalizedEmail) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }
    params.email = normalizedEmail;

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

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
      ctx.badRequest(null, formatError(adminError));
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
      ctx.send({
        jwt: jwtService.issue({ id: user.id }),
        user: sanitizeEntity(user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
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

    const normalized = validateEmail(params.email);
    if (!normalized) {
      return ctx.badRequest('wrong.email');
    }
    params.email = normalized;

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

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