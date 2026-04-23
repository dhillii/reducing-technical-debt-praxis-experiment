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
 * Finds user by provider in users array.
 * @param {Array} users - Array of user objects
 * @param {string} provider - Provider name
 * @returns {Object|undefined} User object or undefined
 */
const findUserByProvider = (users, provider) => {
  return _.find(users, { provider });
};

/**
 * Checks if email is already taken by another provider.
 * @param {Array} users - Array of user objects
 * @param {string} provider - Current provider name
 * @returns {boolean} True if email is taken by another provider
 */
const isEmailTakenByOtherProvider = (users, provider) => {
  return !_.isEmpty(_.find(users, (user) => user.provider !== provider));
};

/**
 * Retrieves default role for new users.
 * @param {string} defaultRoleType - Default role type from settings
 * @returns {Promise<Object>} Role object
 */
const getDefaultRole = async (defaultRoleType) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: defaultRoleType }, []);
};

/**
 * Creates new user with profile data.
 * @param {Object} profile - User profile from provider
 * @param {string} provider - Provider name
 * @param {string} roleId - Role ID for new user
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
 * Handles Discord provider authentication.
 * @param {string} accessToken - Discord access token
 * @param {Function} callback - Callback function
 */
const handleDiscordAuth = (accessToken, callback) => {
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
        return callback(err);
      }

      const username = `${body.username}#${body.discriminator}`;
      callback(null, {
        username,
        email: body.email,
      });
    });
};

/**
 * Handles Cognito provider authentication.
 * @param {Object} query - Query parameters containing id_token
 * @param {Function} callback - Callback function
 */
const handleCognitoAuth = (query, callback) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);

  if (!tokenPayload) {
    return callback(new Error('unable to decode jwt token'));
  }

  callback(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
};

/**
 * Handles Facebook provider authentication.
 * @param {string} accessToken - Facebook access token
 * @param {Function} callback - Callback function
 */
const handleFacebookAuth = (accessToken, callback) => {
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
        return callback(err);
      }

      callback(null, {
        username: body.name,
        email: body.email,
      });
    });
};

/**
 * Handles Google provider authentication.
 * @param {string} accessToken - Google access token
 * @param {Function} callback - Callback function
 */
const handleGoogleAuth = (accessToken, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token: accessToken })
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      callback(null, {
        username: body.email.split('@')[0],
        email: body.email,
      });
    });
};

/**
 * Retrieves primary email from GitHub emails API.
 * @param {string} accessToken - GitHub access token
 * @param {string} login - GitHub login username
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

      callback(null, {
        username: login,
        email,
      });
    });
};

/**
 * Handles GitHub provider authentication.
 * @param {string} accessToken - GitHub access token
 * @param {Function} callback - Callback function
 */
const handleGitHubAuth = (accessToken, callback) => {
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
 * Handles Microsoft provider authentication.
 * @param {string} accessToken - Microsoft access token
 * @param {Function} callback - Callback function
 */
const handleMicrosoftAuth = (accessToken, callback) => {
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
        return callback(err);
      }

      callback(null, {
        username: body.userPrincipalName,
        email: body.userPrincipalName,
      });
    });
};

/**
 * Handles Twitter provider authentication.
 * @param {string} accessToken - Twitter access token
 * @param {Object} query - Query parameters
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleTwitterAuth = (accessToken, query, grant, callback) => {
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
        return callback(err);
      }

      callback(null, {
        username: body.screen_name,
        email: body.email,
      });
    });
};

/**
 * Handles Instagram provider authentication.
 * @param {string} accessToken - Instagram access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleInstagramAuth = (accessToken, grant, callback) => {
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
        return callback(err);
      }

      callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
};

/**
 * Handles VK provider authentication.
 * @param {string} accessToken - VK access token
 * @param {Object} query - Query parameters
 * @param {Function} callback - Callback function
 */
const handleVKAuth = (accessToken, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk.query()
    .get('users.get')
    .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      callback(null, {
        username: `${body.response[0].last_name} ${body.response[0].first_name}`,
        email: query.raw.email,
      });
    });
};

/**
 * Handles Twitch provider authentication.
 * @param {string} accessToken - Twitch access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleTwitchAuth = (accessToken, grant, callback) => {
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
        return callback(err);
      }

      callback(null, {
        username: body.data[0].login,
        email: body.data[0].email,
      });
    });
};

/**
 * Handles LinkedIn provider authentication.
 * @param {string} accessToken - LinkedIn access token
 * @param {Function} callback - Callback function
 */
