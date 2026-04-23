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

const getStore = async () => {
  return strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });
};

const getPluginStore = async (key) => {
  const store = await getStore();
  return store.get({ key });
};

const getUserQuery = () => {
  return strapi.query('user', 'users-permissions');
};

const getUserModel = () => {
  return strapi.query('user', 'users-permissions').model;
};

const getJwtService = () => {
  return strapi.plugins['users-permissions'].services.jwt;
};

const getUserService = () => {
  return strapi.plugins['users-permissions'].services.user;
};

const getTemplateService = () => {
  return strapi.plugins['users-permissions'].services.userspermissions.template;
};

const getEmailService = () => {
  return strapi.plugins['email'].services.email;
};

const getGrantConfig = async () => {
  const store = await getStore();
  return store.get({ key: 'grant' });
};

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

const validateEmail = (email) => {
  if (emailRegExp.test(email)) {
    return { valid: true, normalized: email.toLowerCase() };
  }
  return { valid: false };
};

const validateUser = async (user) => {
  if (!user) {
    return { valid: false, error: formatError({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    }) };
  }

  if (user.confirmed !== true) {
    return { valid: false, error: formatError({
      id: 'Auth.form.error.confirmed',
      message: 'Your account email is not confirmed',
    }) };
  }

  if (user.blocked === true) {
    return { valid: false, error: formatError({
      id: 'Auth.form.error.blocked',
      message: 'Your account has been blocked by an administrator',
    }) };
  }

  if (!user.password) {
    return { valid: false, error: formatError({
      id: 'Auth.form.error.password.local',
      message: 'This user never set a local password, please login with the provider used during account creation.',
    }) };
  }

  return { valid: true, user };
};

const validatePassword = async (password, user) => {
  const validPassword = await getUserService().validatePassword(password, user.password);
  if (!validPassword) {
    return { valid: false, error: formatError({
      id: 'Auth.form.error.invalid',
      message: 'Identifier or password invalid.',
    }) };
  }
  return { valid: true, user };
};

const validateProviderAuth = (provider, grantConfig) => {
  if (!_.get(grantConfig, [provider, 'enabled'])) {
    return {
      valid: false,
      error: formatError({
        id: 'provider.disabled',
        message: 'This provider is disabled.',
      }),
    };
  }
  return { valid: true };
};

const handleLocalAuth = async (ctx, params) => {
  const store = await getStore();
  const grantConfig = _.get(await store.get({ key: 'grant' }), 'email.enabled');

  if (!grantConfig) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const { valid, error } = validateLocalAuthParams(params);
  if (!valid) {
    return error;
  }

  const { identifier, password } = params;
  const { valid: isEmail, normalized } = validateEmail(identifier);

  const query = { provider: 'local' };
  if (isEmail) {
    query.email = normalized;
  } else {
    query.username = identifier;
  }

  const user = await getUserQuery().findOne(query);
  const { valid: userValid, error: userError } = await validateUser(user);
  if (!userValid) {
    return userError;
  }

  const { valid: passwordValid, user: validatedUser } = await validatePassword(password, user);
  if (!passwordValid) {
    return userError;
  }

  const jwt = getJwtService().issue({ id: validatedUser.id });
  const sanitizedUser = sanitizeEntity(validatedUser.toJSON ? validatedUser.toJSON() : validatedUser, {
    model: getUserModel(),
  });

  ctx.send({
    jwt,
    user: sanitizedUser,
  });
};

