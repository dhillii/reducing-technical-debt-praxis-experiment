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
 * Connect thanks to a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
 *
 * @return {Promise<Array>} Resolves with [user|null, error|null, message?]
 */
const connect = (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  return new Promise(async (resolve, reject) => {
    if (!accessToken) {
      return reject([null, { message: 'No access_token.' }]);
    }

    try {
      const profile = await fetchProfile(provider, query);
      if (!profile.email) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      const users = await strapi.query('user', 'users-permissions').find({ email: profile.email });
      const advanced = await strapi
        .store({ environment: '', type: 'plugin', name: 'users-permissions', key: 'advanced' })
        .get();

      const existingUser = _.find(users, { provider });

      // Registration not allowed
      if (_.isEmpty(existingUser) && !advanced.allow_register) {
        return resolve([
          null,
          [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
          'Register action is actually not available.',
        ]);
      }

      // Existing user found
      if (!_.isEmpty(existingUser)) {
        return resolve([existingUser, null]);
      }

      // Email already taken by another provider
      if (!_.isEmpty(_.find(users, (u) => u.provider !== provider)) && advanced.unique_email) {
        return resolve([
          null,
          [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
          'Email is already taken.',
        ]);
      }

      // Retrieve default role and create new user
      const defaultRole = await strapi
        .query('role', 'users-permissions')
        .findOne({ type: advanced.default_role }, []);

      const newUser = await createUser(profile, provider, defaultRole.id);
      return resolve([newUser, null]);
    } catch (err) {
      return reject([null, err]);
    }
  });
};

/**
 * Fetch user profile from the given provider.
 *
 * @param {String} provider
 * @param {Object} query
 *
 * @return {Promise<Object>} Resolves with { username, email }
 */
const fetchProfile = (provider, query) => {
  return new Promise((resolve, reject) => {
    getProfileAsync(provider, query)
      .then(resolve)
      .catch(reject);
  });
};

/**
 * Retrieve profile using provider‑specific logic.
 *
 * @param {String} provider
 * @param {Object} query
 *
 * @return {Promise<Object>}
 */
const getProfileAsync = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;
  const grant = await strapi
    .store({ environment: '', type: 'plugin', name: 'users-permissions', key: 'grant' })
    .get();

  switch (provider) {
    case 'discord':
      return getDiscordProfile(accessToken);
    case 'cognito':
      return getCognitoProfile(query);
    case 'facebook':
      return getFacebookProfile(accessToken);
    case 'google':
      return getGoogleProfile(accessToken);
    case 'github':
      return getGithubProfile(accessToken);
    case 'microsoft':
      return getMicrosoftProfile(accessToken);
    case 'twitter':
      return getTwitterProfile(accessToken, query, grant);
    case 'instagram':
      return getInstagramProfile(accessToken, grant);
    case 'vk':
      return getVkProfile(accessToken, query);
    case 'twitch':
      return getTwitchProfile(accessToken, grant);
    case 'linkedin':
      return getLinkedinProfile(accessToken);
    case 'reddit':
      return getRedditProfile(accessToken);
    case 'auth0':
      return getAuth0Profile(accessToken, grant);
    case 'cas':
      return getCasProfile(accessToken, grant);
    default:
      throw new Error('Unknown provider.');
  }
};

/* Provider specific implementations */

/**
 * Discord profile retrieval.
 */
const getDiscordProfile = (accessToken) => {
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

/**
 * Cognito profile retrieval.
 */
const getCognitoProfile = (query) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);
  if (!tokenPayload) {
    throw new Error('unable to decode jwt token');
  }
  return Promise.resolve({
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
};

/**
 * Facebook profile retrieval.
 */
const getFacebookProfile = (accessToken) => {
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

/**
 * Google profile retrieval.
 */
const getGoogleProfile = (accessToken) => {
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

/**
 * Github profile retrieval.
 */
const getGithubProfile = (accessToken) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: { headers: { 'user-agent': 'strapi' } },
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
        // Fallback to emails endpoint
        github
          .query()
          .get('user/emails')
          .auth(accessToken)
          .request((err2, res2, emailsBody) => {
            if (err2) return reject(err2);
            const primary = Array.isArray(emailsBody)
              ? emailsBody.find((e) => e.primary === true)
              : null;
            resolve({ username: userBody.login, email: primary ? primary.email : null });
          });
      });
  });
};

