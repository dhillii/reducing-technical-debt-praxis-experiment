```javascript
'use strict';

/* eslint-disable no-useless-escape */
const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [{ messages: [{ id: error.id, message: error.message, field: error.field }] }];

/* ---------- Helper Functions ---------- */

/**
 * Retrieve the users‑permissions store.
 */
const getPluginStore = () =>
  strapi.store({ environment: '', type: 'plugin', name: 'users-permissions' });

/**
 * Validate that an identifier (email or username) is present.
 */
const ensureIdentifier = (ctx, identifier) => {
  if (!identifier) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      })
    );
  }
};

/**
 * Validate that a password is present.
 */
const ensurePassword = (ctx, password) => {
  if (!password) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      })
    );
  }
};

/**
 * Build a query object for a local login based on identifier type.
 */
const buildLocalQuery = identifier => {
  const query = { provider: 'local' };
  if (emailRegExp.test(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

/**
 * Send JWT + sanitized user response.
 */
const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

/**
 * Validate password for a local user.
 */
const validateLocalPassword = async (provided, stored) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    provided,
    stored
  );
};

/**
 * Common bad request for disabled providers.
 */
const providerDisabled = ctx =>
  ctx.badRequest(
    null,
    formatError({ id: 'provider.disabled', message: 'This provider is disabled.' })
  );

/**
 * Retrieve grant configuration for a provider.
 */
const getGrantConfig = async provider => {
  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
    key: 'grant',
  });
  const config = await store.get();
  return config[provider] || {};
};

/* ---------- Exported Controllers ---------- */

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
    if (!params.password || !params.passwordConfirmation || params.password !== params.passwordConfirmation || !params.code) {
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

    sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const grantConfig = await getGrantConfig('grant');
    const [requestPath] = ctx.request.url.split('?');
    const provider = requestPath.split('/')[2];
    const providerConfig = await getGrantConfig(provider);

    if (!providerConfig.enabled) {
      return providerDisabled(ctx);
    }

    if (!strapi.config.server.url.startsWith('http')) {
      strapi.log.warn(
        'You are using a third party provider for login. Make sure to set an absolute url in config/server.js. More info here: https://strapi.io/documentation/developer-docs/latest/development/plugins/users-permissions.html#setting-up-the-server-url'
      );
    }

    providerConfig.callback = _.get(ctx, 'query.callback') || providerConfig.callback;
    providerConfig.redirect_uri = strapi.plugins['users-permissions'].services.providers.buildRedirectUri(
      provider
    );

    return grant({ ...grantConfig, [provider]: providerConfig })(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;
    if (!emailRegExp.test(email)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }
    email = email.toLowerCase();

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

    const token = crypto.randomBytes(64).toString('hex');
    const emailSettings = await pluginStore
      .get({ key: 'email' })
      .then(storeEmail => (storeEmail?.reset_password?.options ? storeEmail.reset_password.options : {}))
      .catch(() => ({}));

    const advanced = await pluginStore.get({ key: 'advanced' });
    const userInfo = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    emailSettings.message = await strapi.plugins[
      'users-permissions'
    ].services.userspermissions.template(emailSettings.message, {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: token,
    });

    emailSettings.object = await strapi.plugins[
      'users-permissions'
    ].services.userspermissions.template(emailSettings.object, {
      USER: userInfo,
    });

    try {
      await strapi.plugins['email'].services.email.send({
        to: user.email,
        from:
          emailSettings.from?.email || emailSettings.from?.name
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

    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken: token });
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

    if (!emailRegExp.test(params.email)) {
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

    const existing = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: params.email });

    if (existing && (existing.provider !== params.provider ? settings.unique_email : true)) {
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
    const { confirmation: token } = ctx.query;
    if (_.isEmpty(token)) {
      return ctx.badRequest('token.invalid');
    }

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;
    const user = await userService.fetch({ confirmationToken: token }, []);

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
    const { email } = _.assign(ctx.request.body);
    if (!email) {
      return ctx.badRequest('missing.email');
    }

    if (!emailRegExp.test(email)) {
      return ctx.badRequest('wrong.email');
    }

    const normalized = email.toLowerCase();
    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: normalized });

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

/* ---------- Internal Callback Handlers ---------- */

async function handleLocalCallback(ctx) {
  const params = ctx.request.body;
  const store = await getPluginStore();

  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const identifierError = ensureIdentifier(ctx, params.identifier);
  if (identifierError) return identifierError;

  const passwordError = ensurePassword(ctx, params.password);
  if (passwordError) return passwordError;

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

  if (_.get(await store.get({ key: 'advanced' }), 'email_confirmation') && user.confirmed !== true) {
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

  const valid = await validateLocalPassword(params.password, user.password);
  if (!valid) {
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

async function handleProviderCallback(ctx, provider) {
  const store = await getPluginStore();
  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    return providerDisabled(ctx);
  }

  let user, error;
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

  sendAuthResponse(ctx, user);
}
```