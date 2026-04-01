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

// Helper: Get plugin store
const getPluginStore = async () => {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

// Helper: Validate email format
const validateEmailFormat = (email) => {
  return emailRegExp.test(email);
};

// Helper: Sanitize and return user with JWT
const sendUserWithJwt = (ctx, user) => {
  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({
      id: user.id,
    }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

// Helper: Build local provider query
const buildLocalProviderQuery = (identifier) => {
  const query = { provider: 'local' };
  const isEmail = validateEmailFormat(identifier);
  
  if (isEmail) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  
  return query;
};

// Helper: Validate local login parameters
const validateLocalLoginParams = (params) => {
  if (!params.identifier) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your username or your e-mail.',
      }),
    };
  }

  if (!params.password) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Check user account status
const checkUserAccountStatus = async (user, store) => {
  if (!user) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  const emailConfirmationRequired = _.get(
    await store.get({ key: 'advanced' }),
    'email_confirmation'
  );

  if (emailConfirmationRequired && user.confirmed !== true) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.confirmed',
        message: 'Your account email is not confirmed',
      }),
    };
  }

  if (user.blocked === true) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.blocked',
        message: 'Your account has been blocked by an administrator',
      }),
    };
  }

  if (!user.password) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.local',
        message:
          'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate user password
const validateUserPassword = async (inputPassword, userPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    inputPassword,
    userPassword
  );
};

// Helper: Handle local provider authentication
const handleLocalAuth = async (ctx, params, store) => {
  const paramValidation = validateLocalLoginParams(params);
  if (!paramValidation.valid) {
    return ctx.badRequest(null, paramValidation.error);
  }

  const query = buildLocalProviderQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const statusCheck = await checkUserAccountStatus(user, store);
  if (!statusCheck.valid) {
    return ctx.badRequest(null, statusCheck.error);
  }

  const validPassword = await validateUserPassword(params.password, user.password);
  if (!validPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  return sendUserWithJwt(ctx, user);
};

// Helper: Handle third-party provider authentication
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

  return sendUserWithJwt(ctx, user);
};

// Helper: Validate reset password parameters
const validateResetPasswordParams = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return {
      valid: false,
      type: 'missing',
    };
  }

  if (params.password !== params.passwordConfirmation) {
    return {
      valid: false,
      type: 'mismatch',
    };
  }

  return { valid: true };
};

// Helper: Handle reset password validation errors
const handleResetPasswordError = (ctx, validationResult) => {
  if (validationResult.type === 'mismatch') {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.matching',
        message: 'Passwords do not match.',
      })
    );
  }

  return ctx.badRequest(
    null,
    formatError({
      id: 'Auth.form.error.params.provide',
      message: 'Incorrect params provided.',
    })
  );
};

// Helper: Validate registration parameters
const validateRegistrationParams = (params) => {
  if (!params.password) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.provide',
        message: 'Please provide your password.',
      }),
    };
  }

  if (!params.email) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.provide',
        message: 'Please provide your email.',
      }),
    };
  }

  if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.password.format',
        message: 'Your password cannot contain more than three times the symbol `$`.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate email and normalize
const validateAndNormalizeEmail = (email) => {
  if (!validateEmailFormat(email)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide valid email address.',
      }),
    };
  }

  return { valid: true, email: email.toLowerCase() };
};

// Helper: Check for existing user with email
const checkExistingUser = async (email, provider, settings) => {
  const user = await strapi.query('user', 'users-permissions').findOne({
    email,
  });

  if (user && user.provider === provider) {
    return {
      exists: true,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  if (user && user.provider !== provider && settings.unique_email) {
    return {
      exists: true,
      error: formatError({
        id: 'Auth.form.error.email.taken',
        message: 'Email is already taken.',
      }),
    };
  }

  return { exists: false };
};

// Helper: Get default role for registration
const getDefaultRole = async (defaultRoleType) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRoleType }, []);

  if (!role) {
    return {
      found: false,
      error: formatError({
        id: 'Auth.form.error.role.notFound',
        message: 'Impossible to find the default role.',
      }),
    };
  }

  return { found: true, role };
};

