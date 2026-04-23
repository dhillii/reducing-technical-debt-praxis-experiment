```javascript
'use strict';

/**
 * Module dependencies.
 */
const _ = require('lodash');
const request = require('request');
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
 * @return {Promise}
 */
const connect = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  if (!accessToken) {
    return Promise.reject([null, { message: 'No access_token.' }]);
  }

  try {
    const profile = await getProfile(provider, query);
    if (!profile.email) {
      return Promise.reject([null, { message: 'Email was not available.' }]);
    }

    const users = await strapi
      .query('user', 'users-permissions')
      .find({ email: profile.email });

    const advanced = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const existingUser = _.find(users, { provider });

    // Registration disabled
    if (_.isEmpty(existingUser) && !advanced.allow_register) {
      return Promise.resolve([
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ]);
    }

    // Existing user found
    if (!_.isEmpty(existingUser)) {
      return Promise.resolve([existingUser, null]);
    }

    // Email already taken by another provider
    const otherProviderUser = _.find(users, (u) => u.provider !== provider);
    if (!_.isEmpty(otherProviderUser) && advanced.unique_email) {
      return Promise.resolve([
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ]);
    }

    // Create new user
    const defaultRole = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: advanced.default_role }, []);

    const newUserParams = _.assign(profile, {
      provider,
      role: defaultRole.id,
      confirmed: true,
    });

    const createdUser = await strapi
      .query('user', 'users-permissions')
      .create(newUserParams);

    return Promise.resolve([createdUser, null]);
  } catch (err) {
    return Promise.reject([null, err]);
  }
};

/**
 * Retrieve a normalized profile for a given provider.
 *
 * @param {String} provider
 * @param {Object} query
 *
 * @return {Promise<Object>}
 */
const getProfile = async (provider, query) => {
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
      return fetchDiscordProfile(accessToken);
    case 'cognito':
      return fetchCognitoProfile(query.id_token);
    case 'facebook':
      return fetchFacebookProfile(accessToken);
    case 'google':
      return fetchGoogleProfile(accessToken);
    case 'github':
      return fetchGithubProfile(accessToken);
    case 'microsoft':
      return fetchMicrosoftProfile(accessToken);
    case 'twitter':
      return fetchTwitterProfile(accessToken, query, grant);
    case 'instagram':
      return fetchInstagramProfile(accessToken, grant);
    case 'vk':
      return fetchVkProfile(accessToken, query);
    case 'twitch':
      return fetchTwitchProfile(accessToken, grant);
    case 'linkedin':
      return fetchLinkedInProfile(accessToken);
    case 'reddit':
      return fetchRedditProfile(accessToken);
    case 'auth0':
      return fetchAuth0Profile(accessToken, grant);
    case 'cas':
      return fetchCasProfile(accessToken, grant);
    default:
      throw new Error('Unknown provider.');
  }
};

/* ---------- Provider specific fetchers ---------- */

/**
 * Discord profile (username includes discriminator).
 */
const fetchDiscordProfile = (accessToken) =>
  new Promise((resolve, reject) => {
    const discord = purest({
      provider: 'discord',
      config: {
        discord: {
          'https://discordapp.com/api/': {
            __domain: {
              auth: { auth: { bearer: '[0]' } },
            },
            '{endpoint}': { __path: { alias: '__default' } },
          },
        },
      },
    });

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

/**
 * Cognito profile (decoded JWT).
 */
const fetchCognitoProfile = (idToken) => {
  const payload = jwt.decode(idToken);
  if (!payload) {
    throw new Error('unable to decode jwt token');
  }
  return {
    username: payload['cognito:username'],
    email: payload.email,
  };
};

/**
 * Facebook profile.
 */
const fetchFacebookProfile = (accessToken) =>
  new Promise((resolve, reject) => {
    const facebook = purest({ provider: 'facebook', config: purestConfig });
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({ username: body.name, email: body.email });
      });
  });

/**
 * Google profile.
 */
const fetchGoogleProfile = (accessToken) =>
  new Promise((resolve, reject) => {
    const google = purest({ provider: 'google', config: purestConfig });
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token: accessToken })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({
          username: body.email.split('@')[0],
          email: body.email,
        });
      });
  });

/**
 * Github profile (fallback to emails endpoint if needed).
 */
const fetchGithubProfile = (accessToken) =>
  new Promise((resolve, reject) => {
    const github = purest({
      provider: 'github',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

    github
      .query()
      .get('user')
      .auth(accessToken)
      .request((err, res, user) => {
        if (err) return reject(err);
        if (user.email) {
          return resolve({ username: user.login, email: user.email });
        }

        // Fallback to emails API
        github
          .query()
          .get('user/emails')
          .auth(accessToken)
          .request((err2, res2, emails) => {
            if (err2) return reject(err2);
            const primary = Array.isArray(emails)
              ? emails.find((e) => e.primary === true)
              : null;
            resolve({
              username: user.login,
              email: primary ? primary.email : null,
            });
          });
      });
  });

/**
 * Microsoft profile.
 */
const fetchMicrosoftProfile = (accessToken) =>
  new Promise((resolve, reject) => {
    const microsoft = purest({ provider: 'microsoft', config: purestConfig });
    microsoft
      .query()
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve({
          username: body.userPrincipalName,
          email: body.userPrincipalName,
        });
      });
  });

/**
 * Twitter profile.
 */
const fetchTwitterProfile = (accessToken, query, grant) =>
  new Promise((resolve, reject) => {
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
        if (err) return reject(err);
        resolve({ username: body.screen_name, email: body.email });
      });
  });

/**
 * Instagram profile (dummy email).
 */
const fetchInstagramProfile = (accessToken, grant) =>
  new Promise((resolve, reject) => {
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
        if (err) return reject(err);
        resolve({
          username: body.username,
          email: `${body.username}@strapi.io`,
        });
      });
  });

/**
 * VK profile.
 */
const fetchVkProfile = (accessToken, query) =>
  new Promise((resolve, reject) => {
    const vk = purest({ provider: 'vk', config: purestConfig });
    vk.query()
      .get('users.get')
      .qs({ access_token, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) return reject(err);
        const userInfo = body.response[0];
        resolve({
          username: `${userInfo.last_name} ${userInfo.first_name}`,
          email: query.raw.email,
        });
      });
  });

/**
 * Twitch profile.
 */
const fetchTwitchProfile = (accessToken, grant) =>
  new Promise((resolve, reject) => {
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
            'helix/{endpoint}': { __path: { alias: '__default' } },
            'oauth2/{endpoint}': { __path: { alias: 'oauth' } },
          },
        },
      },
    });

    twitch
      .get('users')
      .auth(accessToken, grant.twitch.key)
      .request((err, res, body) => {
        if (err) return reject(err);
        const user = body.data[0];
        resolve({ username: user.login, email: user.email });
      });
  });

/**
 * LinkedIn profile (combined details and email).
 */
const fetchLinkedInProfile = async (accessToken) => {
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

  return {
    username: localizedFirstName,
    email: email.emailAddress,
  };
};

/**
 * Reddit profile (dummy email).
 */
const fetchRedditProfile = (accessToken) =>
  new Promise((resolve, reject) => {
    const reddit = purest({
      provider: 'reddit',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

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

/**
 * Auth0 profile.
 */
const fetchAuth0Profile = (accessToken, grant) =>
  new Promise((resolve, reject) => {
    const auth0Conf = {};
    auth0Conf[`https://${grant.auth0.subdomain}.auth0.com`] = {
      __domain: { auth: { auth: { bearer: '[0]' } } },
      '{endpoint}': { __path: { alias: '__default' } },
    };

    const auth0 = purest({
      provider: 'auth0',
      config: { auth0: auth0Conf },
    });

    auth0
      .get('userinfo')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) return reject(err);
        const username =
          body.username ||
          body.nickname ||
          body.name ||
          body.email.split('@')[0];
        const email =
          body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
        resolve({ username, email });
      });
  });

/**
 * CAS profile.
 */
const fetchCasProfile = (accessToken, grant) =>
  new Promise((resolve, reject) => {
    const providerUrl = `https://${_.get(grant.cas, 'subdomain')}`;
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
            'CAS Response Body did not contain required attributes: ' +
              JSON.stringify(body)
          );
        }

        resolve({ username, email });
      });
  });

/**
 * Build redirect URI for a provider.
 *
 * @param {String} provider
 *
 * @return {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```