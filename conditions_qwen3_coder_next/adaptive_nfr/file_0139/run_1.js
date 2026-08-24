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
 * @param {String}    access_token
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

        if (isEmptyUserAndNoRegistrationAllowed(user, advanced)) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (!_.isEmpty(user)) {
          return resolve([user, null]);
        }

        if (userFromAnotherProviderExistsAndUniqueEmailEnabled(users, user, advanced)) {
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
 * Determines if registration should be blocked due to missing user and disabled registration.
 *
 * @param {Object|null} user     The user object or null.
 * @param {Object}      advanced The advanced configuration.
 * @returns {boolean}
 */
function isEmptyUserAndNoRegistrationAllowed(user, advanced) {
  return _.isEmpty(user) && !advanced.allow_register;
}

/**
 * Determines if user from another provider exists and email uniqueness is required.
 *
 * @param {Array}       users    Array of existing users.
 * @param {Object|null} currentUser The user being linked.
 * @param {Object}      advanced The advanced configuration.
 * @returns {boolean}
 */
function userFromAnotherProviderExistsAndUniqueEmailEnabled(users, currentUser, advanced) {
  return (
    !_.isEmpty(_.find(users, user => user.provider !== (currentUser && currentUser.provider))) &&
    advanced.unique_email
  );
}

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
      handleDiscordProfile(query, access_token, callback);
      break;
    }
    case 'cognito': {
      handleCognitoProfile(query, callback);
      break;
    }
    case 'facebook': {
      handleFacebookProfile(query, access_token, callback);
      break;
    }
    case 'google': {
      handleGoogleProfile(query, access_token, callback);
      break;
    }
    case 'github': {
      handleGitHubProfile(query, access_token, callback);
      break;
    }
    case 'microsoft': {
      handleMicrosoftProfile(query, access_token, callback);
      break;
    }
    case 'twitter': {
      handleTwitterProfile(query, grant, callback);
      break;
    }
    case 'instagram': {
      handleInstagramProfile(query, grant, callback);
      break;
    }
    case 'vk': {
      handleVKProfile(query, callback);
      break;
    }
    case 'twitch': {
      handleTwitchProfile(query, grant, callback);
      break;
    }
    case 'linkedin': {
      handleLinkedInProfile(query, access_token, callback);
      break;
    }
    case 'reddit': {
      handleRedditProfile(query, access_token, callback);
      break;
    }
    case 'auth0': {
      handleAuth0Profile(query, grant, access_token, callback);
      break;
    }
    case 'cas': {
      handleCASProfile(query, grant, access_token, callback);
      break;
    }
    default:
      callback(new Error('Unknown provider.'));
      break;
  }
};

/**
 * Handles Discord provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  Discord access token.
 * @param {Function} callback     Callback function.
 */
function handleDiscordProfile(query, accessToken, callback) {
  const discord = createDiscordClient(accessToken);

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
}

/**
 * Creates a Discord Purest client instance.
 *
 * @param {String} accessToken Discord access token.
 * @returns {Object} Discord Purest client instance.
 */
function createDiscordClient(accessToken) {
  return purest({
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
}

/**
 * Handles Cognito provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Function} callback     Callback function.
 */
function handleCognitoProfile(query, callback) {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);

  if (!tokenPayload) {
    return callback(new Error('unable to decode jwt token'));
  }

  callback(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
}

/**
 * Handles Facebook provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  Facebook access token.
 * @param {Function} callback     Callback function.
 */
function handleFacebookProfile(query, accessToken, callback) {
  const facebook = createFacebookClient();

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
}

/**
 * Creates a Facebook Purest client instance.
 *
 * @returns {Object} Facebook Purest client instance.
 */
function createFacebookClient() {
  return purest({
    provider: 'facebook',
    config: purestConfig,
  });
}

/**
 * Handles Google provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  Google access token.
 * @param {Function} callback     Callback function.
 */
function handleGoogleProfile(query, accessToken, callback) {
  const google = createGoogleClient();

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token: accessToken })
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      const username = body.email ? body.email.split('@')[0] : '';
      callback(null, {
        username,
        email: body.email,
      });
    });
}

/**
 * Creates a Google Purest client instance.
 *
 * @returns {Object} Google Purest client instance.
 */
function createGoogleClient() {
  return purest({ provider: 'google', config: purestConfig });
}

