const handleLocalProvider = async (ctx, store, params) => {
  const isEmail = emailRegExp.test(params.identifier);

  const query = {
    provider: 'local',
    [isEmail ? 'email' : 'username']: isEmail
      ? params.identifier.toLowerCase()
      : params.identifier,
  };

  const user = await strapi.query('user', 'users-permissions').findOne(query);

  if (!user) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
  }

  const storeAdvanced = await store.get({ key: 'advanced' });
  if (storeAdvanced.email_confirmation && !user.confirmed) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.confirmed', message: 'Your account email is not confirmed' }));
  }

  if (user.blocked) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.blocked', message: 'Your account has been blocked by an administrator' }));
  }

  if (!user.password) {
    return ctx.badRequest(
      null,
      formatError({
        id: 'Auth.form.error.password.local',
        message: 'This user never set a local password, please login with the provider used during account creation.',
      })
    );
  }

  const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(
    params.password,
    user.password
  );

  if (!validPassword) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
  }

  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
      model: strapi.query('user', 'users-permissions').model,
    }),
  });
};

const handleOAuthProvider = async (ctx, store, provider) => {
  const grantConfig = await store.get({ key: 'grant' });
  if (!_.get(grantConfig[provider], 'enabled')) {
    return ctx.badRequest(null, formatError({ id: 'provider.disabled', message: 'This provider is disabled.' }));
  }

  let user, error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(provider, ctx.query);
  } catch ([u, err]) {
    return ctx.badRequest(null, err === 'array' ? err[0] : err);
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
};

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
      const emailGrantEnabled = _.get(await store.get({ key: 'grant' }), 'email.enabled');
      if (!emailGrantEnabled) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      if (!params.identifier) {
        return ctx.badRequest(
          null,
          formatError({ id: 'Auth.form.error.email.provide', message: 'Please provide your username or your e-mail.' })
        );
      }

      if (!params.password) {
        return ctx.badRequest(null, formatError({ id: 'Auth.form.error.password.provide', message: 'Please provide your password.' }));
      }

      return handleLocalProvider(ctx, store, params);
    }

    return handleOAuthProvider(ctx, store, provider);
  },