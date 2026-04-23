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
 * Extracts access token from query parameters.
 * @param {Object} query - Query parameters object
 * @returns {string|null} Access token or null
 */
const extractAccessToken = (query) => {
  return query.access_token || query.code || query.oauth_token;
};

/**
 * Validates that access token exists.
 * @param {string} accessToken - Access token to validate
 * @returns {Promise} Rejects if token is missing
 */
const validateAccessToken = (accessToken) => {
  return new Promise((resolve, reject) => {
    if (!accessToken) {
      reject([null, { message: 'No access_token.' }]);
    } else {
      resolve();
    }
  });
};

/**
 * Validates that profile has required email field.
 * @param {Object} profile - User profile object
 * @returns {Promise} Rejects if email is missing
 */
const validateProfileEmail = (profile) => {
  return new Promise((resolve, reject) => {
    if (!profile.email) {
      reject([null, { message: 'Email was not available.' }]);
    } else {
      resolve();
    }
  });
};

/**
 * Retrieves advanced settings for users-permissions plugin.
 * @returns {Promise<Object>} Advanced settings object
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
 * @returns {Promise<Object>} Grant configuration object
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
 * Finds existing user by email and provider.
 * @param {Array} users - Array of user objects
 * @param {string} provider - Provider name
 * @returns {Object|undefined} User object or undefined
 */
const findUserByProvider = (users, provider) => {
  return _.find(users, { provider });
};

/**
 * Checks if registration is allowed based on advanced settings.
 * @param {Object} user - User object
 * @param {Object} advanced - Advanced settings
 * @returns {Promise} Rejects if registration not allowed
 */
const validateRegistrationAllowed = (user, advanced) => {
  return new Promise((resolve, reject) => {
    if (_.isEmpty(user) && !advanced.allow_register) {
      reject([
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ]);
    } else {
      resolve();
    }
  });
};

/**
 * Checks if email is already taken by another provider.
 * @param {Array} users - Array of user objects
 * @param {string} provider - Provider name
 * @param {Object} advanced - Advanced settings
 * @returns {Promise} Rejects if email is taken
 */
const validateEmailUniqueness = (users, provider, advanced) => {
  return new Promise((resolve, reject) => {
    const otherProviderUser = _.find(users, (user) => user.provider !== provider);
    if (!_.isEmpty(otherProviderUser) && advanced.unique_email) {
      reject([
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ]);
    } else {
      resolve();
    }
  });
};

/**
 * Retrieves default role for new users.
 * @param {Object} advanced - Advanced settings
 * @returns {Promise<Object>} Default role object
 */
const getDefaultRole = async (advanced) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: advanced.default_role }, []);
};

/**
 * Creates new user with profile data and default role.
 * @param {Object} profile - User profile object
 * @param {string} provider - Provider name
 * @param {string} roleId - Default role ID
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
 * Handles user connection logic after profile retrieval.
 * @param {Object} profile - User profile object
 * @param {string} provider - Provider name
 * @returns {Promise<Array>} Resolution array [user, error]
 */
const handleUserConnection = async (profile, provider) => {
  await validateProfileEmail(profile);

  const users = await strapi.query('user', 'users-permissions').find({
    email: profile.email,
  });

  const advanced = await getAdvancedSettings();
  const user = findUserByProvider(users, provider);

  await validateRegistrationAllowed(user, advanced);

  if (!_.isEmpty(user)) {
    return [user, null];
  }

  await validateEmailUniqueness(users, provider, advanced);

  const defaultRole = await getDefaultRole(advanced);
  const createdUser = await createNewUser(profile, provider, defaultRole.id);

  return [createdUser, null];
};

/**
 * Connect thanks to a third-party provider.
 *
 * @param {String} provider - Provider name
 * @param {Object} query - Query parameters
 * @returns {Promise<Array>} Resolution array [user, error]
 */
const connect = (provider, query) => {
  const accessToken = extractAccessToken(query);

  return new Promise((resolve, reject) => {
    validateAccessToken(accessToken)
      .then(() => {
        getProfile(provider, query, async (err, profile) => {
          if (err) {
            return reject([null, err]);
          }

          try {
            const result = await handleUserConnection(profile, provider);
            resolve(result);
          } catch (error) {
            reject([null, error]);
          }
        });
      })
      .catch(reject);
  });
};

/**
 * Handles Discord profile retrieval.
 * @param {string} accessToken - Access token
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
 * @param {string} accessToken - Access token
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
 * @param {string} accessToken - Access token
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
 * Retrieves GitHub user emails.
 * @param {Object} github - Purest GitHub instance
 * @param {string} accessToken - Access token
 * @param {string} login - GitHub login
 * @param {Function} callback - Callback function
 */
const getGitHubEmails = (github, accessToken, login, callback) => {
  github
    .query()
    .get('user/emails')
    .auth(accessToken)
    .request((err, res, emailsbody) => {
      if (err) {
        return callback(err);
      }

      callback(null, {
        username: login,
        email: Array.isArray(emailsbody)
          ? emailsbody.find((email) => email.primary === true).email
          : null,
      });
    });
};

