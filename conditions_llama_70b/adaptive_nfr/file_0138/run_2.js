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
 * Checks if the local provider is enabled.
 * @param {Object} store - The store object.
 * @returns {Boolean} True if the local provider is enabled, false otherwise.
 */
function isLocalProviderEnabled(store) {
  return _.get(store.get({ key: 'grant' }), 'email.enabled');
}

/**
 * Checks if the provider is enabled.
 * @param {Object} store - The store object.
 * @param {String} provider - The provider name.
 * @returns {Boolean} True if the provider is enabled, false otherwise.
 */
function isProviderEnabled(store, provider) {
  return _.get(store.get({ key: 'grant' }), [provider, 'enabled']);
}

/**
 * Validates the identifier.
 * @param {Object} params - The request body.
 * @param {Object} store - The store object.
 * @returns {Object} The validated identifier.
 */
function validateIdentifier(params, store) {
  if (!params.identifier) {
    throw formatError({
      id: 'Auth.form.error.email.provide',
      message: 'Please provide your username or your e-mail.',
    });
  }

  const isEmail = emailRegExp.test(params.identifier);
  const query = { provider: 'local' };

  if (isEmail) {
    query.email = params.identifier.toLowerCase();
  } else {
    query.username = params.identifier;
  }

  return query;
}

/**
 * Validates the password.
 * @param {Object} params - The request body.
 * @param {Object} user - The user object.
 * @returns {Boolean} True if the password is valid, false otherwise.
 */
function validatePassword(params, user) {
  if (!params.password) {
    throw formatError({
      id: 'Auth.form.error.password.provide',
      message: 'Please provide your password.',
    });
  }

  const validPassword = strapi.plugins['users-permissions'].services.user.validatePassword(params.password, user.password);
  if (!validPassword) {
    throw formatError({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    });
  }

  return validPassword;
}

/**
 * Checks if the user is confirmed.
 * @param {Object} store - The store object.
 * @param {Object} user - The user object.
 * @returns {Boolean} True if the user is confirmed, false otherwise.
 */
function isUserConfirmed(store, user) {
  const advanced = store.get({ key: 'advanced' });
  return !advanced.email_confirmation || user.confirmed;
}

/**
 * Checks if the user is blocked.
 * @param {Object} user - The user object.
 * @returns {Boolean} True if the user is blocked, false otherwise.
 */
function isUserBlocked(user) {
  return user.blocked;
}

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
      if (!isLocalProviderEnabled(store)) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      try {
        const query = validateIdentifier(params, store);
        const user = await strapi.query('user', 'users-permissions').findOne(query);

        if (!user) {
          throw formatError({
            id: 'Auth.form.error.invalid',
            message: 'Identifier or password invalid.',
          });
        }

        if (!isUserConfirmed(store, user)) {
          throw formatError({
            id: 'Auth.form.error.confirmed',
            message: 'Your account email is not confirmed',
          });
        }

        if (isUserBlocked(user)) {
          throw formatError({
            id: 'Auth.form.error.blocked',
            message: 'Your account has been blocked by an administrator',
          });
        }

        if (!user.password) {
          throw formatError({
            id: 'Auth.form.error.password.local',
            message: 'This user never set a local password, please login with the provider used during account creation.',
          });
        }

        validatePassword(params, user);

        ctx.send({
          jwt: strapi.plugins['users-permissions'].services.jwt.issue({
            id: user.id,
          }),
          user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
            model: strapi.query('user', 'users-permissions').model,
          }),
        });
      } catch (error) {
        return ctx.badRequest(null, error);
      }
    } else {
      if (!isProviderEnabled(store, provider)) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'provider.disabled',
            message: 'This provider is disabled.',
          })
        );
      }

      try {
        const [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
          provider,
          ctx.query
        );

        if (!user) {
          throw error;
        }

        ctx.send({
          jwt: strapi.plugins['users-permissions'].services.jwt.issue({
            id: user.id,
          }),
          user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
            model: strapi.query('user', 'users-permissions').model,
          }),
        });
      } catch (error) {
        return ctx.badRequest(null, error);
      }
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (!params.password || !params.passwordConfirmation || !params.code) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.params.provide',
          message: 'Incorrect params provided.',
        })
      );
    }

    if (params.password !== params.passwordConfirmation) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    }

    try {
      const user = await strapi
        .query('user', 'users-permissions')
        .findOne({ resetPasswordToken: `${params.code}` });

      if (!user) {
        throw formatError({
          id: 'Auth.form.error.code.provide',
          message: 'Incorrect code provided.',
        });
      }

      const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
        password: params.password,
      });

      await strapi
        .query('user', 'users-permissions')
        .update({ id: user.id }, { resetPasswordToken: null, password });

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({
          id: user.id,
        }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    } catch (error) {
      return ctx.badRequest(null, error);
    }
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

    if (!emailRegExp.test(email)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
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

      await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

      ctx.send({ ok: true });
    } catch (err) {
      return ctx.badRequest(null, err);
    }
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

    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
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

    if (!emailRegExp.test(params.email)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    params.email = params.email.toLowerCase();
    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (user && user.provider === params.provider) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    if (user && user.provider !== params.provider && settings.unique_email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
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

    if (_.isEmpty(confirmationToken)) {
      return ctx.badRequest('token.invalid');
    }

    const user = await strapi.plugins['users-permissions'].services.user.fetch({ confirmationToken }, []);

    if (!user) {
      return ctx.badRequest('token.invalid');
    }

    await strapi.plugins['users-permissions'].services.user.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

    if (returnUser) {
      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({
          id: user.id,
        }),
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

    if (!emailRegExp.test(params.email)) {
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