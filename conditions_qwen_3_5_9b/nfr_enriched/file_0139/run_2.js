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
 * Build the redirect URI for a given provider.
 *
 * @param {String} provider - The provider name.
 * @return {String} The redirect URI.
 */

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

/**
 * Fetch user profile from a third-party provider.
 *
 * @param {String} provider - The provider name.
 * @param {Object} query - Query parameters including access token.
 * @param {Function} callback - Callback function with (err, profile).
 * @return {void}
 */

const getProfile = async (provider, query, callback) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  const grant = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

  switch (provider) {
    case 'discord':
      return await fetchDiscordProfile(access_token, callback);
    case 'cognito':
      return await fetchCognitoProfile(query, callback);
    case 'facebook':
      return await fetchFacebookProfile(access_token, callback);
    case 'google':
      return await fetchGoogleProfile(access_token, callback);
    case 'github':
      return await fetchGitHubProfile(access_token, query, callback);
    case 'microsoft':
      return await fetchMicrosoftProfile(access_token, callback);
    case 'twitter':
      return await fetchTwitterProfile(access_token, query, callback);
    case 'instagram':
      return await fetchInstagramProfile(access_token, callback);
    case 'vk':
      return await fetchVkProfile(access_token, query, callback);
    case 'twitch':
      return await fetchTwitchProfile(access_token, grant, callback);
    case 'linkedin':
      return await fetchLinkedInProfile(access_token, callback);
    case 'reddit':
      return await fetchRedditProfile(access_token, callback);
    case 'auth0':
      return await fetchAuth0Profile(access_token, grant, callback);
    case 'cas':
      return await fetchCasProfile(access_token, grant, callback);
    default:
      callback(new Error('Unknown provider.'));
  }
};

/**
 * Fetch Discord user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchDiscordProfile = (access_token, callback) => {
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
        if (err) {
          reject(err);
        } else {
          const username = `${body.username}#${body.discriminator}`;
          resolve({
            username: username,
            email: body.email,
          });
        }
      });
  });
};

/**
 * Fetch Cognito user profile.
 *
 * @param {Object} query - Query parameters.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchCognitoProfile = (query, callback) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);

  if (!tokenPayload) {
    callback(new Error('unable to decode jwt token'));
    return;
  }

  callback(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
};

/**
 * Fetch Facebook user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchFacebookProfile = (access_token, callback) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.name,
            email: body.email,
          });
        }
      });
  });
};

/**
 * Fetch Google user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchGoogleProfile = (access_token, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  return new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token })
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.email.split('@')[0],
            email: body.email,
          });
        }
      });
  });
};

/**
 * Fetch GitHub user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Object} query - Query parameters.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchGitHubProfile = (access_token, query, callback) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  return new Promise((resolve, reject) => {
    github
      .query()
      .get('user')
      .auth(access_token)
      .request((err, res, userbody) => {
        if (err) {
          return reject(err);
        }

        if (userbody.email) {
          resolve({
            username: userbody.login,
            email: userbody.email,
          });
          return;
        }

        github
          .query()
          .get('user/emails')
          .auth(access_token)
          .request((err, res, emailsbody) => {
            if (err) {
              return reject(err);
            }

            const email = Array.isArray(emailsbody)
              ? emailsbody.find(email => email.primary === true).email
              : null;

            resolve({
              username: userbody.login,
              email: email,
            });
          });
      });
  });
};

/**
 * Fetch Microsoft user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchMicrosoftProfile = (access_token, callback) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    microsoft
      .query()
      .get('me')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.userPrincipalName,
            email: body.userPrincipalName,
          });
        }
      });
  });
};

/**
 * Fetch Twitter user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Object} query - Query parameters.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchTwitterProfile = (access_token, query, callback) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: strapi.store({ environment: '', type: 'plugin', name: 'users-permissions', key: 'grant' }).get().twitter.key,
    secret: strapi.store({ environment: '', type: 'plugin', name: 'users-permissions', key: 'grant' }).get().twitter.secret,
  });

  return new Promise((resolve, reject) => {
    twitter
      .query()
      .get('account/verify_credentials')
      .auth(access_token, query.access_secret)
      .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.screen_name,
            email: body.email,
          });
        }
      });
  });
};

/**
 * Fetch Instagram user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchInstagramProfile = (access_token, callback) => {
  const instagram = purest({
    provider: 'instagram',
    key: strapi.store({ environment: '', type: 'plugin', name: 'users-permissions', key: 'grant' }).get().instagram.key,
    secret: strapi.store({ environment: '', type: 'plugin', name: 'users-permissions', key: 'grant' }).get().instagram.secret,
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    instagram
      .query()
      .get('me')
      .qs({ access_token, fields: 'id,username' })
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.username,
            email: `${body.username}@strapi.io`,
          });
        }
      });
  });
};

/**
 * Fetch VK user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Object} query - Query parameters.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchVkProfile = (access_token, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    vk.query()
      .get('users.get')
      .qs({ access_token, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            username: `${body.response[0].last_name} ${body.response[0].first_name}`,
            email: query.raw.email,
          });
        }
      });
  });
};

/**
 * Fetch Twitch user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Object} grant - Grant configuration.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchTwitchProfile = (access_token, grant, callback) => {
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
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.data[0].login,
            email: body.data[0].email,
          });
        }
      });
  });
};

/**
 * Fetch LinkedIn user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchLinkedInProfile = (access_token, callback) => {
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

  return new Promise((resolve, reject) => {
    const getDetailsRequest = () => {
      return new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(access_token)
          .request((err, res, body) => {
            if (err) {
              return reject(err);
            }
            resolve(body);
          });
      });
    };

    const getEmailRequest = () => {
      return new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(access_token)
          .request((err, res, body) => {
            if (err) {
              return reject(err);
            }
            resolve(body);
          });
      });
    };

    Promise.all([getDetailsRequest(), getEmailRequest()])
      .then(([details, emailData]) => {
        const { localizedFirstName } = details;
        const { elements } = emailData;
        const email = elements[0]['handle~'];

        resolve({
          username: localizedFirstName,
          email: email.emailAddress,
        });
      })
      .catch(reject);
  });
};

/**
 * Fetch Reddit user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchRedditProfile = (access_token, callback) => {
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
        if (err) {
          reject(err);
        } else {
          resolve({
            username: body.name,
            email: `${body.name}@strapi.io`,
          });
        }
      });
  });
};

/**
 * Fetch Auth0 user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Object} grant - Grant configuration.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchAuth0Profile = (access_token, grant, callback) => {
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
    config: {
      auth0: purestAuth0Conf,
    },
  });

  return new Promise((resolve, reject) => {
    auth0
      .get('userinfo')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          const username =
            body.username || body.nickname || body.name || body.email.split('@')[0];
          const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

          resolve({
            username,
            email,
          });
        }
      });
  });
};

/**
 * Fetch CAS user profile.
 *
 * @param {String} access_token - The access token.
 * @param {Object} grant - Grant configuration.
 * @param {Function} callback - Callback function.
 * @return {Promise<void>}
 */

