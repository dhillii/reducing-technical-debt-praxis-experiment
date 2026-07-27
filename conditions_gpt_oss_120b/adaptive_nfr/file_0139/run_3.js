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
 * Connect thanks to a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise}
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
          !_.isEmpty(_.find(users, u => u.provider !== provider)) &&
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
  });
};

/**
 * Guard: checks if an error exists.
 *
 * @param {*} err
 * @returns {boolean}
 */
const hasError = err => !!err;

/**
 * Guard: checks if a value is defined.
 *
 * @param {*} value
 * @returns {boolean}
 */
const isDefined = value => value !== undefined && value !== null;

/**
 * Handles Discord provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleDiscord = (access_token, callback) => {
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

  discord
    .query()
    .get('users/@me')
    .auth(access_token)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      const username = `${body.username}#${body.discriminator}`;
      return callback(null, {
        username,
        email: body.email,
      });
    });
};

/**
 * Handles Cognito provider response.
 *
 * @param {Object} query
 * @param {function} callback
 */
const handleCognito = (query, callback) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);

  if (!isDefined(tokenPayload)) {
    return callback(new Error('unable to decode jwt token'));
  }

  return callback(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
};

/**
 * Handles Facebook provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleFacebook = (access_token, callback) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  facebook
    .query()
    .get('me?fields=name,email')
    .auth(access_token)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.name,
        email: body.email,
      });
    });
};

/**
 * Handles Google provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleGoogle = (access_token, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token })
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.email.split('@')[0],
        email: body.email,
      });
    });
};

/**
 * Handles Github provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleGithub = (access_token, callback) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  github
    .query()
    .get('user')
    .auth(access_token)
    .request((err, res, userbody) => {
      if (hasError(err)) {
        return callback(err);
      }

      if (isDefined(userbody.email)) {
        return callback(null, {
          username: userbody.login,
          email: userbody.email,
        });
      }

      // Fallback to emails API
      github
        .query()
        .get('user/emails')
        .auth(access_token)
        .request((err2, res2, emailsbody) => {
          if (hasError(err2)) {
            return callback(err2);
          }

          const primaryEmail = Array.isArray(emailsbody)
            ? emailsbody.find(e => e.primary === true).email
            : null;

          return callback(null, {
            username: userbody.login,
            email: primaryEmail,
          });
        });
    });
};

/**
 * Handles Microsoft provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleMicrosoft = (access_token, callback) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  microsoft
    .query()
    .get('me')
    .auth(access_token)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.userPrincipalName,
        email: body.userPrincipalName,
      });
    });
};

/**
 * Handles Twitter provider response.
 *
 * @param {string} access_token
 * @param {Object} query
 * @param {Object} grant
 * @param {function} callback
 */
const handleTwitter = (access_token, query, grant, callback) => {
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
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.screen_name,
        email: body.email,
      });
    });
};

/**
 * Handles Instagram provider response.
 *
 * @param {string} access_token
 * @param {Object} grant
 * @param {function} callback
 */
const handleInstagram = (access_token, grant, callback) => {
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
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
};

/**
 * Handles VK provider response.
 *
 * @param {string} access_token
 * @param {Object} query
 * @param {function} callback
 */
const handleVk = (access_token, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk.query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: `${body.response[0].last_name} ${body.response[0].first_name}`,
        email: query.raw.email,
      });
    });
};

/**
 * Handles Twitch provider response.
 *
 * @param {string} access_token
 * @param {Object} grant
 * @param {function} callback
 */
const handleTwitch = (access_token, grant, callback) => {
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

  twitch
    .get('users')
    .auth(access_token, grant.twitch.key)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.data[0].login,
        email: body.data[0].email,
      });
    });
};

/**
 * Handles LinkedIn provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleLinkedIn = async (access_token, callback) => {
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

  try {
    const getDetailsRequest = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(access_token)
          .request((err, res, body) => {
            if (hasError(err)) {
              return reject(err);
            }
            resolve(body);
          });
      });

    const getEmailRequest = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(access_token)
          .request((err, res, body) => {
            if (hasError(err)) {
              return reject(err);
            }
            resolve(body);
          });
      });

    const { localizedFirstName } = await getDetailsRequest();
    const { elements } = await getEmailRequest();
    const email = elements[0]['handle~'];

    return callback(null, {
      username: localizedFirstName,
      email: email.emailAddress,
    });
  } catch (err) {
    return callback(err);
  }
};

/**
 * Handles Reddit provider response.
 *
 * @param {string} access_token
 * @param {function} callback
 */
const handleReddit = (access_token, callback) => {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  reddit
    .query('auth')
    .get('me')
    .auth(access_token)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      return callback(null, {
        username: body.name,
        email: `${body.name}@strapi.io`,
      });
    });
};

/**
 * Handles Auth0 provider response.
 *
 * @param {string} access_token
 * @param {Object} grant
 * @param {function} callback
 */
const handleAuth0 = (access_token, grant, callback) => {
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

  auth0
    .get('userinfo')
    .auth(access_token)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

      const username =
        body.username || body.nickname || body.name || body.email.split('@')[0];
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

      return callback(null, {
        username,
        email,
      });
    });
};

/**
 * Handles CAS provider response.
 *
 * @param {string} access_token
 * @param {Object} grant
 * @param {function} callback
 */
const handleCas = (access_token, grant, callback) => {
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

  cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request((err, res, body) => {
      if (hasError(err)) {
        return callback(err);
      }

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

      return callback(null, {
        username,
        email,
      });
    });
};

/**
 * Retrieves a user profile from a third‑party provider.
 *
 * @param {String}   provider
 * @param {Object}   query
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
    case 'discord':
      return handleDiscord(access_token, callback);
    case 'cognito':
      return handleCognito(query, callback);
    case 'facebook':
      return handleFacebook(access_token, callback);
    case 'google':
      return handleGoogle(access_token, callback);
    case 'github':
      return handleGithub(access_token, callback);
    case 'microsoft':
      return handleMicrosoft(access_token, callback);
    case 'twitter':
      return handleTwitter(access_token, query, grant, callback);
    case 'instagram':
      return handleInstagram(access_token, grant, callback);
    case 'vk':
      return handleVk(access_token, query, callback);
    case 'twitch':
      return handleTwitch(access_token, grant, callback);
    case 'linkedin':
      return handleLinkedIn(access_token, callback);
    case 'reddit':
      return handleReddit(access_token, callback);
    case 'auth0':
      return handleAuth0(access_token, grant, callback);
    case 'cas':
      return handleCas(access_token, grant, callback);
    default:
      return callback(new Error('Unknown provider.'));
  }
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};