const handleLinkedInAuth = async (accessToken, callback) => {
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
 * Handles Reddit provider authentication.
 * @param {string} accessToken - Reddit access token
 * @param {Function} callback - Callback function
 */
const handleRedditAuth = (accessToken, callback) => {
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
        return callback(err);
      }

      callback(null, {
        username: body.name,
        email: `${body.name}@strapi.io`,
      });
    });
};

/**
 * Handles Auth0 provider authentication.
 * @param {string} accessToken - Auth0 access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleAuth0Auth = (accessToken, grant, callback) => {
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
        return callback(err);
      }

      const username =
        body.username || body.nickname || body.name || body.email.split('@')[0];
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Handles CAS provider authentication.
 * @param {string} accessToken - CAS access token
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const handleCASAuth = (accessToken, grant, callback) => {
  const providerUrl = `https://${_.get(grant, 'cas.subdomain')}`;
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
          `CAS Response Body did not contain required attributes: ${JSON.stringify(body)}`
        );
      }

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Routes authentication to appropriate provider handler.
 * @param {string} provider - Provider name
 * @param {string} accessToken - Access token
 * @param {Object} query - Query parameters
 * @param {Object} grant - Grant configuration
 * @param {Function} callback - Callback function
 */
const routeProviderAuth = async (provider, accessToken, query, grant, callback) => {
  switch (provider) {
    case 'discord':
      return handleDiscordAuth(accessToken, callback);
    case 'cognito':
      return handleCognitoAuth(query, callback);
    case 'facebook':
      return handleFacebookAuth(accessToken, callback);
    case 'google':
      return handleGoogleAuth(accessToken, callback);
    case 'github':
      return handleGitHubAuth(accessToken, callback);
    case 'microsoft':
      return handleMicrosoftAuth(accessToken, callback);
    case 'twitter':
      return handleTwitterAuth(accessToken, query, grant, callback);
    case 'instagram':
      return handleInstagramAuth(accessToken, grant, callback);
    case 'vk':
      return handleVKAuth(accessToken, query, callback);
    case 'twitch':
      return handleTwitchAuth(accessToken, grant, callback);
    case 'linkedin':
      return handleLinkedInAuth(accessToken, callback);
    case 'reddit':
      return handleRedditAuth(accessToken, callback);
    case 'auth0':
      return handleAuth0Auth(accessToken, grant, callback);
    case 'cas':
      return handleCASAuth(accessToken, grant, callback);
    default:
      return callback(new Error('Unknown provider.'));
  }
};

/**
 * Helper to get profiles from third-party providers.
 * @param {string} provider - Provider name
 * @param {Object} query - Query parameters
 * @param {Function} callback - Callback function
 */
const getProfile = async (provider, query, callback) => {
  const accessToken = extractAccessToken(query);
  const grant = await getGrantConfig();

  routeProviderAuth(provider, accessToken, query, grant, callback);
};

/**
 * Validates user registration eligibility.
 * @param {Array} users - Array of existing users
 * @param {string} provider - Provider name
 * @param {Object} advanced - Advanced settings
 * @returns {Object|null} Error response or null if valid
 */
const validateUserRegistration = (users, provider, advanced) => {
  const existingUser = findUserByProvider(users, provider);

  if (_.isEmpty(existingUser) && !advanced.allow_register) {
    return [
      null,
      [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      'Register action is actually not available.',
    ];
  }

  if (
    isEmailTakenByOtherProvider(users, provider) &&
    advanced.unique_email
  ) {
    return [
      null,
      [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      'Email is already taken.',
    ];
  }

  return null;
};

/**
 * Connect thanks to a third-party provider.
 * @param {string} provider - Provider name
 * @param {Object} query - Query parameters
 * @returns {Promise<Array>} Result array [user, error, message]
 */
const connect = (provider, query) => {
  const accessToken = extractAccessToken(query);

  return new Promise((resolve, reject) => {
    if (!hasAccessToken(accessToken)) {
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
        const users = await findUsersByEmail(profile.email);
        const advanced = await getAdvancedSettings();
        const existingUser = findUserByProvider(users, provider);

        const validationError = validateUserRegistration(users, provider, advanced);
        if (validationError) {
          return resolve(validationError);
        }

        if (!_.isEmpty(existingUser)) {
          return resolve([existingUser, null]);
        }

        const defaultRole = await getDefaultRole(advanced.default_role);
        const createdUser = await createNewUser(profile, provider, defaultRole.id);

        return resolve([createdUser, null]);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

/**
 * Builds redirect URI for provider callback.
 * @param {string} provider - Provider name
 * @returns {string} Redirect URI
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```