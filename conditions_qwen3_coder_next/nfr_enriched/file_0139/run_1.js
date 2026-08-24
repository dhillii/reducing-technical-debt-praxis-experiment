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

const connect = async (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  if (!access_token) {
    return [null, { message: 'No access_token.' }];
  }

  const profile = await getProfileAsync(provider, query);

  if (!profile.email) {
    return [null, { message: 'Email was not available.' }];
  }

  try {
    const users = await strapi.query('user', 'users-permissions').find({
      email: profile.email,
    });

    const advanced = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    }).get();

    const existingUser = _.find(users, { provider });

    if (_.isEmpty(existingUser) && !advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ];
    }

    if (!_.isEmpty(existingUser)) {
      return [existingUser, null];
    }

    const hasDifferentProviderUser = !_.isEmpty(
      _.find(users, user => user.provider !== provider)
    );

    if (hasDifferentProviderUser && advanced.unique_email) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await strapi.query('role', 'users-permissions').findOne(
      { type: advanced.default_role },
      []
    );

    const params = _.assign(profile, {
      provider: provider,
      role: defaultRole.id,
      confirmed: true,
    });

    const createdUser = await strapi.query('user', 'users-permissions').create(params);

    return [createdUser, null];
  } catch (err) {
    return [null, err];
  }
};

/**
 * Asynchronously retrieve user profile from provider
 *
 * @param {String} provider - OAuth provider name
 * @param {Object} query - Request query parameters including access token
 * @returns {Promise<Object>} Profile data with username and email
 */

const getProfileAsync = (provider, query) => {
  return new Promise((resolve, reject) => {
    getProfile(provider, query, (err, profile) => {
      if (err) {
        reject(err);
      } else {
        resolve(profile);
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
  const access_token = query.access_token || query.code || query.oauth_token;

  const grant = await strapi.store({
    environment: '',
    type: 'plugin',
    name: 'users-permissions',
    key: 'grant',
  }).get();

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
      return handleTwitterProfile(access_token, query, grant, callback);
    case 'instagram':
      return handleInstagramProfile(access_token, grant, callback);
    case 'vk':
      return handleVKProfile(access_token, query, callback);
    case 'twitch':
      return handleTwitchProfile(access_token, grant, callback);
    case 'linkedin':
      return handleLinkedInProfile(access_token, callback);
    case 'reddit':
      return handleRedditProfile(access_token, callback);
    case 'auth0':
      return handleAuth0Profile(access_token, grant, callback);
    case 'cas':
      return handleCASProfile(access_token, grant, callback);
    default:
      callback(new Error('Unknown provider.'));
  }
};

/**
 * Handle Discord profile retrieval
 */

const handleDiscordProfile = (access_token, callback) => {
  const discord = createDiscordClient();

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
 * Handle Cognito profile retrieval
 */

const handleCognitoProfile = (idToken, callback) => {
  try {
    const tokenPayload = jwt.decode(idToken);

    if (!tokenPayload) {
      return callback(new Error('unable to decode jwt token'));
    }

    callback(null, {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    });
  } catch (err) {
    callback(err);
  }
};

/**
 * Handle Facebook profile retrieval
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
 * Handle Google profile retrieval
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
 * Handle GitHub profile retrieval
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

      // Get the email with Github's user/emails API
      github
        .query()
        .get('user/emails')
        .auth(access_token)
        .request((err, res, emailsbody) => {
          if (err) {
            return callback(err);
          }

          const primaryEmail = Array.isArray(emailsbody)
            ? emailsbody.find(email => email.primary === true)?.email
            : null;

          callback(null, {
            username: userbody.login,
            email: primaryEmail,
          });
        });
    });
};

/**
 * Handle Microsoft profile retrieval
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
 * Handle Twitter profile retrieval
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
 * Handle Instagram profile retrieval
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
 * Handle VK profile retrieval
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
 * Handle Twitch profile retrieval
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
 * Handle LinkedIn profile retrieval
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
          err ? reject(err) : resolve(body);
        });
    });

  const getEmailRequest = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(access_token)
        .request((err, res, body) => {
          err ? reject(err) : resolve(body);
        });
    });

  Promise.all([getDetailsRequest(), getEmailRequest()])
    .then(([details, emailResponse]) => {
      const { localizedFirstName } = details;
      const { elements } = emailResponse;
      const email = elements[0]['handle~'];

      callback(null, {
        username: localizedFirstName,
        email: email.emailAddress,
      });
    })
    .catch(err => callback(err));
};

/**
 * Handle Reddit profile retrieval
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
 * Handle Auth0 profile retrieval
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
 * Handle CAS profile retrieval
 */

const handleCASProfile = (access_token, grant, callback) => {
  const cas = createCASClient(grant);

  cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      // CAS attribute may be in body.attributes or "FLAT", depending on CAS config
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
 * Provider client factories
 */

const createDiscordClient = () =>
  purest({
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

const createFacebookClient = () =>
  purest({
    provider: 'facebook',
    config: purestConfig,
  });

const createGoogleClient = () =>
  purest({ provider: 'google', config: purestConfig });

const createGitHubClient = () =>
  purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

const createMicrosoftClient = () =>
  purest({
    provider: 'microsoft',
    config: purestConfig,
  });

const createTwitterClient = (grant) =>
  purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

const createInstagramClient = (grant) =>
  purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });

const createVKClient = () =>
  purest({
    provider: 'vk',
    config: purestConfig,
  });

const createTwitchClient = (grant) =>
  purest({
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

const createLinkedInClient = () =>
  purest({
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

const createRedditClient = () =>
  purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

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

const createCASClient = (grant) => {
  const provider_url = 'https://' + _.get(grant['cas'], 'subdomain');
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