/**
 * Handles GitHub provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  GitHub access token.
 * @param {Function} callback     Callback function.
 */
function handleGitHubProfile(query, accessToken, callback) {
  const githubClient = createGitHubClient();

  githubClient
    .query()
    .get('user')
    .auth(accessToken)
    .request((err, res, userBody) => {
      if (err) {
        return callback(err);
      }

      if (userBody.email) {
        callback(null, {
          username: userBody.login,
          email: userBody.email,
        });
        return;
      }

      fetchGitHubEmail(userBody, accessToken, callback);
    });
}

/**
 * Creates a GitHub Purest client instance.
 *
 * @returns {Object} GitHub Purest client instance.
 */
function createGitHubClient() {
  return purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });
}

/**
 * Fetches primary GitHub email using user/emails API.
 *
 * @param {Object}   userBody     GitHub user object.
 * @param {String}   accessToken  GitHub access token.
 * @param {Function} callback     Callback function.
 */
function fetchGitHubEmail(userBody, accessToken, callback) {
  const github = createGitHubClient();

  github
    .query()
    .get('user/emails')
    .auth(accessToken)
    .request((err, res, emailsBody) => {
      if (err) {
        return callback(err);
      }

      const email = Array.isArray(emailsBody)
        ? emailsBody.find(email => email.primary === true)?.email || null
        : null;

      callback(null, {
        username: userBody.login,
        email,
      });
    });
}

/**
 * Handles Microsoft provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  Microsoft access token.
 * @param {Function} callback     Callback function.
 */
function handleMicrosoftProfile(query, accessToken, callback) {
  const microsoft = createMicrosoftClient();

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
}

/**
 * Creates a Microsoft Purest client instance.
 *
 * @returns {Object} Microsoft Purest client instance.
 */
function createMicrosoftClient() {
  return purest({
    provider: 'microsoft',
    config: purestConfig,
  });
}

/**
 * Handles Twitter provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Object}   grant        OAuth grant configuration.
 * @param {Function} callback     Callback function.
 */
function handleTwitterProfile(query, grant, callback) {
  const twitter = createTwitterClient(query, grant);

  twitter
    .query()
    .get('account/verify_credentials')
    .auth(query.access_token, query.access_secret)
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
}

/**
 * Creates a Twitter Purest client instance.
 *
 * @param {Object}   query   Request query object.
 * @param {Object}   grant   OAuth grant configuration.
 * @returns {Object} Twitter Purest client instance.
 */
function createTwitterClient(query, grant) {
  return purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });
}

/**
 * Handles Instagram provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Object}   grant        OAuth grant configuration.
 * @param {Function} callback     Callback function.
 */
function handleInstagramProfile(query, grant, callback) {
  const instagram = createInstagramClient(grant);

  instagram
    .query()
    .get('me')
    .qs({ access_token: query.access_token, fields: 'id,username' })
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
}

/**
 * Creates an Instagram Purest client instance.
 *
 * @param {Object} grant OAuth grant configuration.
 * @returns {Object} Instagram Purest client instance.
 */
function createInstagramClient(grant) {
  return purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });
}

/**
 * Handles VK provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Function} callback     Callback function.
 */
function handleVKProfile(query, callback) {
  const vk = createVKClient();

  vk.query()
    .get('users.get')
    .qs({ access_token: query.access_token, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      const firstName = body.response?.[0]?.first_name || '';
      const lastName = body.response?.[0]?.last_name || '';
      const username = `${lastName} ${firstName}`;

      callback(null, {
        username,
        email: query.raw.email,
      });
    });
}

/**
 * Creates a VK Purest client instance.
 *
 * @returns {Object} VK Purest client instance.
 */
function createVKClient() {
  return purest({
    provider: 'vk',
    config: purestConfig,
  });
}

/**
 * Handles Twitch provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Object}   grant        OAuth grant configuration.
 * @param {Function} callback     Callback function.
 */
function handleTwitchProfile(query, grant, callback) {
  const twitch = createTwitchClient(grant);

  twitch
    .get('users')
    .auth(query.access_token, grant.twitch.key)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      const userData = body.data?.[0] || {};
      callback(null, {
        username: userData.login,
        email: userData.email,
      });
    });
}

/**
 * Creates a Twitch Purest client instance.
 *
 * @param {Object} grant OAuth grant configuration.
 * @returns {Object} Twitch Purest client instance.
 */
