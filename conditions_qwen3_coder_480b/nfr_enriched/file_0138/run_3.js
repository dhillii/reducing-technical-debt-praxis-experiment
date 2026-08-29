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
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    })));
  }

  if (!params.password) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    })));
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
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    })));
  }

  if (
    _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
    user.confirmed !== true
  ) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.confirmed',
      message: 'Your account email is not confirmed',
    })));
  }

  if (user.blocked === true) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.blocked',
      message: 'Your account has been blocked by an administrator',
    })));
  }

  if (!user.password) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.password.local',
      message:
        'This user never set a local password, please login with the provider used during account creation.',
    })));
  }
};

const handleLocalAuth = async (ctx) => {
  const params = ctx.request.body;

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
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    })));
  }

  return user;
};

const validateExternalProvider = async (provider) => {
  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    throw new Error(JSON.stringify(formatError({
      id: 'provider.disabled',
      message: 'This provider is disabled.',
    })));
  }
};

const handleExternalAuth = async (provider, query) => {
  await validateExternalProvider(provider);

  let user;
  let error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
      provider,
      query
    );
  } catch ([u, e]) {
    throw new Error(error === 'array' ? error[0] : error);
  }

  if (!user) {
    throw new Error(error === 'array' ? error[0] : error);
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
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.params.provide',
      message: 'Incorrect params provided.',
    })));
  }

  if (params.password !== params.passwordConfirmation) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.password.matching',
      message: 'Passwords do not match.',
    })));
  }
};

const processPasswordReset = async (params) => {
  const user = await strapi
    .query('user', 'users-permissions')
    .findOne({ resetPasswordToken: `${params.code}` });

  if (!user) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.code.provide',
      message: 'Incorrect code provided.',
    })));
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
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.email.format',
      message: 'Please provide a valid email address.',
    })));
  }
};

const validateForgotPasswordUser = (user) => {
  if (!user) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.user.not-exist',
      message: 'This email does not exist.',
    })));
  }

  if (user.blocked) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.user.blocked',
      message: 'This user is disabled.',
    })));
  }
};

const sendResetPasswordEmail = async (user, resetPasswordToken) => {
  const pluginStore = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

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
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.advanced.allow_register',
      message: 'Register action is currently disabled.',
    })));
  }

  return { pluginStore, settings };
};

const validateRegistrationParams = (params) => {
  if (!params.password) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    })));
  }

  if (!params.email) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your email.',
    })));
  }

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.password.format',
      message: 'Your password cannot contain more than three times the symbol `$`.',
    })));
  }
};

const getRegistrationRole = async (defaultRole) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRole }, []);

  if (!role) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.role.notFound',
      message: 'Impossible to find the default role.',
    })));
  }

  return role;
};

const validateRegistrationEmail = (email) => {
  const isEmail = emailRegExp.test(email);

  if (isEmail) {
    return email.toLowerCase();
  } else {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.email.format',
      message: 'Please provide valid email address.',
    })));
  }
};

const checkExistingUser = async (email, provider, uniqueEmail) => {
  const user = await strapi.query('user', 'users-permissions').findOne({
    email: email,
  });

  if (user && user.provider === provider) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    })));
  }

  if (user && user.provider !== provider && uniqueEmail) {
    throw new Error(JSON.stringify(formatError({
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    })));
  }

  return user;
};

const createUserAndSendResponse = async (ctx, params, settings) => {
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
        throw err;
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

    throw new Error(JSON.stringify(formatError(adminError)));
  }
};

const validateEmailConfirmationParams = (confirmationToken) => {
  if (_.isEmpty(confirmationToken)) {
    throw new Error('token.invalid');
  }
};

const processEmailConfirmation = async (confirmationToken) => {
  const { user: userService } = strapi.plugins['users-permissions'].services;

  validateEmailConfirmationParams(confirmationToken);

  const user = await userService.fetch({ confirmationToken }, []);

  if (!user) {
    throw new Error('token.invalid');
  }

  await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

  return user;
};

const validateSendConfirmationParams = (params) => {
  if (!params.email) {
    throw new Error('missing.email');
  }

  const isEmail = emailRegExp.test(params.email);

  if (isEmail) {
    return params.email.toLowerCase();
  } else {
    throw new Error('wrong.email');
  }
};

const validateSendConfirmationUser = (user) => {
  if (user.confirmed) {
    throw new Error('already.confirmed');
  }

  if (user.blocked) {
    throw new Error('blocked.user');
  }
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';

    try {
      if (provider === 'local') {
        const user = await handleLocalAuth(ctx);
        sendAuthResponse(ctx, user);
      } else {
        const user = await handleExternalAuth(provider, ctx.query);
        sendAuthResponse(ctx, user);
      }
    } catch (error) {
      if (error.message.startsWith('[')) {
        return ctx.badRequest(null, JSON.parse(error.message));
      }
      return ctx.badRequest(null, error.message);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    try {
      validateResetPasswordParams(params);
      const user = await processPasswordReset(params);
      sendAuthResponse(ctx, user);
    } catch (error) {
      if (error.message.startsWith('[')) {
        return ctx.badRequest(null, JSON.parse(error.message));
      }
      return ctx.badRequest(null, error.message);
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
      email = validateForgotPasswordEmail(email);

      const user = await strapi
        .query('user', 'users-permissions')
        .findOne({ email: email.toLowerCase() });

      validateForgotPasswordUser(user);

      // Generate random token.
      const resetPasswordToken = crypto.randomBytes(64).toString('hex');

      await sendResetPasswordEmail(user, resetPasswordToken);

      // Update the user.
      await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

      ctx.send({ ok: true });
    } catch (error) {
      if (error.message.startsWith('[')) {
        return ctx.badRequest(null, JSON.parse(error.message));
      }
      return ctx.badRequest(null, error.message);
    }
  },

  async register(ctx) {
    try {
      const { pluginStore, settings } = await validateRegistrationSettings();

      const params = {
        ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
        provider: 'local',
      };

      validateRegistrationParams(params);

      const role = await getRegistrationRole(settings.default_role);

      params.email = validateRegistrationEmail(params.email);
      params.role = role.id;
      params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

      await checkExistingUser(params.email, params.provider, settings.unique_email);

      await createUserAndSendResponse(ctx, params, settings);
    } catch (error) {
      if (error.message.startsWith('[')) {
        return ctx.badRequest(null, JSON.parse(error.message));
      }
      return ctx.badRequest(null, error.message);
    }
  },

  async emailConfirmation(ctx, next, returnUser) {
    try {
      const { confirmation: confirmationToken } = ctx.query;
      const user = await processEmailConfirmation(confirmationToken);

      if (returnUser) {
        const { jwt: jwtService } = strapi.plugins['users-permissions'].services;
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
    } catch (error) {
      return ctx.badRequest(error.message);
    }
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    try {
      params.email = validateSendConfirmationParams(params);

      const user = await strapi.query('user', 'users-permissions').findOne({
        email: params.email,
      });

      validateSendConfirmationUser(user);

      await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
      ctx.send({
        email: user.email,
        sent: true,
      });
    } catch (error) {
      return ctx.badRequest(null, error.message);
    }
  },
};