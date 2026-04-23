'use strict';

/**
 * Module dependencies.
 */

// Public node modules.
const _ = require('lodash');
const request = require('request');

// Purest strategies.
const purest = require('purest')({ request });
const purestConfig = require('@purest/providers');
const { getAbsoluteServerUrl } = require('strapi-utils');
const jwt = require('jsonwebtoken');

/**
 * Helper to perform a purest GET request and return a promise.
 *
 * @param {Object} purestInstance
 * @param {String} endpoint
 * @param {Object} auth
 * @param {Object} qs
 * @returns {Promise<Object>}
 */
const purestGet = (purestInstance, endpoint, auth, qs = {}) => {
  return new Promise((resolve, reject) => {
    purestInstance
      .query()
      .get(endpoint)
      .auth(auth)
      .qs(qs)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve(body);
      });
  });
};

/**
 * Provider specific profile fetchers.
 */
const providerHandlers = {
  discord: async (query) => {
    const discord = purest({
      provider: 'discord',
      config: {
        discord: {
          'https://discordapp.com/api/': {
            __domain: {
              auth: {
                auth: { bearer: '[0]' },
              },
            },
            '{endpoint}': {
              __path: {
                alias: '__default',
              },
            },
          },
        },
      },
    });

    const body = await purestGet(discord, 'users/@me', query.access_token);
    const username = `${body.username}#${body.discriminator}`;
    return { username, email: body.email };
  },

  cognito: async (query) => {
    const idToken = query.id_token;
    const tokenPayload = jwt.decode(idToken);
    if (!tokenPayload) {
      throw new Error('unable to decode jwt token');
    }
    return {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    };
  },

  facebook: async (query) => {
    const facebook = purest({ provider: 'facebook', config: purestConfig });
    const body = await purestGet(facebook, 'me?fields=name,email', query.access_token);
    return { username: body.name, email: body.email };
  },

  google: async (query) => {
    const google = purest({ provider: 'google', config: purestConfig });
    const body = await purestGet(google, 'oauth/tokeninfo', query.access_token, { access_token: query.access_token });
    return { username: body.email.split('@')[0], email: body.email };
  },

  github: async (query) => {
    const github = purest({
      provider: 'github',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

    const userBody = await purestGet(github, 'user', query.access_token);
    if (userBody.email) {
      return { username: userBody.login, email: userBody.email };
    }

    const emailsBody = await purestGet(github, 'user/emails', query.access_token);
    const primaryEmail = Array.isArray(emailsBody)
      ? emailsBody.find((email) => email.primary === true).email
      : null;
    return { username: userBody.login, email: primaryEmail };
  },

  microsoft: async (query) => {
    const microsoft = purest({ provider: 'microsoft', config: purestConfig });
    const body = await purestGet(microsoft, 'me', query.access_token);
    return { username: body.userPrincipalName, email: body.userPrincipalName };
  },

  twitter: async (query, grant) => {
    const twitter = purest({
      provider: 'twitter',
      config: purestConfig,
      key: grant.twitter.key,
      secret: grant.twitter.secret,
    });

    const body = await purestGet(
      twitter,
      'account/verify_credentials',
      query.access_token,
      {
        screen_name: query['raw[screen_name]'],
        include_email: 'true',
      }
    );
    return { username: body.screen_name, email: body.email };
  },

  instagram: async (query, grant) => {
    const instagram = purest({
      provider: 'instagram',
      key: grant.instagram.key,
      secret: grant.instagram.secret,
      config: purestConfig,
    });

    const body = await purestGet(instagram, 'me', null, {
      access_token,
      fields: 'id,username',
    });
    return {
      username: body.username,
      email: `${body.username}@strapi.io`,
    };
  },

  vk: async (query) => {
    const vk = purest({ provider: 'vk', config: purestConfig });
    const body = await purestGet(vk, 'users.get', null, {
      access_token,
      id: query.raw.user_id,
      v: '5.122',
    });
    return {
      username: `${body.response[0].last_name} ${body.response[0].first_name}`,
      email: query.raw.email,
    };
  },

  twitch: async (query, grant) => {
    const twitch = purest({
      provider: 'twitch',
      config: {
        twitch: {
          'https://api.twitch.tv': {
            __domain: {
              auth: {
                headers: {
                  Authorization: 'Bearer [0]',
                  'Client-ID': '[1]',
                },
              },
            },
            'helix/{endpoint}': { __path: { alias: '__default' } },
            'oauth2/{endpoint}': { __path: { alias: 'oauth' } },
          },
        },
      },
    });

    const body = await purestGet(twitch, 'users', query.access_token, grant.twitch.key);
    return { username: body.data[0].login, email: body.data[0].email };
  },

  linkedin: async (query, grant) => {
    const linkedIn = purest({
      provider: 'linkedin',
      config: {
        linkedin: {
          'https://api.linkedin.com': {
            __domain: { auth: [{ auth: { bearer: '[0]' } }] },
            '[version]/{endpoint}': {
              __path: { alias: '__default', version: 'v2' },
            },
          },
        },
      },
    });

    const details = await new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('me')
        .auth(query.access_token)
        .request((err, res, body) => (err ? reject(err) : resolve(body)));
    });

    const emailBody = await new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(query.access_token)
        .request((err, res, body) => (err ? reject(err) : resolve(body)));
    });

    const email = emailBody.elements[0]['handle~'];
    return { username: details.localizedFirstName, email: email.emailAddress };
  },

  reddit: async (query) => {
    const reddit = purest({
      provider: 'reddit',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

    const body = await purestGet(reddit, 'auth/me', query.access_token);
    return {
      username: body.name,
      email: `${body.name}@strapi.io`,
    };
  },

  auth0: async (query, grant) => {
    const purestAuth0Conf = {};
    purestAuth0Conf[`https://${grant.auth0.subdomain}.auth0.com`] = {
      __domain: { auth: { auth: { bearer: '[0]' } } },
      '{endpoint}': { __path: { alias: '__default' } },
    };

    const auth0 = purest({
      provider: 'auth0',
      config: { auth0: purestAuth0Conf },
    });

    const body = await purestGet(auth0, 'userinfo', query.access_token);
    const username =
      body.username || body.nickname || body.name || body.email.split('@')[0];
    const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
    return { username, email };
  },

  cas: async (query, grant) => {
    const providerUrl = `https://${_.get(grant, 'cas.subdomain')}`;
    const cas = purest({
      provider: 'cas',
      config: {
        cas: {
          [providerUrl]: {
            __domain: { auth: { auth: { bearer: '[0]' } } },
            '{endpoint}': { __path: { alias: '__default' } },
          },
        },
      },
    });

    const body = await purestGet(cas, 'oidc/profile', query.access_token);
    const username = body.attributes
      ? body.attributes.strapiusername || body.id || body.sub
      : body.strapiusername || body.id || body.sub;
    const email = body.attributes
      ? body.attributes.strapiemail || body.attributes.email
      : body.strapiemail || body.email;

    if (!username || !email) {
      strapi.log.warn(
        'CAS Response Body did not contain required attributes: ' +
          JSON.stringify(body)
      );
    }

    return { username, email };
  },
};

/**
 * Retrieve a user profile from a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getProfile = async (provider, query) => {
  const grant = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

  const handler = providerHandlers[provider];
  if (!handler) {
    throw new Error('Unknown provider.');
  }

  return handler(query, grant);
};

/**
 * Connect thanks to a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Array>}
 */
const connect = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;
  if (!accessToken) {
    return [null, { message: 'No access_token.' }];
  }

  try {
    const profile = await getProfile(provider, query);
    if (!profile.email) {
      return [null, { message: 'Email was not available.' }];
    }

    const users = await strapi
      .query('user', 'users-permissions')
      .find({ email: profile.email });

    const advanced = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const existingUser = users.find((u) => u.provider === provider);

    if (!existingUser && !advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ];
    }

    if (existingUser) {
      return [existingUser, null];
    }

    const otherProviderUser = users.find((u) => u.provider !== provider);
    if (otherProviderUser && advanced.unique_email) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: advanced.default_role }, []);

    const params = Object.assign({}, profile, {
      provider,
      role: defaultRole.id,
      confirmed: true,
    });

    const createdUser = await strapi
      .query('user', 'users-permissions')
      .create(params);

    return [createdUser, null];
  } catch (err) {
    return [null, err];
  }
};

/**
 * Build the redirect URI for a provider.
 *
 * @param {String} provider
 * @returns {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};