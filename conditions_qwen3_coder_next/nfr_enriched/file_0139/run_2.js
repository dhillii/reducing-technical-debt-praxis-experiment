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
          !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
          advanced.unique_email
        ) {
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

  const handlers = {
    discord: () => handleDiscordProfile(access_token, callback),
    cognito: () => handleCognitoProfile(query, callback),
    facebook: () => handleFacebookProfile(access_token, callback),
    google: () => handleGoogleProfile(access_token, callback),
    github: () => handleGitHubProfile(access_token, callback),
    microsoft: () => handleMicrosoftProfile(access_token, callback),
    twitter: () => handleTwitterProfile(access_token, query, grant, callback),
    instagram: () => handleInstagramProfile(access_token, grant, callback),
    vk: () => handleVKProfile(access_token, query, callback),
    twitch: () => handleTwitchProfile(access_token, grant, callback),
    linkedin: () => handleLinkedInProfile(access_token, callback),
    reddit: () => handleRedditProfile(access_token, callback),
    auth0: () => handleAuth0Profile(access_token, grant, callback),
    cas: () => handleCASProfile(access_token, grant, callback),
  };

  const handler = handlers[provider];
  if (!handler) {
    return callback(new Error('Unknown provider.'));
  }

  handler();
};

/**
 * Handles Discord profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleDiscordProfile = (access_token, callback) => {
  const discord = createDiscordClient(access_token);
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
        username,
        email: body.email,
      });
    });
};

/**
 * Creates a Discord Purest client.
 *
 * @param {String} access_token
 * @returns {Object} discord client
 */
const createDiscordClient = access_token => {
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
};

/**
 * Handles Cognito profile retrieval.
 *
 * @param {Object}   query
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
 * Handles Facebook profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleFacebookProfile = (access_token, callback) => {
  const facebook = createFacebookClient();
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
 * Creates a Facebook Purest client.
 *
 * @returns {Object} facebook client
 */
const createFacebookClient = () => {
  return purest({
    provider: 'facebook',
    config: purestConfig,
  });
};

/**
 * Handles Google profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleGoogleProfile = (access_token, callback) => {
  const google = createGoogleClient();
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
 * Creates a Google Purest client.
 *
 * @returns {Object} google client
 */
const createGoogleClient = () => {
  return purest({ provider: 'google', config: purestConfig });
};

/**
 * Handles GitHub profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleGitHubProfile = (access_token, callback) => {
  const github = createGitHubClient();
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

      getGitHubEmails(github, access_token, callback);
    });
};

/**
 * Retrieves GitHub email using the emails API.
 *
 * @param {Object}   github
 * @param {String}   access_token
 * @param {Function} callback
 */
const getGitHubEmails = (github, access_token, callback) => {
  github
    .query()
    .get('user/emails')
    .auth(access_token)
    .request((err, res, emailsbody) => {
      if (err) {
        return callback(err);
      }

      const primaryEmail = Array.isArray(emailsbody)
        ? emailsbody.find(email => email.primary === true)
        : null;

      callback(null, {
        username: userbody.login,
        email: primaryEmail ? primaryEmail.email : null,
      });
    });
};

/**
 * Creates a GitHub Purest client.
 *
 * @returns {Object} github client
 */
const createGitHubClient = () => {
  return purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });
};

/**
 * Handles Microsoft profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleMicrosoftProfile = (access_token, callback) => {
  const microsoft = createMicrosoftClient();
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
 * Creates a Microsoft Purest client.
 *
 * @returns {Object} microsoft client
 */
const createMicrosoftClient = () => {
  return purest({
    provider: 'microsoft',
    config: purestConfig,
  });
};

/**
 * Handles Twitter profile retrieval.
 *
 * @param {String}   access_token
 * @param {Object}   query
 * @param {Object}   grant
 * @param {Function} callback
 */
const handleTwitterProfile = (access_token, query, grant, callback) => {
  const twitter = createTwitterClient(grant);
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
 * Creates a Twitter Purest client.
 *
 * @param {Object} grant
 * @returns {Object} twitter client
 */
const createTwitterClient = grant => {
  return purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });
};

