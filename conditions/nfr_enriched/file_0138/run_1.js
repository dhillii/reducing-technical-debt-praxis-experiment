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
// Validation Helpers
// ============================================================================

const isValidEmail = (email) => EMAIL_REGEXP.test(email);

const normalizeEmail = (email) => email.toLowerCase();

const buildUserQuery = (identifier) => {
  const isEmail = isValidEmail(identifier);
  return isEmail
    ? { email: normalizeEmail(identifier) }
    : { username: identifier };
};

// ============================================================================
// User Sanitization
// ============================================================================

const sanitizeUser = (user) => {
  return sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: getUserQuery().model,
  });
};

// ============================================================================
// Authentication Response
// ============================================================================

const sendAuthResponse = (ctx, user) => {
  ctx.send({
    jwt: getJwtService().issue({ id: user.id }),
    user: sanitizeUser(user),
  });
};

// ============================================================================
// Local Authentication
// ============================================================================

const validateLocalAuthInput = (params) => {
  if (!params.identifier) {
    return { error: ErrorMessages.EMAIL_REQUIRED };
  }
  if (!params.password) {
    return { error: ErrorMessages.PASSWORD_REQUIRED };
  }
  return { valid: true };
};

const checkUserStatus = async (user, store) => {
  const advanced = await store.get({ key: 'advanced' });

  if (advanced.email_confirmation && user.confirmed !== true) {
    return { error: ErrorMessages.EMAIL_NOT_CONFIRMED };
  }

  if (user.blocked === true) {
    return { error: ErrorMessages.ACCOUNT_BLOCKED };
  }

  if (!user.password) {
    return { error: ErrorMessages.NO_LOCAL_PASSWORD };
  }

  return { valid: true };
};

const authenticateLocalUser = async (ctx, params, store) => {
  const inputValidation = validateLocalAuthInput(params);
  if (inputValidation.error) {
    return ctx.badRequest(null, formatError(inputValidation.error));
  }

  const query = { provider: 'local', ...buildUserQuery(params.identifier) };
  const user = await getUserQuery().findOne(query);

  if (!user) {
    return ctx.badRequest(null, formatError(ErrorMessages.INVALID_CREDENTIALS));
  }

  const statusCheck = await checkUserStatus(user, store);
  if (statusCheck.error) {
    return ctx.badRequest(null, formatError(statusCheck.error));
  }

  const validPassword = await getUserService().validatePassword(params.password, user.password);

  if (!validPassword) {
    return ctx.badRequest(null, formatError(ErrorMessages.INVALID_CREDENTIALS));
  }

  sendAuthResponse(ctx, user);
};

// ============================================================================
// OAuth Authentication
// ============================================================================

