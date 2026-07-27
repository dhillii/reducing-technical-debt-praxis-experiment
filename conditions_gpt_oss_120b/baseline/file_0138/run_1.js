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

const badRequest = (ctx, error) => ctx.badRequest(null, formatError(error));

const issueJwt = userId =>
  strapi.plugins['users-permissions'].services.jwt.issue({ id: userId });

const sanitize = user =>
  sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });

async function handleLocal(ctx, params, store) {
  const grantConfig = await store.get({ key: 'grant' });
  if (!_.get(grantConfig, 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  if (!params.identifier) {
    return badRequest(ctx, {
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    });
  }

  if (!params.password) {
    return badRequest(ctx, {
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    });
  }

  const isEmail = emailRegExp.test(params.identifier);
  const query = isEmail
    ? { email: params.identifier.toLowerCase(), provider: 'local' }
    : { username: params.identifier, provider: 'local' };

  const user = await strapi.query('user', 'users-permissions').findOne(query);
  if (!user) {
    return badRequest(ctx, {
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    });
  }

  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return badRequest(ctx, {
      id: 'Auth.form.error.confirmed',
      message: 'Your account email is not confirmed',
    });
  }

  if (user.blocked) {
    return badRequest(ctx, {
      id: 'Auth.form.error.blocked',
      message: 'Your account has been blocked by an administrator',
    });
  }

  if (!user.password) {
    return badRequest(ctx, {
      id: 'Auth.form.error.password.local',
      message:
        'This user never set a local password, please login with the provider used during account creation.',
    });
  }

  const validPassword = await strapi.plugins[
    'users-permissions'
  ].services.user.validatePassword(params.password, user.password);

  if (!validPassword) {
    return badRequest(ctx, {
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    });
  }

  ctx.send({
    jwt: issueJwt(user.id),
    user: sanitize(user),
  });
}

async function handleOAuth(ctx, provider, store) {
  const grantConfig = await store.get({ key: 'grant' });
  if (!_.get(grantConfig, [provider, 'enabled'])) {
    return ctx.badRequest(null, formatError({
      id: 'provider.disabled',
      message: 'This provider is disabled.',
    }));
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

  ctx.send({
    jwt: issueJwt(user.id),
    user: sanitize(user),
  });
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
      return handleLocal(ctx, params, store);
    }
    return handleOAuth(ctx, provider, store);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (params.password && params.passwordConfirmation && params.password === params.passwordConfirmation && params.code) {
      const user = await strapi
        .query('user', 'users-permissions')
        .findOne({ resetPasswordToken: `${params.code}` });

      if (!user) {
        return badRequest(ctx, {
          id: 'Auth.form.error.code.provide',
          message: 'Incorrect code provided.',
        });
      }

      const hashed = await strapi.plugins['users-permissions'].services.user.hashPassword({
        password: params.password,
      });

      await strapi
        .query('user', 'users-permissions')
        .update({ id: user.id }, { resetPasswordToken: null, password: hashed });

      ctx.send({
        jwt: issueJwt(user.id),
        user: sanitize(user),
      });
      return;
    }

    if (params.password && params.passwordConfirmation && params.password !== params.passwordConfirmation) {
      return badRequest(ctx, {
        id: 'Auth.form.error.password.matching',
        message: 'Passwords do not match.',
      });
    }

    return badRequest(ctx, {
      id: 'Auth.form.error.params.provide',
      message: 'Incorrect params provided.',
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

    if (!emailRegExp.test(email)) {
      return badRequest(ctx, {
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      });
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
      return badRequest(ctx, {
        id: 'Auth.form.error.user.not-exist',
        message: 'This email does not exist.',
      });
    }

    if (user.blocked) {
      return badRequest(ctx, {
        id: 'Auth.form.error.user.blocked',
        message: 'This user is disabled.',
      });
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    const emailSettings = await pluginStore
      .get({ key: 'email' })
      .then(storeEmail => (storeEmail?.reset_password?.options) || {});

    const advanced = await pluginStore.get({ key: 'advanced' });

    const userInfo = sanitize(user);

    emailSettings.message = await strapi.plugins['users-permissions'].services.userspermissions.template(
      emailSettings.message,
      {
        URL: advanced.email_reset_password,
        USER: userInfo,
        TOKEN: resetPasswordToken,
      }
    );

    emailSettings.object = await strapi.plugins['users-permissions'].services.userspermissions.template(
      emailSettings.object,
      { USER: userInfo }
    );

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
      return badRequest(ctx, {
        id: 'Auth.advanced.allow_register',
        message: 'Register action is currently disabled.',
      });
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    if (!params.password) {
      return badRequest(ctx, {
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      });
    }

    if (!params.email) {
      return badRequest(ctx, {
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      });
    }

    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
      return badRequest(ctx, {
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      });
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return badRequest(ctx, {
        id: 'Auth.form.error.role.notFound',
        message: 'Impossible to find the default role.',
      });
    }

    if (!emailRegExp.test(params.email)) {
      return badRequest(ctx, {
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      });
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existing = await strapi.query('user', 'users-permissions').findOne({ email: params.email });

    if (existing && (existing.provider === params.provider || settings.unique_email)) {
      return badRequest(ctx, {
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      });
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);
      const sanitizedUser = sanitize(user);

      if (settings.email_confirmation) {
        await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
        return ctx.send({ user: sanitizedUser });
      }

      ctx.send({
        jwt: issueJwt(user.id),
        user: sanitizedUser,
      });
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? { id: 'Auth.form.error.username.taken', message: 'Username already taken' }
        : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };
      return badRequest(ctx, adminError);
    }
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    if (_.isEmpty(confirmationToken)) {
      return ctx.badRequest('token.invalid');
    }

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

    const user = await userService.fetch({ confirmationToken }, []);

    if (!user) {
      return ctx.badRequest('token.invalid');
    }

    await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

    if (returnUser) {
      ctx.send({
        jwt: jwtService.issue({ id: user.id }),
        user: sanitize(user),
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
      return ctx.badRequest('missing.email');
    }

    if (!emailRegExp.test(params.email)) {
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