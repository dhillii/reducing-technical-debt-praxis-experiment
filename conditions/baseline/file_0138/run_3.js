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

const getStore = () => strapi.store({
  environment: '',
  type: 'plugin',
  name: 'users-permissions',
});

const sanitizeUser = user => sanitizeEntity(user.toJSON ? user.toJSON() : user, {
  model: strapi.query('user', 'users-permissions').model,
});

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeUser(user),
  });
};

const validateLocalAuthInput = (params) => {
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
};

const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  const isEmail = emailRegExp.test(identifier);
  
  if (isEmail) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

const validateUserStatus = async (user, store) => {
  if (!user) {
    return {
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    };
  }

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
      message: 'This user never set a local password, please login with the provider used during account creation.',
    };
  }

  return null;
};

const handleLocalAuth = async (ctx, params, store) => {
  const inputError = validateLocalAuthInput(params);
  if (inputError) {
    return ctx.badRequest(null, formatError(inputError));
  }

  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const query = buildUserQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const statusError = await validateUserStatus(user, store);
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

  sendAuthResponse(ctx, user);
};

const handleProviderAuth = async (ctx, provider, store) => {
  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
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

const validateResetPasswordParams = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return 'missing';
  }
  if (params.password !== params.passwordConfirmation) {
    return 'mismatch';
  }
  return null;
};

const validateEmailFormat = (email) => {
  if (!emailRegExp.test(email)) {
    return {
      id: 'Auth.form.error.email.format',
      message: 'Please provide a valid email address.',
    };
  }
  return null;
};

const validateRegistrationInput = (params) => {
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
  const emailError = validateEmailFormat(params.email);
  if (emailError) return emailError;
  
  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    return {
      id: 'Auth.form.error.password.format',
      message: 'Your password cannot contain more than three times the symbol `$`.',
    };
  }
  return null;
};

const checkEmailExists = async (email, provider, settings) => {
  const user = await strapi.query('user', 'users-permissions').findOne({ email });
  
  if (user && user.provider === provider) {
    return {
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    };
  }
  
  if (user && user.provider !== provider && settings.unique_email) {
    return {
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    };
  }
  return null;
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getStore();

    if (provider === 'local') {
      await handleLocalAuth(ctx, params, store);
    } else {
      await handleProviderAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);
    const paramError = validateResetPasswordParams(params);

    if (paramError === 'mismatch') {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    }

    if (paramError === 'missing') {
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

    const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
      password: params.password,
    });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password });

    sendAuthResponse(ctx, user);
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

    const emailError = validateEmailFormat(email);
    if (emailError) {
      return ctx.badRequest(null, formatError(emailError));
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

    const settings = await pluginStore.get({ key: 'email' }).then(storeEmail => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

    const advanced = await pluginStore.get({ key: 'advanced' });
    const userInfo = sanitizeUser(user);

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

    const inputError = validateRegistrationInput(params);
    if (inputError) {
      return ctx.badRequest(null, formatError(inputError));
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

    params.email = params.email.toLowerCase();
    const emailExistsError = await checkEmailExists(params.email, params.provider, settings);
    if (emailExistsError) {
      return ctx.badRequest(null, formatError(emailExistsError));
    }

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

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

    await userService.edit({ id: user.id }, { confirmed: