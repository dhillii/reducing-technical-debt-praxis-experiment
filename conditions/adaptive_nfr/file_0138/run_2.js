```javascript
'use strict';

const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const EMAIL_REGEXP = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

// ============================================================================
// UTILITIES
// ============================================================================

const formatError = (error) => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

const getPluginStore = () =>
  strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

const getUserService = () => strapi.plugins['users-permissions'].services.user;
const getJwtService = () => strapi.plugins['users-permissions'].services.jwt;
const getProvidersService = () => strapi.plugins['users-permissions'].services.providers;
const getUsersPermissionsService = () => strapi.plugins['users-permissions'].services.userspermissions;

const sanitizeUser = (user) =>
  sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: strapi.query('user', 'users-permissions').model,
  });

const isValidEmail = (email) => EMAIL_REGEXP.test(email);

const normalizeEmail = (email) => email.toLowerCase();

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

const ERRORS = {
  PROVIDER_DISABLED: {
    id: 'provider.disabled',
    message: 'This provider is disabled.',
  },
  INVALID_CREDENTIALS: {
    id: 'Auth.form.error.invalid',
    message: 'Identifier or password invalid.',
  },
  EMAIL_REQUIRED: {
    id: 'Auth.form.error.email.provide',
    message: 'Please provide your email.',
  },
  IDENTIFIER_REQUIRED: {
    id: 'Auth.form.error.email.provide',
    message: 'Please provide your username or your e-mail.',
  },
  PASSWORD_REQUIRED: {
    id: 'Auth.form.error.password.provide',
    message: 'Please provide your password.',
  },
  EMAIL_NOT_CONFIRMED: {
    id: 'Auth.form.error.confirmed',
    message: 'Your account email is not confirmed',
  },
  ACCOUNT_BLOCKED: {
    id: 'Auth.form.error.blocked',
    message: 'Your account has been blocked by an administrator',
  },
  NO_LOCAL_PASSWORD: {
    id: 'Auth.form.error.password.local',
    message: 'This user never set a local password, please login with the provider used during account creation.',
  },
  PASSWORDS_MISMATCH: {
    id: 'Auth.form.error.password.matching',
    message: 'Passwords do not match.',
  },
  INVALID_CODE: {
    id: 'Auth.form.error.code.provide',
    message: 'Incorrect code provided.',
  },
  INVALID_PARAMS: {
    id: 'Auth.form.error.params.provide',
    message: 'Incorrect params provided.',
  },
  INVALID_EMAIL_FORMAT: {
    id: 'Auth.form.error.email.format',
    message: 'Please provide a valid email address.',
  },
  USER_NOT_FOUND: {
    id: 'Auth.form.error.user.not-exist',
    message: 'This email does not exist.',
  },
  USER_BLOCKED: {
    id: 'Auth.form.error.user.blocked',
    message: 'This user is disabled.',
  },
  REGISTER_DISABLED: {
    id: 'Auth.advanced.allow_register',
    message: 'Register action is currently disabled.',
  },
  PASSWORD_FORMAT_INVALID: {
    id: 'Auth.form.error.password.format',
    message: 'Your password cannot contain more than three times the symbol `$`.',
  },
  ROLE_NOT_FOUND: {
    id: 'Auth.form.error.role.notFound',
    message: 'Impossible to find the default role.',
  },
  EMAIL_TAKEN: {
    id: 'Auth.form.error.email.taken',
    message: 'Email is already taken.',
  },
  USERNAME_TAKEN: {
    id: 'Auth.form.error.username.taken',
    message: 'Username already taken',
  },
  TOKEN_INVALID: 'token.invalid',
  MISSING_EMAIL: 'missing.email',
  WRONG_EMAIL: 'wrong.email',
  ALREADY_CONFIRMED: 'already.confirmed',
  BLOCKED_USER: 'blocked.user',
};

// ============================================================================
// LOCAL AUTH HELPERS
// ============================================================================

const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  if (isValidEmail(identifier)) {
    query.email = normalizeEmail(identifier);
  } else {
    query.username = identifier;
  }
  return query;
};

const validateLocalAuthInput = (params) => {
  if (!params.identifier) {
    return formatError(ERRORS.IDENTIFIER_REQUIRED);
  }
  if (!params.password) {
    return formatError(ERRORS.PASSWORD_REQUIRED);
  }
  return null;
};

const validateUserStatus = async (user, store) => {
  const advanced = await store.get({ key: 'advanced' });
  
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return formatError(ERRORS.EMAIL_NOT_CONFIRMED);
  }
  
  if (user.blocked === true) {
    return formatError(ERRORS.ACCOUNT_BLOCKED);
  }
  
  if (!user.password) {
    return formatError(ERRORS.NO_LOCAL_PASSWORD);
  }
  
  return null;
};

const authenticateLocalUser = async (user, password) => {
  const isValid = await getUserService().validatePassword(password, user.password);
  return isValid ? null : formatError(ERRORS.INVALID_CREDENTIALS);
};

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: getJwtService().issue({ id: user.id }),
    user: sanitizeUser(user),
  });
};

// ============================================================================
// OAUTH HELPERS
// ============================================================================

const connectOAuthProvider = async (provider, query) => {
  try {
    const [user, error] = await getProvidersService().connect(provider, query);
    return { user, error };
  } catch (err) {
    return { user: null, error: err };
  }
};

// ============================================================================
// PASSWORD RESET HELPERS
// ============================================================================

const validateResetPasswordInput = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return formatError(ERRORS.INVALID_PARAMS);
  }
  
  if (params.password !== params.passwordConfirmation) {
    return formatError(ERRORS.PASSWORDS_MISMATCH);
  }
  
  return null;
};

// ============================================================================
// REGISTRATION HELPERS
// ============================================================================

const validateRegistrationInput = (params) => {
  if (!params.password) {
    return formatError(ERRORS.PASSWORD_REQUIRED);
  }
  
  if (!params.email) {
    return formatError(ERRORS.EMAIL_REQUIRED);
  }
  
  if (!isValidEmail(params.email)) {
    return formatError(ERRORS.INVALID_EMAIL_FORMAT);
  }
  
  if (getUserService().isHashed(params.password)) {
    return formatError(ERRORS.PASSWORD_FORMAT_INVALID);
  }
  
  return null;
};

const checkEmailAvailability = async (email, provider, uniqueEmailRequired) => {
  const existingUser = await strapi.query('user', 'users-permissions').findOne({ email });
  
  if (existingUser && existingUser.provider === provider) {
    return formatError(ERRORS.EMAIL_TAKEN);
  }
  
  if (existingUser && existingUser.provider !== provider && uniqueEmailRequired) {
    return formatError(ERRORS.EMAIL_TAKEN);
  }
  
  return null;
};

const prepareRegistrationParams = async (params, roleId) => {
  return {
    ..._.omit(params, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
    provider: 'local',
    role: roleId,
    email: normalizeEmail(params.email),
    password: await getUserService().hashPassword(params),
  };
};

const handleRegistrationError = (err) => {
  const isUsernameTaken = _.includes(err.message, 'username');
  return formatError(isUsernameTaken ? ERRORS.USERNAME_TAKEN : ERRORS.EMAIL_TAKEN);
};

// ============================================================================
// EMAIL HELPERS
// ============================================================================

const prepareEmailSettings = async (store, templateKey, templateData) => {
  const emailConfig = await store.get({ key: 'email' });
  const settings = emailConfig?.[templateKey]?.options || {};
  
  if (templateData) {
    const usersPermissionsService = getUsersPermissionsService();
    settings.message = await usersPermissionsService.template(settings.message, templateData);
    settings.object = await usersPermissionsService.template(settings.object, templateData);
  }
  
  return settings;
};

const buildEmailFrom = (settings) => {
  if (!settings.from) return undefined;
  const { email, name } = settings.from;
  return email || name ? `${name} <${email}>` : undefined;
};

// ============================================================================
// CONTROLLERS
// ============================================================================

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore();

    if (provider === 'local') {
      if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
        return ctx.badRequest(null, formatError(ERRORS.PROVIDER_DISABLED));
      }

      const inputError = validateLocalAuthInput(params);
      if (inputError) return ctx.badRequest(null, inputError);

      const query = buildUserQuery(params.identifier);
      const user = await strapi.query('user', 'users-permissions').findOne(query);

      if (!user) {
        return ctx.badRequest(null, formatError(ERRORS.INVALID_CREDENTIALS));
      }

      const statusError = await validateUserStatus(user, store);
      if (statusError) return ctx.badRequest(null, statusError);

      const authError = await authenticateLocalUser(user, params.password);
      if (authError) return ctx.badRequest(null, authError);

      return sendAuthResponse(ctx, user);
    }

    // OAuth Provider Flow
    if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
      return ctx.badRequest(null, formatError(ERRORS.PROVIDER_DISABLED));
    }

    const { user, error } = await connectOAuthProvider(provider, ctx.query);

    if (!user) {
      const errorMessage = _.isArray(error) ? error[0] : error;
      return ctx.badRequest(null, errorMessage);
    }

    return sendAuthResponse(ctx, user);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const inputError = validateResetPasswordInput(params);
    if (inputError) return ctx.badRequest(null, inputError);

    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ resetPasswordToken: `${params.code}` });

    if (!user) {
      return ctx.badRequest(null, formatError(ERRORS.INVALID_CODE));
    }

    const hashedPassword = await getUserService().hashPassword({ password: params.password });

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken: null, password: hashedPassword });

    return sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const grantConfig = await getPluginStore().then((store) => store.get({ key: 'grant' }));

    const [requestPath] = ctx.request.url.split('?');
    const provider = requestPath.split('/')[2];

    if (!_.get(grantConfig[provider], 'enabled')) {
      return ctx.badRequest(null, formatError(ERRORS.PROVIDER_DISABLED));
    }

    if (!strapi.config.server.url.startsWith('http')) {
      strapi.log.warn(
        'You are using a third party provider for login. Make sure to set an absolute url in config/server.js. More info here: https://strapi.io/documentation/developer-docs/latest/development/plugins/users-permissions.html#setting-up-the-server-url'
      );
    }

    grantConfig[provider].callback = _.get(ctx, 'query.callback') || grantConfig[provider].callback;
    grantConfig[provider].redirect_uri = getProvidersService().buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    if (!isValidEmail(email)) {
      return ctx.badRequest(null, formatError(ERRORS.INVALID_EMAIL_FORMAT));
    }

    email = normalizeEmail(email);
    const store = await getPluginStore();
    const user = await strapi.query('user', 'users-permissions').findOne({ email });

    if (!user) {
      return ctx.badRequest(null, formatError(ERRORS.USER_NOT_FOUND));
    }

    if (user.blocked) {
      return ctx.badRequest(null, formatError(ERRORS.USER_BLOCKED));
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');
    const advanced = await store.get({ key: 'advanced' });
    const userInfo = sanitizeUser(user);

    const settings = await prepareEmailSettings(store, 'reset_password', {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetPasswordToken,
    });

    try {
      await strapi.plugins['email'].services.email.send({
        to: user.email,
        from: buildEmailFrom(settings),
        replyTo: settings.response_email,
        subject: settings.object,
        text: settings.message,
        html: settings.message,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const store = await getPluginStore();
    const settings = await store.get({ key: 'advanced' });

    if (!settings.allow_register) {
      return ctx.badRequest(null, formatError(ERRORS.REGISTER_DISABLED));
    }

    const params = ctx.request.body;

    const inputError = validateRegistrationInput(params);
    if (inputError) return ctx.badRequest(null, inputError);

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(null, format