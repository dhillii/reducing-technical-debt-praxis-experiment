module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    if (provider === 'local') {
      await handleLocalProvider(ctx, params);
    } else {
      await handleThirdPartyProvider(ctx, provider, params);
    }
  },
};

async function handleLocalProvider(ctx, params) {
  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
    return ctx.badRequest(null, 'This provider is disabled.');
  }

  const errors = validateLocalParams(params);
  if (errors.length > 0) {
    return ctx.badRequest(null, formatError(errors[0]));
  }

  const query = getQuery(params);
  const user = await strapi.query('user', 'users-permissions').findOne(query);

  if (!user) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
  }

  if (!await validateUser(user, store)) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
  }

  const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(params.password, user.password);
  if (!validPassword) {
    return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
  }

  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, { model: strapi.query('user', 'users-permissions').model }),
  });
}

async function handleThirdPartyProvider(ctx, provider, params) {
  const store = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
  });

  if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
    return ctx.badRequest(null, formatError({ id: 'provider.disabled', message: 'This provider is disabled.' }));
  }

  let user;
  let error;
  try {
    [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(provider, ctx.query);
  } catch ([user, error]) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  if (!user) {
    return ctx.badRequest(null, error === 'array' ? error[0] : error);
  }

  ctx.send({
    jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
    user: sanitizeEntity(user.toJSON ? user.toJSON() : user, { model: strapi.query('user', 'users-permissions').model }),
  });
}

function validateLocalParams(params) {
  const errors = [];

  if (!params.identifier) {
    errors.push({ id: 'Auth.form.error.email.provide', message: 'Please provide your username or your e-mail.' });
  }

  if (!params.password) {
    errors.push({ id: 'Auth.form.error.password.provide', message: 'Please provide your password.' });
  }

  return errors;
}

function getQuery(params) {
  const query = { provider: 'local' };

  const isEmail = emailRegExp.test(params.identifier);
  if (isEmail) {
    query.email = params.identifier.toLowerCase();
  } else {
    query.username = params.identifier;
  }

  return query;
}

async function validateUser(user, store) {
  if (
    _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
    user.confirmed !== true
  ) {
    return false;
  }

  if (user.blocked === true) {
    return false;
  }

  if (!user.password) {
    return false;
  }

  return true;
}