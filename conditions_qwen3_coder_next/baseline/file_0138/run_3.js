module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;
    const store = await strapi.store({ environment: '', type: 'plugin', name: 'users-permissions' });
    const isLocal = provider === 'local';
    const grantConfig = await store.get({ key: 'grant' });
    const addrValidation = (isLocal && !_.get(grantConfig, 'email.enabled')) ||
                           (!isLocal && !_.get(grantConfig, [provider, 'enabled']));
    if (addrValidation) {
      return ctx.badRequest(null, formatError({ id: 'provider.disabled', message: 'This provider is disabled.' }));
    }

    if (isLocal) {
      return await this.handleLocalAuth(ctx, params, store);
    } else {
      return await this.handleOAuthAuth(ctx, provider);
    }
  },

  async handleLocalAuth(ctx, params, store) {
    const { identifier, password } = params;
    if (!identifier) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.email.provide', message: 'Please provide your username or your e-mail.' }));
    }

    if (!password) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.password.provide', message: 'Please provide your password.' }));
    }

    const query = { provider: 'local' };
    const isEmail = emailRegExp.test(identifier);
    query[isEmail ? 'email' : 'username'] = isEmail ? identifier.toLowerCase() : identifier;

    const user = await strapi.query('user', 'users-permissions').findOne(query);
    if (!user) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
    }

    const advanced = await store.get({ key: 'advanced' });
    if (_.get(advanced, 'email_confirmation') && user.confirmed !== true) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.confirmed', message: 'Your account email is not confirmed' }));
    }

    if (user.blocked) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.blocked', message: 'Your account has been blocked by an administrator' }));
    }

    if (!user.password) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.password.local', message: 'This user never set a local password, please login with the provider used during account creation.' }));
    }

    const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(password, user.password);
    if (!validPassword) {
      return ctx.badRequest(null, formatError({ id: 'Auth.form.error.invalid', message: 'Identifier or password invalid.' }));
    }

    ctx.send({
      jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
      user: sanitizeEntity(user.toJSON ? user.toJSON() : user, { model: strapi.query('user', 'users-permissions').model }),
    });
  },

  async handleOAuthAuth(ctx, provider) {
    let user, error;
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
  },
}