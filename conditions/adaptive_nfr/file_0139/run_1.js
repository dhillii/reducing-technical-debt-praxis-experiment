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
 * Validates that access token exists.
 * @param {string} accessToken
 * @returns {boolean}
 */
const hasAccessToken = (accessToken) => {
  return Boolean(accessToken);
};

/**
 * Validates that profile has email.
 * @param {object} profile
 * @returns {boolean}
 */
const profileHasEmail = (profile) => {
  return Boolean(profile && profile.email);
};

/**
 * Checks if user exists with given provider.
 * @param {array} users
 * @param {string} provider
 * @returns {boolean}
 */
const userExistsWithProvider = (users, provider) => {
  return !_.isEmpty(_.find(users, { provider }));
};

/**
 * Checks if another user has same email with different provider.
 * @param {array} users
 * @param {string} provider
 * @returns {boolean}
 */
const anotherUserHasSameEmail = (users, provider) => {
  return !_.isEmpty(_.find(users, (user) => user.provider !== provider));
};

/**
 * Checks if registration is allowed.
 * @param {boolean} userExists
 * @param {object} advanced
 * @returns {boolean}
 */
const isRegistrationAllowed = (userExists, advanced) => {
  return userExists || advanced.allow_register;
};

/**
 * Checks if email uniqueness constraint is violated.
 * @param {boolean} anotherUserExists
 * @param {object} advanced
 * @returns {boolean}
 */
const isEmailUniquenessViolated = (anotherUserExists, advanced) => {
  return anotherUserExists && advanced.unique_email;
};

/**
 * Connect thanks to a third-party provider.
 *
 * @param {String}    provider
 * @param {String}    query
 *
 * @return  {Promise}
 */
const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!hasAccessToken(access_token)) {
      return reject([null, { message: 'No access_token.' }]);
    }

    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (!profileHasEmail(profile)) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
        const result = await handleUserConnection(provider, profile);
        return resolve(result);
      } catch (err) {
        return reject([null, err]);
      }
    });
  });
};

/**
 * Handles user connection logic.
 * @param {string} provider
 * @param {object} profile
 * @returns {Promise<array>}
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

  const userExists = userExistsWithProvider(users, provider);

  if (userExists) {
    const user = _.find(users, { provider });
    return [user, null];
  }

  if (!isRegistrationAllowed(userExists, advanced)) {
    return [
      null,
      [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      'Register action is actually not available.',
    ];
  }

  const anotherUserExists = anotherUserHasSameEmail(users, provider);

  if (isEmailUniquenessViolated(anotherUserExists, advanced)) {
    return [
      null,
      [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      'Email is already taken.',
    ];
  }

  return createNewUser(provider, profile, advanced);
};

/**
 * Creates a new user with given profile.
 * @param {string} provider
 * @param {object} profile
 * @param {object} advanced
 * @returns {Promise<array>}
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
 * Handles Discord profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
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
 * Handles Cognito profile retrieval.
 * @param {object} query
 * @param {function} callback
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
 * Handles Facebook profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
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
        return callback(err);
      }

      callback(null, {
        username: body.name,
        email: body.email,
      });
    });
};

/**
 * Handles Google profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
 */
const handleGoogleProfile = (accessToken, callback) => {
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
 * Handles GitHub profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
 */
const handleGithubProfile = (accessToken, callback) => {
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
            username: userbody.login,
            email: email,
          });
        });
    });
};

/**
 * Handles Microsoft profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
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
        return callback(err);
      }

      callback(null, {
        username: body.userPrincipalName,
        email: body.userPrincipalName,
      });
    });
};

/**
 * Handles Twitter profile retrieval.
 * @param {string} accessToken
 * @param {object} query
 * @param {object} grant
 * @param {function} callback
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
        return callback(err);
      }

      callback(null, {
        username: body.screen_name,
        email: body.email,
      });
    });
};

/**
 * Handles Instagram profile retrieval.
 * @param {string} accessToken
 * @param {object} grant
 * @param {function} callback
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
        return callback(err);
      }

      callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
};

/**
 * Handles VK profile retrieval.
 * @param {string} accessToken
 * @param {object} query
 * @param {function} callback
 */
const handleVkProfile = (accessToken, query, callback) => {
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
 * Handles Twitch profile retrieval.
 * @param {string} accessToken
 * @param {object} grant
 * @param {function} callback
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
 * Handles LinkedIn profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
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
    const details = await getDetailsRequest();
    const emailData = await getEmailRequest();
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
 * @param {string} accessToken
 * @param {function} callback
 */
const handleRedditProfile = (accessToken, callback) => {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: