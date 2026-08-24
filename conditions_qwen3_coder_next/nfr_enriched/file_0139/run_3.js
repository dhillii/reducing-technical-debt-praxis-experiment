'use strict';

/**
 * Module dependencies.
 */

// Public node files.
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
    case 'discord':
      return handleDiscordProfile(access_token, callback);
    case 'cognito':
      return handleCognitoProfile(query.id_token, callback);
    case 'facebook':
      return handleFacebookProfile(access_token, callback);
    case 'google':
      return handleGoogleProfile(access_token, callback);
    case 'github':
      return handleGitHubProfile(access_token, callback);
    case 'microsoft':
      return handleMicrosoftProfile(access_token, callback);
    case 'twitter':
      return handleTwitterProfile(query, access_token, grant, callback);
    case 'instagram':
      return handleInstagramProfile(query, access_token, grant, callback);
    case 'vk':
      return handleVKProfile(query, access_token, callback);
    case 'twitch':
      return handleTwitchProfile(query, access_token, grant, callback);
    case 'linkedin':
      return handleLinkedInProfile(query, access_token, grant, callback);
    case 'reddit':
      return handleRedditProfile(access_token, callback);
    case 'auth0':
      return handleAuth0Profile(query, access_token, grant, callback);
    case 'cas':
      return handleCASProfile(query, access_token, grant, callback);
    default:
      callback(new Error('Unknown provider.'));
      break;
  }
};

/**
 * Retrieves Discord user profile data.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleDiscordProfile = (accessToken, callback) => {
  const discord = createDiscordClient();

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
 * Creates a configured Discord Purest client instance.
 */
const createDiscordClient = () => {
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
 * Retrieves Cognito user profile from decoded JWT token.
 *
 * @param {String} idToken
 * @param {Function} callback
 */
const handleCognitoProfile = (idToken, callback) => {
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
 * Retrieves Facebook user profile.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleFacebookProfile = (accessToken, callback) => {
  const facebook = createFacebookClient();

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
 * Creates a configured Facebook Purest client instance.
 */
const createFacebookClient = () => {
  return purest({
    provider: 'facebook',
    config: purestConfig,
  });
};

/**
 * Retrieves Google user profile via token info endpoint.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleGoogleProfile = (accessToken, callback) => {
  const google = createGoogleClient();

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
 * Creates a configured Google Purest client instance.
 */
const createGoogleClient = () => {
  return purest({ provider: 'google', config: purestConfig });
};

/**
 * Retrieves GitHub user profile.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleGitHubProfile = (accessToken, callback) => {
  const github = createGitHubClient();

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

      retrieveGitHubEmails(github, accessToken, userbody, callback);
    });
};

/**
 * Retrieves GitHub email using user/emails endpoint.
 *
 * @param {Object} githubClient
 * @param {String} accessToken
 * @param {Object} userbody
 * @param {Function} callback
 */
const retrieveGitHubEmails = (githubClient, accessToken, userbody, callback) => {
  githubClient
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
};

/**
 * Extracts primary email from GitHub email list.
 *
 * @param {Array} emailsBody
 * @returns {String|null}
 */
const getPrimaryGitHubEmail = emailsBody => {
  if (!Array.isArray(emailsBody)) {
    return null;
  }
  const primaryEmail = emailsBody.find(email => email.primary === true);
  return primaryEmail ? primaryEmail.email : null;
};

/**
 * Creates a configured GitHub Purest client instance.
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
 * Retrieves Microsoft user profile.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleMicrosoftProfile = (accessToken, callback) => {
  const microsoft = createMicrosoftClient();

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
 * Creates a configured Microsoft Purest client instance.
 */
const createMicrosoftClient = () => {
  return purest({
    provider: 'microsoft',
    config: purestConfig,
  });
};

/**
 * Retrieves Twitter user profile.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const handleTwitterProfile = (query, accessToken, grant, callback) => {
  const twitter = createTwitterClient(query, grant);

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
 * Creates a configured Twitter Purest client instance.
 *
 * @param {Object} query
 * @param {Object} grant
 * @returns {Object}
 */
const createTwitterClient = (query, grant) => {
  return purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });
};

/**
 * Retrieves Instagram user profile.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const handleInstagramProfile = (query, accessToken, grant, callback) => {
  const instagram = createInstagramClient(grant);

  instagram
    .query()
    .get('me')
    .qs({ access_token, fields: 'id,username' })
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
 * Creates a configured Instagram Purest client instance.
 *
 * @param {Object} grant
 * @returns {Object}
 */
const createInstagramClient = (grant) => {
  return purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });
};

