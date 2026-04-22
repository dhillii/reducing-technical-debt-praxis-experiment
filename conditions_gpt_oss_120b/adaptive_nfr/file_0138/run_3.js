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

/**
 * Guard: ensure provider is enabled.
 */
async function ensureProviderEnabled(store, provider) {
  const grantConfig = await store.get({ key: 'grant' });
  if (provider === 'local') {
    if (!_.get(grantConfig, 'email.enabled')) {
      return false;
    }
  } else {
    if (!_.get(grantConfig, [provider, 'enabled'])) {
      return false;
    }
  }
  return true;
}

/**
 * Guard: validate identifier and password presence.
 */
function validateLocalCredentials(params) {
  if (!params.identifier) {
    return formatError({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    });
  }
  if (!params.password) {
    return formatError({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    });
  }
  return null;
}

/**
 * Predicate: is email confirmation required and not confirmed.
 */
async function isEmailConfirmationRequired(store, user) {
  const advanced = await store.get({ key: 'advanced' });
  return _.get(advanced, 'email_confirmation') && user.confirmed !== true;
}

/**
 * Predicate: user is blocked.
 */
function isUserBlocked(user) {
  return user.blocked === true;
}

/**
 * Predicate: user has no local password.
 */
function hasNoLocalPassword(user) {
  return !user.password;
}

/**
 * Guard: validate reset password parameters.
 */
function validateResetPasswordParams(params) {
  const { password, passwordConfirmation, code } = params;
  if (password && passwordConfirmation && password === passwordConfirmation && code) {
    return 'valid';
  }
  if (password && passwordConfirmation && password !== passwordConfirmation) {
    return 'mismatch';
  }
  return 'invalid';
}

/**
 * Guard: validate email format.
 */
function validateEmailFormat(email) {
  return emailRegExp.test(email);
}

/**
 * Guard: ensure registration is allowed.
 */
async function ensureRegistrationAllowed(store) {
  const settings = await store.get({ key: 'advanced' });
  return settings.allow_register;
}

/**
 * Guard: validate password hash rule.
 */
function isPasswordHashed(password) {
  return strapi.plugins['users-permissions'].services.user.isHashed(password);
}

/**
 * Guard: ensure email is valid and normalized.
 */
function normalizeEmail(email) {
  if (validateEmailFormat(email)) {
    return email.toLowerCase();
  }
  return null;
}

/**
 * Guard: ensure role exists.
 */
async function fetchDefaultRole(settings) {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: settings.default_role }, []);
}

/**
 * Guard: ensure user does not already exist.
 */
function isUserEmailTaken(user, provider, uniqueEmail) {
  if (!user) return false;
  if (user.provider === provider) return true;
  return user.provider !== provider && uniqueEmail;
}

/**
 * Guard: ensure email confirmation flow.
 */
function shouldSkipEmailConfirmation(settings) {
  return !settings.email_confirmation;
}

/**
 * Guard: ensure email confirmation token is present.
 */
function hasConfirmationToken(token) {
  return !_.isEmpty(token);
}

/**
 * Guard: ensure email confirmation token matches a user.
 */
async function fetchUserByConfirmationToken(token) {
  const { user: userService } = strapi.plugins['users-permissions'].services;
  return userService.fetch({ confirmation: token }, []);
}

/**
 * Guard: ensure email exists for sending confirmation.
 */
function ensureEmailProvided(email) {
  return !!email;
}

/**
 * Guard: ensure email is not already confirmed.
 */
function isAlreadyConfirmed(user) {
  return user.confirmed;
}

/**
 * Guard: ensure user is not blocked.
 */
function isUserDisabled(user) {
  return user.blocked;
}

/**
 * Main callback handler.
 */
module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    if (!(await ensureProviderEnabled(store, provider))) {
      return ctx.badRequest(null, 'This provider is disabled.');
    }

    if (provider === 'local') {
      const credentialError = validateLocalCredentials(params);
      if (credentialError) {
        return ctx.badRequest(null, credentialError);
      }

      const query = { provider };
      if (emailRegExp.test(params.identifier)) {
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

      if (await isEmailConfirmationRequired(store, user)) {
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

      if (hasNoLocalPassword(user)) {
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

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    } else {
      let user;
      let error;
      try {
        [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
          provider,
          ctx.query
        );
      } catch (e) {
        return ctx.badRequest(null, e === 'array' ? e[0] : e);
      }

      if (!user) {
        return ctx.badRequest(null, error === 'array' ? error[0] : error);
      }

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);
    const validation = validateResetPasswordParams(params);

    if (validation === 'valid') {
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

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
      return;
    }

    if (validation === 'mismatch') {
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
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }
    email = normalized;

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

    const settings = await pluginStore
      .get({ key: 'email' })
      .then(storeEmail => {
        try {
          return storeEmail['reset_password'].options;
        } catch (e) {
          return {};
        }
      });

    const advanced = await pluginStore.get({ key: 'advanced' });

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
        from:
          settings.from.email || settings.from.name
            ? `${settings.from.name} <${settings.from.email}>`
            : undefined,
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

    if (!(await ensureRegistrationAllowed(pluginStore))) {
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

    if (!params.password) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.provide',
          message: 'Please provide your password.',
        })
      );
    }

    if (!params.email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.provide',
          message: 'Please provide your email.',
        })
      );
    }

    if (isPasswordHashed(params.password)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.format',
          message: 'Your password cannot contain more than three times the symbol `$`.',
        })
      );
    }

    const settings = await pluginStore.get({ key: 'advanced' });
    const role = await fetchDefaultRole(settings);
    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
    }

    const normalizedEmail = normalizeEmail(params.email);
    if (!normalizedEmail) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }
    params.email = normalizedEmail;

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const existingUser = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (isUserEmailTaken(existingUser, params.provider, settings.unique_email)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    try {
      if (shouldSkipEmailConfirmation(settings)) {
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

    if (!hasConfirmationToken(confirmationToken)) {
      return ctx.badRequest('token.invalid');
    }

    const user = await fetchUserByConfirmationToken(confirmationToken);
    if (!user) {
      return ctx.badRequest('token.invalid');
    }

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;
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

    if (!ensureEmailProvided(params.email)) {
      return ctx.badRequest('missing.email');
    }

    const normalized = normalizeEmail(params.email);
    if (!normalized) {
      return ctx.badRequest('wrong.email');
    }
    params.email = normalized;

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (isAlreadyConfirmed(user)) {
      return ctx.badRequest('already.confirmed');
    }

    if (isUserDisabled(user)) {
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