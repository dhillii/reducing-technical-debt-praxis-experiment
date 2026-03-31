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
  INVALID_CODE: {
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
  INVALID_TOKEN: 'token.invalid',
  MISSING_EMAIL: 'missing.email',
  WRONG_EMAIL: 'wrong.email',
  ALREADY_CONFIRMED: 'already.confirmed',
  BLOCKED_USER: 'blocked.user',
};

// ============================================================================
// Service Accessors
// ============================================================================

const getPluginStore = async () => {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

const getUserService = () => strapi.plugins['users-permissions'].services.user;
const getJwtService = () => strapi.plugins['users-permissions'].services.jwt;
const getProvidersService = () => strapi.plugins['users-permissions'].services.providers;
const getUsersPermissionsService = () => strapi.plugins['users-permissions'].services.userspermissions;
const getEmailService = () => strapi.plugins['email'].services.email;

const getUserQuery = () => strapi.query('user', 'users-permissions');
const getRoleQuery = () => strapi.query('role', 'users-permissions');

// ============================================================================
// Utility Functions
// ============================================================================

const isValidEmail = (email) => EMAIL_REGEXP.test(email);

const normalizeEmail = (email) => email.toLowerCase();

const sanitizeUser = (user) => {
  const userModel = getUserQuery().model;
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, { model: userModel });
};

const buildAuthResponse = (user) => ({
  jwt: getJwtService().issue({ id: user.id }),
  user: sanitizeUser(user),
});

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
    return { valid: false, error: ErrorMessages.IDENTIFIER_REQUIRED };
  }
  if (!params.password) {
    return { valid: false, error: ErrorMessages.PASSWORD_REQUIRED };
  }
  return { valid: true };
};

const buildUserQuery = (identifier) => {
  const query = { provider: 'local' };
  if (isValidEmail(identifier)) {
    query.email = normalizeEmail(identifier);
  } else {
    query.username = identifier;
  }
  return query;
};

const validateUserStatus = (user, store) => {
  if (!user) {
    return { valid: false, error: ErrorMessages.INVALID_CREDENTIALS };
  }
  if (!user.password) {
    return { valid: false, error: ErrorMessages.NO_LOCAL_PASSWORD };
  }
  return { valid: true };
};

const validateUserConfirmation = async (user, store) => {
  const advanced = await store.get({ key: 'advanced' });
  if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
    return { valid: false, error: ErrorMessages.EMAIL_NOT_CONFIRMED };
  }
  return { valid: true };
};

const validateUserBlocked = (user) => {
  if (user.blocked === true) {
    return { valid: false, error: ErrorMessages.ACCOUNT_BLOCKED };
  }
  return { valid: true };
};

const handleLocalAuth = async (ctx, params, store) => {
  const validation = await validateLocalProvider(store);
  if (!validation.valid) {
    return ctx.badRequest(null, formatError(validation.error));
  }

  const credentialsValidation = validateLocalCredentials(params);
  if (!credentialsValidation.valid) {
    return ctx.badRequest(null, formatError(credentialsValidation.error));
  }

  const query = buildUserQuery(params.identifier);
  const user = await getUserQuery().findOne(query);

  const userStatusValidation = validateUserStatus(user, store);
  if (!userStatusValidation.valid) {
    return ctx.badRequest(null, formatError(userStatusValidation.error));
  }

  const confirmationValidation = await validateUserConfirmation(user, store);
  if (!confirmationValidation.valid) {
    return ctx.badRequest(null, formatError(confirmationValidation.error));
  }

  const blockedValidation = validateUserBlocked(user);
  if (!blockedValidation.valid) {
    return ctx.badRequest(null, formatError(blockedValidation.error));
  }

  const validPassword = await getUserService().validatePassword(params.password, user.password);
  if (!validPassword) {
    return ctx.badRequest(null, formatError(ErrorMessages.INVALID_CREDENTIALS));
  }

  ctx.send(buildAuthResponse(user));
};

// ============================================================================
// OAuth Authentication
// ============================================================================

