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

// Helper: Validate local provider is enabled
const validateLocalProviderEnabled = async (store) => {
  return _.get(await store.get({ key: 'grant' }), 'email.enabled');
};

// Helper: Validate third-party provider is enabled
const validateProviderEnabled = async (store, provider) => {
  return _.get(await store.get({ key: 'grant' }), [provider, 'enabled']);
};

// Helper: Build user query for local authentication
const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  const isEmail = validateEmailFormat(identifier);
  
  if (isEmail) {
    query.email = identifier.toLowerCase();
  } else {
    query.username = identifier;
  }
  
  return query;
};

// Helper: Validate local authentication parameters
const validateLocalAuthParams = (params) => {
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

// Helper: Validate user account status
const validateUserStatus = async (user, store) => {
  if (!user) {
    return {
      valid: false,
      error: formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      }),
    };
  }

  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
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
        message: 'This user never set a local password, please login with the provider used during account creation.',
      }),
    };
  }

  return { valid: true };
};

// Helper: Validate password
const validatePassword = async (inputPassword, userPassword) => {
  return strapi.plugins['users-permissions'].services.user.validatePassword(
    inputPassword,
    userPassword
  );
};

// Helper: Handle local authentication
const handleLocalAuth = async (ctx, params, store) => {
  const paramValidation = validateLocalAuthParams(params);
  if (!paramValidation.valid) {
    return ctx.badRequest(null, paramValidation.error);
  }

  const query = buildUserQuery(params.identifier);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  const statusValidation = await validateUserStatus(user, store);
  if (!statusValidation.valid) {
    return ctx.badRequest(null, statusValidation.error);
  }

  const validPassword = await validatePassword(params.password, user.password);
  if (!validPassword) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.invalid',
        message: 'Identifier or password invalid.',
      })
    );
  }

  sendUserWithJwt(ctx, user);
};

// Helper: Handle third-party provider authentication
const handleProviderAuth = async (ctx, provider, store) => {
  if (!await validateProviderEnabled(store, provider)) {
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

  sendUserWithJwt(ctx, user);
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

// Helper: Hash and update password
const updateUserPassword = async (userId, newPassword) => {
  const hashedPassword = await strapi.plugins['users-permissions'].services.user.hashPassword({
    password: newPassword,
  });

  await strapi.query('user', 'users-permissions').update(
    { id: userId },
    { resetPasswordToken: null, password: hashedPassword }
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
  const user = await strapi.query('user', 'users-permissions').findOne({ email });

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

// Helper: Get default role
const getDefaultRole = async (defaultRoleType) => {
  return strapi.query('role', 'users-permissions').findOne({ type: defaultRoleType }, []);
};

// Helper: Prepare registration parameters
const prepareRegistrationParams = async (params) => {
  const preparedParams = {
    ..._.omit(params, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
    provider: 'local',
  };

  const emailValidation = validateAndNormalizeEmail(preparedParams.email);
  if (!emailValidation.valid) {
    return { valid: false, error: emailValidation.error };
  }

  preparedParams.email = emailValidation.email;
  preparedParams.password = await strapi.plugins['users-permissions'].services.user.hashPassword(preparedParams);

  return { valid: true, params: preparedParams };
};

// Helper: Create user and handle confirmation
const createUserAndHandleConfirmation = async (ctx, user, settings) => {
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
  return ctx.send({ jwt, user: sanitizedUser });
};

// Helper: Get email settings for password reset
const getPasswordResetEmailSettings = async (pluginStore, user) => {
  const settings = await pluginStore.get({ key: 'email' }).then(storeEmail => {
    try {
      return storeEmail['reset_password'].options;
    } catch (error) {
      return {};
    }
  });

  const advanced = await pluginStore.get({ key: 'advanced' });
  const userInfo = sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

  const resetPasswordToken = crypto.randomBytes(64).toString('hex');

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

  return { settings, resetPasswordToken };
};

// Helper: Send password reset email
const sendPasswordResetEmail = async (user, settings) => {
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
const validateConfirmationToken = (confirmationToken) => {
  if (_.isEmpty(confirmationToken)) {
    return { valid: false };
  }
  return { valid: true };
};

// Helper: Validate user for email confirmation
const validateUserForConfirmation = async (confirmationToken) => {
  const user = await strapi.plugins['users-permissions'].services.user.fetch(
    { confirmationToken },
    []
  );

  if (!user) {
    return { valid: false };
  }

  return { valid: true, user };
};

// Helper: Handle email confirmation redirect
const handleConfirmationRedirect = async (ctx) => {
  const settings = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    })
    .get();

  ctx.redirect(settings.email_confirmation_redirection || '/');
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

// Helper: Validate user for email confirmation request
const validateUserForEmailConfirmationRequest = (user) => {
  if (!user) {
    return { valid: false, error: 'user.not.found' };
  }

  if (user.confirmed) {
    return { valid: false, error: 'already.confirmed' };
  }

  if (user.blocked) {
    return { valid: false, error: 'blocked.user' };
  }

  return { valid: true };
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore();

    if (provider === 'local') {
      if (!await validateLocalProviderEnabled(store)) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }
      return handleLocalAuth(ctx, params, store);
    } else {
      return handleProviderAuth(ctx, provider, store);
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);
    const paramValidation = validateResetPasswordParams(params);

    if (!paramValidation.valid) {
      if (paramValidation.type === 'mismatch') {
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
    }

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ resetPasswordToken: `${params.code}` });

    if (!user) {
      return ctx.badRequest(
        null,