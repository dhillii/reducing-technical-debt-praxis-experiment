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
 * Check if access token is present
 * @param {String} access_token
 * @returns {Boolean}
 */
const hasAccessToken = (access_token) => {
  return !!access_token;
};

/**
 * Check if user has email
 * @param {Object} profile
 * @returns {Boolean}
 */
const hasEmail = (profile) => {
  return !!profile.email;
};

/**
 * Check if user exists with provider
 * @param {Array} users
 * @param {String} provider
 * @returns {Boolean}
 */
const userExistsWithProvider = (users, provider) => {
  return !_.isEmpty(_.find(users, { provider }));
};

/**
 * Check if email is already taken by another provider
 * @param {Array} users
 * @param {String} provider
 * @param {Boolean} uniqueEmailRequired
 * @returns {Boolean}
 */
const isEmailTakenByOtherProvider = (users, provider, uniqueEmailRequired) => {
  return !_.isEmpty(_.find(users, user => user.provider !== provider)) && uniqueEmailRequired;
};

/**
 * Get access token from query
 * @param {Object} query
 * @returns {String}
 */
const getAccessToken = (query) => {
  return query.access_token || query.code || query.oauth_token;
};

/**
 * Handle registration not allowed response
 * @returns {Array}
 */
const getRegistrationNotAllowedResponse = () => {
  return [
    null,
    [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
    'Register action is actually not available.',
  ];
};

/**
 * Handle email taken response
 * @returns {Array}
 */
const getEmailTakenResponse = () => {
  return [
    null,
    [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
    'Email is already taken.',
  ];
};

/**
 * Handle user found response
 * @param {Object} user
 * @returns {Array}
 */
const getUserFoundResponse = (user) => {
  return [user, null];
};

/**
 * Connect thanks to a third-party provider.
 *
 * @param {String}    provider
 * @param {String}    access_token
 *
 * @return  {*}
 */
const connect = (provider, query) => {
  const access_token = getAccessToken(query);

  return new Promise((resolve, reject) => {
    if (!hasAccessToken(access_token)) {
      return reject([null, { message: 'No access_token.' }]);
    }

    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (!hasEmail(profile)) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
        const result = await handleUserConnection(provider, profile);
        return resolve(result);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

/**
 * Handle user connection logic
 * @param {String} provider
 * @param {Object} profile
 * @returns {Promise<Array>}
 */
const handleUserConnection = async (provider, profile) => {
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

  if (userExistsWithProvider(users, provider)) {
    return getUserFoundResponse(user);
  }

  if (_.isEmpty(user) && !advanced.allow_register) {
    return getRegistrationNotAllowedResponse();
  }

  if (isEmailTakenByOtherProvider(users, provider, advanced.unique_email)) {
    return getEmailTakenResponse();
  }

  return createNewUser(provider, profile, advanced);
};

/**
 * Create new user with profile data
 * @param {String} provider
 * @param {Object} profile
 * @param {Object} advanced
 * @returns {Promise<Array>}
 */
const createNewUser = async (provider, profile, advanced) => {
  const defaultRole = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: advanced.default_role }, []);

  const params = _.assign(profile, {
    provider: provider,
    role: defaultRole.id,
    confirmed: true,
  });

  const createdUser = await strapi.query('user', 'users-permissions').create(params);

  return [createdUser, null];
};

/**
 * Handle Discord profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleDiscordProfile = (access_token, callback) => {
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
      if (err) {
        return callback(err);
      }

      const username = `${body.username}#${body.discriminator}`;
      callback(null, {
        username: username,
        email: body.email,
      });
    });
};

/**
 * Handle Cognito profile request
 * @param {Object} query
 * @param {Function} callback
 */
const handleCognitoProfile = (query, callback) => {
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
 * Handle Facebook profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleFacebookProfile = (access_token, callback) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  facebook
    .query()
    .get('me?fields=name,email')
    .auth(access_token)
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
 * Handle Google profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleGoogleProfile = (access_token, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token })
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
 * Handle GitHub profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleGithubProfile = (access_token, callback) => {
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
      if (err) {
        return callback(err);
      }

      if (userbody.email) {
        return callback(null, {
          username: userbody.login,
          email: userbody.email,
        });
      }

      fetchGithubEmails(github, access_token, userbody, callback);
    });
};

/**
 * Fetch GitHub emails from API
 * @param {Object} github
 * @param {String} access_token
 * @param {Object} userbody
 * @param {Function} callback
 */
const fetchGithubEmails = (github, access_token, userbody, callback) => {
  github
    .query()
    .get('user/emails')
    .auth(access_token)
    .request((err, res, emailsbody) => {
      if (err) {
        return callback(err);
      }

      const email = Array.isArray(emailsbody)
        ? emailsbody.find(email => email.primary === true).email
        : null;

      callback(null, {
        username: userbody.login,
        email: email,
      });
    });
};

/**
 * Handle Microsoft profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleMicrosoftProfile = (access_token, callback) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  microsoft
    .query()
    .get('me')
    .auth(access_token)
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
 * Handle Twitter profile request
 * @param {String} access_token
 * @param {Object} query
 * @param {Object} grant
 * @param {Function} callback
 */
const handleTwitterProfile = (access_token, query, grant, callback) => {
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
 * Handle Instagram profile request
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleInstagramProfile = (access_token, grant, callback) => {
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
 * Handle VK profile request
 * @param {String} access_token
 * @param {Object} query
 * @param {Function} callback
 */
const handleVkProfile = (access_token, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk.query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
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
 * Handle Twitch profile request
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleTwitchProfile = (access_token, grant, callback) => {
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
 * Handle LinkedIn profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleLinkedInProfile = async (access_token, callback) => {
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
    const details = await getLinkedInDetails(linkedIn, access_token);
    const emailData = await getLinkedInEmail(linkedIn, access_token);
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
 * Get LinkedIn user details
 * @param {Object} linkedIn
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getLinkedInDetails = (linkedIn, access_token) => {
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

/**
 * Get LinkedIn user email
 * @param {Object} linkedIn
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getLinkedInEmail = (linkedIn, access_token) => {
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

/**
 * Handle Reddit profile request
 * @param {String} access_token
 * @param {Function} callback
 */
const handleRedditProfile = (access_token, callback) => {
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
 * Handle Auth0 profile request
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleAuth0Profile = (access_token, grant, callback) => {
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
 * Handle CAS profile request
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleCasProfile = (access_token, grant, callback) => {
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
          'CAS Response Body did not contain required attributes: ' + JSON.stringify(body)
        );
      }

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Helper to get profiles
 *
 * @param {String}   provider
 * @param {Object}   query
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const access_token = getAccessToken(query);

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
      return handleDiscordProfile(access_token, callback);
    case 'cognito':
      return handleCognitoProfile(query, callback);
    case 'facebook':
      return handleFacebookProfile(access_token, callback);
    case 'google':
      return handleGoogleProfile(access_token, callback);
    case 'github':
      return handleGithubProfile(access_token, callback);
    case 'microsoft':
      return handleMicrosoftProfile(access_token, callback);
    case 'twitter':
      return handleTwitterProfile(access_token, query, grant, callback);
    case 'instagram':
      return handleInstagramProfile(access_token, grant, callback);
    case 'vk':
      return handleVkProfile(access_token, query, callback);
    case 'twitch':
      return handleTwitchProfile(access_token, grant, callback);
    case 'linkedin':
      return handleLinkedInProfile(access_token, callback);
    case 'reddit':
      return handleRedditProfile(access_token, callback);
    case 'auth0':
      return handleAuth0Profile(access_token, grant, callback);
    case 'cas':
      return handleCasProfile(access_token, grant, callback);
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