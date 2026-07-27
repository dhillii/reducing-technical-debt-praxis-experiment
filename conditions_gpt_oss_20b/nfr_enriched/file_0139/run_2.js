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
 * @param {String} provider
 * @param {Object} query
 * @return {Promise}
 */
const connect = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  if (!accessToken) {
    throw [null, { message: 'No access_token.' }];
  }

  const profile = await new Promise((resolve, reject) => {
    getProfile(provider, query, (err, result) => {
      if (err) return reject([null, err]);
      resolve(result);
    });
  });

  if (!profile.email) {
    throw [null, { message: 'Email was not available.' }];
  }

  const users = await strapi.query('user', 'users-permissions').find({
    email: profile.email,
  });

  const advanced = await getAdvancedSettings();

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

  if (
    !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
    advanced.unique_email
  ) {
    return [
      null,
      [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      'Email is already taken.',
    ];
  }

  const defaultRole = await getDefaultRole(advanced.default_role);

  const params = _.assign(profile, {
    provider,
    role: defaultRole.id,
    confirmed: true,
  });

  const createdUser = await strapi.query('user', 'users-permissions').create(params);

  return [createdUser, null];
};

/**
 * Retrieve advanced settings from the plugin store.
 *
 * @return {Promise<Object>}
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
 * Retrieve the default role based on the role type.
 *
 * @param {String} roleType
 * @return {Promise<Object>}
 */
const getDefaultRole = async roleType => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: roleType }, []);
};

/**
 * Helper to get profiles
 *
 * @param {String} provider
 * @param {Object} query
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

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
      return getDiscordProfile(accessToken, callback);
    case 'cognito':
      return getCognitoProfile(query, callback);
    case 'facebook':
      return getFacebookProfile(accessToken, callback);
    case 'google':
      return getGoogleProfile(accessToken, callback);
    case 'github':
      return getGithubProfile(accessToken, callback);
    case 'microsoft':
      return getMicrosoftProfile(accessToken, callback);
    case 'twitter':
      return getTwitterProfile(accessToken, query, grant, callback);
    case 'instagram':
      return getInstagramProfile(accessToken, grant, callback);
    case 'vk':
      return getVkProfile(accessToken, query, callback);
    case 'twitch':
      return getTwitchProfile(accessToken, grant, callback);
    case 'linkedin':
      return getLinkedInProfile(accessToken, callback);
    case 'reddit':
      return getRedditProfile(accessToken, callback);
    case 'auth0':
      return getAuth0Profile(accessToken, grant, callback);
    case 'cas':
      return getCasProfile(accessToken, grant, callback);
    default:
      return callback(new Error('Unknown provider.'));
  }
};

/**
 * Discord profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getDiscordProfile = (accessToken, callback) => {
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
      if (err) return callback(err);
      const username = `${body.username}#${body.discriminator}`;
      callback(null, { username, email: body.email });
    });
};

/**
 * Cognito profile retrieval.
 *
 * @param {Object} query
 * @param {Function} callback
 */
const getCognitoProfile = (query, callback) => {
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
 * Facebook profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getFacebookProfile = (accessToken, callback) => {
  const facebook = purest({ provider: 'facebook', config: purestConfig });

  facebook
    .query()
    .get('me?fields=name,email')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, { username: body.name, email: body.email });
    });
};

/**
 * Google profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getGoogleProfile = (accessToken, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token: accessToken })
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, { username: body.email.split('@')[0], email: body.email });
    });
};

/**
 * GitHub profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getGithubProfile = (accessToken, callback) => {
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
    .request((err, res, userBody) => {
      if (err) return callback(err);

      if (userBody.email) {
        return callback(null, { username: userBody.login, email: userBody.email });
      }

      github
        .query()
        .get('user/emails')
        .auth(accessToken)
        .request((err, res, emailsBody) => {
          if (err) return callback(err);
          const primaryEmail = Array.isArray(emailsBody)
            ? emailsBody.find(email => email.primary === true).email
            : null;
          callback(null, { username: userBody.login, email: primaryEmail });
        });
    });
};

/**
 * Microsoft profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getMicrosoftProfile = (accessToken, callback) => {
  const microsoft = purest({ provider: 'microsoft', config: purestConfig });

  microsoft
    .query()
    .get('me')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, { username: body.userPrincipalName, email: body.userPrincipalName });
    });
};

/**
 * Twitter profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} query
 * @param {Object} grant
 * @param {Function} callback
 */
const getTwitterProfile = (accessToken, query, grant, callback) => {
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
      if (err) return callback(err);
      callback(null, { username: body.screen_name, email: body.email });
    });
};

/**
 * Instagram profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const getInstagramProfile = (accessToken, grant, callback) => {
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
      if (err) return callback(err);
      callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
};

/**
 * VK profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} query
 * @param {Function} callback
 */
const getVkProfile = (accessToken, query, callback) => {
  const vk = purest({ provider: 'vk', config: purestConfig });

  vk.query()
    .get('users.get')
    .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, {
        username: `${body.response[0].last_name} ${body.response[0].first_name}`,
        email: query.raw.email,
      });
    });
};

/**
 * Twitch profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const getTwitchProfile = (accessToken, grant, callback) => {
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
      if (err) return callback(err);
      callback(null, { username: body.data[0].login, email: body.data[0].email });
    });
};

/**
 * LinkedIn profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getLinkedInProfile = async (accessToken, callback) => {
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
    const getDetails = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(accessToken)
          .request((err, res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const getEmail = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(accessToken)
          .request((err, res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const { localizedFirstName } = await getDetails();
    const { elements } = await getEmail();
    const email = elements[0]['handle~'];

    callback(null, { username: localizedFirstName, email: email.emailAddress });
  } catch (err) {
    callback(err);
  }
};

/**
 * Reddit profile retrieval.
 *
 * @param {String} accessToken
 * @param {Function} callback
 */
const getRedditProfile = (accessToken, callback) => {
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
      if (err) return callback(err);
      callback(null, {
        username: body.name,
        email: `${body.name}@strapi.io`,
      });
    });
};

/**
 * Auth0 profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const getAuth0Profile = (accessToken, grant, callback) => {
  const auth0Config = {};
  auth0Config[`https://${grant.auth0.subdomain}.auth0.com`] = {
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
      auth0: auth0Config,
    },
  });

  auth0
    .get('userinfo')
    .auth(accessToken)
    .request((err, res, body) => {
      if (err) return callback(err);
      const username =
        body.username || body.nickname || body.name || body.email.split('@')[0];
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
      callback(null, { username, email });
    });
};

/**
 * CAS profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @param {Function} callback
 */
const getCasProfile = (accessToken, grant, callback) => {
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
      if (err) return callback(err);
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
      callback(null, { username, email });
    });
};

/**
 * Build redirect URI for a provider.
 *
 * @param {String} provider
 * @return {String}
 */
const buildRedirectUri = provider => `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};