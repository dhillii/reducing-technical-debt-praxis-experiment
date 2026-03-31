```javascript
'use strict';

const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');

const EMAIL_REGEXP = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

// ============================================================================
// Error Handling
// ============================================================================

const formatError = (error) => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

const ErrorMessages = {
  PROVIDER_DISABLED: {
    id: 'provider.disabled',
    message: 'This provider is disabled.',
  },
  EMAIL_REQUIRED: {
    id: 'Auth.form.error.email.provide',
    message: 'Please provide your username or your e-mail.',
  },
  PASSWORD_REQUIRED: {
    id: 'Auth.form.error.password.provide',
    message: 'Please provide your password.',
  },
  INVALID_CREDENTIALS: {
    id: 'Auth.form.error.invalid',
    message: 'Identifier or password invalid.',
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
  INVALID_RESET_CODE: {
    id: 'Auth.form.error.code.provide',
    message: 'Incorrect code provided.',
  },
  PASSWORD_MISMATCH: {
    id: 'Auth.form.error.password.matching',
    message: 'Passwords do not match.',
  },
  INVALID_PARAMS: {
    id: 'Auth.form.error.params.provide',
    message: 'Incorrect params provided.',
  },
  REGISTER_DISABLED: {
    id: 'Auth.advanced.allow_register',
    message: 'Register action is currently disabled.',
  },
  INVALID_PASSWORD_FORMAT: {
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
};

// ============================================================================
// Service Accessors
// ============================================================================

const getUserService = () => strapi.plugins['users-permissions'].services.user;
const getJwtService = () => strapi.plugins['users-permissions'].services.jwt;
const getProvidersService = () => strapi.plugins['users-permissions'].services.providers;
const getUsersPermissionsService = () => strapi.plugins['users-permissions'].services.userspermissions;
const getEmailService = () => strapi.plugins['email'].services.email;
const getUserQuery = () => strapi.query('user', 'users-permissions');
const getRoleQuery = () => strapi.query('role', 'users-permissions');

const getPluginStore = () => strapi.store({
  environment: '',
  type: 'plugin',
  name: 'users-permissions',
});

// ============================================================================
// Validation Helpers
// ============================================================================

const isValidEmail = (email) => EMAIL_REGEXP.test(email);

const normalizeEmail = (email) => email.toLowerCase();

const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  if (isValidEmail(identifier)) {
    query.email = normalizeEmail(identifier);
  } else {
    query.username = identifier;
  }
  return query;
};

const sanitizeUser = (user) => sanitizeEntity(user.toJSON ? user.toJSON() : user, {
  model: getUserQuery().model,
});

const issueJwt = (userId) => getJwtService().issue({ id: userId });

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: issueJwt(user.id),
    user: sanitizeUser(user),
  });
};

// ============================================================================
// Local Authentication
// ============================================================================

const validateLocalProvider = async (store) => {
  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return { valid: false, error: ErrorMessages.PROVIDER_DISABLED };
  }
  return { valid: true };
};

const validateLocalCredentials = (params) => {
  if (!params.identifier) {
    return { valid: false, error: ErrorMessages.EMAIL_REQUIRED };
  }
  if (!params.password) {
    return { valid: false, error: ErrorMessages.PASSWORD_REQUIRED };
  }
  return { valid: true };
};

const validateUserStatus = async (user, store) => {
  if (!user) {
    return { valid: false, error: ErrorMessages.INVALID_CREDENTIALS };
  }

  if (_.get(await store.get({ key: 'advanced' }), 'email_confirmation') && !user.confirmed) {
    return { valid: false, error: ErrorMessages.EMAIL_NOT_CONFIRMED };
  }

  if (user.blocked) {
    return { valid: false, error: ErrorMessages.ACCOUNT_BLOCKED };
  }

  if (!user.password) {
    return { valid: false, error: ErrorMessages.NO_LOCAL_PASSWORD };
  }

  return { valid: true };
};

const authenticateLocalUser = async (ctx, user, password) => {
  const isValid = await getUserService().validatePassword(password, user.password);
  if (!isValid) {
    return { authenticated: false, error: ErrorMessages.INVALID_CREDENTIALS };
  }
  return { authenticated: true };
};

const handleLocalAuth = async (ctx, params, store) => {
  const validation = validateLocalCredentials(params);
  if (!validation.valid) {
    return ctx.badRequest(null, formatError(validation.error));
  }

  const query = buildUserQuery(params.identifier);
  const user = await getUserQuery().findOne(query);

  const statusValidation = await validateUserStatus(user, store);
  if (!statusValidation.valid) {
    return ctx.badRequest(null, formatError(statusValidation.error));
  }

  const authResult = await authenticateLocalUser(ctx, user, params.password);
  if (!authResult.authenticated) {
    return ctx.badRequest(null, formatError(authResult.error));
  }

  sendAuthResponse(ctx, user);
};

// ============================================================================
// OAuth Authentication
// ============================================================================

const validateOAuthProvider = async (store, provider) => {
  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    return { valid: false, error: ErrorMessages.PROVIDER_DISABLED };
  }
  return { valid: true };
};

const connectOAuthProvider = async (provider, query) => {
  try {
    const [user, error] = await getProvidersService().connect(provider, query);
    if (!user) {
      return { success: false, error: Array.isArray(error) ? error[0] : error };
    }
    return { success: true, user };
  } catch (err) {
    const error = Array.isArray(err) ? err[0] : err;
    return { success: false, error };
  }
};

const handleOAuthAuth = async (ctx, provider, store) => {
  const validation = await validateOAuthProvider(store, provider);
  if (!validation.valid) {
    return ctx.badRequest(null, formatError(validation.error));
  }

  const result = await connectOAuthProvider(provider, ctx.query);
  if (!result.success) {
    return ctx.badRequest(null, result.error);
  }

  sendAuthResponse(ctx, result.user);
};

// ============================================================================
// Password Reset
// ============================================================================

const validateResetPasswordParams = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return { valid: false, error: ErrorMessages.INVALID_PARAMS };
  }
  if (params.password !== params.passwordConfirmation) {
    return { valid: false, error: ErrorMessages.PASSWORD_MISMATCH };
  }
  return { valid: true };
};

const performPasswordReset = async (ctx, user, newPassword) => {
  const hashedPassword = await getUserService().hashPassword({ password: newPassword });
  await getUserQuery().update(
    { id: user.id },
    { resetPasswordToken: null, password: hashedPassword }
  );
  sendAuthResponse(ctx, user);
};

// ============================================================================
// Email Confirmation
// ============================================================================

const validateEmailFormat = (email) => {
  if (!isValidEmail(email)) {
    return { valid: false, error: ErrorMessages.INVALID_EMAIL_FORMAT };
  }
  return { valid: true };
};

const validateUserExists = (user) => {
  if (!user) {
    return { valid: false, error: ErrorMessages.USER_NOT_FOUND };
  }
  return { valid: true };
};

const validateUserNotBlocked = (user) => {
  if (user.blocked) {
    return { valid: false, error: ErrorMessages.USER_BLOCKED };
  }
  return { valid: true };
};

// ============================================================================
// Registration
// ============================================================================

const validateRegistrationEnabled = (settings) => {
  if (!settings.allow_register) {
    return { valid: false, error: ErrorMessages.REGISTER_DISABLED };
  }
  return { valid: true };
};

const validateRegistrationParams = (params) => {
  if (!params.password) {
    return { valid: false, error: ErrorMessages.PASSWORD_REQUIRED };
  }
  if (!params.email) {
    return { valid: false, error: ErrorMessages.EMAIL_REQUIRED };
  }
  if (getUserService().isHashed(params.password)) {
    return { valid: false, error: ErrorMessages.INVALID_PASSWORD_FORMAT };
  }
  return { valid: true };
};

const validateRegistrationEmail = (params) => {
  if (!isValidEmail(params.email)) {
    return { valid: false, error: ErrorMessages.INVALID_EMAIL_FORMAT };
  }
  return { valid: true };
};

const validateEmailNotTaken = async (email, provider, settings) => {
  const existingUser = await getUserQuery().findOne({ email });
  if (existingUser && existingUser.provider === provider) {
    return { valid: false, error: ErrorMessages.EMAIL_TAKEN };
  }
  if (existingUser && existingUser.provider !== provider && settings.unique_email) {
    return { valid: false, error: ErrorMessages.EMAIL_TAKEN };
  }
  return { valid: true };
};

const validateDefaultRole = async (settings) => {
  const role = await getRoleQuery().findOne({ type: settings.default_role }, []);
  if (!role) {
    return { valid: false, error: ErrorMessages.ROLE_NOT_FOUND };
  }
  return { valid: true, role };
};

const prepareRegistrationParams = async (params, settings, role) => {
  const prepared = {
    ..._.omit(params, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
    provider: 'local',
    email: normalizeEmail(params.email),
    role: role.id,
    password: await getUserService().hashPassword(params),
  };

  if (!settings.email_confirmation) {
    prepared.confirmed = true;
  }

  return prepared;
};

const handleRegistrationError = (err) => {
  const isUsernameTaken = _.includes(err.message, 'username');
  return isUsernameTaken ? ErrorMessages.USERNAME_TAKEN : ErrorMessages.EMAIL_TAKEN;
};

// ============================================================================
// Email Services
// ============================================================================

const generateResetToken = () => crypto.randomBytes(64).toString('hex');

const buildEmailSettings = async (pluginStore, key) => {
  try {
    const storeEmail = await pluginStore.get({ key: 'email' });
    return storeEmail[key].options;
  } catch {
    return {};
  }
};

const sendResetPasswordEmail = async (user, token, settings, advanced) => {
  const userInfo = sanitizeUser(user);
  const templatedSettings = {
    ...settings,
    message: await getUsersPermissionsService().template(settings.message, {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: token,
    }),
    object: await getUsersPermissionsService().template(settings.object, {
      USER: userInfo,
    }),
  };

  const fromEmail = templatedSettings.from.email || templatedSettings.from.name
    ? `${templatedSettings.from.name} <${templatedSettings.from.email}>`
    : undefined;

  await getEmailService().send({
    to: user.email,
    from: fromEmail,
    replyTo: templatedSettings.response_email,
    subject: templatedSettings.object,
    text: templatedSettings.message,
    html: templatedSettings.message,
  });
};

// ============================================================================
// Main Controller
// ============================================================================

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await getPluginStore();

    if (provider === 'local') {
      const providerValidation = await validateLocalProvider(store);
      if (!providerValidation.valid) {
        return ctx.badRequest(null, formatError(providerValidation.error));
      }
      return handleLocalAuth(ctx, params, store);
    }

    return handleOAuthAuth(ctx, provider, store);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validation = validateResetPasswordParams(params);
    if (!validation.valid) {
      return ctx.badRequest(null, formatError(validation.error));
    }

    const user = await getUserQuery().findOne({ resetPasswordToken: params.code });
    if (!user) {
      return ctx.badRequest(null, formatError(ErrorMessages.INVALID_RESET_CODE));
    }

    return performPasswordReset(ctx, user, params.password);
  },

  async connect(ctx, next) {
    const grantConfig = await getPluginStore().get();
    const [requestPath] = ctx.request.url.split('?');
    const provider = requestPath.split('/')[2];

    if (!_.get(grantConfig[provider], 'enabled')) {
      return ctx.badRequest(null, 'This provider is disabled.');