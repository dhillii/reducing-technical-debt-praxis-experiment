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

/**
 * Formats error into standardized response structure
 * @param {Object} error - Error object with id, message, field
 * @returns {Array} Formatted error array
 */
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

/**
 * Checks if email is valid format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
const isValidEmail = email => emailRegExp.test(email);

/**
 * Checks if provider is enabled in grant config
 * @param {Object} grantConfig - Grant configuration object
 * @param {string} provider - Provider name
 * @returns {boolean} True if provider is enabled
 */
const isProviderEnabled = (grantConfig, provider) => {
  return _.get(grantConfig, [provider, 'enabled']);
};

/**
 * Checks if email provider is enabled
 * @param {Object} grantConfig - Grant configuration object
 * @returns {boolean} True if email provider is enabled
 */
const isEmailProviderEnabled = grantConfig => {
  return _.get(grantConfig, 'email.enabled');
};

/**
 * Checks if user account requires email confirmation
 * @param {Object} store - Plugin store
 * @param {Object} user - User object
 * @returns {Promise<boolean>} True if confirmation required and not confirmed
 */
const requiresEmailConfirmation = async (store, user) => {
  const advanced = await store.get({ key: 'advanced' });
  return _.get(advanced, 'email_confirmation') && user.confirmed !== true;
};

/**
 * Checks if user is blocked
 * @param {Object} user - User object
 * @returns {boolean} True if user is blocked
 */
const isUserBlocked = user => user.blocked === true;

/**
 * Checks if user has local password set
 * @param {Object} user - User object
 * @returns {boolean} True if user has password
 */
const hasLocalPassword = user => !!user.password;

/**
 * Builds user query based on identifier type
 * @param {string} identifier - Email or username
 * @param {string} provider - Provider name
 * @returns {Object} Query object
 */
const buildUserQuery = (identifier, provider) => {
  const query = { provider };
  if (isValidEmail(identifier)) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  return query;
};

/**
 * Sanitizes and returns user with JWT
 * @param {Object} user - User object
 * @param {Object} ctx - Koa context
 * @returns {Object} Response object with jwt and user
 */
const buildAuthResponse = (user, ctx) => {
  return {
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  };
};

/**
 * Validates local provider login
 * @param {Object} ctx - Koa context
 * @param {Object} store - Plugin store
 * @returns {Promise<void>}
 */
const handleLocalCallback = async (ctx, store) => {
  const params = ctx.request.body;

  if (!isEmailProviderEnabled(await store.get({ key: 'grant' }))) {
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

  const query = buildUserQuery(params.identifier, 'local');
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

  if (await requiresEmailConfirmation(store, user)) {
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

  ctx.send(buildAuthResponse(user, ctx));
};

/**
 * Handles third-party provider callback
 * @param {Object} ctx - Koa context
 * @param {string} provider - Provider name
 * @param {Object} store - Plugin store
 * @returns {Promise<void>}
 */
const handleProviderCallback = async (ctx, provider, store) => {
  const grantConfig = await store.get({ key: 'grant' });

  if (!isProviderEnabled(grantConfig, provider)) {
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

  ctx.send(buildAuthResponse(user, ctx));
};

/**
 * Validates reset password parameters
 * @param {Object} params - Request parameters
 * @returns {boolean} True if all required fields are present and valid
 */
const isValidResetPasswordRequest = params => {
  return params.password && params.passwordConfirmation && params.code;
};

/**
 * Checks if passwords match
 * @param {string} password - Password
 * @param {string} confirmation - Password confirmation
 * @returns {boolean} True if passwords match
 */
const passwordsMatch = (password, confirmation) => password === confirmation;

/**
 * Handles password reset logic
 * @param {Object} ctx - Koa context
 * @param {Object} params - Request parameters
 * @returns {Promise<void>}
 */
const processPasswordReset = async (ctx, params) => {
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

  ctx.send(buildAuthResponse(user, ctx));
};

/**
 * Validates email format and returns normalized email
 * @param {string} email - Email to validate
 * @returns {Promise<string|null>} Normalized email or null if invalid
 */
const validateAndNormalizeEmail = async (email, ctx) => {
  if (!isValidEmail(email)) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      })
    );
    return null;
  }
  return email.toLowerCase();
};

/**
 * Checks if user exists and is not blocked
 * @param {Object} user - User object
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if user is valid for password reset
 */
const isValidUserForPasswordReset = (user, ctx) => {
  if (!user) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.user.not-exist',
        message: 'This email does not exist.',
      })
    );
    return false;
  }

  if (user.blocked) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.user.blocked',
        message: 'This user is disabled.',
      })
    );
    return false;
  }

  return true;
};

/**
 * Builds email from address
 * @param {Object} from - From object with email and name
 * @returns {string|undefined} Formatted from address
 */