const authenticateOAuthUser = async (ctx, provider) => {
  let user;
  let error;

  try {
    [user, error] = await getProvidersService().connect(provider, ctx.query);
  } catch ([catchUser, catchError]) {
    return ctx.badRequest(null, catchError === 'array' ? catchError[0] : catchError);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  sendAuthResponse(ctx, user);
};

// ============================================================================
// Password Reset
// ============================================================================

const validateResetPasswordInput = (params) => {
  if (!params.password || !params.passwordConfirmation || !params.code) {
    return { error: ErrorMessages.INVALID_PARAMS };
  }

  if (params.password !== params.passwordConfirmation) {
    return { error: ErrorMessages.PASSWORD_MISMATCH };
  }

  return { valid: true };
};

// ============================================================================
// Email Confirmation
// ============================================================================

const sendConfirmationEmailWithSettings = async (user, settings) => {
  const userInfo = sanitizeUser(user);

  const message = await getUsersPermissionsService().template(settings.message, {
    URL: settings.email_reset_password,
    USER: userInfo,
    TOKEN: crypto.randomBytes(64).toString('hex'),
  });

  const subject = await getUsersPermissionsService().template(settings.object, {
    USER: userInfo,
  });

  const fromEmail = settings.from.email || settings.from.name
    ? `${settings.from.name} <${settings.from.email}>`
    : undefined;

  await getEmailService().send({
    to: user.email,
    from: fromEmail,
    replyTo: settings.response_email,
    subject,
    text: message,
    html: message,
  });
};

// ============================================================================
// Registration
// ============================================================================

const validateRegistrationInput = (params) => {
  if (!params.password) {
    return { error: ErrorMessages.PASSWORD_REQUIRED };
  }

  if (!params.email) {
    return { error: ErrorMessages.EMAIL_REQUIRED };
  }

  if (!isValidEmail(params.email)) {
    return { error: ErrorMessages.INVALID_EMAIL_FORMAT };
  }

  if (getUserService().isHashed(params.password)) {
    return { error: ErrorMessages.PASSWORD_FORMAT_INVALID };
  }

  return { valid: true };
};

const checkEmailAvailability = async (email, provider, uniqueEmailRequired) => {
  const existingUser = await getUserQuery().findOne({ email });

  if (existingUser && existingUser.provider === provider) {
    return { error: ErrorMessages.EMAIL_TAKEN };
  }

  if (existingUser && existingUser.provider !== provider && uniqueEmailRequired) {
    return { error: ErrorMessages.EMAIL_TAKEN };
  }

  return { available: true };
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
      if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
        return ctx.badRequest(null, formatError(ErrorMessages.PROVIDER_DISABLED));
      }

      return authenticateLocalUser(ctx, params, store);
    }

    if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
      return ctx.badRequest(null, formatError(ErrorMessages.PROVIDER_DISABLED));
    }

    return authenticateOAuthUser(ctx, provider);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    const validation = validateResetPasswordInput(params);
    if (validation.error) {
      return ctx.badRequest(null, formatError(validation.error));
    }

    const user = await getUserQuery().findOne({ resetPasswordToken: `${params.code}` });

    if (!user) {
      return ctx.badRequest(null, formatError(ErrorMessages.INVALID_RESET_CODE));
    }

    const hashedPassword = await getUserService().hashPassword({ password: params.password });

    await getUserQuery().update(
      { id: user.id },
      { resetPasswordToken: null, password: hashedPassword }
    );

    sendAuthResponse(ctx, user);
  },

  async connect(ctx, next) {
    const grantConfig = await getPluginStore().then((store) => store.get({ key: 'grant' }));

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
    let { email } = ctx.request.body;

    if (!isValidEmail(email)) {
      return ctx.badRequest(null, formatError(ErrorMessages.INVALID_EMAIL_FORMAT));
    }

    email = normalizeEmail(email);

    const pluginStore = await getPluginStore();
    const user = await getUserQuery().findOne({ email });

    if (!user) {
      return ctx.badRequest(null, formatError(ErrorMessages.USER_NOT_FOUND));
    }

    if (user.blocked) {
      return ctx.badRequest(null, formatError(ErrorMessages.USER_BLOCKED));
    }

    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    const settings = await pluginStore.get({ key: 'email' }).then((storeEmail) => {
      try {
        return storeEmail.reset_password.options;
      } catch (error) {
        return {};
      }
    });

    const advanced = await pluginStore.get({ key: 'advanced' });
    const userInfo = sanitizeUser(user);

    settings.message = await getUsersPermissionsService().template(settings.message, {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetPasswordToken,
    });

    settings.object = await getUsersPermissionsService().template(settings.object, {
      USER: userInfo,
    });

    try {
      await sendConfirmationEmailWithSettings(user, settings);
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await getUserQuery().update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await getPluginStore();
    const settings = await pluginStore.get({ key: 'advanced' });

    if (!settings.allow_register) {
      return ctx.badRequest(null, formatError(ErrorMessages.REGISTER_DISABLED));
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    const inputValidation = validateRegistrationInput(params);
    if (inputValidation.error) {
      return ctx.badRequest(null, formatError(inputValidation.error));
    }

    const role = await getRoleQuery().findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(null, formatError(ErrorMessages.ROLE_NOT_FOUND));
    }

    params.email = normalizeEmail(params.email);

    const emailAvailability = await checkEmailAvailability(
      params.email,
      params