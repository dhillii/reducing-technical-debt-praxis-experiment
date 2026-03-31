```javascript
'use strict';

const _ = require('lodash');
const request = require('request');
const purest = require('purest')({ request });
const purestConfig = require('@purest/providers');
const { getAbsoluteServerUrl } = require('strapi-utils');
const jwt = require('jsonwebtoken');

/**
 * Provider-specific profile fetchers
 */
const profileFetchers = {
  discord: async (accessToken, query) => {
    const discord = purest({
      provider: 'discord',
      config: {
        discord: {
          'https://discordapp.com/api/': {
            __domain: { auth: { auth: { bearer: '[0]' } } },
            '{endpoint}': { __path: { alias: '__default' } },
          },
        },
      },
    });

    return new Promise((resolve, reject) => {
      discord
        .query()
        .get('users/@me')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: `${body.username}#${body.discriminator}`,
            email: body.email,
          });
        });
    });
  },

  cognito: async (accessToken, query) => {
    const tokenPayload = jwt.decode(query.id_token);
    if (!tokenPayload) throw new Error('Unable to decode JWT token');
    return {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    };
  },

  facebook: async (accessToken) => {
    const facebook = purest({ provider: 'facebook', config: purestConfig });
    return new Promise((resolve, reject) => {
      facebook
        .query()
        .get('me?fields=name,email')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({ username: body.name, email: body.email });
        });
    });
  },

  google: async (accessToken) => {
    const google = purest({ provider: 'google', config: purestConfig });
    return new Promise((resolve, reject) => {
      google
        .query('oauth')
        .get('tokeninfo')
        .qs({ access_token: accessToken })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.email.split('@')[0],
            email: body.email,
          });
        });
    });
  },

  github: async (accessToken) => {
    const github = purest({
      provider: 'github',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

    return new Promise((resolve, reject) => {
      github
        .query()
        .get('user')
        .auth(accessToken)
        .request((err, res, userBody) => {
          if (err) return reject(err);

          if (userBody.email) {
            return resolve({
              username: userBody.login,
              email: userBody.email,
            });
          }

          github
            .query()
            .get('user/emails')
            .auth(accessToken)
            .request((err, res, emailsBody) => {
              if (err) return reject(err);
              const email = Array.isArray(emailsBody)
                ? emailsBody.find(e => e.primary)?.email
                : null;
              resolve({
                username: userBody.login,
                email,
              });
            });
        });
    });
  },

  microsoft: async (accessToken) => {
    const microsoft = purest({ provider: 'microsoft', config: purestConfig });
    return new Promise((resolve, reject) => {
      microsoft
        .query()
        .get('me')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.userPrincipalName,
            email: body.userPrincipalName,
          });
        });
    });
  },

  twitter: async (accessToken, query, grant) => {
    const twitter = purest({
      provider: 'twitter',
      config: purestConfig,
      key: grant.twitter.key,
      secret: grant.twitter.secret,
    });

    return new Promise((resolve, reject) => {
      twitter
        .query()
        .get('account/verify_credentials')
        .auth(accessToken, query.access_secret)
        .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.screen_name,
            email: body.email,
          });
        });
    });
  },

  instagram: async (accessToken, query, grant) => {
    const instagram = purest({
      provider: 'instagram',
      key: grant.instagram.key,
      secret: grant.instagram.secret,
      config: purestConfig,
    });

    return new Promise((resolve, reject) => {
      instagram
        .query()
        .get('me')
        .qs({ access_token: accessToken, fields: 'id,username' })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.username,
            email: `${body.username}@strapi.io`,
          });
        });
    });
  },

  vk: async (accessToken, query) => {
    const vk = purest({ provider: 'vk', config: purestConfig });
    return new Promise((resolve, reject) => {
      vk.query()
        .get('users.get')
        .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: `${body.response[0].last_name} ${body.response[0].first_name}`,
            email: query.raw.email,
          });
        });
    });
  },

  twitch: async (accessToken, query, grant) => {
    const twitch = purest({
      provider: 'twitch',
      config: {
        twitch: {
          'https://api.twitch.tv': {
            __domain: {
              auth: {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Client-ID': grant.twitch.key,
                },
              },
            },
            'helix/{endpoint}': { __path: { alias: '__default' } },
            'oauth2/{endpoint}': { __path: { alias: 'oauth' } },
          },
        },
      },
    });

    return new Promise((resolve, reject) => {
      twitch
        .get('users')
        .auth(accessToken, grant.twitch.key)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.data[0].login,
            email: body.data[0].email,
          });
        });
    });
  },

  linkedin: async (accessToken) => {
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

    const makeRequest = (endpoint) =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get(endpoint)
          .auth(accessToken)
          .request((err, res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const details = await makeRequest('me');
    const emailData = await makeRequest('emailAddress?q=members&projection=(elements*(handle~))');

    return {
      username: details.localizedFirstName,
      email: emailData.elements[0]['handle~'].emailAddress,
    };
  },

  reddit: async (accessToken) => {
    const reddit = purest({
      provider: 'reddit',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

    return new Promise((resolve, reject) => {
      reddit
        .query('auth')
        .get('me')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.name,
            email: `${body.name}@strapi.io`,
          });
        });
    });
  },

  auth0: async (accessToken, query, grant) => {
    const config = {
      [`https://${grant.auth0.subdomain}.auth0.com`]: {
        __domain: { auth: { auth: { bearer: '[0]' } } },
        '{endpoint}': { __path: { alias: '__default' } },
      },
    };

    const auth0 = purest({ provider: 'auth0', config: { auth0: config } });

    return new Promise((resolve, reject) => {
      auth0
        .get('userinfo')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          const username =
            body.username || body.nickname || body.name || body.email.split('@')[0];
          const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
          resolve({ username, email });
        });
    });
  },

  cas: async (accessToken, query, grant) => {
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

    return new Promise((resolve, reject) => {
      cas
        .query()
        .get('oidc/profile')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);

          const getAttr = (path, fallback) =>
            body.attributes ? _.get(body.attributes, path, fallback) : _.get(body, path, fallback);

          const username = getAttr('strapiusername', getAttr('id', body.sub));
          const email = getAttr('strapiemail', getAttr('email'));

          if (!username || !email) {
            strapi.log.warn(`CAS Response missing attributes: ${JSON.stringify(body)}`);
          }

          resolve({ username, email });
        });
    });
  },
};

