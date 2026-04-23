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
 * @param {String}    provider
 * @param {String}    access_token
 *
 * @return  {*}
 */
const connect = async (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  if (!access_token) {
    throw new Error('No access_token.');
  }

  const profile = await getProfile(provider, query);
  if (!profile.email) {
    throw new Error('Email was not available.');
  }

  return await handleUserProfile(provider, profile);
};

/**
 * Handle user profile
 *
 * @param {String}    provider
 * @param {Object}    profile
 *
 * @return  {*}
 */
const handleUserProfile = async (provider, profile) => {
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
    throw new Error('Register action is actually not available.');
  }

  if (!_.isEmpty(user)) {
    return user;
  }

  if (
    !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
    advanced.unique_email
  ) {
    throw new Error('Email is already taken.');
  }

  const defaultRole = await strapi
    .query('role', 'users-permissions')
    .findOne({ type: advanced.default_role }, []);

  const params = _.assign(profile, {
    provider: provider,
    role: defaultRole.id,
    confirmed: true,
  });

  return await strapi.query('user', 'users-permissions').create(params);
};

/**
 * Helper to get profiles
 *
 * @param {String}   provider
 * @param {Object}   query
 *
 * @return  {Promise<Object>}
 */
const getProfile = async (provider, query) => {
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
      return await getDiscordProfile(access_token);
    case 'cognito':
      return await getCognitoProfile(query.id_token);
    case 'facebook':
      return await getFacebookProfile(access_token);
    case 'google':
      return await getGoogleProfile(access_token);
    case 'github':
      return await getGithubProfile(access_token, query);
    case 'microsoft':
      return await getMicrosoftProfile(access_token);
    case 'twitter':
      return await getTwitterProfile(access_token, query);
    case 'instagram':
      return await getInstagramProfile(access_token);
    case 'vk':
      return await getVkProfile(access_token, query);
    case 'twitch':
      return await getTwitchProfile(access_token, grant);
    case 'linkedin':
      return await getLinkedinProfile(access_token);
    case 'reddit':
      return await getRedditProfile(access_token);
    case 'auth0':
      return await getAuth0Profile(access_token, grant);
    case 'cas':
      return await getCasProfile(access_token, grant);
    default:
      throw new Error('Unknown provider.');
  }
};

/**
 * Get Discord profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getDiscordProfile = async access_token => {
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

  const response = await discord
    .query()
    .get('users/@me')
    .auth(access_token)
    .request();

  const username = `${response.body.username}#${response.body.discriminator}`;
  return { username, email: response.body.email };
};

/**
 * Get Cognito profile
 *
 * @param {String}   id_token
 *
 * @return  {Promise<Object>}
 */
const getCognitoProfile = async id_token => {
  const tokenPayload = jwt.decode(id_token);
  if (!tokenPayload) {
    throw new Error('unable to decode jwt token');
  }

  return {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  };
};

/**
 * Get Facebook profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getFacebookProfile = async access_token => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  const response = await facebook
    .query()
    .get('me?fields=name,email')
    .auth(access_token)
    .request();

  return { username: response.body.name, email: response.body.email };
};

/**
 * Get Google profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getGoogleProfile = async access_token => {
  const google = purest({ provider: 'google', config: purestConfig });

  const response = await google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token })
    .request();

  return {
    username: response.body.email.split('@')[0],
    email: response.body.email,
  };
};

/**
 * Get Github profile
 *
 * @param {String}   access_token
 * @param {Object}   query
 *
 * @return  {Promise<Object>}
 */
const getGithubProfile = async (access_token, query) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const response = await github
    .query()
    .get('user')
    .auth(access_token)
    .request();

  if (response.body.email) {
    return { username: response.body.login, email: response.body.email };
  }

  const emailsResponse = await github
    .query()
    .get('user/emails')
    .auth(access_token)
    .request();

  return {
    username: response.body.login,
    email: Array.isArray(emailsResponse.body)
      ? emailsResponse.body.find(email => email.primary === true).email
      : null,
  };
};

/**
 * Get Microsoft profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getMicrosoftProfile = async access_token => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  const response = await microsoft
    .query()
    .get('me')
    .auth(access_token)
    .request();

  return {
    username: response.body.userPrincipalName,
    email: response.body.userPrincipalName,
  };
};

/**
 * Get Twitter profile
 *
 * @param {String}   access_token
 * @param {Object}   query
 *
 * @return  {Promise<Object>}
 */
