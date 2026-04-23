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
 * Connect thanks to a third-party provider.
 *
 * @param {String} provider
 * @param {Object} query
 *
 * @return {Promise}
 */
const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise(async (resolve, reject) => {
    if (!access_token) {
      return reject([null, { message: 'No access_token.' }]);
    }

    try {
      const profile = await getProfile(provider, query);
      if (!profile.email) {
        return reject([null, { message: 'Email was not available.' }]);
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

      if (_.isEmpty(existingUser) && !advanced.allow_register) {
        return resolve([
          null,
          [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
          'Register action is actually not available.',
        ]);
      }

      if (!_.isEmpty(existingUser)) {
        return resolve([existingUser, null]);
      }

      const otherProviderUserExists =
        !_.isEmpty(_.find(users, (u) => u.provider !== provider)) && advanced.unique_email;

      if (otherProviderUserExists) {
        return resolve([
          null,
          [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
          'Email is already taken.',
        ]);
      }

      const defaultRole = await strapi
        .query('role', 'users-permissions')
        .findOne({ type: advanced.default_role }, []);

      const params = _.assign(profile, {
        provider,
        role: defaultRole.id,
        confirmed: true,
      });

      const createdUser = await strapi.query('user', 'users-permissions').create(params);
      return resolve([createdUser, null]);
    } catch (err) {
      reject([null, err]);
    }
  });
};

/**
 * Retrieve user profile from a provider.
 *
 * @param {String} provider
 * @param {Object} query
 *
 * @return {Promise<Object>}
 */
const getProfile = async (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

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

  return handler({ access_token, query, grant });
};

/**
 * Provider-specific profile handlers.
 */
const providerHandlers = {
  discord: async ({ access_token }) => {
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

    return new Promise((resolve, reject) => {
      discord
        .query()
        .get('users/@me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          const username = `${body.username}#${body.discriminator}`;
          resolve({ username, email: body.email });
        });
    });
  },

  cognito: async ({ query }) => {
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

  facebook: async ({ access_token }) => {
    const facebook = purest({ provider: 'facebook', config: purestConfig });
    return new Promise((resolve, reject) => {
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

  google: async ({ access_token }) => {
    const google = purest({ provider: 'google', config: purestConfig });
    return new Promise((resolve, reject) => {
      google
        .query('oauth')
        .get('tokeninfo')
        .qs({ access_token })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({ username: body.email.split('@')[0], email: body.email });
        });
    });
  },

  github: async ({ access_token }) => {
    const github = purest({
      provider: 'github',
      config: purestConfig,
      defaults: {
        headers: {
          'user-agent': 'strapi',
        },
      },
    });

    const user = await new Promise((resolve, reject) => {
      github
        .query()
        .get('user')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    });

    if (user.email) {
      return { username: user.login, email: user.email };
    }

    const emails = await new Promise((resolve, reject) => {
      github
        .query()
        .get('user/emails')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    });

    const primary = Array.isArray(emails) ? emails.find((e) => e.primary === true) : null;
    return { username: user.login, email: primary ? primary.email : null };
  },

  microsoft: async ({ access_token }) => {
    const microsoft = purest({ provider: 'microsoft', config: purestConfig });
    return new Promise((resolve, reject) => {
      microsoft
        .query()
        .get('me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({ username: body.userPrincipalName, email: body.userPrincipalName });
        });
    });
  },

  twitter: async ({ access_token, query, grant }) => {
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
        .auth(access_token, query.access_secret)
        .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({ username: body.screen_name, email: body.email });
        });
    });
  },

  instagram: async ({ access_token, grant }) => {
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

  vk: async ({ access_token, query }) => {
    const vk = purest({ provider: 'vk', config: purestConfig });
    return new Promise((resolve, reject) => {
      vk.query()
        .get('users.get')
        .qs({ access_token, id: query.raw.user_id, v: '5.122' })
        .request((err, res, body) => {
          if (err) return reject(err);
          const userInfo = body.response[0];
          resolve({
            username: `${userInfo.last_name} ${userInfo.first_name}`,
            email: query.raw.email,
          });
        });
    });
  },

  twitch: async ({ access_token, grant }) => {
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
            'helix/{endpoint}': {
              __path: {
                alias: '__default',
              },
            },
            'oauth2/{endpoint}': {
              __path: {
                alias: 'oauth',
              },
            },
          },
        },
      },
    });

    return new Promise((resolve, reject) => {
      twitch
        .get('users')
        .auth(access_token, grant.twitch.key)
        .request((err, res, body) => {
          if (err) return reject(err);
          const user = body.data[0];
          resolve({ username: user.login, email: user.email });
        });
    });
  },

  linkedin: async ({ access_token }) => {
    const linkedIn = purest({
      provider: 'linkedin',
      config: {
        linkedin: {
          'https://api.linkedin.com': {
            __domain: {
              auth: [{ auth: { bearer: '[0]' } }],
            },
            '[version]/{endpoint}': {
              __path: {
                alias: '__default',
                version: 'v2',
              },
            },
          },
        },
      },
    });

    const getDetails = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(access_token)
          .request((err, res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const getEmail = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(access_token)
          .request((err, res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const details = await getDetails();
    const emailRes = await getEmail();
    const email = emailRes.elements[0]['handle~'];
    return {
      username: details.localizedFirstName,
      email: email.emailAddress,
    };
  },

  reddit: async ({ access_token }) => {
    const reddit = purest({
      provider: 'reddit',
      config: purestConfig,
      defaults: {
        headers: {
          'user-agent': 'strapi',
        },
      },
    });

    return new Promise((resolve, reject) => {
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

  auth0: async ({ access_token, grant }) => {
    const purestAuth0Conf = {};
    purestAuth0Conf[`https://${grant.auth0.subdomain}.auth0.com`] = {
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
    };
    const auth0 = purest({
      provider: 'auth0',
      config: { auth0: purestAuth0Conf },
    });

    return new Promise((resolve, reject) => {
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

  cas: async ({ access_token, grant }) => {
    const provider_url = 'https://' + _.get(grant['cas'], 'subdomain');
    const cas = purest({
      provider: 'cas',
      config: {
        cas: {
          [provider_url]: {
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

    return new Promise((resolve, reject) => {
      cas
        .query()
        .get('oidc/profile')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          const username = body.attributes
            ? body.attributes.strapiusername || body.id || body.sub
            : body.strapiusername || body.id || body.sub;
          const email = body.attributes
            ? body.attributes.strapiemail || body.attributes.email
            : body.strapiemail || body.email;
          if (!username || !email) {
            strapi.log.warn(
              'CAS Response Body did not contain required attributes: ' + JSON.stringify(body)
            );
          }
          resolve({ username, email });
        });
    });
  },
};

/**
 * Build redirect URI for a provider.
 *
 * @param {String} provider
 *
 * @return {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};