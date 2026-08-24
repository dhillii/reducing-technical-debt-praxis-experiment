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
 *
 * @param {String}    provider
 * @param {String}    query
 *
 * @return  {*}
 */

const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!access_token) {
      return reject([null, { message: 'No access_token.' }]);
    }

    // Get the profile.
    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      // We need at least the mail.
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

        const user = _.find(users, { provider });

        if (_.isEmpty(user) && !advanced.allow_register) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (!_.isEmpty(user)) {
          return resolve([user, null]);
        }

        if (
          !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
          advanced.unique_email
        ) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
            'Email is already taken.',
          ]);
        }

        // Retrieve default role.
        const defaultRole = await strapi
          .query('role', 'users-permissions')
          .findOne({ type: advanced.default_role }, []);

        // Create the new user.
        const params = _.assign(profile, {
          provider: provider,
          role: defaultRole.id,
          confirmed: true,
        });

        const createdUser = await strapi.query('user', 'users-permissions').create(params);

        return resolve([createdUser, null]);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

/**
 * Helper to get profiles
 *
 * @param {String}   provider
 * @param {Function} callback
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
    case 'discord': {
      const username = await fetchDiscordUsername(access_token);
      callback(null, {
        username,
        email: query.email,
      });
      break;
    }
    case 'cognito': {
      const { username, email } = extractCognitoProfile(query.id_token);
      callback(null, { username, email });
      break;
    }
    case 'facebook': {
      const { username, email } = await fetchFacebookProfile(access_token);
      callback(null, { username, email });
      break;
    }
    case 'google': {
      const { username, email } = await fetchGoogleProfile(access_token);
      callback(null, { username, email });
      break;
    }
    case 'github': {
      const { username, email } = await fetchGithubProfile(access_token);
      callback(null, { username, email });
      break;
    }
    case 'microsoft': {
      const { username, email } = await fetchMicrosoftProfile(access_token);
      callback(null, { username, email });
      break;
    }
    case 'twitter': {
      const { username, email } = await fetchTwitterProfile(access_token, query, grant);
      callback(null, { username, email });
      break;
    }
    case 'instagram': {
      const { username, email } = await fetchInstagramProfile(access_token, grant);
      callback(null, { username, email });
      break;
    }
    case 'vk': {
      const { username, email } = await fetchVkProfile(access_token, query);
      callback(null, { username, email });
      break;
    }
    case 'twitch': {
      const { username, email } = await fetchTwitchProfile(access_token, grant);
      callback(null, { username, email });
      break;
    }
    case 'linkedin': {
      const { username, email } = await fetchLinkedInProfile(access_token);
      callback(null, { username, email });
      break;
    }
    case 'reddit': {
      const { username, email } = await fetchRedditProfile(access_token);
      callback(null, { username, email });
      break;
    }
    case 'auth0': {
      const { username, email } = await fetchAuth0Profile(access_token, grant);
      callback(null, { username, email });
      break;
    }
    case 'cas': {
      const { username, email } = await fetchCasProfile(access_token, grant);
      callback(null, { username, email });
      break;
    }
    default:
      callback(new Error('Unknown provider.'));
      break;
  }
};

/**
 * Fetch Discord username using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<String>}_discord username
 */
const fetchDiscordUsername = async (accessToken) => {
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
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve(`${body.username}#${body.discriminator}`);
      });
  });
};

/**
 * Extract Cognito user profile from ID token
 *
 * @param {String} idToken - JWT ID token from Amazon Cognito
 * @returns {{username:String, email:String}}
 */
const extractCognitoProfile = (idToken) => {
  const tokenPayload = jwt.decode(idToken);
  if (!tokenPayload) {
    throw new Error('unable to decode jwt token');
  }

  return {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  };
};

/**
 * Fetch Facebook profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<Object>} {username, email}
 */
const fetchFacebookProfile = async (accessToken) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.name,
          email: body.email,
        });
      });
  });
};

/**
 * Fetch Google profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<Object>} {username, email}
 */
