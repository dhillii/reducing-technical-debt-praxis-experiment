```javascript
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
 * @returns {Promise<Array>}
 */
const connect = async (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  if (!access_token) {
    return Promise.reject([null, { message: 'No access_token.' }]);
  }

  try {
    const profile = await getProfile(provider, query);
    if (!profile.email) {
      return Promise.reject([null, { message: 'Email was not available.' }]);
    }

    const user = await findUser(provider, profile.email);
    if (user) {
      return [user, null];
    }

    const advanced = await getAdvancedSettings();
    if (!advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ];
    }

    if (await isEmailTaken(provider, profile.email)) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await getDefaultRole(advanced);
    const createdUser = await createUser(profile, provider, defaultRole.id);

    return [createdUser, null];
  } catch (err) {
    return Promise.reject([null, err]);
  }
};

/**
 * Helper to get profiles
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getProfile = async (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  const grant = await getGrantSettings();

  switch (provider) {
    case 'discord':
      return getDiscordProfile(access_token);
    case 'cognito':
      return getCognitoProfile(query.id_token);
    case 'facebook':
      return getFacebookProfile(access_token);
    case 'google':
      return getGoogleProfile(access_token);
    case 'github':
      return getGithubProfile(access_token);
    case 'microsoft':
      return getMicrosoftProfile(access_token);
    case 'twitter':
      return getTwitterProfile(access_token, query.access_secret);
    case 'instagram':
      return getInstagramProfile(access_token);
    case 'vk':
      return getVkProfile(access_token, query.raw.user_id);
    case 'twitch':
      return getTwitchProfile(access_token, grant.twitch.key);
    case 'linkedin':
      return getLinkedinProfile(access_token);
    case 'reddit':
      return getRedditProfile(access_token);
    case 'auth0':
      return getAuth0Profile(access_token, grant.auth0.subdomain);
    case 'cas':
      return getCasProfile(access_token, grant.cas.subdomain);
    default:
      throw new Error('Unknown provider.');
  }
};

/**
 * Get Discord profile
 *
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getDiscordProfile = async (access_token) => {
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
 * @param {String} id_token
 * @returns {Promise<Object>}
 */
const getCognitoProfile = async (id_token) => {
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
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getFacebookProfile = async (access_token) => {
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
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getGoogleProfile = async (access_token) => {
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
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getGithubProfile = async (access_token) => {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });

  const userResponse = await github
    .query()
    .get('user')
    .auth(access_token)
    .request();

  if (userResponse.body.email) {
    return { username: userResponse.body.login, email: userResponse.body.email };
  }

  const emailsResponse = await github
    .query()
    .get('user/emails')
    .auth(access_token)
    .request();

  return {
    username: userResponse.body.login,
    email: Array.isArray(emailsResponse.body)
      ? emailsResponse.body.find(email => email.primary === true).email
      : null,
  };
};

/**
 * Get Microsoft profile
 *
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getMicrosoftProfile = async (access_token) => {
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
 * @param {String} access_token
 * @param {String} access_secret
 * @returns {Promise<Object>}
 */
const getTwitterProfile = async (access_token, access_secret) => {
  const grant = await getGrantSettings();
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

  const response = await twitter
    .query()
    .get('account/verify_credentials')
    .auth(access_token, access_secret)
    .qs({ screen_name: grant.twitter.screen_name, include_email: 'true' })
    .request();

  return { username: response.body.screen_name, email: response.body.email };
};

/**
 * Get Instagram profile
 *
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getInstagramProfile = async (access_token) => {
  const instagram = purest({
    provider: 'instagram',
    key: (await getGrantSettings()).instagram.key,
    secret: (await getGrantSettings()).instagram.secret,
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
 * @param {String} access_token
 * @param {String} user_id
 * @returns {Promise<Object>}
 */
const getVkProfile = async (access_token, user_id) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  const response = await vk
    .query()
    .get('users.get')
    .qs({ access_token, id: user_id, v: '5.122' })
    .request();

  return {
    username: `${response.body.response[0].last_name} ${response.body.response[0].first_name}`,
    email: response.body.response[0].email,
  };
};

/**
 * Get Twitch profile
 *
 * @param {String} access_token
 * @param {String} client_id
 * @returns {Promise<Object>}
 */
const getTwitchProfile = async (access_token, client_id) => {
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
    .auth(access_token, client_id)
    .request();

  return { username: response.body.data[0].login, email: response.body.data[0].email };
};

/**
 * Get Linkedin profile
 *
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getLinkedinProfile = async (access_token) => {
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

  const detailsResponse = await linkedIn
    .query()
    .get('me')
    .auth(access_token)
    .request();

  const emailResponse = await linkedIn
    .query()
    .get('emailAddress?q=members&projection=(elements*(handle~))')
    .auth(access_token)
    .request();

  return {
    username: detailsResponse.body.localizedFirstName,
    email: emailResponse.body.elements[0]['handle~'].emailAddress,
  };
};

/**
 * Get Reddit profile
 *
 * @param {String} access_token
 * @returns {Promise<Object>}
 */
const getRedditProfile = async (access_token) => {
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
 * @param {String} access_token
 * @param {String} subdomain
 * @returns {Promise<Object>}
 */
const getAuth0Profile = async (access_token, subdomain) => {
  const purestAuth0Conf = {};
  purestAuth0Conf[`https://${subdomain}.auth0.com`] = {
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
 * @param {String} access_token
 * @param {String} subdomain
 * @returns {Promise<Object>}
 */
const getCasProfile = async (access_token, subdomain) => {
  const provider_url = 'https://' + subdomain;
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
    strapi.log.warn('CAS Response Body did not contain required attributes: ' + JSON.stringify(response.body));
  }

  return { username, email };
};

/**
 * Find user by provider and email
 *
 * @param {String} provider
 * @param {String} email
 * @returns {Promise<Object>}
 */
const findUser = async (provider, email) => {
  const users = await strapi.query('user', 'users-permissions').find({ email });
  return _.find(users, { provider });
};

/**
 * Get advanced settings
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
 * Check if email is taken
 *
 * @param {String} provider
 * @param {String} email
 * @returns {Promise<Boolean>}
 */
const isEmailTaken = async (provider, email) => {
  const users = await strapi.query('user', 'users-permissions').find({ email });
  return !_.isEmpty(_.find(users, user => user.provider !== provider));
};

/**
 * Get default role
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
 * Create new user
 *
 * @param {Object} profile
 * @param {String} provider
 * @param {Number} role_id
 * @returns {Promise<Object>}
 */
const createUser = async (profile, provider, role_id) => {
  const params = _.assign(profile, {
    provider,
    role: role_id,
    confirmed: true,
  });

  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Get grant settings
 *
 * @returns {Promise<Object>}
 */
const getGrantSettings = async () => {
  return strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();
};

/**
 * Build redirect URI
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
```