const getTwitterProfile = async (access_token, query) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: query.grant.twitter.key,
    secret: query.grant.twitter.secret,
  });

  const response = await twitter
    .query()
    .get('account/verify_credentials')
    .auth(access_token, query.access_secret)
    .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
    .request();

  return { username: response.body.screen_name, email: response.body.email };
};

/**
 * Get Instagram profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getInstagramProfile = async access_token => {
  const instagram = purest({
    provider: 'instagram',
    key: query.grant.instagram.key,
    secret: query.grant.instagram.secret,
    config: purestConfig,
  });

  const response = await instagram
    .query()
    .get('me')
    .qs({ access_token, fields: 'id,username' })
    .request();

  return {
    username: response.body.username,
    email: `${response.body.username}@strapi.io`, // dummy email as Instagram does not provide user email
  };
};

/**
 * Get Vk profile
 *
 * @param {String}   access_token
 * @param {Object}   query
 *
 * @return  {Promise<Object>}
 */
const getVkProfile = async (access_token, query) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  const response = await vk.query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
    .request();

  return {
    username: `${response.body.response[0].last_name} ${response.body.response[0].first_name}`,
    email: query.raw.email,
  };
};

/**
 * Get Twitch profile
 *
 * @param {String}   access_token
 * @param {Object}   grant
 *
 * @return  {Promise<Object>}
 */
const getTwitchProfile = async (access_token, grant) => {
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

  const response = await twitch
    .get('users')
    .auth(access_token, grant.twitch.key)
    .request();

  return {
    username: response.body.data[0].login,
    email: response.body.data[0].email,
  };
};

/**
 * Get Linkedin profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getLinkedinProfile = async access_token => {
  const linkedIn = purest({
    provider: 'linkedin',
    config: {
      linkedin: {
        'https://api.linkedin.com': {
          __domain: {
            auth: {
              auth: { bearer: '[0]' },
            },
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

  const getDetailsRequest = async () => {
    const response = await linkedIn
      .query()
      .get('me')
      .auth(access_token)
      .request();

    return response.body;
  };

  const getEmailRequest = async () => {
    const response = await linkedIn
      .query()
      .get('emailAddress?q=members&projection=(elements*(handle~))')
      .auth(access_token)
      .request();

    return response.body;
  };

  const details = await getDetailsRequest();
  const email = await getEmailRequest();

  return {
    username: details.localizedFirstName,
    email: email.elements[0]['handle~'].emailAddress,
  };
};

/**
 * Get Reddit profile
 *
 * @param {String}   access_token
 *
 * @return  {Promise<Object>}
 */
const getRedditProfile = async access_token => {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const response = await reddit
    .query('auth')
    .get('me')
    .auth(access_token)
    .request();

  return {
    username: response.body.name,
    email: `${response.body.name}@strapi.io`, // dummy email as Reddit does not provide user email
  };
};

/**
 * Get Auth0 profile
 *
 * @param {String}   access_token
 * @param {Object}   grant
 *
 * @return  {Promise<Object>}
 */
const getAuth0Profile = async (access_token, grant) => {
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

  const response = await auth0
    .get('userinfo')
    .auth(access_token)
    .request();

  const username =
    response.body.username || response.body.nickname || response.body.name || response.body.email.split('@')[0];
  const email = response.body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

  return { username, email };
};

/**
 * Get Cas profile
 *
 * @param {String}   access_token
 * @param {Object}   grant
 *
 * @return  {Promise<Object>}
 */
const getCasProfile = async (access_token, grant) => {
  const provider_url = 'https://' + _.get(grant['cas'], 'subdomain');
  const cas = purest({
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

  const response = await cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request();

  const username = response.body.attributes
    ? response.body.attributes.strapiusername || response.body.id || response.body.sub
    : response.body.strapiusername || response.body.id || response.body.sub;
  const email = response.body.attributes
    ? response.body.attributes.strapiemail || response.body.attributes.email
    : response.body.strapiemail || response.body.email;

  if (!username || !email) {
    strapi.log.warn(
      'CAS Response Body did not contain required attributes: ' + JSON.stringify(response.body)
    );
  }

  return { username, email };
};

/**
 * Build redirect URI
 *
 * @param {String}   provider
 *
 * @return  {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};