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
 * Build redirect URI for a provider.
 *
 * @param {String} provider
 * @returns {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

/**
 * Validate that an access token is present.
 *
 * @param {Object} query
 * @returns {String}
 * @throws {Error}
 */
const getAccessToken = (query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;
  if (!accessToken) {
    throw new Error('No access_token.');
  }
  return accessToken;
};

/**
 * Retrieve advanced settings from the users-permissions plugin.
 *
 * @returns {Promise<Object>}
 */
const getAdvancedSettings = async () => {
  return await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    })
    .get();
};

/**
 * Find a user by email and provider.
 *
 * @param {String} email
 * @param {String} provider
 * @returns {Promise<Object|null>}
 */
const findUserByEmailAndProvider = async (email, provider) => {
  const users = await strapi.query('user', 'users-permissions').find({ email });
  return _.find(users, { provider }) || null;
};

/**
 * Find a user by email with a different provider.
 *
 * @param {String} email
 * @param {String} provider
 * @returns {Promise<Object|null>}
 */
const findUserByEmailDifferentProvider = async (email, provider) => {
  const users = await strapi.query('user', 'users-permissions').find({ email });
  return _.find(users, (user) => user.provider !== provider) || null;
};

/**
 * Retrieve the default role for a new user.
 *
 * @param {String} roleType
 * @returns {Promise<Object>}
 */
const getDefaultRole = async (roleType) => {
  return await strapi
    .query('role', 'users-permissions')
    .findOne({ type: roleType }, []);
};

/**
 * Create a new user with the given profile.
 *
 * @param {Object} profile
 * @param {String} provider
 * @param {Number} roleId
 * @returns {Promise<Object>}
 */
const createUser = async (profile, provider, roleId) => {
  const params = _.assign(profile, {
    provider,
    role: roleId,
    confirmed: true,
  });
  return await strapi.query('user', 'users-permissions').create(params);
};

/**
 * Handle the case where registration is disabled.
 *
 * @returns {Array}
 */
const handleRegisterDisabled = () => [
  null,
  [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
  'Register action is actually not available.',
];

/**
 * Handle the case where the email is already taken.
 *
 * @returns {Array}
 */
const handleEmailTaken = () => [
  null,
  [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
  'Email is already taken.',
];

/**
 * Retrieve the profile from a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getProfile = async (provider, query) => {
  const accessToken = getAccessToken(query);

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
      return await getDiscordProfile(accessToken);
    case 'cognito':
      return await getCognitoProfile(query);
    case 'facebook':
      return await getFacebookProfile(accessToken);
    case 'google':
      return await getGoogleProfile(accessToken);
    case 'github':
      return await getGithubProfile(accessToken);
    case 'microsoft':
      return await getMicrosoftProfile(accessToken);
    case 'twitter':
      return await getTwitterProfile(accessToken, query, grant);
    case 'instagram':
      return await getInstagramProfile(accessToken, grant);
    case 'vk':
      return await getVkProfile(accessToken, query);
    case 'twitch':
      return await getTwitchProfile(accessToken, grant);
    case 'linkedin':
      return await getLinkedInProfile(accessToken);
    case 'reddit':
      return await getRedditProfile(accessToken);
    case 'auth0':
      return await getAuth0Profile(accessToken, grant);
    case 'cas':
      return await getCasProfile(accessToken, grant);
    default:
      throw new Error('Unknown provider.');
  }
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

  return new Promise((resolve, reject) => {
    discord
      .query()
      .get('users/@me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        const username = `${body.username}#${body.discriminator}`;
        resolve({ username, email: body.email });
      });
  });
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

  return new Promise((resolve, reject) => {
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.name, email: body.email });
      });
  });
};

const getGoogleProfile = async (accessToken) => {
  const google = purest({ provider: 'google', config: purestConfig });

  return new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token: accessToken })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.email.split('@')[0], email: body.email });
      });
  });
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

  return new Promise((resolve, reject) => {
    github
      .query()
      .get('user')
      .auth(accessToken)
      .request((err, res, userBody) => {
        if (err) return reject(err);

        if (userBody.email) {
          return resolve({ username: userBody.login, email: userBody.email });
        }

        github
          .query()
          .get('user/emails')
          .auth(accessToken)
          .request((err2, res2, emailsBody) => {
            if (err2) return reject(err2);
            const primaryEmail = Array.isArray(emailsBody)
              ? emailsBody.find((e) => e.primary === true).email
              : null;
            resolve({ username: userBody.login, email: primaryEmail });
          });
      });
  });
};

const getMicrosoftProfile = async (accessToken) => {
  const microsoft = purest({ provider: 'microsoft', config: purestConfig });

  return new Promise((resolve, reject) => {
    microsoft
      .query()
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.userPrincipalName, email: body.userPrincipalName });
      });
  });
};

const getTwitterProfile = async (accessToken, query, grant) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

  return new Promise((resolve, reject) => {
    twitter
      .query()
      .get('account/verify_credentials')
      .auth(accessToken, query.access_secret)
      .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.screen_name, email: body.email });
      });
  });
};

const getInstagramProfile = async (accessToken, grant) => {
  const instagram = purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    instagram
      .query()
      .get('me')
      .qs({ access_token: accessToken, fields: 'id,username' })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({
          username: body.username,
          email: `${body.username}@strapi.io`,
        });
      });
  });
};

const getVkProfile = async (accessToken, query) => {
  const vk = purest({ provider: 'vk', config: purestConfig });

  return new Promise((resolve, reject) => {
    vk
      .query()
      .get('users.get')
      .qs({ access_token, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({
          username: `${body.response[0].last_name} ${body.response[0].first_name}`,
          email: query.raw.email,
        });
      });
  });
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

  return new Promise((resolve, reject) => {
    twitch
      .get('users')
      .auth(accessToken, grant.twitch.key)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.data[0].login, email: body.data[0].email });
      });
  });
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

  const details = await getDetails();
  const emailData = await getEmail();
  const email = emailData.elements[0]['handle~'];

  return {
    username: details.localizedFirstName,
    email: email.emailAddress,
  };
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

  return new Promise((resolve, reject) => {
    reddit
      .query('auth')
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({
          username: body.name,
          email: `${body.name}@strapi.io`,
        });
      });
  });
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

  return new Promise((resolve, reject) => {
    auth0
      .get('userinfo')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        const username =
          body.username || body.nickname || body.name || body.email.split('@')[0];
        const email =
          body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
        resolve({ username, email });
      });
  });
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

  return new Promise((resolve, reject) => {
    cas
      .query()
      .get('oidc/profile')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
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
        resolve({ username, email });
      });
  });
};

/**
 * Main connect function used by the authentication flow.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Array>}
 */
const connect = async (provider, query) => {
  try {
    const accessToken = getAccessToken(query);
    const profile = await getProfile(provider, query);

    if (!profile.email) {
      throw new Error('Email was not available.');
    }

    const advanced = await getAdvancedSettings();
    const existingUser = await findUserByEmailAndProvider(profile.email, provider);

    if (!existingUser && !advanced.allow_register) {
      return handleRegisterDisabled();
    }

    if (existingUser) {
      return [existingUser, null];
    }

    const emailTakenUser = await findUserByEmailDifferentProvider(profile.email, provider);
    if (emailTakenUser && advanced.unique_email) {
      return handleEmailTaken();
    }

    const defaultRole = await getDefaultRole(advanced.default_role);
    const createdUser = await createUser(profile, provider, defaultRole.id);

    return [createdUser, null];
  } catch (err) {
    return [null, err];
  }
};

module.exports = {
  connect,
  buildRedirectUri,
};