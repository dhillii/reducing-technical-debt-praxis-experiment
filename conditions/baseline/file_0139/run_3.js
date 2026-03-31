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
          resolve({
            username: body.name,
            email: body.email,
          });
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
        .request((err, res, userbody) => {
          if (err) return reject(err);

          if (userbody.email) {
            return resolve({
              username: userbody.login,
              email: userbody.email,
            });
          }

          github
            .query()
            .get('user/emails')
            .auth(accessToken)
            .request((err, res, emailsbody) => {
              if (err) return reject(err);
              const email = Array.isArray(emailsbody)
                ? emailsbody.find(e => e.primary)?.email
                : null;
              resolve({
                username: userbody.login,
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
    const purestAuth0Conf = {
      [`https://${grant.auth0.subdomain}.auth0.com`]: {
        __domain: { auth: { auth: { bearer: '[0]' } } },
        '{endpoint}': { __path: { alias: '__default' } },
      },
    };

    const auth0 = purest({
      provider: 'auth0',
      config: { auth0: purestAuth0Conf },
    });

    return new Promise((resolve, reject) => {
      auth0
        .get('userinfo')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          const username = body.username || body.nickname || body.name || body.email.split('@')[0];
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

          const username = body.attributes
            ? body.attributes.strapiusername || body.id || body.sub
            : body.strapiusername || body.id || body.sub;

          const email = body.attributes
            ? body.attributes.strapiemail || body.attributes.email
            : body.strapiemail || body.email;

          if (!username || !email) {
            strapi.log.warn(`CAS Response Body missing attributes: ${JSON.stringify(body)}`);
          }

          resolve({ username, email });
        });
    });
  },
};

/**
 * Get user profile from provider
 */
const getProfile = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  if (!profileFetchers[provider]) {
    throw new Error('Unknown provider.');
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
 * Get advanced settings
 */
const getAdvancedSettings = async () => {
  return strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    })
    .get();
};

/**
 * Get default role
 */
const getDefaultRole = async (roleType) => {
  return strapi.query('role', 'users-permissions').findOne({ type: roleType }, []);
};

/**
 * Find user by email and provider
 */
const findUserByEmailAndProvider = (users, provider) => {
  return _.find(users, { provider });
};

/**
 * Check if email is already taken by another provider
 */
const isEmailTakenByOtherProvider = (users, provider, uniqueEmailEnabled) => {
  return (
    !_.isEmpty(_.find(users, user => user.provider !== provider)) && uniqueEmailEnabled
  );
};

/**
 * Connect user via third-party provider
 */
const connect = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  if (!accessToken) {
    throw [null, { message: 'No access_token.' }];
  }

  try {
    const profile = await getProfile(provider, query);

    if (!profile.email) {
      throw [null, { message: 'Email was not available.' }];
    }

    const users = await strapi.query('user', 'users-permissions').find({
      email: profile.email,
    });

    const advanced = await getAdvancedSettings();
    const existingUser = findUserByEmailAndProvider(users, provider);

    if (_.isEmpty(existingUser) && !advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is not available.',
      ];
    }

    if (!_.isEmpty(existingUser)) {
      return [existingUser, null];
    }

    if (isEmailTakenByOtherProvider(users, provider, advanced.unique_email)) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await getDefaultRole(advanced.default_role);

    const newUser = await strapi.query('user', 'users-permissions').create({
      ...profile,
      provider,
      role: defaultRole.id,
      confirmed: true,
    });

    return [newUser, null];
  } catch (err) {
    throw [null, err];
  }
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```