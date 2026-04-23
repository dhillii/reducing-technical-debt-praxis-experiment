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
 * @param {boolean} isUserEmpty
 * @param {boolean} allowRegister
 * @returns {boolean}
 */
const canRegisterNewUser = (isUserEmpty, allowRegister) => {
  return isUserEmpty && allowRegister;
};

/**
 * Checks if email is unique when required.
 * @param {boolean} anotherUserExists
 * @param {boolean} uniqueEmailRequired
 * @returns {boolean}
 */
const isEmailUnique = (anotherUserExists, uniqueEmailRequired) => {
  return !(anotherUserExists && uniqueEmailRequired);
};

/**
 * Extracts access token from query parameters.
 * @param {object} query
 * @returns {string}
 */
const extractAccessToken = (query) => {
  return query.access_token || query.code || query.oauth_token;
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
        username,
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
 * Retrieves primary email from GitHub emails array.
 * @param {array} emailsbody
 * @returns {string|null}
 */
const getPrimaryGitHubEmail = (emailsbody) => {
  if (!Array.isArray(emailsbody)) {
    return null;
  }

  const primaryEmail = emailsbody.find((email) => email.primary === true);
  return primaryEmail ? primaryEmail.email : null;
};

/**
 * Handles GitHub profile retrieval.
 * @param {string} accessToken
 * @param {function} callback
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

      github
        .query()
        .get('user/emails')
        .auth(accessToken)
        .request((err, res, emailsbody) => {
          if (err) {
            return callback(err);
          }

          const email = getPrimaryGitHubEmail(emailsbody);
          callback(null, {
            username: userbody.login,
            email,
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
 * Extracts Auth0 username from profile data.
 * @param {object} body
 * @returns {string}
 */
const extractAuth0Username = (body) => {
  return body.username || body.nickname || body.name || body.email.split('@')[0];
};

/**
 * Extracts Auth0 email from profile data.
 * @param {object} body
 * @param {string} username
 * @returns {string}
 */
const extractAuth0Email = (body, username) => {
  return body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
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

      const username = extractAuth0Username(body);
      const email = extractAuth0Email(body, username);

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Extracts CAS username from profile data.
 * @param {object} body
 * @returns {string}
 */
const extractCASUsername = (body) => {
  return body.attributes
    ? body.attributes.strapiusername || body.id || body.sub
    : body.strapiusername || body.id || body.sub;
};

/**
 * Extracts CAS email from profile data.
 * @param {object} body
 * @returns {string}
 */
const extractCASEmail = (body) => {
  return body.attributes
    ? body.attributes.strapiemail || body.attributes.email
    : body.strapiemail || body.email;
};

/**
 * Validates CAS profile has required attributes.
 * @param {string} username
 * @param {string} email
 * @param {object} body
 */
const validateCASProfile = (username, email, body) => {
  if (!username || !email) {
    strapi.log.warn(
      'CAS Response Body did not contain required attributes: ' + JSON.stringify(body)
    );
  }
};

/**
 * Handles CAS profile retrieval.
 * @param {string} accessToken
 * @param {object} grant
 * @param {function} callback
 */
const handleCASProfile = (accessToken, grant, callback) => {
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

      const username = extractCASUsername(body);
      const email = extractCASEmail(body);

      validateCASProfile(username, email, body);

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Routes profile retrieval to appropriate provider handler.
 * @param {string} provider
 * @param {object} query
 * @param {object} grant
 * @param {function} callback
 */
const routeProfileHandler = (provider, query, grant, callback) => {
  const accessToken = extractAccessToken(query);

  switch (provider) {
    case 'discord':
      return handleDiscordProfile(accessToken, callback);
    case 'cognito':
      return handleCognitoProfile(query, callback);
    case 'facebook':
      return handleFacebookProfile(accessToken, callback);
    case 'google':
      return handleGoogleProfile(accessToken, callback);
    case 'github':
      return handleGitHubProfile(accessToken, callback);
    case 'microsoft':
      return handleMicrosoftProfile(accessToken, callback);
    case 'twitter':
      return handleTwitterProfile(accessToken, query, grant, callback);
    case 'instagram':
      return handleInstagramProfile(accessToken, grant, callback);
    case 'vk':
      return handleVKProfile(accessToken, query, callback);
    case 'twitch':
      return handleTwitchProfile(accessToken, grant, callback);
    case 'linkedin':
      return handleLinkedInProfile(accessToken, callback);
    case 'reddit':
      return handleRedditProfile(accessToken, callback);
    case 'auth0':
      return handleAuth0Profile(accessToken, grant, callback);
    case 'cas':
      return handleCASProfile(accessToken, grant, callback);
    default:
      return callback(new Error('Unknown provider.'));
  }
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
  const accessToken = extractAccessToken(query);

  return new Promise((resolve, reject) => {
    if (!hasAccessToken(accessToken)) {
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

        if (!userExists && !advanced.allow_register) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (userExists) {
          const user = _.find(users, { provider });
          return resolve([user, null]);
        }

        const anotherUserExists = anotherUserHasSameEmail(users, provider);
        if (!isEmailUnique(anotherUserExists, advanced.unique_email)) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
            'Email is already taken.',
          ]);
        }

        const defaultRole = await strapi
          .query('role', 'users-permissions')
          .findOne({ type: advanced.default_role }, []);

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
 * Helper to get profiles
 *
 * @param {String}   provider
 * @param {Object}   query
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const grant = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

  routeProfileHandler(provider, query, grant, callback);
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```