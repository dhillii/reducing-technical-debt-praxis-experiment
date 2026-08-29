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

const validateLocalProvider = async () => {
  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    throw new Error('This provider is disabled.');
  }
};

const validateLocalParams = (params) => {
  if (!params.identifier) {
    throw {
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    };
  }

  if (!params.password) {
    throw {
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    };
  }
};

const buildLocalQuery = (params) => {
  const query = { provider: 'local' };
  const isEmail = emailRegExp.test(params.identifier);

  if (isEmail) {
    query.email = params.identifier.toLowerCase();
  } else {
    query.username = params.identifier;
  }

  return query;
};

const validateLocalUser = async (user, store) => {
  if (!user) {
    throw {
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    };
  }

  if (
    _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
    user.confirmed !== true
  ) {
    throw {
      id: 'Auth.form.error.confirmed',
      message: 'Your account email is not confirmed',
    };
  }

  if (user.blocked === true) {
    throw {
      id: 'Auth.form.error.blocked',
      message: 'Your account has been blocked by an administrator',
    };
  }

  if (!user.password) {
    throw {
      id: 'Auth.form.error.password.local',
      message:
        'This user never set a local password, please login with the provider used during account creation.',
    };
  }
};

const handleLocalAuth = async (ctx, params) => {
  await validateLocalProvider();

  validateLocalParams(params);

  const query = buildLocalQuery(params);

  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  await validateLocalUser(user, store);

  const validPassword = await strapi.plugins[
    'users-permissions'
  ].services.user.validatePassword(params.password, user.password);

  if (!validPassword) {
    throw {
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    };
  }

  return user;
};

const validateProviderEnabled = async (provider) => {
  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    throw {
      id: 'provider.disabled',
      message: 'This provider is disabled.',
    };
  }
};

const handleProviderAuth = async (provider, query) => {
  await validateProviderEnabled(provider);

  let user;
  let error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      query
    );
  } catch ([user, error]) {
    throw error === 'array' ? error[0] : error;
  }

  if (!user) {
    throw error === 'array' ? error[0] : error;
  }

  return user;
};

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

const validateResetPasswordParams = (params) => {
  if (
    !params.password ||
    !params.passwordConfirmation ||
    !params.code
  ) {
    throw {
      id: 'Auth.form.error.params.provide',
      message: 'Incorrect params provided.',
    };
  }

  if (params.password !== params.passwordConfirmation) {
    throw {
      id: 'Auth.form.error.password.matching',
      message: 'Passwords do not match.',
    };
  }
};

const processPasswordReset = async (ctx, params) => {
  validateResetPasswordParams(params);

  const user = await strapi
    .query('user', 'users-permissions')
    .findOne({ resetPasswordToken: `${params.code}` });

  if (!user) {
    throw {
      id: 'Auth.form.error.code.provide',
      message: 'Incorrect code provided.',
    };
  }

  const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
    password: params.password,
  });

  await strapi
    .query('user', 'users-permissions')
    .update({ id: user.id }, { resetPasswordToken: null, password });

  return user;
};

const validateForgotPasswordEmail = (email) => {
  const isEmail = emailRegExp.test(email);

  if (isEmail) {
    return email.toLowerCase();
  } else {
    throw {
      id: 'Auth.form.error.email.format',
      message: 'Please provide a valid email address.',
    };
  }
};

const validateForgotPasswordUser = (user) => {
  if (!user) {
    throw {
      id: 'Auth.form.error.user.not-exist',
      message: 'This email does not exist.',
    };
  }

  if (user.blocked) {
    throw {
      id: 'Auth.form.error.user.blocked',
      message: 'This user is disabled.',
    };
  }
};

const sendResetPasswordEmail = async (user, resetPasswordToken, pluginStore) => {
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
};

const processForgotPassword = async (ctx, email) => {
  const validatedEmail = validateForgotPasswordEmail(email);

  const pluginStore = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  const user = await strapi
    .query('user', 'users-permissions')
    .findOne({ email: validatedEmail });

  validateForgotPasswordUser(user);

  const resetPasswordToken = crypto.randomBytes(64).toString('hex');

  await sendResetPasswordEmail(user, resetPasswordToken, pluginStore);

  await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

  return true;
};

const validateRegistrationSettings = async () => {
  const pluginStore = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  const settings = await pluginStore.get({
    key: 'advanced',
  });

  if (!settings.allow_register) {
    throw {
      id: 'Auth.advanced.allow_register',
      message: 'Register action is currently disabled.',
    };
  }

  return { pluginStore, settings };
};