const fetchCasProfile = (access_token, grant, callback) => {
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
        if (err) {
          reject(err);
        } else {
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

          resolve({
            username,
            email,
          });
        }
      });
  });
};

/**
 * Check if user already exists by provider.
 *
 * @param {Array} users - Array of users.
 * @param {String} provider - The provider name.
 * @return {Boolean} True if user exists.
 */

const userExistsByProvider = (users, provider) => {
  return _.find(users, { provider });
};

/**
 * Check if user exists by email.
 *
 * @param {Array} users - Array of users.
 * @param {String} email - The email address.
 * @param {String} provider - The provider name.
 * @return {Boolean} True if user exists.
 */

const userExistsByEmail = (users, email, provider) => {
  return _.find(users, user => user.provider !== provider && user.email === email);
};

/**
 * Fetch default role for user creation.
 *
 * @return {Promise<Object>} The default role object.
 */

const fetchDefaultRole = async () => {
  const advanced = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    })
    .get();

  const defaultRole = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: advanced.default_role }, []);

  return defaultRole;
};

/**
 * Create a new user with the provided profile data.
 *
 * @param {Object} profile - The user profile data.
 * @param {String} provider - The provider name.
 * @param {Object} defaultRole - The default role object.
 * @return {Promise<Object>} The created user object.
 */

const createUser = async (profile, provider, defaultRole) => {
  const params = _.assign(profile, {
    provider: provider,
    role: defaultRole.id,
    confirmed: true,
  });

  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Connect a user through a third-party provider.
 *
 * @param {String} provider - The provider name.
 * @param {Object} query - Query parameters including access token.
 * @return {Promise<Array>} Array with [user, error, message].
 */

const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!access_token) {
      return reject([null, { message: 'No access_token.' }]);
    }

    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (!profile.email) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
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

        const existingUser = userExistsByProvider(users, provider);

        if (!existingUser && !advanced.allow_register) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (existingUser) {
          return resolve([existingUser, null]);
        }

        if (userExistsByEmail(users, profile.email, provider) && advanced.unique_email) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
            'Email is already taken.',
          ]);
        }

        const defaultRole = await fetchDefaultRole();
        const createdUser = await createUser(profile, provider, defaultRole);

        return resolve([createdUser, null]);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

module.exports = {
  connect,
  buildRedirectUri,
};