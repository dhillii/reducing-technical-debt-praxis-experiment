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

const createBadRequest = (id, message) => ctx.badRequest(null, formatError({ id, message }));

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
      await this.validateLocalProvider(ctx, store, params);
      const user = await this.findUser(ctx, store, params);
      await this.validateUserStatus(user, store);
      const validPassword = await this.validatePassword(params.password, user);

      if (validPassword) {
        ctx.send({
          jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
          user: this.sanitizeUser(user),
        });
      } else {
        createBadRequest('Auth.form.error.invalid', 'Identifier or password invalid.');
      }
    } else {
      await this.validateGrantProvider(ctx, store, provider);
      const [user, error] = await this.connectUser(provider, ctx.query);
      if (user) {
        ctx.send({
          jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
          user: this.sanitizeUser(user),
        });
      } else {
        createBadRequest('provider.disabled', 'This provider is disabled.');
      }
    }
  },

  async validateLocalProvider(ctx, store, params) {
    if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
      return createBadRequest(null, 'This provider is disabled.');
    }

    if (!params.identifier) {
      return createBadRequest(
        'Auth.form.error.email.provide',
        'Please provide your username or your e-mail.'
      );
    }

    if (!params.password) {
      return createBadRequest(
        'Auth.form.error.password.provide',
        'Please provide your password.'
      );
    }
  },

  async findUser(ctx, store, params) {
    const query = { provider: ctx.params.provider || 'local' };
    const isEmail = emailRegExp.test(params.identifier);

    if (isEmail) {
      query.email = params.identifier.toLowerCase();
    } else {
      query.username = params.identifier;
    }

    const user = await strapi.query('user', 'users-permissions').findOne(query);

    if (!user) {
      return createBadRequest(
        'Auth.form.error.invalid',
        'Identifier or password invalid.'
      );
    }

    return user;
  },

  async validateUserStatus(user, store) {
    if (
      _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
      user.confirmed !== true
    ) {
      return createBadRequest(
        'Auth.form.error.confirmed',
        'Your account email is not confirmed'
      );
    }

    if (user.blocked === true) {
      return createBadRequest(
        'Auth.form.error.blocked',
        'Your account has been blocked by an administrator'
      );
    }

    if (!user.password) {
      return createBadRequest(
        'Auth.form.error.password.local',
        'This user never set a local password, please login with the provider used during account creation.'
      );
    }
  },

  async validatePassword(password, user) {
    const validPassword = await strapi.plugins[
      'users-permissions'
    ].services.user.validatePassword(password, user.password);

    return validPassword;
  },

  async validateGrantProvider(ctx, store, provider) {
    if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
      return createBadRequest(
        null,
        formatError({
          id: 'provider.disabled',
          message: 'This provider is disabled.',
        })
      );
    }
  },

  async connectUser(provider, query) {
    try {
      const [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
        provider,
        query
      );
      return [user, error];
    } catch ([user, error]) {
      return [user, error === 'array' ? error[0] : error];
    }
  },

  sanitizeUser(user) {
    return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    });
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (
      params.password &&
      params.passwordConfirmation &&
      params.password === params.passwordConfirmation &&
      params.code
    ) {
      const user = await strapi
        .query('user', 'users-permissions')
        .findOne({ resetPasswordToken: `${params.code}` });

      if (!user) {
        return createBadRequest(
          'Auth.form.error.code.provide',
          'Incorrect code provided.'
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
        user: this.sanitizeUser(user),
      });
    } else if (
      params.password &&
      params.passwordConfirmation &&
      params.password !== params.passwordConfirmation
    ) {
      return createBadRequest(
        'Auth.form.error.password.matching',
        'Passwords do not match.'
      );
    } else {
      return createBadRequest(
        'Auth.form.error.params.provide',
        'Incorrect params provided.'
      );
    }
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

    if (emailRegExp.test(email)) {
      email = email.toLowerCase();
    } else {
      return createBadRequest(
        'Auth.form.error.email.format',
        'Please provide a valid email address.'
      );
    }

    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email });

    if (!user) {
      return createBadRequest(
        'Auth.form.error.user.not-exist',
        'This email does not exist.'
      );
    }

    if (user.blocked) {
      return createBadRequest(
        'Auth.form.error.user.blocked',
        'This user is disabled.'
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

    const advanced = await pluginStore.get({ key: 'advanced' });

    const userInfo = this.sanitizeUser(user);

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

    const settings = await pluginStore.get({ key: 'advanced' });

    if (!settings.allow_register) {
      return createBadRequest(
        'Auth.advanced.allow_register',
        'Register action is currently disabled.'
      );
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    if (!params.password) {
      return createBadRequest(
        'Auth.form.error.password.provide',
        'Please provide your password.'
      );
    }

    if (!params.email) {
      return createBadRequest(
        'Auth.form.error.email.provide',
        'Please provide your email.'
      );
    }

    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
      return createBadRequest(
        'Auth.form.error.password.format',
        'Your password cannot contain more than three times the symbol `$`.'
      );
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return createBadRequest(
        'Auth.form.error.role.notFound',
        'Impossible to find the default role.'
      );
    }

    if (emailRegExp.test(params.email)) {
      params.email = params.email.toLowerCase();
    } else {
      return createBadRequest(
        'Auth.form.error.email.format',
        'Please provide valid email address.'
      );
    }

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (existingUser && existingUser.provider === params.provider) {
      return createBadRequest(
        'Auth.form.error.email.taken',
        'Email is already taken.'
      );
    }

    if (existingUser && existingUser.provider !== params.provider && settings.unique_email) {
      return createBadRequest(
        'Auth.form.error.email.taken',
        'Email is already taken.'
      );
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);
      const sanitizedUser = this.sanitizeUser(user);

      if (settings.email_confirmation) {
        try {
          await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
        } catch (err) {
          return createBadRequest(null, err);
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
        user: this.sanitizeUser(user),
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

    if (emailRegExp.test(params.email)) {
      params.email = params.email.toLowerCase();
    } else {
      return ctx.badRequest('wrong.email');
    }

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
      ctx.send({
        email: user.email,
        sent: true,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
    }
  },
};