const buildFromAddress = from => {
  return from.email || from.name ? `${from.name} <${from.email}>` : undefined;
};

/**
 * Checks if registration is allowed
 * @param {Object} settings - Advanced settings
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if registration is allowed
 */
const isRegistrationAllowed = (settings, ctx) => {
  if (!settings.allow_register) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.advanced.allow_register',
        message: 'Register action is currently disabled.',
      })
    );
    return false;
  }
  return true;
};

/**
 * Validates required registration fields
 * @param {Object} params - Request parameters
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if all required fields present
 */
const validateRegistrationFields = (params, ctx) => {
  if (!params.password) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      })
    );
    return false;
  }

  if (!params.email) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      })
    );
    return false;
  }

  return true;
};

/**
 * Checks if password has invalid format
 * @param {string} password - Password to check
 * @returns {boolean} True if password is invalid
 */
const hasInvalidPasswordFormat = password => {
  return strapi.plugins['users-permissions'].services.user.isHashed(password);
};

/**
 * Validates email format for registration
 * @param {Object} params - Request parameters
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if email is valid
 */
const validateRegistrationEmail = (params, ctx) => {
  if (!isValidEmail(params.email)) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      })
    );
    return false;
  }
  return true;
};

/**
 * Checks if email is already taken
 * @param {Object} user - Existing user
 * @param {Object} params - Request parameters
 * @param {Object} settings - Advanced settings
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if email conflict exists
 */
const hasEmailConflict = (user, params, settings, ctx) => {
  if (user && user.provider === params.provider) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      })
    );
    return true;
  }

  if (user && user.provider !== params.provider && settings.unique_email) {
    ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      })
    );
    return true;
  }

  return false;
};

/**
 * Determines error message for registration failure
 * @param {Error} err - Error object
 * @returns {Object} Error details
 */
const getRegistrationErrorMessage = err => {
  return _.includes(err.message, 'username')
    ? {
        id: 'Auth.form.error.username.taken',
        message: 'Username already taken',
      }
    : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };
};

/**
 * Checks if confirmation token is valid
 * @param {string} token - Confirmation token
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if token is valid
 */
const isValidConfirmationToken = (token, ctx) => {
  if (_.isEmpty(token)) {
    ctx.badRequest('token.invalid');
    return false;
  }
  return true;
};

/**
 * Checks if user email is already confirmed
 * @param {Object} user - User object
 * @param {Object} ctx - Koa context
 * @returns {boolean} True if already confirmed
 */
const isUserAlreadyConfirmed = (user, ctx) => {
  if (user.confirmed) {
    ctx.badRequest('already.confirmed');
    return true;
  }
  return false;
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';

    const store = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    if (provider === 'local') {
      return handleLocalCallback(ctx, store);
    }

    return handleProviderCallback(ctx, provider, store);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (!isValidResetPasswordRequest(params)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.params.provide',
          message: 'Incorrect params provided.',
        })
      );
    }

    if (!passwordsMatch(params.password, params.passwordConfirmation)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    }

    return processPasswordReset(ctx, params);
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

    if (!isProviderEnabled(grantConfig, provider)) {
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

    const normalizedEmail = await validateAndNormalizeEmail(email, ctx);
    if (!normalizedEmail) {
      return;
    }
    email = normalizedEmail;

    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: email.toLowerCase() });

    if (!isValidUserForPasswordReset(user, ctx)) {
      return;
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
        from: buildFromAddress(settings.from),
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

    const settings = await pluginStore.get({
      key: 'advanced',
    });

    if (!isRegistrationAllowed(settings, ctx)) {
      return;
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    if (!validateRegistrationFields(params, ctx)) {
      return;
    }

    if (hasInvalidPasswordFormat(params.password)) {
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

    if (!validateRegistrationEmail(params, ctx)) {
      return;
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (hasEmailConflict(user, params, settings, ctx)) {
      return;
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const createdUser = await strapi.query('user', 'users-permissions').create(params);

      const sanitizedUser = sanitizeEntity(createdUser, {
        model: strapi.query('user', 'users-permissions').model,
      });

      if (settings.email_confirmation) {
        try {
          await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(createdUser);
        } catch (err) {
          return ctx.badRequest(null, err);
        }

        return ctx.send({ user: sanitizedUser });
      }

      const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(createdUser, ['id']));

      return ctx.send({
        jwt,
        user: sanitizedUser,
      });
    } catch (err) {
      const adminError = getRegistrationErrorMessage(err);
      ctx.badRequest(null, formatError(adminError));
    }
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

    if (!isValidConfirmationToken(confirmationToken, ctx)) {
      return;
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

    if (!isValidEmail(params.email)) {
      return ctx.badRequest('wrong.email');
    }

    params.email = params.email.toLowerCase();

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (isUserAlreadyConfirmed(user, ctx)) {
      return;
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
```