const validateRegistrationParams = (params) => {
  if (!params.password) {
    throw {
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    };
  }

  if (!params.email) {
    throw {
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your email.',
    };
  }

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    throw {
      id: 'Auth.form.error.password.format',
      message: 'Your password cannot contain more than three times the symbol `$`.',
    };
  }
};

const getRegistrationRole = async (settings) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: settings.default_role }, []);

  if (!role) {
    throw {
      id: 'Auth.form.error.role.notFound',
      message: 'Impossible to find the default role.',
    };
  }

  return role;
};

const validateRegistrationEmail = (email) => {
  const isEmail = emailRegExp.test(email);

  if (isEmail) {
    return email.toLowerCase();
  } else {
    throw {
      id: 'Auth.form.error.email.format',
      message: 'Please provide valid email address.',
    };
  }
};

const checkExistingUser = async (params, settings) => {
  const user = await strapi.query('user', 'users-permissions').findOne({
    email: params.email,
  });

  if (user && user.provider === params.provider) {
    throw {
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    };
  }

  if (user && user.provider !== params.provider && settings.unique_email) {
    throw {
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    };
  }

  return user;
};

const createUserAndSendResponse = async (ctx, params, settings) => {
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
      throw err;
    }

    return { user: sanitizedUser, jwt: null };
  }

  const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
  return { user: sanitizedUser, jwt };
};

const processRegistration = async (ctx, body) => {
  const { pluginStore, settings } = await validateRegistrationSettings();

  const params = {
    ..._.omit(body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
    provider: 'local',
  };

  validateRegistrationParams(params);

  params.email = validateRegistrationEmail(params.email);

  const role = await getRegistrationRole(settings);
  params.role = role.id;
  params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

  await checkExistingUser(params, settings);

  return await createUserAndSendResponse(ctx, params, settings);
};

const validateEmailConfirmation = (confirmationToken) => {
  if (_.isEmpty(confirmationToken)) {
    throw 'token.invalid';
  }
};

const processEmailConfirmation = async (confirmationToken) => {
  validateEmailConfirmation(confirmationToken);

  const user = await strapi.plugins['users-permissions'].services.user.fetch({ confirmationToken }, []);

  if (!user) {
    throw 'token.invalid';
  }

  await strapi.plugins['users-permissions'].services.user.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

  return user;
};

const sendEmailConfirmation = async (ctx, email) => {
  if (!email) {
    throw 'missing.email';
  }

  const isEmail = emailRegExp.test(email);

  if (isEmail) {
    email = email.toLowerCase();
  } else {
    throw 'wrong.email';
  }

  const user = await strapi.query('user', 'users-permissions').findOne({
    email: email,
  });

  if (user.confirmed) {
    throw 'already.confirmed';
  }

  if (user.blocked) {
    throw 'blocked.user';
  }

  await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
  
  return {
    email: user.email,
    sent: true,
  };
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    try {
      let user;
      if (provider === 'local') {
        user = await handleLocalAuth(ctx, params);
      } else {
        user = await handleProviderAuth(provider, ctx.query);
      }

      sendAuthResponse(ctx, user);
    } catch (error) {
      if (typeof error === 'string') {
        return ctx.badRequest(null, error);
      }
      return ctx.badRequest(null, formatError(error));
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    try {
      const user = await processPasswordReset(ctx, params);
      
      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({
          id: user.id,
        }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    } catch (error) {
      return ctx.badRequest(null, formatError(error));
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

    // Ability to pass OAuth callback dynamically
    grantConfig[provider].callback = _.get(ctx, 'query.callback') || grantConfig[provider].callback;
    grantConfig[provider].redirect_uri = strapi.plugins[
      'users-permissions'
    ].services.providers.buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    try {
      await processForgotPassword(ctx, email);
      ctx.send({ ok: true });
    } catch (error) {
      if (typeof error === 'string') {
        return ctx.badRequest(null, error);
      }
      return ctx.badRequest(null, formatError(error));
    }
  },

  async register(ctx) {
    try {
      const result = await processRegistration(ctx, ctx.request.body);
      
      if (result.jwt) {
        ctx.send({
          jwt: result.jwt,
          user: result.user,
        });
      } else {
        ctx.send({ user: result.user });
      }
    } catch (error) {
      const adminError = _.includes(error.message, 'username')
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

    try {
      const user = await processEmailConfirmation(confirmationToken);

      if (returnUser) {
        ctx.send({
          jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
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
    } catch (error) {
      return ctx.badRequest(error);
    }
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    try {
      const result = await sendEmailConfirmation(ctx, params.email);
      ctx.send(result);
    } catch (error) {
      return ctx.badRequest(null, error);
    }
  },
};