function createTwitchClient(grant) {
  return purest({
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
}

/**
 * Handles LinkedIn provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  LinkedIn access token.
 * @param {Function} callback     Callback function.
 */
function handleLinkedInProfile(query, accessToken, callback) {
  const linkedIn = createLinkedInClient();

  Promise.all([getLinkedInDetails(linkedIn, accessToken), getLinkedInEmail(linkedIn, accessToken)])
    .then(([details, emailResult]) => {
      const username = details?.localizedFirstName || '';
      const email = emailResult?.elements?.[0]?.['handle~']?.emailAddress || '';

      callback(null, {
        username,
        email,
      });
    })
    .catch(err => callback(err));
}

/**
 * Creates a LinkedIn Purest client instance.
 *
 * @returns {Object} LinkedIn Purest client instance.
 */
function createLinkedInClient() {
  return purest({
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
}

/**
 * Fetches LinkedIn user details.
 *
 * @param {Object}   linkedIn     LinkedIn Purest client instance.
 * @param {String}   accessToken  LinkedIn access token.
 * @returns {Promise<Object>}     LinkedIn user details.
 */
function getLinkedInDetails(linkedIn, accessToken) {
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
}

/**
 * Fetches LinkedIn user email address.
 *
 * @param {Object}   linkedIn     LinkedIn Purest client instance.
 * @param {String}   accessToken  LinkedIn access token.
 * @returns {Promise<Object>}     LinkedIn email address details.
 */
function getLinkedInEmail(linkedIn, accessToken) {
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
}

/**
 * Handles Reddit provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {String}   accessToken  Reddit access token.
 * @param {Function} callback     Callback function.
 */
function handleRedditProfile(query, accessToken, callback) {
  const reddit = createRedditClient();

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
}

/**
 * Creates a Reddit Purest client instance.
 *
 * @returns {Object} Reddit Purest client instance.
 */
function createRedditClient() {
  return purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });
}

/**
 * Handles Auth0 provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Object}   grant        OAuth grant configuration.
 * @param {String}   accessToken  Auth0 access token.
 * @param {Function} callback     Callback function.
 */
function handleAuth0Profile(query, grant, accessToken, callback) {
  const auth0 = createAuth0Client(grant);

  auth0
    .get('userinfo')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      const username =
        body.username || body.nickname || body.name || (body.email ? body.email.split('@')[0] : '');
      const email = body.email || (username ? `${username.replace(/\s+/g, '.')}@strapi.io` : '');

      callback(null, {
        username,
        email,
      });
    });
}

/**
 * Creates an Auth0 Purest client instance.
 *
 * @param {Object} grant OAuth grant configuration.
 * @returns {Object} Auth0 Purest client instance.
 */
function createAuth0Client(grant) {
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

  return purest({
    provider: 'auth0',
    config: {
      auth0: purestAuth0Conf,
    },
  });
}

/**
 * Handles CAS provider profile extraction.
 *
 * @param {Object}   query        Request query object.
 * @param {Object}   grant        OAuth grant configuration.
 * @param {String}   accessToken  CAS access token.
 * @param {Function} callback     Callback function.
 */
function handleCASProfile(query, grant, accessToken, callback) {
  const providerUrl = 'https://' + _.get(grant.cas, 'subdomain');
  const cas = createCASClient(providerUrl);

  cas
    .query()
    .get('oidc/profile')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      const username = extractCASUsername(body);
      const email = extractCAS_EMAIL(body);

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
}

/**
 * Extracts username from CAS response body.
 *
 * @param {Object} body CAS response body.
 * @returns {String} cas username.
 */
function extractCASUsername(body) {
  if (body.attributes) {
    return body.attributes.strapiusername || body.id || body.sub;
  }

  return body.strapiusername || body.id || body.sub;
}

/**
 * Extracts email from CAS response body.
 *
 * @param {Object} body CAS response body.
 * @returns {String} CAS email address.
 */
function extractCAS_EMAIL(body) {
  if (body.attributes) {
    return body.attributes.strapiemail || body.attributes.email;
  }

  return body.strapiemail || body.email;
}

/**
 * Creates a CAS Purest client instance.
 *
 * @param {String} providerUrl CAS provider URL.
 * @returns {Object} CAS Purest client instance.
 */
function createCASClient(providerUrl) {
  return purest({
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
}

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};