/**
 * Retrieves VK user profile.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleVKProfile = (query, accessToken, callback) => {
  const vk = createVKClient();

  vk.query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
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
 * Creates a configured VK Purest client instance.
 */
const createVKClient = () => {
  return purest({
    provider: 'vk',
    config: purestConfig,
  });
};

/**
 * Retrieves Twitch user profile.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const handleTwitchProfile = (query, accessToken, grant, callback) => {
  const twitch = createTwitchClient(query, grant);

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
 * Creates a configured Twitch Purest client instance.
 *
 * @param {Object} query
 * @param {Object} grant
 * @returns {Object}
 */
const createTwitchClient = (query, grant) => {
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
 * Retrieves LinkedIn user profile using v2 endpoints.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const handleLinkedInProfile = (query, accessToken, grant, callback) => {
  const linkedIn = createLinkedInClient();

  const getDetailsRequest = createLinkedInGetDetailsRequest(linkedIn, accessToken);
  const getEmailRequest = createLinkedInGetEmailRequest(linkedIn, accessToken);

  Promise.all([getDetailsRequest, getEmailRequest])
    .then(([details, emailRes]) => {
      const email = extractLinkedInEmail(emailRes);
      callback(null, {
        username: details.localizedFirstName,
        email: email.emailAddress,
      });
    })
    .catch(err => {
      callback(err);
    });
};

/**
 * Creates LinkedIn Purest client instance.
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
 * Creates LinkedIn get-details promise.
 */
const createLinkedInGetDetailsRequest = (client, accessToken) => {
  return new Promise((resolve, reject) => {
    client
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

/**
 * Creates LinkedIn get-email-address promise.
 */
const createLinkedInGetEmailRequest = (client, accessToken) => {
  return new Promise((resolve, reject) => {
    client
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

/**
 * Extracts LinkedIn email from response.
 */
const extractLinkedInEmail = (emailRes) => {
  if (!emailRes || !Array.isArray(emailRes.elements) || emailRes.elements.length === 0) {
    return { emailAddress: null };
  }
  return emailRes.elements[0]['handle~'];
};

/**
 * Retrieves Reddit user profile.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const handleRedditProfile = (accessToken, callback) => {
  const reddit = createRedditClient();

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
 * Creates a configured Reddit Purest client instance.
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
 * Retrieves Auth0 user profile.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const handleAuth0Profile = (query, accessToken, grant, callback) => {
  const auth0 = createAuth0Client(grant);
  const auth0Base = `https://${grant.auth0.subdomain}.auth0.com`;

  auth0
    .get('userinfo')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        const username = body.username || body.nickname || body.name || body.email.split('@')[0];
        const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

        callback(null, {
          username,
          email,
        });
      }
    });
};

/**
 * Creates a configured Auth0 Purest client instance.
 */
const createAuth0Client = (grant) => {
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
 * Retrieves CAS user profile.
 *
 * @param {Object} query
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const handleCASProfile = (query, accessToken, grant, callback) => {
  const providerUrl = 'https://' + _.get(grant['cas'], 'subdomain');
  const cas = createCASClient(providerUrl);

  cas
    .query()
    .get('oidc/profile')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) {
        callback(err);
      } else {
        const { username, email } = extractCASAttributes(body);
        callback(null, {
          username,
          email,
        });
      }
    });
};

/**
 * Extracts username and email from CAS response body.
 */
const extractCASAttributes = (body) => {
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

  return { username, email };
};

/**
 * Creates a configured CAS Purest client instance.
 */
const createCASClient = (providerUrl) => {
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
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};