const handleOAuthAuth = async (ctx, provider, store) => {
  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    return ctx.badRequest(null, formatError(ErrorMessages.PROVIDER_DISABLED));
  }

  try {
    const [user, error] = await getProvidersService().connect(provider, ctx.query);

    if (!user) {
      const errorMessage = Array.isArray(error) ? error[0] : error;
      return ctx.badRequest(null, errorMessage);
    }

    ctx.send(buildAuthResponse(user));
  } catch (err) {
    const errorMessage = Array.isArray(err) ? err[0] : err;
    return ctx.badRequest(null, errorMessage);
  }
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

// ============================================================================
// Email Validation
// ============================================================================

const validateAndNormalizeEmail = (email) => {
  if (!isValidEmail(email)) {
    return { valid: false, error: ErrorMessages.INVALID_EMAIL_FORMAT };
  }
  return { valid: true, email: normalizeEmail(email) };
};

// ============================================================================
// Registration
// ============================================================================

const validateRegistrationParams = (params) => {
  if (!params.password) {
    return { valid: false, error: ErrorMessages.PASSWORD_REQUIRED };
  }
  if (!params.email) {
    return { valid: false, error: ErrorMessages.EMAIL_REQUIRED };
  }
  if (getUserService().isHashed(params.password)) {
    return { valid: false, error: ErrorMessages.PASSWORD_FORMAT_INVALID };
  }
  return { valid: true };
};

const validateEmailAvailability = async (email, provider, uniqueEmail) => {
  const existingUser = await getUserQuery().findOne({ email });

  if (existingUser && existingUser.provider === provider) {
    return { available: false, error: ErrorMessages.EMAIL_TAKEN };
  }

  if (existingUser && existingUser.provider !== provider && uniqueEmail) {
    return { available: false, error: ErrorMessages.EMAIL_TAKEN };
  }

  return { available: true };
};

const handleRegistrationError = (err) => {
  if (_.includes(err.message, 'username')) {
    return ErrorMessages.USERNAME_TAKEN;
  }
  return ErrorMessages.EMAIL_TAKEN;
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
      return ctx.badRequest(null, formatError(ErrorMessages.INVALID_CODE));
    }

    const hashedPassword = await getUserService().hashPassword({ password: params.password });

    await getUserQuery().update(
      { id: user.id },
      { resetPasswordToken: null, password: hashedPassword }
    );

    ctx.send(buildAuthResponse(user));
  },

  async connect(ctx, next) {
    const store = await getPluginStore();
    const grantConfig = await store.get({ key: 'grant' });

    const [requestPath] = ctx.request.url.split('?');
    const provider = requestPath.split('/')[2];

    if (!_.get(grantConfig[provider], 'enabled')) {
      return ctx.badRequest(null, ErrorMessages.PROVIDER_DISABLED.message);
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
    const { email: rawEmail } = ctx.request.body;

    const emailValidation = validateAndNormalizeEmail(rawEmail);
    if (!emailValidation.valid) {
      return ctx.badRequest(null, formatError(emailValidation.error));
    }

    const email = emailValidation.email;
    const user = await getUserQuery().findOne({ email });

    if (!user) {
      return ctx.badRequest(null, formatError(ErrorMessages.USER_NOT_FOUND));
    }

    if (user.blocked) {
      return ctx.badRequest(null, formatError(ErrorMessages.USER_BLOCKED));
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');
    const store = await getPluginStore();

    const emailSettings = await store.get({ key: 'email' }).then((storeEmail) => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

    const advanced = await store.get({ key: 'advanced' });
    const sanitizedUser = sanitizeUser(user);

    const templateData = {
      URL: advanced.email_reset_password,
      USER: sanitizedUser,
      TOKEN: resetPasswordToken,
    };

    emailSettings.message = await getUsersPermissionsService().template(
      emailSettings.message,
      templateData
    );

    emailSettings.object = await getUsersPermissionsService().template(emailSettings.object, {
      USER: sanitizedUser,
    });

    try {
      await getEmailService().send({
        to: user.email,
        from:
          emailSettings.from.email || emailSettings.from.name
            ? `${emailSettings.from.name} <${emailSettings.from.email}>`
            : undefined,
        replyTo: emailSettings.response_email,
        subject: emailSettings.object,
        text: emailSettings.message,
        html: emailSettings.message,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await getUserQuery().update({ id: user.id },