const handleProviderAuth = async (ctx, provider) => {
  const grantConfig = await getGrantConfig();
  const { valid, error } = validateProviderAuth(provider, grantConfig);
  if (!valid) {
    return error;
  }

  let user;
  let error;
  try {
    [user, error] = await getUserService().connect(provider, ctx.query);
  } catch ([user, error]) {
    return error === 'array' ? error[0] : error;
  }

  if (!user) {
    return error === 'array' ? error[0] : error;
  }

  const jwt = getJwtService().issue({ id: user.id });
  const sanitizedUser = sanitizeEntity(user.toJSON ? user.toJSON() : user, {
    model: getUserModel(),
  });

  ctx.send({
    jwt,
    user: sanitizedUser,
  });
};

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    if (provider === 'local') {
      return handleLocalAuth(ctx, params);
    }

    return handleProviderAuth(ctx, provider);
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (params.password && params.passwordConfirmation && params.password === params.passwordConfirmation && params.code) {
      const user = await getUserQuery().findOne({ resetPasswordToken: `${params.code}` });

      if (!user) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.code.provide',
            message: 'Incorrect code provided.',
          })
        );
      }

      const password = await getUserService().hashPassword({
        password: params.password,
      });

      await getUserQuery().update({ id: user.id }, { resetPasswordToken: null, password });

      const jwt = getJwtService().issue({ id: user.id });
      const sanitizedUser = sanitizeEntity(user.toJSON ? user.toJSON() : user, {
        model: getUserModel(),
      });

      ctx.send({
        jwt,
        user: sanitizedUser,
      });
    } else if (params.password && params.passwordConfirmation && params.password !== params.passwordConfirmation) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    } else {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.params.provide',
          message: 'Incorrect params provided.',
        })
      );
    }
  },

  async connect(ctx, next) {
    const grantConfig = await getGrantConfig();
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
    grantConfig[provider].redirect_uri = getUserService().buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    const { valid, normalized } = validateEmail(email);
    if (!valid) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide a valid email address.',
        })
      );
    }

    email = normalized;

    const user = await getUserQuery().findOne({ email });

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

    const emailSettings = await getPluginStore('email').then(storeEmail => {
      try {
        return storeEmail['reset_password'].options;
      } catch (error) {
        return {};
      }
    });

    const advancedSettings = await getPluginStore('advanced');

    const userInfo = sanitizeEntity(user, {
      model: getUserModel(),
    });

    const templateMessage = await getTemplateService()(
      emailSettings.message,
      {
        URL: advancedSettings.email_reset_password,
        USER: userInfo,
        TOKEN: resetPasswordToken,
      }
    );

    const templateObject = await getTemplateService()(
      emailSettings.object,
      {
        USER: userInfo,
      }
    );

    try {
      await getEmailService().send({
        to: user.email,
        from:
          emailSettings.from.email || emailSettings.from.name
            ? `${emailSettings.from.name} <${emailSettings.from.email}>`
            : undefined,
        replyTo: emailSettings.response_email,
        subject: templateObject,
        text: templateMessage,
        html: templateMessage,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    await getUserQuery().update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await getStore();
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

    if (getUserService().isHashed(params.password)) {
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

    const { valid: isEmail, normalized } = validateEmail(params.email);
    if (!isEmail) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    params.email = normalized;
    params.role = role.id;
    params.password = await getUserService().hashPassword(params);

    const existingUser = await getUserQuery().findOne({
      email: params.email,
    });

    if (existingUser && existingUser.provider === params.provider) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    if (existingUser && existingUser.provider !== params.provider && settings.unique_email) {
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

      const newUser = await getUserQuery().create(params);
      const sanitizedUser = sanitizeEntity(newUser, {
        model: getUserModel(),
      });

      if (settings.email_confirmation) {
        try {
          await getUserService().sendConfirmationEmail(newUser);
        } catch (err) {
          return ctx.badRequest(null, err);
        }

        return ctx.send({ user: sanitizedUser });
      }

      const jwt = getJwtService().issue(_.pick(newUser, ['id']));

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
      const jwtToken = jwtService.issue({ id: user.id });
      const sanitizedUser = sanitizeEntity(user, {
        model: getUserModel(),
      });

      ctx.send({
        jwt: jwtToken,
        user: sanitizedUser,
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

    const { valid: isEmail, normalized } = validateEmail(params.email);
    if (!isEmail) {
      return ctx.badRequest('wrong.email');
    }

    params.email = normalized;

    const user = await getUserQuery().findOne({
      email: params.email,
    });

    if (user.confirmed) {
      return ctx.badRequest('already.confirmed');
    }

    if (user.blocked) {
      return ctx.badRequest('blocked.user');
    }

    try {
      await getUserService().sendConfirmationEmail(user);
      ctx.send({
        email: user.email,
        sent: true,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
    }
  },
};