/**
 * Handles Instagram profile retrieval.
 *
 * @param {String}   access_token
 * @param {Object}   grant
 * @param {Function} callback
 */
const handleInstagramProfile = (access_token, grant, callback) => {
  const instagram = createInstagramClient(grant);
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
 * Creates an Instagram Purest client.
 *
 * @param {Object} grant
 * @returns {Object} instagram client
 */
const createInstagramClient = grant => {
  return purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });
};

/**
 * Handles VK profile retrieval.
 *
 * @param {String}   access_token
 * @param {Object}   query
 * @param {Function} callback
 */
const handleVKProfile = (access_token, query, callback) => {
  const vk = createVKClient();
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
 * Creates a VK Purest client.
 *
 * @returns {Object} vk client
 */
const createVKClient = () => {
  return purest({
    provider: 'vk',
    config: purestConfig,
  });
};

/**
 * Handles Twitch profile retrieval.
 *
 * @param {String}   access_token
 * @param {Object}   grant
 * @param {Function} callback
 */
const handleTwitchProfile = (access_token, grant, callback) => {
  const twitch = createTwitchClient(grant);
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
 * Creates a Twitch Purest client.
 *
 * @param {Object} grant
 * @returns {Object} twitch client
 */
const createTwitchClient = grant => {
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
};

/**
 * Handles LinkedIn profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleLinkedInProfile = (access_token, callback) => {
  const linkedIn = createLinkedInClient();
  const getDetailsRequest = () =>
    new Promise((resolve, reject) => {
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

  const getEmailRequest = () =>
    new Promise((resolve, reject) => {
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

  Promise.all([getDetailsRequest(), getEmailRequest()])
    .then(([details, emailResponse]) => {
      const { localizedFirstName } = details;
      const { elements } = emailResponse;
      const email = elements[0]['handle~'].emailAddress;

      callback(null, {
        username: localizedFirstName,
        email,
      });
    })
    .catch(err => callback(err));
};

/**
 * Creates a LinkedIn Purest client.
 *
 * @returns {Object} linkedIn client
 */
const createLinkedInClient = () => {
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
};

/**
 * Handles Reddit profile retrieval.
 *
 * @param {String}   access_token
 * @param {Function} callback
 */
const handleRedditProfile = (access_token, callback) => {
  const reddit = createRedditClient();
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
 * Creates a Reddit Purest client.
 *
 * @returns {Object} reddit client
 */
const createRedditClient = () => {
  return purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });
};

/**
 * Handles Auth0 profile retrieval.
 *
 * @param {String}   access_token
 * @param {Object}   grant
 * @param {Function} callback
 */
const handleAuth0Profile = (access_token, grant, callback) => {
  const auth0 = createAuth0Client(grant);
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
 * Creates an Auth0 Purest client.
 *
 * @param {Object} grant
 * @returns {Object} auth0 client
 */
const createAuth0Client = grant => {
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
};

/**
 * Handles CAS profile retrieval.
 *
 * @param {String}   access_token
 * @param {Object}   grant
 * @param {Function} callback
 */
const handleCASProfile = (access_token, grant, callback) => {
  const provider_url = 'https://' + _.get(grant['cas'], 'subdomain');
  const cas = createCASClient(provider_url);
  cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }
      const username = getUserNameFromCAS(body);
      const email = getEmailFromCAS(body);
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
 * Extracts username from CAS response body.
 *
 * @param {Object} body
 * @returns {String} username
 */
const getUserNameFromCAS = body => {
  const attributes = body.attributes || {};
  return (
    attributes.strapiusername ||
    body.strapiusername ||
    body.id ||
    body.sub
  );
};

/**
 * Extracts email from CAS response body.
 *
 * @param {Object} body
 * @returns {String} email
 */
const getEmailFromCAS = body => {
  const attributes = body.attributes || {};
  return (
    attributes.strapiemail ||
    body.strapiemail ||
    attributes.email ||
    body.email
  );
};

/**
 * Creates a CAS Purest client.
 *
 * @param {String} provider_url
 * @returns {Object} cas client
 */
const createCASClient = provider_url => {
  return purest({
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
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};