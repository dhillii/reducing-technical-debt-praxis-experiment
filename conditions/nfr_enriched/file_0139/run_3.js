```javascript
'use strict';

const _ = require('lodash');
const request = require('request');
const purest = require('purest')({ request });
const purestConfig = require('@purest/providers');
const { getAbsoluteServerUrl } = require('strapi-utils');
const jwt = require('jsonwebtoken');

/**
 * Provider profile extractors
 */
const profileExtractors = {
  discord: async (access_token, query) => {
    return new Promise((resolve, reject) => {
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

      discord
        .query()
        .get('users/@me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: `${body.username}#${body.discriminator}`,
            email: body.email,
          });
        });
    });
  },

  cognito: async (access_token, query) => {
    const tokenPayload = jwt.decode(query.id_token);
    if (!tokenPayload) throw new Error('Unable to decode JWT token');
    return {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    };
  },

  facebook: async (access_token, query) => {
    return new Promise((resolve, reject) => {
      const facebook = purest({ provider: 'facebook', config: purestConfig });
      facebook
        .query()
        .get('me?fields=name,email')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({ username: body.name, email: body.email });
        });
    });
  },

  google: async (access_token, query) => {
    return new Promise((resolve, reject) => {
      const google = purest({ provider: 'google', config: purestConfig });
      google
        .query('oauth')
        .get('tokeninfo')
        .qs({ access_token })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.email.split('@')[0],
            email: body.email,
          });
        });
    });
  },

  github: async (access_token, query) => {
    return new Promise((resolve, reject) => {
      const github = purest({
        provider: 'github',
        config: purestConfig,
        defaults: { headers: { 'user-agent': 'strapi' } },
      });

      github
        .query()
        .get('user')
        .auth(access_token)
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
            .auth(access_token)
            .request((err, res, emailsbody) => {
              if (err) return reject(err);
              const primaryEmail = Array.isArray(emailsbody)
                ? emailsbody.find(e => e.primary)?.email
                : null;
              resolve({
                username: userbody.login,
                email: primaryEmail,
              });
            });
        });
    });
  },

  microsoft: async (access_token, query) => {
    return new Promise((resolve, reject) => {
      const microsoft = purest({ provider: 'microsoft', config: purestConfig });
      microsoft
        .query()
        .get('me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.userPrincipalName,
            email: body.userPrincipalName,
          });
        });
    });
  },

  twitter: async (access_token, query, grant) => {
    return new Promise((resolve, reject) => {
      const twitter = purest({
        provider: 'twitter',
        config: purestConfig,
        key: grant.twitter.key,
        secret: grant.twitter.secret,
      });

      twitter
        .query()
        .get('account/verify_credentials')
        .auth(access_token, query.access_secret)
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

  instagram: async (access_token, query, grant) => {
    return new Promise((resolve, reject) => {
      const instagram = purest({
        provider: 'instagram',
        key: grant.instagram.key,
        secret: grant.instagram.secret,
        config: purestConfig,
      });

      instagram
        .query()
        .get('me')
        .qs({ access_token, fields: 'id,username' })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.username,
            email: `${body.username}@strapi.io`,
          });
        });
    });
  },

  vk: async (access_token, query) => {
    return new Promise((resolve, reject) => {
      const vk = purest({ provider: 'vk', config: purestConfig });
      vk.query()
        .get('users.get')
        .qs({ access_token, id: query.raw.user_id, v: '5.122' })
        .request((err, res, body) => {
          if (err) return reject(err);
          const user = body.response[0];
          resolve({
            username: `${user.last_name} ${user.first_name}`,
            email: query.raw.email,
          });
        });
    });
  },

  twitch: async (access_token, query, grant) => {
    return new Promise((resolve, reject) => {
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

      twitch
        .get('users')
        .auth(access_token, grant.twitch.key)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.data[0].login,
            email: body.data[0].email,
          });
        });
    });
  },

  linkedin: async (access_token, query) => {
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
          .auth(access_token)
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

  reddit: async (access_token, query) => {
    return new Promise((resolve, reject) => {
      const reddit = purest({
        provider: 'reddit',
        config: purestConfig,
        defaults: { headers: { 'user-agent': 'strapi' } },
      });

      reddit
        .query('auth')
        .get('me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({
            username: body.name,
            email: `${body.name}@strapi.io`,
          });
        });
    });
  },

  auth0: async (access_token, query, grant) => {
    return new Promise((resolve, reject) => {
      const config = {
        auth0: {
          [`https://${grant.auth0.subdomain}.auth0.com`]: {
            __domain: { auth: { auth: { bearer: '[0]' } } },
            '{endpoint}': { __path: { alias: '__default' } },
          },
        },
      };

      const auth0 = purest({ provider: 'auth0', config });
      auth0
        .get('userinfo')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          const username =
            body.username || body.nickname || body.name || body.email.split('@')[0];
          const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
          resolve({ username, email });
        });
    });
  },

  cas: async (access_token, query, grant) => {
    return new Promise((resolve, reject) => {
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

      cas
        .query()
        .get('oidc/profile')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);

          const attrs = body.attributes || body;
          const username = attrs.strapiusername || attrs.id || attrs.sub;
          const email = attrs.strapiemail || attrs.email;

          if (!username || !email) {
            strapi.log.warn(
              `CAS Response Body missing required attributes: ${JSON.stringify(body)}`
            );
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
  if (!profileExtractors[provider]) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const grant = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

  return profileExtractors[provider](
    query.access_token || query.code || query.oauth_token,
    query,
    grant
  );
};

/**
 * Validate user registration
 */
const validateUserRegistration = async (profile, provider, advanced) => {
  const users = await strapi.query('user', 'users-permissions').find({
    email: profile.email,
  });

  const existingUser = _.find(users, { provider });

  if (_.isEmpty(existingUser) && !advanced.allow_register) {
    return {
      error: [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      message: 'Register action is not available.',
    };
  }

  if (!_.isEmpty(existingUser)) {
    return { user: existingUser };
  }

  if (
    !_.isEmpty(_.find(users, u => u.provider !== provider)) &&
    advanced.unique_email
  ) {
    return {
      error: [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      message: 'Email is already taken.',
    };
  }

  return { valid: true };
};

/**
 * Create new user from provider profile
 */
const createUserFromProfile = async (profile, provider, defaultRole) => {
  const params = {
    ...profile,
    provider,
    role: defaultRole.id,
    confirmed: true,
  };

  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Connect through third-party provider
 */
const connect = async (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  if (!access_token) {
    throw new Error('No access_token provided');
  }

  try {
    const profile = await getProfile(provider, query);

    if (!profile.email) {
      throw new Error('Email was not available');
    }

    const advanced = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const validation = await validateUserRegistration(profile, provider, advanced);

    if (validation.error) {
      return [null, validation.error, validation.message];
    }

    if (validation.user) {
      return [validation.user, null];
    }

    const defaultRole = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: advanced.default_role }, []);

    const createdUser = await createUserFromProfile(profile, provider, defaultRole);

    return [createdUser, null];
  } catch (err) {
    throw err;
  }
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```