// Helper: Create user and handle confirmation
const createUserAndHandleConfirmation = async (ctx, params, settings) => {
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
};

// Helper: Prepare forgot password email settings
const prepareForgotPasswordEmailSettings = async (pluginStore, user, resetPasswordToken) => {
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

  return settings;
};

// Helper: Send forgot password email
const sendForgotPasswordEmail = async (user, settings) => {
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

// Helper: Validate forgot password email
const validateForgotPasswordEmail = (email) => {
  if (!validateEmailFormat(email)) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.email.format',
        message: 'Please provide a valid email address.',
      }),
    };
  }

  return { valid: true, email: email.toLowerCase() };
};

// Helper: Check user eligibility for forgot password
const checkUserEligibilityForForgotPassword = (user) => {
  if (!user) {
    return {
      eligible: false,
      error: formatError({
        id: 'Auth.form.error.user.not-exist',
        message: 'This email does not exist.',
      }),
    };
  }

  if (user.blocked) {
    return {
      eligible: false,
      error: formatError({
        id: 'Auth.form.error.user.blocked',
        message: 'This user is disabled.',
      }),
    };
  }

  return { eligible: true };
};

// Helper: Validate email confirmation token
const validateConfirmationToken = (confirmationToken) => {
  if (_.isEmpty(confirmationToken)) {
    return { valid: false };
  }
  return { valid: true };
};

// Helper: Validate send email confirmation parameters
const validateSendEmailConfirmationParams = (email) => {
  if (!email) {
    return { valid: false, error: 'missing.email' };
  }

  if (!validateEmailFormat(email)) {
    return { valid: false, error: 'wrong.email' };
  }

  return { valid: true, email: email.toLowerCase() };
};

// Helper: Check user eligibility for email confirmation
const checkUserEligibilityForEmailConfirmation = (user) => {
  if (user.confirmed) {
    return { eligible: false, error: 'already.confirmed' };
  }

  if (user.blocked) {
    return { eligible: false, error: 'blocked.user' };
  }

  return { eligible: true };
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore();

    if (provider === 'local') {
      if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      return handleLocalAuth(ctx, params, store);
    } else {
      return handleProviderAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);
    const validation = validateResetPasswordParams(params);

    if (!validation.valid) {
      return handleResetPasswordError(ctx, validation);
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

    return sendUserWithJwt(ctx, user);
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

    const emailValidation = validateForgotPasswordEmail(email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    email = emailValidation.email;
    const pluginStore = await getPluginStore();

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email });

    const eligibilityCheck = checkUserEligibilityForForgotPassword(user);
    if (!eligibilityCheck.eligible) {
      return ctx.badRequest(null, eligibilityCheck.error);
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    const settings = await prepareForgotPasswordEmailSettings(
      pluginStore,
      user,
      resetPasswordToken
    );

    try {
      await sendForgotPasswordEmail(user, settings);
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await getPluginStore();

    const settings = await pluginStore.get({
      key: 'advanced',
    });

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

    const paramValidation = validateRegistrationParams(params);
    if (!paramValidation.valid) {
      return ctx.badRequest(null, paramValidation.error);
    }

    const roleResult = await getDefaultRole(settings.default_role);
    if (!roleResult.found) {
      return ctx.badRequest(null, roleResult.error);
    }

    const emailValidation = validateAndNormalizeEmail(params.email);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, emailValidation.error);
    }

    params.email = emailValidation.email;

    const existingUserCheck = await checkExistingUser(params.email, params.provider, settings);
    if (existingUserCheck.exists) {
      return ctx.badRequest(null, existingUserCheck.error);
    }

    params.role = roleResult.role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    return createUserAndHandleConfirmation(ctx, params, settings);
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    const tokenValidation = validateConfirmationToken(confirmationToken);
    if (!tokenValidation.valid) {
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

    const paramValidation = validateSendEmailConfirmationParams(params.email);
    if (!paramValidation.valid) {
      return ctx.badRequest(paramValidation.error);
    }

    params.email = paramValidation.email;

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    const eligibilityCheck = checkUserEligibilityForEmailConfirmation(user);
    if (!eligibilityCheck.eligible) {
      return ctx.badRequest(eligibilityCheck.error);
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