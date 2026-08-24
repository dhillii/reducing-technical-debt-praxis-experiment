async callback(ctx) {
      const provider = ctx.params.provider || 'local';
      const params = ctx.request.body;

      const store = await strapi.store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
      });

      if (provider === 'local') {
        return await this.handleLocalAuth(ctx, store, params);
      }

      return await this.handleOAuthAuth(ctx, store, provider);
    },

    async handleLocalAuth(ctx, store, params) {
      if (!this.isProviderEnabled(store, 'grant', 'email', 'enabled')) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      if (!this.hasValidIdentifier(params)) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.email.provide', 'Please provide your username or your e-mail.')
        );
      }

      if (!this.hasValidPassword(params)) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.password.provide', 'Please provide your password.')
        );
      }

      const query = this.buildAuthenticationQuery(params);
      const user = await this.findUserByQuery(query);

      if (!user) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.invalid', 'Identifier or password invalid.')
        );
      }

      if (await this.isAccountNotConfirmed(store, user)) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.confirmed', 'Your account email is not confirmed')
        );
      }

      if (this.isAccountBlocked(user)) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.blocked', 'Your account has been blocked by an administrator')
        );
      }

      if (!this.hasLocalPassword(user)) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.password.local', 'This user never set a local password, please login with the provider used during account creation.')
        );
      }

      const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(params.password, user.password);

      if (!validPassword) {
        return ctx.badRequest(
          null,
          this.formatValidationError('Auth.form.error.invalid', 'Identifier or password invalid.')
        );
      }

      return this.buildSuccessfulLocalResponse(user);
    },

    async handleOAuthAuth(ctx, store, provider) {
      const grantSettings = await store.get({ key: 'grant' });
      if (!this.isProviderEnabled(store, 'grant', provider, 'enabled')) {
        return ctx.badRequest(
          null,
          this.formatValidationError('provider.disabled', 'This provider is disabled.')
        );
      }

      let user, error;
      try {
        [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
          provider,
          ctx.query
        );
      } catch (exc) {
        return ctx.badRequest(null, Array.isArray(exc) ? exc[0] : exc);
      }

      if (!user) {
        return ctx.badRequest(null, Array.isArray(error) ? error[0] : error);
      }

      return this.buildSuccessfulOAuthResponse(user);
    },

    isProviderEnabled: async (store, ...keys) => {
      const settings = await store.get({ key: keys[0] });
      return _.get(settings, keys.slice(1).join('.'), false);
    },

    hasValidIdentifier: params => !_.isEmpty(params.identifier),

    hasValidPassword: params => !_.isEmpty(params.password),

    isEmail: params => emailRegExp.test(params.identifier),

    buildAuthenticationQuery: params => {
      const query = { provider: 'local' };
      if (this.isEmail(params)) {
        query.email = params.identifier.toLowerCase();
      } else {
        query.username = params.identifier;
      }
      return query;
    },

    findUserByQuery: async query => {
      return await strapi.query('user', 'users-permissions').findOne(query);
    },

    isAccountNotConfirmed: async (store, user) => {
      const advancedSettings = await store.get({ key: 'advanced' });
      return _.get(advancedSettings, 'email_confirmation') && user.confirmed !== true;
    },

    isAccountBlocked: user => user.blocked === true,

    hasLocalPassword: user => !!user.password,

    buildSuccessfulLocalResponse: user => {
      return ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    },

    buildSuccessfulOAuthResponse: user => {
      return ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    },

    formatValidationError: (id, message) => [
      { messages: [{ id, message, field: '' }] }
    ]