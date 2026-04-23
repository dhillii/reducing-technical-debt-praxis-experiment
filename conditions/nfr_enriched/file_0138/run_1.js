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

// Helper: Validate email format
const isValidEmail = email => emailRegExp.test(email);

// Helper: Get plugin store
const getPluginStore = async () => {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

// Helper: Build user response with JWT and sanitized user data
const buildUserResponse = user => ({
  jwt: strapi.plugins['users-permissions'].services.jwt.issue({
    id: user.id,
  }),
  user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  }),
});

// Helper: Validate local provider is enabled
const validateLocalProviderEnabled = async store => {
  return _.get(await store.get({ key: 'grant' }), 'email.enabled');
};

// Helper: Validate third-party provider is enabled
const validateProviderEnabled = async (store, provider) => {
  return _.get(await store.get({ key: 'grant' }), [provider, 'enabled']);
};

// Helper: Find user by identifier (email or username)
const findUserByIdentifier = async (identifier, provider) => {
  const query = { provider };
  if (isValidEmail(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return strapi.query('user', 'users-permissions').findOne(query);
};

// Helper: Validate user account status
const validateUserAccountStatus = async (user, store) => {
  if (!user) {
    return { valid: false, error: { id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' } };
  }

  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return { valid: false, error: { id: 'Auth.form.error.confirmed', message: 'Your account email is not confirmed' } };
  }

  if (user.blocked === true) {
    return { valid: false, error: { id: 'Auth.form.error.blocked', message: 'Your account has been blocked by an administrator' } };
  }

  return { valid: true };
};

// Helper: Validate user password
const validateUserPassword = async (user, password) => {
  if (!user.password) {
    return { valid: false, error: { id: 'Auth.form.error.password.local', message: 'This user never set a local password, please login with the provider used during account creation.' } };
  }

  const isValid = await strapi.plugins['users-permissions'].services.user.validatePassword(password, user.password);
  if (!isValid) {
    return { valid: false, error: { id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' } };
  }

  return { valid: true };
};

// Helper: Handle local authentication
const handleLocalAuth = async (ctx, params, store) => {
  if (!params.identifier) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.email.provide', message: 'Please provide your username or your e-mail.' }));
  }

  if (!params.password) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.password.provide', message: 'Please provide your password.' }));
  }

  const user = await findUserByIdentifier(params.identifier, 'local');
  const statusValidation = await validateUserAccountStatus(user, store);
  if (!statusValidation.valid) {
    return ctx.badRequest(null, formatError(statusValidation.error));
  }

  const passwordValidation = await validateUserPassword(user, params.password);
  if (!passwordValidation.valid) {
    return ctx.badRequest(null, formatError(passwordValidation.error));
  }

  ctx.send(buildUserResponse(user));
};

// Helper: Handle third-party provider authentication
const handleProviderAuth = async (ctx, provider, store) => {
  let user;
  let error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(provider, ctx.query);
  } catch ([user, error]) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  ctx.send(buildUserResponse(user));
};

// Helper: Validate reset password parameters
const validateResetPasswordParams = params => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return { valid: false, error: { id: 'Auth.form.error.params.provide', message: 'Incorrect params provided.' } };
  }

  if (params.password !== params.passwordConfirmation) {
    return { valid: false, error: { id: 'Auth.form.error.password.matching', message: 'Passwords do not match.' } };
  }

  return { valid: true };
};

// Helper: Validate registration parameters
const validateRegistrationParams = params => {
  if (!params.password) {
    return { valid: false, error: { id: 'Auth.form.error.password.provide', message: 'Please provide your password.' } };
  }

  if (!params.email) {
    return { valid: false, error: { id: 'Auth.form.error.email.provide', message: 'Please provide your email.' } };
  }

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    return { valid: false, error: { id: 'Auth.form.error.password.format', message: 'Your password cannot contain more than three times the symbol `$`.' } };
  }

  if (!isValidEmail(params.email)) {
    return { valid: false, error: { id: 'Auth.form.error.email.format', message: 'Please provide valid email address.' } };
  }

  return { valid: true };
};

// Helper: Check for existing user with email
const checkExistingUserByEmail = async (email, provider, settings) => {
  const user = await strapi.query('user', 'users-permissions').findOne({ email });

  if (user && user.provider === provider) {
    return { exists: true, error: { id: 'Auth.form.error.email.taken', message: 'Email is already taken.' } };
  }

  if (user && user.provider !== provider && settings.unique_email) {
    return { exists: true, error: { id: 'Auth.form.error.email.taken', message: 'Email is already taken.' } };
  }

  return { exists: false };
};

// Helper: Send confirmation email if needed
const handleConfirmationEmail = async (ctx, user, settings, sanitizedUser) => {
  if (settings.email_confirmation) {
    try {
      await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
    } catch (err) {
      return ctx.badRequest(null, err);
    }
    return ctx.send({ user: sanitizedUser });
  }
  return null;
};

