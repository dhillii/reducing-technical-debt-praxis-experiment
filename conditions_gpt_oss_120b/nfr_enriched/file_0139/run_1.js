'use strict';

/**
 * Module dependencies.
 */
const _ = require('lodash');
const request = require('request');
const purest = require('purest')({ request });
const purestConfig = require('@purest/providers');
const { getAbsoluteServerUrl } = require('strapi-utils');
const jwt = require('jsonwebtoken');

/**
 * Connect thanks to a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise}
 */
const connect = (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!accessToken) {
      return reject([null, { message: 'No access_token.' }]);
    }

    // Retrieve the user profile from the provider.
    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (!profile.email) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
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

        const emailTaken = !_.isEmpty(
          _.find(users, (u) => u.provider !== provider)
        );
        if (emailTaken && advanced.unique_email) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
            'Email is already taken.',
          ]);
        }

        const defaultRole = await strapi
          .query('role', 'users-permissions')
          .findOne({ type: advanced.default_role }, []);

        const newUserParams = _.assign(profile, {
          provider,
          role: defaultRole.id,
          confirmed: true,
        });

        const createdUser = await strapi
          .query('user', 'users-permissions')
          .create(newUserParams);

        return resolve([createdUser, null]);
      } catch (error) {
        reject([null, error]);
      }
    });
  });
};

/**
 * Retrieve a user profile from a specific provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  try {
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
      return callback(new Error('Unknown provider.'));
    }

    const profile = await handler({ accessToken, query, grant });
    callback(null, profile);
  } catch (error) {
    callback(error);
  }
};

/**
 * Handlers for each supported provider.
 * Each handler returns a Promise resolving to { username, email }.
 */
const providerHandlers = {
  discord: async ({ accessToken }) => {
    const discord = purest({
      provider: 'discord',
      config: {
        discord: {
          'https://discordapp.com/api/': {
            __domain: {
              auth: { auth: { bearer: '[0]' } },
            },
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
          const username = `${body.username}#${body.discriminator}`;
          resolve({ username, email: body.email });
        });
    });
  },

  cognito: async ({ query }) => {
    const idToken = query.id_token;
    const payload = jwt.decode(idToken);
    if (!payload) {
      throw new Error('unable to decode jwt token');
    }
    return {
      username: payload['cognito:username'],
      email: payload.email,
    };
  },

  facebook: async ({ accessToken }) => {
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

  google: async ({ accessToken }) => {
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

  github: async ({ accessToken }) => {
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
            return resolve({ username: userBody.login, email: userBody.email });
          }

          // Fallback to emails endpoint
          github
            .query()
            .get('user/emails')
            .auth(accessToken)
            .request((err2, res2, emailsBody) => {
              if (err2) return reject(err2);
              const primary = Array.isArray(emailsBody)
                ? emailsBody.find((e) => e.primary === true)
                : null;
              resolve({
                username: userBody.login,
                email: primary ? primary.email : null,
              });
            });
        });
    });
  },

  microsoft: async ({ accessToken }) => {
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

  twitter: async ({ accessToken, query, grant }) => {
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
        .qs({
          screen_name: query['raw[screen_name]'],
          include_email: 'true',
        })
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve({ username: body.screen_name, email: body.email });
        });
    });
  },

  instagram: async ({ accessToken, grant }) => {
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

  vk: async ({ accessToken, query }) => {
    const vk = purest({ provider: 'vk', config: purestConfig });
    return new Promise((resolve, reject) => {
      vk.query()
        .get('users.get')
        .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
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

  twitch: async ({ accessToken, grant }) => {
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
          const user = body.data[0];
          resolve({ username: user.login, email: user.email });
        });
    });
  },

  linkedin: async ({ accessToken, grant }) => {
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

    const getDetails = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(accessToken)
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
          .auth(accessToken)
          .request((err, res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const details = await getDetails();
    const emailInfo = await getEmail();
    const email = emailInfo.elements[0]['handle~'];

    return {
      username: details.localizedFirstName,
      email: email.emailAddress,
    };
  },

  reddit: async ({ accessToken }) => {
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

  auth0: async ({ accessToken, grant }) => {
    const auth0Domain = `https://${grant.auth0.subdomain}.auth0.com`;
    const auth0 = purest({
      provider: 'auth0',
      config: { auth0: { [auth0Domain]: { __domain: { auth: { auth: { bearer: '[0]' } } }, '{endpoint}': { __path: { alias: '__default' } } } } },
    });

    return new Promise((resolve, reject) => {
      auth0
        .get('userinfo')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          const username =
            body.username ||
            body.nickname ||
            body.name ||
            body.email.split('@')[0];
          const email =
            body.email ||
            `${username.replace(/\s+/g, '.')}@strapi.io`;
          resolve({ username, email });
        });
    });
  },

  cas: async ({ accessToken, grant }) => {
    const providerUrl = `https://${_.get(grant['cas'], 'subdomain')}`;
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
            strapi.log.warn(
              'CAS Response Body did not contain required attributes: ' +
                JSON.stringify(body)
            );
          }

          resolve({ username, email });
        });
    });
  },
};

/**
 * Build the redirect URI for a given provider.
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