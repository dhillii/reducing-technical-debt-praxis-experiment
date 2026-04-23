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
 * Checks if email is valid format
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => emailRegExp.test(email);

/**
 * Checks if local provider is enabled
 * @param {object} grantConfig
 * @returns {boolean}
 */
const isLocalProviderEnabled = (grantConfig) => _.get(grantConfig, 'email.enabled');

/**
 * Checks if external provider is enabled
 * @param {object} grantConfig
 * @param {string} provider
 * @returns {boolean}
 */
const isExternalProviderEnabled = (grantConfig, provider) => _.get(grantConfig, [provider, 'enabled']);

/**
 * Checks if email confirmation is required
 * @param {object} advancedSettings
 * @param {object} user
 * @returns {boolean}
 */
const isEmailConfirmationRequired = (advancedSettings, user) => 
  _.get(advancedSettings, 'email_confirmation') && user.confirmed !== true;

/**
 * Checks if user is blocked
 * @param {object} user
 * @returns {boolean}
 */
const isUserBlocked = (user) => user.blocked === true;

/**
 * Checks if user has local password
 * @param {object} user
 * @returns {boolean}
 */
const hasLocalPassword = (user) => !!user.password;

/**
 * Checks if passwords match
 * @param {string} password
 * @param {string} passwordConfirmation
 * @returns {boolean}
 */
const passwordsMatch = (password, passwordConfirmation) => password === passwordConfirmation;

/**
 * Checks if reset password params are valid
 * @param {object} params
 * @returns {boolean}
 */
const isValidResetPasswordRequest = (params) =>
  params.password && params.passwordConfirmation && params.code && passwordsMatch(params.password, params.passwordConfirmation);

/**
 * Checks if password and confirmation are provided but don't match
 * @param {object} params
 * @returns {boolean}
 */
const isPasswordMismatch = (params) =>
  params.password && params.passwordConfirmation && !passwordsMatch(params.password, params.passwordConfirmation);

/**
 * Sanitizes user entity
 * @param {object} user
 * @returns {object}
 */
const sanitizeUser = (user) => sanitizeEntity(user.toJSON ? user.toJSON() : user, {
  model: strapi.query('user', 'users-permissions').model,
});

/**
 * Issues JWT and returns user response
 * @param {object} user
 * @returns {object}
 */
const buildAuthResponse = (user) => ({
  jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
  user: sanitizeUser(user),
});

/**
 * Handles local provider authentication
 * @param {object} ctx
 * @param {object} params
 * @param {object} store
 * @returns {Promise<void>}
 */
const handleLocalAuth = async (ctx, params, store) => {
  if (!isLocalProviderEnabled(await store.get({ key: 'grant' }))) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

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

  const query = { provider: 'local' };
  const isEmail = isValidEmail(params.identifier);

  if (isEmail) {
    query.email = params.identifier.toLowerCase();
  } else {
    query.username = params.identifier;
  }

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

  const advancedSettings = await store.get({ key: 'advanced' });
  if (isEmailConfirmationRequired(advancedSettings, user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      })
    );
  }

  if (isUserBlocked(user)) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      })
    );
  }

  if (!hasLocalPassword(user)) {
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

  ctx.send(buildAuthResponse(user));
};

/**
 * Handles external provider authentication
 * @param {object} ctx
 * @param {object} store
 * @param {string} provider
 * @returns {Promise<void>}
 */