// Helper: Get email settings for forgot password
const getForgotPasswordEmailSettings = async pluginStore => {
  return pluginStore.get({ key: 'email' }).then(storeEmail => {
    try {
      return storeEmail['reset_password'].options;
    } catch (error) {
      return {};
    }
  });
};

// Helper: Validate forgot password email
const validateForgotPasswordEmail = async email => {
  if (!isValidEmail(email)) {
    return { valid: false, error: { id: 'Auth.form.error.email.format', message: 'Please provide a valid email address.' } };
  }

  const user = await strapi.query('user', 'users-permissions').findOne({ email: email.toLowerCase() });

  if (!user) {
    return { valid: false, error: { id: 'Auth.form.error.user.not-exist', message: 'This email does not exist.' } };
  }

  if (user.blocked) {
    return { valid: false, error: { id: 'Auth.form.error.user.blocked', message: 'This user is disabled.' } };
  }

  return { valid: true, user };
};

// Helper: Send forgot password email
const sendForgotPasswordEmail = async (user, settings, resetPasswordToken, advanced) => {
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

// Helper: Validate email confirmation token
const validateConfirmationToken = async confirmationToken => {
  if (_.isEmpty(confirmationToken)) {
    return { valid: false };
  }

  const user = await strapi.plugins['users-permissions'].services.user.fetch({ confirmationToken }, []);

  if (!user) {
    return { valid: false };
  }

  return { valid: true, user };
};

// Helper: Validate send email confirmation request
const validateSendEmailConfirmationRequest = async email => {
  if (!email) {
    return { valid: false, error: 'missing.email' };
  }

  if (!isValidEmail(email)) {
    return { valid: false, error: 'wrong.email' };
  }

  const user = await strapi.query('user', 'users-permissions').findOne({ email: email.toLowerCase() });

  if (!user) {
    return { valid: false, error: 'user.not.found' };
  }

  if (user.confirmed) {
    return { valid: false, error: 'already.confirmed' };
  }

  if (user.blocked) {
    return { valid: false, error: 'blocked.user' };
  }

  return { valid: true, user };
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore();

    if (provider === 'local') {
      const isEnabled = await validateLocalProviderEnabled(store);
      if (!isEnabled) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }
      return handleLocalAuth(ctx, params, store);
    } else {
      const isEnabled = await validateProviderEnabled(store, provider);
      if (!isEnabled) {
        return ctx.badRequest(null, formatError({ id: 'provider.disabled', message: 'This provider is disabled.' }));
      }
      return handleProviderAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);
    const validation = validateResetPasswordParams(params);

    if (!validation.valid) {
      return ctx.badRequest(null, formatError(validation.error));
    }

    const user = await strapi.query('user', 'users-permissions').findOne({ resetPasswordToken: `${params.code}` });

    if (!user) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.code.provide', message: 'Incorrect code provided.' }));
    }

    const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
      password: params.password,
    });

    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken: null, password });

    ctx.send(buildUserResponse(user));
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
    grantConfig[provider].redirect_uri = strapi.plugins['users-permissions'].services.providers.buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    if (!isValidEmail(email)) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.email.format', message: 'Please provide a valid email address.' }));
    }

    email = email.toLowerCase();
    const validation = await validateForgotPasswordEmail(email);

    if (!validation.valid) {
      return ctx.badRequest(null, formatError(validation.error));
    }

    const user = validation.user;
    const pluginStore = await getPluginStore();
    const resetPasswordToken = crypto.randomBytes(64).toString('hex');
    const settings = await getForgotPasswordEmailSettings(pluginStore);
    const advanced = await pluginStore.get({ key: 'advanced' });

    try {
      await sendForgotPasswordEmail(user, settings, resetPasswordToken, advanced);
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
      return ctx.badRequest(null, formatError({ id: 'Auth.advanced.allow_register', message: 'Register action is currently disabled.' }));
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    const paramValidation = validateRegistrationParams(params);
    if (!paramValidation.valid) {
      return ctx.badRequest(null, formatError(paramValidation.error));
    }

    const role = await strapi.query('role', 'users-permissions').findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.role.notFound', message: 'Impossible to find the default role.' }));
    }

    params.email = params.email.toLowerCase();
    const existingUserCheck = await checkExistingUserByEmail(params.email, params.provider, settings);

    if (existingUserCheck.exists) {
      return ctx.badRequest(null, formatError(existingUserCheck.error));
    }

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);
      const sanitizedUser = sanitizeEntity(user, {
        model: strapi.query('user', 'users-permissions').model,
      });

      const confirmationResult = await handleConfirmationEmail(ctx, user, settings, sanitizedUser);
      if (confirmationResult) {
        return confirmationResult;
      }

      const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

      return ctx.send({
        jwt,
        user: sanitizedUser,
      });
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

    const validation = await validateConfirmationToken(confirmationToken);
    if (!validation.valid) {
      return ctx.badRequest('token.invalid');
    }

    const user = validation.user;
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
    const validation = await validateSendEmailConfirmationRequest(params.email);

    if (!validation.valid) {
      return ctx.badRequest(validation.error);
    }

    const user = validation.user;

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