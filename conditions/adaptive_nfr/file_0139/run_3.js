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
const hasProfileEmail = (profile) => {
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
 * @param {boolean} isUserEmpty
 * @param {object} advanced
 * @returns {boolean}
 */
const isRegistrationAllowed = (isUserEmpty, advanced) => {
  return isUserEmpty && advanced.allow_register;
};

/**
 * Checks if email is unique when required.
 * @param {boolean} anotherUserExists
 * @param {object} advanced
 * @returns {boolean}
 */
const isEmailUnique = (anotherUserExists, advanced) => {
  return !anotherUserExists || !advanced.unique_email;
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

      if (!hasProfileEmail(profile)) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
        await handleUserConnection(provider, profile, resolve, reject);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

/**
 * Handles user connection logic.
 * @param {string} provider
 * @param {object} profile
 * @param {function} resolve
 * @param {function} reject
 */
const handleUserConnection = async (provider, profile, resolve, reject) => {
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
  const isUserEmpty = _.isEmpty(user);

  if (isUserEmpty && !advanced.allow_register) {
    return resolve([
      null,
      [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      'Register action is actually not available.',
    ]);
  }

  if (!isUserEmpty) {
    return resolve([user, null]);
  }

  const anotherUserExists = anotherUserHasSameEmail(users, provider);

  if (!isEmailUnique(anotherUserExists, advanced)) {
    return resolve([
      null,
      [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      'Email is already taken.',
    ]);
  }

  await createNewUser(provider, profile, advanced, resolve);
};

/**
 * Creates a new user with given profile.
 * @param {string} provider
 * @param {object} profile
 * @param {object} advanced
 * @param {function} resolve
 */
const createNewUser = async (provider, profile, advanced, resolve) => {
  const defaultRole = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: advanced.default_role }, []);

  const params = _.assign(profile, {
    provider: provider,
    role: defaultRole.id,
    confirmed: true,
  });

  const createdUser = await strapi.query('user', 'users-permissions').create(params);

  return resolve([createdUser, null]);
};

/**
 * Helper to get profiles
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
      callback(new Error('Unknown provider.'));
  }
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
 * Handles Github profile retrieval.
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

          return callback(null, {
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

  try {
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
 * @param {string} accessToken
 * @param {function} callback
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
        return callback(err);
      }

      callback(null, {
        username: body.name,
        email: `${body.name}@strapi.io`,
      });
    });
};

/**
 * Handles Auth0 profile retrieval.
 * @param {string} accessToken
 * @param {object} grant
 * @param {function} callback
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
 * Handles CAS profile retrieval.
 * @param {string} accessToken
 * @param {object} grant
 * @param {function} callback
 */
const handleCasProfile = (accessToken, grant, callback) => {
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
 * Builds redirect URI for provider callback.
 * @param {string} provider
 * @returns {string}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```