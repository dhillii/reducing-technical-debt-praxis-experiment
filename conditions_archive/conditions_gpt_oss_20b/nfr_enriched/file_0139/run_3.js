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
 * Helper to perform a purest request and return a promise.
 *
 * @param {Object} purestInstance
 * @param {String} method
 * @param {String} path
 * @param {Object} [authOptions]
 * @param {Object} [qs]
 * @returns {Promise<Object>}
 */
const requestAsync = (purestInstance, method, path, authOptions, qs) =>
  new Promise((resolve, reject) => {
    let req = purestInstance.query();
    if (method === 'get') {
      req = req.get(path);
    } else if (method === 'post') {
      req = req.post(path);
    }
    if (authOptions) {
      if (authOptions.access_token && authOptions.access_secret) {
        req.auth(authOptions.access_token, authOptions.access_secret);
      } else if (authOptions.access_token) {
        req.auth(authOptions.access_token);
      }
    }
    if (qs) {
      req.qs(qs);
    }
    req.request((err, res, body) => {
      if (err) {
        return reject(err);
      }
      resolve(body);
    });
  });

/**
 * Provider specific profile fetchers.
 */
const getDiscordProfile = async (query) => {
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

  const body = await requestAsync(discord, 'get', 'users/@me', {
    access_token: query.access_token,
  });

  const username = `${body.username}#${body.discriminator}`;
  return { username, email: body.email };
};

const getCognitoProfile = (query) => {
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

const getFacebookProfile = async (query) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  const body = await requestAsync(
    facebook,
    'get',
    'me?fields=name,email',
    { access_token: query.access_token }
  );

  return { username: body.name, email: body.email };
};

const getGoogleProfile = async (query) => {
  const google = purest({
    provider: 'google',
    config: purestConfig,
  });

  const body = await new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token: query.access_token })
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.email.split('@')[0], email: body.email };
};

const getGithubProfile = async (query) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const userBody = await requestAsync(
    github,
    'get',
    'user',
    { access_token: query.access_token }
  );

  if (userBody.email) {
    return { username: userBody.login, email: userBody.email };
  }

  const emailsBody = await requestAsync(
    github,
    'get',
    'user/emails',
    { access_token: query.access_token }
  );

  const primaryEmail =
    Array.isArray(emailsBody)
      ? emailsBody.find((e) => e.primary === true).email
      : null;

  return { username: userBody.login, email: primaryEmail };
};

const getMicrosoftProfile = async (query) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  const body = await requestAsync(
    microsoft,
    'get',
    'me',
    { access_token: query.access_token }
  );

  return { username: body.userPrincipalName, email: body.userPrincipalName };
};

const getTwitterProfile = async (query, grant) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

  const body = await requestAsync(
    twitter,
    'get',
    'account/verify_credentials',
    {
      access_token: query.access_token,
      access_secret: query.access_secret,
    },
    {
      screen_name: query['raw[screen_name]'],
      include_email: 'true',
    }
  );

  return { username: body.screen_name, email: body.email };
};

const getInstagramProfile = async (query, grant) => {
  const instagram = purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });

  const body = await requestAsync(
    instagram,
    'get',
    'me',
    null,
    { access_token: query.access_token, fields: 'id,username' }
  );

  return {
    username: body.username,
    email: `${body.username}@strapi.io`,
  };
};

const getVkProfile = async (query) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  const body = await requestAsync(
    vk,
    'get',
    'users.get',
    null,
    {
      access_token: query.access_token,
      id: query.raw.user_id,
      v: '5.122',
    }
  );

  return {
    username: `${body.response[0].last_name} ${body.response[0].first_name}`,
    email: query.raw.email,
  };
};

const getTwitchProfile = async (query, grant) => {
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
      .auth(query.access_token, grant.twitch.key)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  return { username: body.data[0].login, email: body.data[0].email };
};

const getLinkedInProfile = async (query, grant) => {
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
        .auth(query.access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    });

  const getEmail = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get(
          'emailAddress?q=members&projection=(elements*(handle~))'
        )
        .auth(query.access_token)
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    });

  const details = await getDetails();
  const emailBody = await getEmail();
  const email = emailBody.elements[0]['handle~'];

  return {
    username: details.localizedFirstName,
    email: email.emailAddress,
  };
};

const getRedditProfile = async (query) => {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const body = await requestAsync(
    reddit,
    'get',
    'me',
    { access_token: query.access_token }
  );

  return {
    username: body.name,
    email: `${body.name}@strapi.io`,
  };
};

const getAuth0Profile = async (query, grant) => {
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
      .auth(query.access_token)
      .request((err, res, body) => {
        if (err) return reject(err);
        resolve(body);
      });
  });

  const username =
    body.username ||
    body.nickname ||
    body.name ||
    body.email.split('@')[0];
  const email =
    body.email ||
    `${username.replace(/\s+/g, '.')}@strapi.io`;

  return { username, email };
};

const getCasProfile = async (query, grant) => {
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
      .auth(query.access_token)
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
      'CAS Response Body did not contain required attributes: ' +
        JSON.stringify(body)
    );
  }

  return { username, email };
};

/**
 * Helper to get profiles
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getProfile = async (provider, query) => {
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
      return getDiscordProfile(query);
    case 'cognito':
      return getCognitoProfile(query);
    case 'facebook':
      return getFacebookProfile(query);
    case 'google':
      return getGoogleProfile(query);
    case 'github':
      return getGithubProfile(query);
    case 'microsoft':
      return getMicrosoftProfile(query);
    case 'twitter':
      return getTwitterProfile(query, grant);
    case 'instagram':
      return getInstagramProfile(query, grant);
    case 'vk':
      return getVkProfile(query);
    case 'twitch':
      return getTwitchProfile(query, grant);
    case 'linkedin':
      return getLinkedInProfile(query, grant);
    case 'reddit':
      return getRedditProfile(query);
    case 'auth0':
      return getAuth0Profile(query, grant);
    case 'cas':
      return getCasProfile(query, grant);
    default:
      throw new Error('Unknown provider.');
  }
};

/**
 * Connect thanks to a third-party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Array>}
 */
const connect = async (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  if (!accessToken) {
    return [null, { message: 'No access_token.' }];
  }

  try {
    const profile = await getProfile(provider, query);

    if (!profile.email) {
      return [null, { message: 'Email was not available.' }];
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

    const user = _.find(users, { provider });

    if (_.isEmpty(user) && !advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ];
    }

    if (!_.isEmpty(user)) {
      return [user, null];
    }

    if (
      !_.isEmpty(_.find(users, (u) => u.provider !== provider)) &&
      advanced.unique_email
    ) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: advanced.default_role }, []);

    const params = _.assign(profile, {
      provider,
      role: defaultRole.id,
      confirmed: true,
    });

    const createdUser = await strapi
      .query('user', 'users-permissions')
      .create(params);

    return [createdUser, null];
  } catch (err) {
    return [null, err];
  }
};

/**
 * Build redirect URI for a provider.
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