const handleExternalAuth = async (ctx, store, provider) => {
  const grantConfig = await store.get({ key: 'grant' });

  if (!isExternalProviderEnabled(grantConfig, provider)) {
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

  ctx.send(buildAuthResponse(user));
};

/**
 * Validates reset password request parameters
 * @param {object} params
 * @returns {object|null}
 */
const validateResetPasswordParams = (params) => {
  if (isValidResetPasswordRequest(params)) {
    return null;
  }

  if (isPasswordMismatch(params)) {
    return formatError({
      id: 'Auth.form.error.password.matching',
      message: 'Passwords do not match.',
    });
  }

  return formatError({
    id: 'Auth.form.error.params.provide',
    message: 'Incorrect params provided.',
  });
};

/**
 * Validates email format
 * @param {string} email
 * @returns {object|null}
 */
const validateEmailFormat = (email) => {
  if (!isValidEmail(email)) {
    return formatError({
      id: 'Auth.form.error.email.format',
      message: 'Please provide a valid email address.',
    });
  }
  return null;
};

/**
 * Checks if user exists with same email and provider
 * @param {object} user
 * @param {string} provider
 * @returns {boolean}
 */
const userExistsWithProvider = (user, provider) => user && user.provider === provider;

/**
 * Checks if email is already taken by another provider
 * @param {object} user
 * @param {string} provider
 * @param {boolean} uniqueEmail
 * @returns {boolean}
 */
const emailTakenByOtherProvider = (user, provider, uniqueEmail) =>
  user && user.provider !== provider && uniqueEmail;

/**
 * Builds email configuration for forgot password
 * @param {object} settings
 * @param {object} userInfo
 * @param {string} resetPasswordToken
 * @param {object} advanced
 * @returns {Promise<object>}
 */
const buildEmailConfig = async (settings, userInfo, resetPasswordToken, advanced) => {
  const message = await strapi.plugins['users-permissions'].services.userspermissions.template(
    settings.message,
    {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetPasswordToken,
    }
  );

  const object = await strapi.plugins['users-permissions'].services.userspermissions.template(
    settings.object,
    {
      USER: userInfo,
    }
  );

  return {
    to: userInfo.email,
    from:
      settings.from.email || settings.from.name
        ? `${settings.from.name} <${settings.from.email}>`
        : undefined,
    replyTo: settings.response_email,
    subject: object,
    text: message,
    html: message,
  };
};

/**
 * Checks if user can register
 * @param {boolean} allowRegister
 * @returns {object|null}
 */
const validateRegistrationAllowed = (allowRegister) => {
  if (!allowRegister) {
    return formatError({
      id: 'Auth.advanced.allow_register',
      message: 'Register action is currently disabled.',
    });
  }
  return null;
};

/**
 * Validates registration parameters
 * @param {object} params
 * @returns {object|null}
 */
const validateRegistrationParams = (params) => {
  if (!params.password) {
    return formatError({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    });
  }

  if (!params.email) {
    return formatError({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your email.',
    });
  }

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    return formatError({
      id: 'Auth.form.error.password.format',
      message: 'Your password cannot contain more than three times the symbol `$`.',
    });
  }

  return null;
};

/**
 * Validates email format for registration
 * @param {string} email
 * @returns {object|null}
 */
const validateRegistrationEmail = (email) => {
  if (!isValidEmail(email)) {
    return formatError({
      id: 'Auth.form.error.email.format',
      message: 'Please provide valid email address.',
    });
  }
  return null;
};

/**
 * Checks if role exists
 * @param {object} role
 * @returns {object|null}
 */
const validateRoleExists = (role) => {
  if (!role) {
    return formatError({
      id: 'Auth.form.error.role.notFound',
      message: 'Impossible to find the default role.',
    });
  }
  return null;
};

/**
 * Checks if email is already taken
 * @param {object} user
 * @param {string} provider
 * @param {boolean} uniqueEmail
 * @returns {object|null}
 */
const validateEmailNotTaken = (user, provider, uniqueEmail) => {
  if (userExistsWithProvider(user, provider)) {
    return formatError({
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    });
  }

  if (emailTakenByOtherProvider(user, provider, uniqueEmail)) {
    return formatError({
      id: 'Auth.form.error.email.taken',
      message: 'Email is already taken.',
    });
  }

  return null;
};

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
      return handleLocalAuth(ctx, params, store);
    }

    return handleExternalAuth(ctx, store, provider);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validationError = validateResetPasswordParams(params);
    if (validationError) {
      return ctx.badRequest(null, validationError);
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

    ctx.send(buildAuthResponse(user));
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

    const emailValidationError = validateEmailFormat(email);
    if (emailValidationError) {
      return ctx.badRequest(null, emailValidationError);
    }

    email = email.toLowerCase();

    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: email.toLowerCase() });

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

    const advanced = await pluginStore.get({
      key: 'advanced',
    });

    const userInfo = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    const emailConfig = await buildEmailConfig(settings, userInfo, resetPasswordToken, advanced);

    try {
      await strapi.plugins['email'].services.email.send(emailConfig);
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

    const settings = await pluginStore.get({
      key: 'advanced',
    });

    const registrationError = validateRegistrationAllowed(settings.allow_register);
    if (registrationError) {
      return ctx.badRequest(null, registrationError);
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    const paramsError = validateRegistrationParams(params);
    if (paramsError) {
      return ctx.badRequest(null, paramsError);
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    const roleError = validateRoleExists(role);
    if (roleError) {
      return ctx.badRequest(null, roleError);
    }

    const emailError = validateRegistrationEmail(params.email);
    if (emailError) {
      return ctx.badRequest(null, emailError);
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    const emailTakenError = validateEmailNotTaken(existingUser, params.provider, settings.unique_email);
    if (emailTakenError) {
      return ctx.badRequest(null, emailTakenError);
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

    const emailError = validateEmailFormat(params.email);
    if (emailError) {
      return ctx.badRequest('wrong.email');
    }

    params.email = params.email.toLowerCase();

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