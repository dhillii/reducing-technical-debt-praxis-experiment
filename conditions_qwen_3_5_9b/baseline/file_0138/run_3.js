```javascript
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

const createBadRequest = (error) => ctx.badRequest(null, formatError(error));

const getUser = async (query) => {
  return await strapi.query('user', 'users-permissions').findOne(query);
};

const getUserEntity = (user) => {
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });
};

const getJwt = (user) => {
  return strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id });
};

const getStore = async () => {
  return await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

const validateUser = async (user, store) => {
  if (!user) return null;
  
  if (
    _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
    user.confirmed !== true
  ) {
    return { error: 'confirmed' };
  }
  
  if (user.blocked === true) {
    return { error: 'blocked' };
  }
  
  if (!user.password) {
    return { error: 'password.local' };
  }
  
  return user;
};

const validatePassword = async (password, user) => {
  return await strapi.plugins['users-permissions'].services.user.validatePassword(
    password,
    user.password
  );
};

const isEmail = (identifier) => {
  return emailRegExp.test(identifier);
};

const getIdentifierQuery = (identifier) => {
  if (isEmail(identifier)) {
    return { email: identifier.toLowerCase() };
  }
  return { username: identifier };
};

const handleLocalAuth = async (ctx, params, store) => {
  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return createBadRequest({
      id: 'Auth.form.error.email.provide',
      message: 'This provider is disabled.',
    });
  }

  if (!params.identifier) {
    return createBadRequest({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    });
  }

  if (!params.password) {
    return createBadRequest({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    });
  }

  const query = getIdentifierQuery(params.identifier);
  const user = await getUser(query);

  if (!user) {
    return createBadRequest({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    });
  }

  const validation = await validateUser(user, store);
  if (validation?.error) {
    const errorMessages = {
      confirmed: 'Your account email is not confirmed',
      blocked: 'Your account has been blocked by an administrator',
      'password.local': 'This user never set a local password, please login with the provider used during account creation.',
    };
    return createBadRequest({
      id: `Auth.form.error.${validation.error}`,
      message: errorMessages[validation.error],
    });
  }

  const validPassword = await validatePassword(params.password, user);
  if (!validPassword) {
    return createBadRequest({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    });
  }

  const jwt = getJwt(user);
  const userEntity = getUserEntity(user);

  ctx.send({ jwt, user: userEntity });
};

const handleThirdPartyAuth = async (ctx, provider) => {
  if (!_.get(await getStore(), [provider, 'enabled'])) {
    return createBadRequest({
      id: 'provider.disabled',
      message: 'This provider is disabled.',
    });
  }

  let user;
  let error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      ctx.query
    );
  } catch ([user, error]) {
    return createBadRequest(null, error === 'array' ? error[0] : error);
  }

  if (!user) {
    return createBadRequest(null, error === 'array' ? error[0] : error);
  }

  const jwt = getJwt(user);
  const userEntity = getUserEntity(user);

  ctx.send({ jwt, user: userEntity });
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getStore();

    if (provider === 'local') {
      return handleLocalAuth(ctx, params, store);
    }

    return handleThirdPartyAuth(ctx, provider);
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
        return createBadRequest({
          id: 'Auth.form.error.code.provide',
          message: 'Incorrect code provided.',
        });
      }

      const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
        password: params.password,
      });

      await strapi
        .query('user', 'users-permissions')
        .update({ id: user.id }, { resetPasswordToken: null, password });

      const jwt = getJwt(user);
      const userEntity = getUserEntity(user);

      ctx.send({ jwt, user: userEntity });
    } else if (
      params.password &&
      params.passwordConfirmation &&
      params.password !== params.passwordConfirmation
    ) {
      return createBadRequest({
        id: 'Auth.form.error.password.matching',
        message: 'Passwords do not match.',
      });
    } else {
      return createBadRequest({
        id: 'Auth.form.error.params.provide',
        message: 'Incorrect params provided.',
      });
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
    grantConfig[provider].redirect_uri = strapi.plugins['users-permissions']
      .services.providers.buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;
    const isEmailValid = isEmail(email);

    if (!isEmailValid) {
      return createBadRequest({
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      });
    }

    email = email.toLowerCase();

    const pluginStore = await getStore();
    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email });

    if (!user) {
      return createBadRequest({
        id: 'Auth.form.error.user.not-exist',
        message: 'This email does not exist.',
      });
    }

    if (user.blocked) {
      return createBadRequest({
        id: 'Auth.form.error.user.blocked',
        message: 'This user is disabled.',
      });
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
    const userInfo = getUserEntity(user);

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
      return createBadRequest({
        id: 'Auth.advanced.allow_register',
        message: 'Register action is currently disabled.',
      });
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    if (!params.password) {
      return createBadRequest({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      });
    }

    if (!params.email) {
      return createBadRequest({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      });
    }

    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
      return createBadRequest({
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      });
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return createBadRequest({
        id: 'Auth.form.error.role.notFound',
        message: 'Impossible to find the default role.',
      });
    }

    const isEmailValid = isEmail(params.email);

    if (!isEmailValid) {
      return createBadRequest({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      });
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({ email: params.email });

    if (existingUser && existingUser.provider === params.provider) {
      return createBadRequest({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      });
    }

    if (existingUser && existingUser.provider !== params.provider && settings.unique_email) {
      return createBadRequest({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      });
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);
      const sanitizedUser = getUserEntity(user);

      if (settings.email_confirmation) {
        try {
          await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
        } catch (err) {
          return createBadRequest(null, err);
        }

        return ctx.send({ user: sanitizedUser });
      }

      const jwt = getJwt(user);

      return ctx.send({ jwt, user: sanitizedUser });
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
        user: getUserEntity(user),
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

    const isEmailValid = isEmail(params.email);

    if (!isEmailValid) {
      return ctx.badRequest('wrong.email');
    }

    params.email = params.email.toLowerCase();

    const user = await strapi.query('user', 'users-permissions').findOne({ email: params.email });

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
```