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
 * Helper to retrieve provider specific profile.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Object>} profile
 */
const providerHandlers = {
  discord: async (accessToken) => {
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
  },

  cognito: async (idToken) => {
    const tokenPayload = jwt.decode(idToken);
    if (!tokenPayload) {
      throw new Error('unable to decode jwt token');
    }
    return {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    };
  },

  facebook: async (accessToken) => {
    const facebook = purest({
      provider: 'facebook',
      config: purestConfig,
    });

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
  },

  google: async (accessToken) => {
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
  },

  github: async (accessToken) => {
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

    const primaryEmail = Array.isArray(emailsBody)
      ? emailsBody.find((email) => email.primary === true).email
      : null;

    return { username: userBody.login, email: primaryEmail };
  },

  microsoft: async (accessToken) => {
    const microsoft = purest({
      provider: 'microsoft',
      config: purestConfig,
    });

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
  },

  twitter: async (accessToken, accessSecret, query) => {
    const grant = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'grant',
      })
      .get();

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
        .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
        .request((err, res, body) => {
          if (err) reject(err);
          else resolve(body);
        });
    });

    return { username: body.screen_name, email: body.email };
  },

  instagram: async (accessToken, grant) => {
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

    return {
      username: body.username,
      email: `${body.username}@strapi.io`,
    };
  },

  vk: async (accessToken, query) => {
    const vk = purest({
      provider: 'vk',
      config: purestConfig,
    });

    const body = await new Promise((resolve, reject) => {
      vk.query()
        .get('users.get')
        .qs({ access_token: accessToken, id: query.raw.user_id, v: '5.122' })
        .request((err, res, body) => {
          if (err) reject(err);
          else resolve(body);
        });
    });

    return {
      username: `${body.response[0].last_name} ${body.response[0].first_name}`,
      email: query.raw.email,
    };
  },

  twitch: async (accessToken, grant) => {
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
  },

  linkedin: async (accessToken) => {
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

    const details = await getDetails();
    const emailData = await getEmail();

    const email = emailData.elements[0]['handle~'].emailAddress;

    return { username: details.localizedFirstName, email };
  },

  reddit: async (accessToken) => {
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

    return {
      username: body.name,
      email: `${body.name}@strapi.io`,
    };
  },

  auth0: async (accessToken, grant) => {
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
          if (err) reject(err);
          else resolve(body);
        });
    });

    const username =
      body.username || body.nickname || body.name || body.email.split('@')[0];
    const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

    return { username, email };
  },

  cas: async (accessToken, grant) => {
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
  },
};

/**
 * Retrieve profile for a given provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<Object>} profile
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

  const handler = providerHandlers[provider];
  if (!handler) {
    throw new Error('Unknown provider.');
  }

  return handler(accessToken, query, grant);
};

/**
 * Validate presence of access token.
 *
 * @param {Object} query
 * @returns {String} accessToken
 */
const validateAccessToken = (query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;
  if (!accessToken) {
    throw new Error('No access_token.');
  }
  return accessToken;
};

/**
 * Find user by email and provider.
 *
 * @param {String} email
 * @param {String} provider
 * @returns {Promise<Object|null>}
 */
const findUserByEmailAndProvider = async (email, provider) => {
  const users = await strapi
    .query('user', 'users-permissions')
    .find({ email });

  return _.find(users, { provider }) || null;
};

/**
 * Retrieve advanced settings.
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
 * Retrieve default role.
 *
 * @param {String} roleType
 * @returns {Promise<Object>}
 */
const getDefaultRole = async (roleType) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: roleType }, []);
};

/**
 * Create a new user.
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

  return strapi.query('user', 'users-permissions').create(params);
};

/**
 * Connect thanks to a third-party provider.
 *
 * @param {String} provider
 * @param {Object} query
 * @returns {Promise<[Object|null, Object|null]>}
 */
const connect = async (provider, query) => {
  try {
    const accessToken = validateAccessToken(query);
    const profile = await getProfile(provider, query);

    if (!profile.email) {
      throw new Error('Email was not available.');
    }

    const user = await findUserByEmailAndProvider(profile.email, provider);
    const advanced = await getAdvancedSettings();

    if (!user && !advanced.allow_register) {
      return [
        null,
        [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
        'Register action is actually not available.',
      ];
    }

    if (user) {
      return [user, null];
    }

    const otherProviderUser = _.find(
      await strapi.query('user', 'users-permissions').find({ email: profile.email }),
      (u) => u.provider !== provider
    );

    if (otherProviderUser && advanced.unique_email) {
      return [
        null,
        [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
        'Email is already taken.',
      ];
    }

    const defaultRole = await getDefaultRole(advanced.default_role);
    const createdUser = await createUser(profile, provider, defaultRole.id);

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