/**
 * Microsoft profile retrieval.
 */
const getMicrosoftProfile = (accessToken) => {
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

/**
 * Twitter profile retrieval.
 */
const getTwitterProfile = (accessToken, query, grant) => {
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

/**
 * Instagram profile retrieval.
 */
const getInstagramProfile = (accessToken, grant) => {
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

/**
 * VK profile retrieval.
 */
const getVkProfile = (accessToken, query) => {
  const vk = purest({ provider: 'vk', config: purestConfig });
  return new Promise((resolve, reject) => {
    vk
      .query()
      .get('users.get')
      .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) return reject(err);
        const user = body.response[0];
        resolve({
          username: `${user.last_name} ${user.first_name}`,
          email: query.raw.email,
        });
      });
  });
};

/**
 * Twitch profile retrieval.
 */
const getTwitchProfile = (accessToken, grant) => {
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
            __path: { alias: '__default' },
          },
          'oauth2/{endpoint}': {
            __path: { alias: 'oauth' },
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
        const user = body.data[0];
        resolve({ username: user.login, email: user.email });
      });
  });
};

/**
 * LinkedIn profile retrieval.
 */
const getLinkedinProfile = async (accessToken) => {
  const linkedIn = purest({
    provider: 'linkedin',
    config: {
      linkedin: {
        'https://api.linkedin.com': {
          __domain: { auth: [{ auth: { bearer: '[0]' } }] },
          '[version]/{endpoint}': {
            __path: { alias: '__default', version: 'v2' },
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
        .request((err, res, body) => (err ? reject(err) : resolve(body)));
    });

  const getEmail = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(accessToken)
        .request((err, res, body) => (err ? reject(err) : resolve(body)));
    });

  const { localizedFirstName } = await getDetails();
  const { elements } = await getEmail();
  const email = elements[0]['handle~'];
  return { username: localizedFirstName, email: email.emailAddress };
};

/**
 * Reddit profile retrieval.
 */
const getRedditProfile = (accessToken) => {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: { headers: { 'user-agent': 'strapi' } },
  });

  return new Promise((resolve, reject) => {
    reddit
      .query('auth')
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.name, email: `${body.name}@strapi.io` });
      });
  });
};

/**
 * Auth0 profile retrieval.
 */
const getAuth0Profile = (accessToken, grant) => {
  const purestAuth0Conf = {};
  purestAuth0Conf[`https://${grant.auth0.subdomain}.auth0.com`] = {
    __domain: { auth: { auth: { bearer: '[0]' } } },
    '{endpoint}': { __path: { alias: '__default' } },
  };
  const auth0 = purest({
    provider: 'auth0',
    config: { auth0: purestAuth0Conf },
  });

  return new Promise((resolve, reject) => {
    auth0
      .get('userinfo')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        const username =
          body.username || body.nickname || body.name || body.email.split('@')[0];
        const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
        resolve({ username, email });
      });
  });
};

/**
 * CAS profile retrieval.
 */
const getCasProfile = async (accessToken, grant) => {
  const providerUrl = 'https://' + _.get(grant['cas'], 'subdomain');
  const cas = purest({
    provider: 'cas',
    config: {
      cas: {
        [providerUrl]: {
          __domain: { auth: { auth: { bearer: '[0]' } } },
          '{endpoint}': { __path: { alias: '__default' } },
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
          strapi.log.warn('CAS Response Body did not contain required attributes: ' + JSON.stringify(body));
        }
        resolve({ username, email });
      });
  });
};

/**
 * Create a new user with the given profile data.
 *
 * @param {Object} profile
 * @param {String} provider
 * @param {Number} roleId
 *
 * @return {Promise<Object>}
 */
const createUser = (profile, provider, roleId) => {
  const params = _.assign(profile, {
    provider,
    role: roleId,
    confirmed: true,
  });
  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Build redirect URI for a provider.
 *
 * @param {String} [provider='']
 *
 * @return {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};