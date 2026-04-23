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
 * Retrieve the access token from the query.
 *
 * @param {Object} query
 * @returns {String|null}
 */
const getAccessToken = (query) => {
  return query.access_token || query.code || query.oauth_token || null;
};

/**
 * Find a user by email.
 *
 * @param {String} email
 * @returns {Promise<Array>}
 */
const findUsersByEmail = async (email) => {
  return strapi.query('user', 'users-permissions').find({ email });
};

/**
 * Retrieve advanced settings from the users-permissions plugin.
 *
 * @returns {Promise<Object>}
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
 * Retrieve the default role based on advanced settings.
 *
 * @param {Object} advanced
 * @returns {Promise<Object>}
 */
const getDefaultRole = async (advanced) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: advanced.default_role }, []);
};

/**
 * Create a new user with the provided profile.
 *
 * @param {Object} profile
 * @param {String} provider
 * @param {Object} defaultRole
 * @returns {Promise<Object>}
 */
const createUser = async (profile, provider, defaultRole) => {
  const params = _.assign(profile, {
    provider,
    role: defaultRole.id,
    confirmed: true,
  });
  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Check if registration is allowed.
 *
 * @param {Object} advanced
 * @returns {Boolean}
 */
const isRegistrationAllowed = (advanced) => {
  return advanced.allow_register;
};

/**
 * Check if the email is already taken by another provider.
 *
 * @param {Array} users
 * @param {String} provider
 * @param {Object} advanced
 * @returns {Boolean}
 */
const isEmailTakenByOtherProvider = (users, provider, advanced) => {
  if (!advanced.unique_email) return false;
  return _.some(users, (user) => user.provider !== provider);
};

/**
 * Provider specific profile retrieval functions.
 * Each returns a Promise resolving to { username, email }.
 */

const getDiscordProfile = async (accessToken) => {
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

  const body = await new Promise((resolve, reject) => {
    discord
      .query()
      .get('users/@me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  const username = `${body.username}#${body.discriminator}`;
  return { username, email: body.email };
};

const getCognitoProfile = async (query) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);
  if (!tokenPayload) {
    throw new Error('unable to decode jwt token');
  }
  return {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  };
};

const getFacebookProfile = async (accessToken) => {
  const facebook = purest({ provider: 'facebook', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.name, email: body.email };
};

const getGoogleProfile = async (accessToken) => {
  const google = purest({ provider: 'google', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token: accessToken })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.email.split('@')[0], email: body.email };
};

const getGithubProfile = async (accessToken) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const userBody = await new Promise((resolve, reject) => {
    github
      .query()
      .get('user')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  if (userBody.email) {
    return { username: userBody.login, email: userBody.email };
  }

  const emailsBody = await new Promise((resolve, reject) => {
    github
      .query()
      .get('user/emails')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  const primaryEmail = Array.isArray(emailsBody)
    ? emailsBody.find((email) => email.primary === true).email
    : null;

  return { username: userBody.login, email: primaryEmail };
};

const getMicrosoftProfile = async (accessToken) => {
  const microsoft = purest({ provider: 'microsoft', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    microsoft
      .query()
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.userPrincipalName, email: body.userPrincipalName };
};

const getTwitterProfile = async (accessToken, query, grant) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

  const body = await new Promise((resolve, reject) => {
    twitter
      .query()
      .get('account/verify_credentials')
      .auth(accessToken, query.access_secret)
      .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.screen_name, email: body.email };
};

const getInstagramProfile = async (accessToken, grant) => {
  const instagram = purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });

  const body = await new Promise((resolve, reject) => {
    instagram
      .query()
      .get('me')
      .qs({ access_token: accessToken, fields: 'id,username' })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return {
    username: body.username,
    email: `${body.username}@strapi.io`,
  };
};

const getVkProfile = async (accessToken, query) => {
  const vk = purest({ provider: 'vk', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    vk
      .query()
      .get('users.get')
      .qs({ access_token, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return {
    username: `${body.response[0].last_name} ${body.response[0].first_name}`,
    email: query.raw.email,
  };
};

const getTwitchProfile = async (accessToken, grant) => {
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

  const body = await new Promise((resolve, reject) => {
    twitch
      .get('users')
      .auth(accessToken, grant.twitch.key)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.data[0].login, email: body.data[0].email };
};

const getLinkedInProfile = async (accessToken) => {
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

  const [details, email] = await Promise.all([
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('me')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    }),
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    }),
  ]);

  const { localizedFirstName } = details;
  const emailAddress = email.elements[0]['handle~'].emailAddress;

  return { username: localizedFirstName, email: emailAddress };
};

const getRedditProfile = async (accessToken) => {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const body = await new Promise((resolve, reject) => {
    reddit
      .query('auth')
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return {
    username: body.name,
    email: `${body.name}@strapi.io`,
  };
};

const getAuth0Profile = async (accessToken, grant) => {
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

  const body = await new Promise((resolve, reject) => {
    auth0
      .get('userinfo')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  const username =
    body.username || body.nickname || body.name || body.email.split('@')[0];
  const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

  return { username, email };
};

const getCasProfile = async (accessToken, grant) => {
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

  const body = await new Promise((resolve, reject) => {
    cas
      .query()
      .get('oidc/profile')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

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
 * Retrieve the profile for a given provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const accessToken = getAccessToken(query);

  try {
    const grant = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'grant',
      })
      .get();

    let profile;
    switch (provider) {
      case 'discord':
        profile = await getDiscordProfile(accessToken);
        break;
      case 'cognito':
        profile = await getCognitoProfile(query);
        break;
      case 'facebook':
        profile = await getFacebookProfile(accessToken);
        break;
      case 'google':
        profile = await getGoogleProfile(accessToken);
        break;
      case 'github':
        profile = await getGithubProfile(accessToken);
        break;
      case 'microsoft':
        profile = await getMicrosoftProfile(accessToken);
        break;
      case 'twitter':
        profile = await getTwitterProfile(accessToken, query, grant);
        break;
      case 'instagram':
        profile = await getInstagramProfile(accessToken, grant);
        break;
      case 'vk':
        profile = await getVkProfile(accessToken, query);
        break;
      case 'twitch':
        profile = await getTwitchProfile(accessToken, grant);
        break;
      case 'linkedin':
        profile = await getLinkedInProfile(accessToken);
        break;
      case 'reddit':
        profile = await getRedditProfile(accessToken);
        break;
      case 'auth0':
        profile = await getAuth0Profile(accessToken, grant);
        break;
      case 'cas':
        profile = await getCasProfile(accessToken, grant);
        break;
      default:
        throw new Error('Unknown provider.');
    }

    callback(null, profile);
  } catch (err) {
    callback(err);
  }
};

/**
 * Connect thanks to a third-party provider.
 *
 * @param {String} provider
 * @param {String} access_token
 *
 * @return  {*}
 */
const connect = async (provider, query) => {
  const accessToken = getAccessToken(query);

  if (!accessToken) {
    throw [null, { message: 'No access_token.' }];
  }

  const profile = await new Promise((resolve, reject) => {
    getProfile(provider, query, (err, profile) => {
      if (err) return reject([null, err]);
      resolve(profile);
    });
  });

  if (!profile.email) {
    throw [null, { message: 'Email was not available.' }];
  }

  const users = await findUsersByEmail(profile.email);
  const advanced = await getAdvancedSettings();

  const existingUser = _.find(users, { provider });

  if (_.isEmpty(existingUser) && !isRegistrationAllowed(advanced)) {
    throw [
      null,
      [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      'Register action is actually not available.',
    ];
  }

  if (!_.isEmpty(existingUser)) {
    return [existingUser, null];
  }

  if (isEmailTakenByOtherProvider(users, provider, advanced)) {
    throw [
      null,
      [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      'Email is already taken.',
    ];
  }

  const defaultRole = await getDefaultRole(advanced);
  const createdUser = await createUser(profile, provider, defaultRole);

  return [createdUser, null];
};

/**
 * Build the redirect URI for a provider.
 *
 * @param {String} provider
 * @returns {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};