const fetchGoogleProfile = async (accessToken) => {
  const google = purest({ provider: 'google', config: purestConfig });

  return new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token })
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.email.split('@')[0],
          email: body.email,
        });
      });
  });
};

/**
 * Fetch GitHub profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<Object>} {username, email}
 */
const fetchGithubProfile = async (accessToken) => {
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
      .auth(accessToken)
      .request((err, res, userbody) => {
        if (err) {
          return reject(err);
        }

        if (userbody.email) {
          return resolve({
            username: userbody.login,
            email: userbody.email,
          });
        }

        // Get the email with Github's user/emails API
        github
          .query()
          .get('user/emails')
          .auth(accessToken)
          .request((err, res, emailsbody) => {
            if (err) {
              return reject(err);
            }

            resolve({
              username: userbody.login,
              email: Array.isArray(emailsbody)
                ? emailsbody.find(email => email.primary === true).email
                : null,
            });
          });
      });
  });
};

/**
 * Fetch Microsoft profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<Object>} {username, email}
 */
const fetchMicrosoftProfile = async (accessToken) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    microsoft
      .query()
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.userPrincipalName,
          email: body.userPrincipalName,
        });
      });
  });
};

/**
 * Fetch Twitter profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @param {Object} query       - OAuth query parameters
 * @param {Object} grant       - Provider grant configuration
 * @returns {Promise<Object>} {username, email}
 */
const fetchTwitterProfile = async (accessToken, query, grant) => {
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
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.screen_name,
          email: body.email,
        });
      });
  });
};

/**
 * Fetch Instagram profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @param {Object} grant       - Provider grant configuration
 * @returns {Promise<Object>} {username, email}
 */
const fetchInstagramProfile = async (accessToken, grant) => {
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
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.username,
          email: `${body.username}@strapi.io`,
        });
      });
  });
};

/**
 * Fetch VK profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @param {Object} query       - OAuth query parameters
 * @returns {Promise<Object>} {username, email}
 */
const fetchVkProfile = async (accessToken, query) => {
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
          return reject(err);
        }
        resolve({
          username: `${body.response[0].last_name} ${body.response[0].first_name}`,
          email: query.raw.email,
        });
      });
  });
};

/**
 * Fetch Twitch profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @param {Object} grant       - Provider grant configuration
 * @returns {Promise<Object>} {username, email}
 */
const fetchTwitchProfile = async (accessToken, grant) => {
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
      .auth(accessToken, grant.twitch.key)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.data[0].login,
          email: body.data[0].email,
        });
      });
  });
};

/**
 * Fetch LinkedIn profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<Object>} {username, email}
 */
const fetchLinkedInProfile = async (accessToken) => {
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

  const getDetailsRequest = () => {
    return new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('me')
        .auth(accessToken)
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
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) {
            return reject(err);
          }
          resolve(body);
        });
    });
  };

  try {
    const { localizedFirstName } = await getDetailsRequest();
    const { elements } = await getEmailRequest();
    const email = elements[0]['handle~'];

    return {
      username: localizedFirstName,
      email: email.emailAddress,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Fetch Reddit profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @returns {Promise<Object>} {username, email}
 */
const fetchRedditProfile = async (accessToken) => {
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
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.name,
          email: `${body.name}@strapi.io`,
        });
      });
  });
};

/**
 * Fetch Auth0 profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @param {Object} grant       - Provider grant configuration
 * @returns {Promise<Object>} {username, email}
 */
const fetchAuth0Profile = async (accessToken, grant) => {
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
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        const username =
          body.username || body.nickname || body.name || body.email.split('@')[0];
        const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

        resolve({
          username,
          email,
        });
      });
  });
};

/**
 * Fetch CAS profile using Purest
 *
 * @param {String} accessToken - OAuth access token
 * @param {Object} grant       - Provider grant configuration
 * @returns {Promise<Object>} {username, email}
 */
const fetchCasProfile = async (accessToken, grant) => {
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
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        // CAS attribute may be in body.attributes or "FLAT", depending on CAS config
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
      });
  });
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};