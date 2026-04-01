```javascript
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
 * Validates access token presence.
 * @param {string} accessToken - The access token to validate
 * @returns {boolean} True if token exists
 */
const hasAccessToken = (accessToken) => {
  return !!accessToken;
};

/**
 * Extracts access token from query parameters.
 * @param {Object} query - Query parameters object
 * @returns {string|undefined} The access token
 */
const extractAccessToken = (query) => {
  return query.access_token || query.code || query.oauth_token;
};

/**
 * Retrieves user from database by email.
 * @param {string} email - User email
 * @returns {Promise<Array>} Array of users with matching email
 */
const findUsersByEmail = async (email) => {
  return strapi.query('user', 'users-permissions').find({ email });
};

/**
 * Retrieves advanced settings for users-permissions plugin.
 * @returns {Promise<Object>} Advanced settings configuration
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
 * Retrieves grant configuration for users-permissions plugin.
 * @returns {Promise<Object>} Grant configuration
 */
const getGrantConfig = async () => {
  return strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();
};

/**
 * Finds user by provider in users array.
 * @param {Array} users - Array of users
 * @param {string} provider - Provider name
 * @returns {Object|undefined} User object or undefined
 */
const findUserByProvider = (users, provider) => {
  return _.find(users, { provider });
};

/**
 * Checks if email is already taken by another provider.
 * @param {Array} users - Array of users
 * @param {string} provider - Current provider
 * @returns {boolean} True if email is taken by another provider
 */
const isEmailTakenByOtherProvider = (users, provider) => {
  return !_.isEmpty(_.find(users, (user) => user.provider !== provider));
};

/**
 * Retrieves default role for new users.
 * @param {string} defaultRoleType - Default role type
 * @returns {Promise<Object>} Role object
 */
const getDefaultRole = async (defaultRoleType) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRoleType }, []);
};

/**
 * Creates new user with profile data.
 * @param {Object} profile - User profile data
 * @param {string} provider - Provider name
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Created user object
 */
const createNewUser = async (profile, provider, roleId) => {
  const params = _.assign(profile, {
    provider,
    role: roleId,
    confirmed: true,
  });

  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Handles Discord profile retrieval.
 * @param {string} accessToken - Discord access token
 * @param {Function} callback - Callback function
 */
const handleDiscordProfile = (accessToken, callback) => {
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
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        const username = `${body.username}#${body.discriminator}`;
        callback(null, {
          username,
          email: body.email,
        });
      }
    });
};

/**
 * Handles Cognito profile retrieval.
 * @param {Object} query - Query parameters
 * @param {Function} callback - Callback function
 */
const handleCognitoProfile = (query, callback) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);

  if (!tokenPayload) {
    callback(new Error('unable to decode jwt token'));
  } else {
    callback(null, {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    });
  }
};

/**
 * Handles Facebook profile retrieval.
 * @param {string} accessToken - Facebook access token
 * @param {Function} callback - Callback function
 */
const handleFacebookProfile = (accessToken, callback) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  facebook
    .query()
    .get('me?fields=name,email')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: body.name,
          email: body.email,
        });
      }
    });
};

/**
 * Handles Google profile retrieval.
 * @param {string} accessToken - Google access token
 * @param {Function} callback - Callback function
 */
const handleGoogleProfile = (accessToken, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token: accessToken })
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: body.email.split('@')[0],
          email: body.email,
        });
      }
    });
};

/**
 * Retrieves primary email from GitHub emails API.
 * @param {string} accessToken - GitHub access token
 * @param {string} login - GitHub login
 * @param {Function} callback - Callback function
 */
const getGitHubPrimaryEmail = (accessToken, login, callback) => {
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
    .get('user/emails')
    .auth(accessToken)
    .request((err, res, emailsbody) => {
      if (err) {
        return callback(err);
      }

      const email = Array.isArray(emailsbody)
        ? emailsbody.find((email) => email.primary === true).email
        : null;

      return callback(null, {
        username: login,
        email,
      });
    });
};

/**
 * Handles GitHub profile retrieval.
 * @param {string} accessToken - GitHub access token
 * @param {Function} callback - Callback function
 */
const handleGitHubProfile = (accessToken, callback) => {
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
    .auth(accessToken)
    .request((err, res, userbody) => {
      if (err) {
        return callback(err);
      }

      if (userbody.email) {
        return callback(null, {
          username: userbody.login,
          email: userbody.email,
        });
      }

      getGitHubPrimaryEmail(accessToken, userbody.login, callback);
    });
};

/**
 * Handles Microsoft profile retrieval.
 * @param {string} accessToken - Microsoft access token
 * @param {Function} callback - Callback function
 */
const handleMicrosoftProfile = (accessToken, callback) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  microsoft
    .query()
    .get('me')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: body.userPrincipalName,
          email: body.userPrincipalName,
        });
      }
    });
};

/**
 * Handles Twitter profile retrieval.
 * @param {string} accessToken - Twitter access token
 * @param {Object} query - Query parameters
 * @param {Object} grantConfig - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleTwitterProfile = (accessToken, query, grantConfig, callback) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grantConfig.twitter.key,
    secret: grantConfig.twitter.secret,
  });

  twitter
    .query()
    .get('account/verify_credentials')
    .auth(accessToken, query.access_secret)
    .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: body.screen_name,
          email: body.email,
        });
      }
    });
};

/**
 * Handles Instagram profile retrieval.
 * @param {string} accessToken - Instagram access token
 * @param {Object} grantConfig - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleInstagramProfile = (accessToken, grantConfig, callback) => {
  const instagram = purest({
    provider: 'instagram',
    key: grantConfig.instagram.key,
    secret: grantConfig.instagram.secret,
    config: purestConfig,
  });

  instagram
    .query()
    .get('me')
    .qs({ access_token: accessToken, fields: 'id,username' })
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: body.username,
          email: `${body.username}@strapi.io`,
        });
      }
    });
};

/**
 * Handles VK profile retrieval.
 * @param {string} accessToken - VK access token
 * @param {Object} query - Query parameters
 * @param {Function} callback - Callback function
 */
const handleVKProfile = (accessToken, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk.query()
    .get('users.get')
    .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: `${body.response[0].last_name} ${body.response[0].first_name}`,
          email: query.raw.email,
        });
      }
    });
};

/**
 * Handles Twitch profile retrieval.
 * @param {string} accessToken - Twitch access token
 * @param {Object} grantConfig - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleTwitchProfile = (accessToken, grantConfig, callback) => {
  const twitch = purest({
    provider: 'twitch',
    config: {
      twitch: {
        'https://api.twitch.tv': {
          __domain: {
            auth: {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Client-ID': grantConfig.twitch.key,
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
    .auth(accessToken, grantConfig.twitch.key)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        callback(null, {
          username: body.data[0].login,
          email: body.data[0].email,
        });
      }
    });
};

/**
 * Handles LinkedIn profile retrieval.
 * @param {string} accessToken - LinkedIn access token
 * @param {Function} callback - Callback function
 */
const handleLinkedInProfile = async (accessToken, callback) => {
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

    callback(null, {
      username: localizedFirstName,
      email: email.emailAddress,
    });
  } catch (err) {
    callback(err);
  }
};

/**
 * Handles Reddit profile retrieval.
 * @param {string} accessToken - Reddit access token
 * @param {Function} callback - Callback function
 */
const handleRedditProfile = (accessToken, callback) => {
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
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);