/**
 * Handles GitHub profile retrieval.
 * @param {string} accessToken - Access token
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

      getGitHubEmails(github, accessToken, userbody.login, callback);
    });
};

/**
 * Handles Microsoft profile retrieval.
 * @param {string} accessToken - Access token
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
 * @param {string} accessToken - Access token
 * @param {Object} query - Query parameters
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleTwitterProfile = (accessToken, query, grant, callback) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
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
 * @param {string} accessToken - Access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleInstagramProfile = (accessToken, grant, callback) => {
  const instagram = purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
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
 * @param {string} accessToken - Access token
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
 * @param {string} accessToken - Access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleTwitchProfile = (accessToken, grant, callback) => {
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
    .auth(accessToken, grant.twitch.key)
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
 * Retrieves LinkedIn user details.
 * @param {Object} linkedIn - Purest LinkedIn instance
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} User details
 */
const getLinkedInDetails = (linkedIn, accessToken) => {
  return new Promise((resolve, reject) => {
    linkedIn
      .query()
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve(body);
        }
      });
  });
};

/**
 * Retrieves LinkedIn user email.
 * @param {Object} linkedIn - Purest LinkedIn instance
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} Email data
 */
const getLinkedInEmail = (linkedIn, accessToken) => {
  return new Promise((resolve, reject) => {
    linkedIn
      .query()
      .get('emailAddress?q=members&projection=(elements*(handle~))')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve(body);
        }
      });
  });
};

/**
 * Handles LinkedIn profile retrieval.
 * @param {string} accessToken - Access token
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

  try {
    const details = await getLinkedInDetails(linkedIn, accessToken);
    const emailData = await getLinkedInEmail(linkedIn, accessToken);
    const email = emailData.elements[0]['handle~'];

    callback(null, {
      username: details.localizedFirstName,
      email: email.emailAddress,
    });
  } catch (err) {
    callback(err);
  }
};

/**
 * Handles Reddit profile retrieval.
 * @param {string} accessToken - Access token
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
      } else {
        callback(null, {
          username: body.name,
          email: `${body.name}@strapi.io`,
        });
      }
    });
};

/**
 * Handles Auth0 profile retrieval.
 * @param {string} accessToken - Access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleAuth0Profile = (accessToken, grant, callback) => {
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
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        const username =
          body.username || body.nickname || body.name || body.email.split('@')[0];
        const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

        callback(null, {
          username,
          email,
        });
      }
    });
};

/**
 * Handles CAS profile retrieval.
 * @param {string} accessToken - Access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleCASProfile = (accessToken, grant, callback) => {
  const providerUrl = `https://${_.get(grant['cas'], 'subdomain')}`;
  const cas = purest({
    provider: 'cas',
    config: {
      cas: {
        [providerUrl]: {
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
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        const username = body.attributes
          ? body.attributes.strapiusername || body.id || body.sub
          : body.strapiusername || body.id || body.sub;
        const email = body.attributes
          ? body.attributes.strapiemail || body.attributes.email
          : body.strapiemail || body.email;

        if (!username || !email) {
          strapi.log.warn(
            `CAS Response Body did not contain required attributes: ${JSON.stringify(body)}`
          );
        }

        callback(null, {
          username,
          email,
        });
      }
    });
};

/**
 * Helper to get profiles from various providers.
 *
 * @param {String} provider - Provider name
 * @param {Object} query - Query parameters
 * @param {Function} callback - Callback function
 */
const getProfile = async (provider, query, callback) => {
  const accessToken = extractAccessToken(query);

  try {
    const grant = await getGrantConfig();

    switch (provider) {
      case 'discord':
        handleDiscordProfile(accessToken, callback);
        break;
      case 'cognito':
        handleCognitoProfile(query, callback);
        break;
      case 'facebook':
        handleFacebookProfile(accessToken, callback);
        break;
      case 'google':
        handleGoogleProfile(accessToken, callback);
        break;
      case 'github':
        handleGitHubProfile(accessToken, callback);
        break;
      case 'microsoft':
        handleMicrosoftProfile(accessToken, callback);
        break;
      case 'twitter':
        handleTwitterProfile(accessToken, query, grant, callback);
        break;
      case 'instagram':
        handleInstagramProfile(accessToken, grant, callback);
        break;
      case 'vk':
        handleVKProfile(accessToken, query, callback);
        break;
      case 'twitch':
        handleTwitchProfile(accessToken, grant, callback);
        break;
      case 'linkedin':
        await handleLinkedInProfile(accessToken, callback);
        break;
      case 'reddit':
        handleRedditProfile(accessToken, callback);
        break;
      case 'auth0':
        handleAuth0Profile(accessToken, grant, callback);
        break;
      case 'cas':
        handleCASProfile(accessToken, grant, callback);
        break;
      default:
        callback(new Error('Unknown provider.'));
        break;
    }
  } catch (err) {
    callback(err);
  }
};

/**
 * Builds redirect URI for OAuth callback.
 * @param {String} provider - Provider name
 * @returns {String} Redirect URI
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};