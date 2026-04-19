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
 * @return {Promise<Array>}
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

    if (!_.isEmpty(_.find(users, u => u.provider !== provider)) && advanced.unique_email) {
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
 * Retrieve the user profile from the provider.
 *
 * @param {String} provider
 * @param {Object} query
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
      return getDiscordProfile(accessToken);
    case 'cognito':
      return getCognitoProfile(query.id_token);
    case 'facebook':
      return getFacebookProfile(accessToken);
    case 'google':
      return getGoogleProfile(accessToken);
    case 'github':
      return getGithubProfile(accessToken);
    case 'microsoft':
      return getMicrosoftProfile(accessToken);
    case 'twitter':
      return getTwitterProfile(accessToken, query.access_secret, query['raw[screen_name]'], grant);
    case 'instagram':
      return getInstagramProfile(accessToken, grant);
    case 'vk':
      return getVkProfile(accessToken, query.raw.user_id, query.raw.email);
    case 'twitch':
      return getTwitchProfile(accessToken, grant);
    case 'linkedin':
      return getLinkedInProfile(accessToken);
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

/**
 * Discord profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getDiscordProfile = async accessToken => {
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
        if (err) reject(err);
        else resolve(body);
      });
  });

  const username = `${body.username}#${body.discriminator}`;
  return { username, email: body.email };
};

/**
 * Cognito profile retrieval.
 *
 * @param {String} idToken
 * @return {Promise<Object>}
 */
const getCognitoProfile = async idToken => {
  const tokenPayload = jwt.decode(idToken);
  if (!tokenPayload) {
    throw new Error('unable to decode jwt token');
  }
  return {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  };
};

/**
 * Facebook profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getFacebookProfile = async accessToken => {
  const facebook = purest({ provider: 'facebook', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.name, email: body.email };
};

/**
 * Google profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getGoogleProfile = async accessToken => {
  const google = purest({ provider: 'google', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token: accessToken })
      .request((err, res, body) => {
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.email.split('@')[0], email: body.email };
};

/**
 * GitHub profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getGithubProfile = async accessToken => {
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
        if (err) reject(err);
        else resolve(body);
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
        if (err) reject(err);
        else resolve(body);
      });
  });

  const email = Array.isArray(emailsBody)
    ? emailsBody.find(e => e.primary === true).email
    : null;

  return { username: userBody.login, email };
};

/**
 * Microsoft profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getMicrosoftProfile = async accessToken => {
  const microsoft = purest({ provider: 'microsoft', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    microsoft
      .query()
      .get('me')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.userPrincipalName, email: body.userPrincipalName };
};

/**
 * Twitter profile retrieval.
 *
 * @param {String} accessToken
 * @param {String} accessSecret
 * @param {String} screenName
 * @param {Object} grant
 * @return {Promise<Object>}
 */
const getTwitterProfile = async (accessToken, accessSecret, screenName, grant) => {
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
      .auth(accessToken, accessSecret)
      .qs({ screen_name: screenName, include_email: 'true' })
      .request((err, res, body) => {
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.screen_name, email: body.email };
};

/**
 * Instagram profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @return {Promise<Object>}
 */
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
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.username, email: `${body.username}@strapi.io` };
};

/**
 * VK profile retrieval.
 *
 * @param {String} accessToken
 * @param {String} userId
 * @param {String} email
 * @return {Promise<Object>}
 */
const getVkProfile = async (accessToken, userId, email) => {
  const vk = purest({ provider: 'vk', config: purestConfig });

  const body = await new Promise((resolve, reject) => {
    vk
      .query()
      .get('users.get')
      .qs({ access_token: accessToken, id: userId, v: '5.122' })
      .request((err, res, body) => {
        if (err) reject(err);
        else resolve(body);
      });
  });

  return {
    username: `${body.response[0].last_name} ${body.response[0].first_name}`,
    email,
  };
};

/**
 * Twitch profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @return {Promise<Object>}
 */
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
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.data[0].login, email: body.data[0].email };
};

/**
 * LinkedIn profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getLinkedInProfile = async accessToken => {
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
          if (err) reject(err);
          else resolve(body);
        });
    });

  const getEmail = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(accessToken)
        .request((err, res, body) => {
          if (err) reject(err);
          else resolve(body);
        });
    });

  const { localizedFirstName } = await getDetails();
  const { elements } = await getEmail();
  const email = elements[0]['handle~'];

  return { username: localizedFirstName, email: email.emailAddress };
};

/**
 * Reddit profile retrieval.
 *
 * @param {String} accessToken
 * @return {Promise<Object>}
 */
const getRedditProfile = async accessToken => {
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
        if (err) reject(err);
        else resolve(body);
      });
  });

  return { username: body.name, email: `${body.name}@strapi.io` };
};

/**
 * Auth0 profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @return {Promise<Object>}
 */
const getAuth0Profile = async (accessToken, grant) => {
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

  const body = await new Promise((resolve, reject) => {
    auth0
      .get('userinfo')
      .auth(accessToken)
      .request((err, res, body) => {
        if (err) reject(err);
        else resolve(body);
      });
  });

  const username =
    body.username || body.nickname || body.name || body.email.split('@')[0];
  const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

  return { username, email };
};

/**
 * CAS profile retrieval.
 *
 * @param {String} accessToken
 * @param {Object} grant
 * @return {Promise<Object>}
 */
const getCasProfile = async (accessToken, grant) => {
  const providerUrl = `https://${_.get(grant['cas'], 'subdomain')}`;
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
        if (err) reject(err);
        else resolve(body);
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
 * Build redirect URI for provider callback.
 *
 * @param {String} provider
 * @return {String}
 */
const buildRedirectUri = provider => `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};