/**
 * Extract access token from query
 */
const extractAccessToken = (query) => query.access_token || query.code || query.oauth_token;

/**
 * Get user profile from provider
 */
const getProfile = async (provider, query) => {
  if (!profileFetchers[provider]) {
    throw new Error('Unknown provider.');
  }

  const accessToken = extractAccessToken(query);
  if (!accessToken) {
    throw new Error('No access_token.');
  }

  const grant = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

  return profileFetchers[provider](accessToken, query, grant);
};

/**
 * Find or create user from provider profile
 */
const connect = async (provider, query) => {
  try {
    const profile = await getProfile(provider, query);

    if (!profile.email) {
      return [null, { message: 'Email was not available.' }];
    }

    const users = await strapi.query('user', 'users-permissions').find({
      email: profile.email,
    });

    const advanced = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const existingUser = _.find(users, { provider });

    if (existingUser) {
      return [existingUser, null];
    }

    if (!advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is not available.',
      ];
    }

    if (
      _.some(users, u => u.provider !== provider) &&
      advanced.unique_email
    ) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: advanced.default_role }, []);

    const newUser = await strapi.query('user', 'users-permissions').create({
      ...profile,
      provider,
      role: defaultRole.id,
      confirmed: true,
    });

    return [newUser, null];
  } catch (err) {
    return [null, err];
  }
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```