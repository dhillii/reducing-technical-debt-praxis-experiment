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
 * @param {String} access_token
 *
 * @return {*}
 */
const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!access_token) {
      return reject([null, { message: 'No access_token.' }]);
    }

    // Get the profile.
    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      // We need at least the mail.
      if (!profile.email) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
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
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (!_.isEmpty(user)) {
          return resolve([user, null]);
        }

        if (
          !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
          advanced.unique_email
        ) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
            'Email is already taken.',
          ]);
        }

        // Retrieve default role.
        const defaultRole = await strapi
          .query('role', 'users-permissions')
          .findOne({ type: advanced.default_role }, []);

        // Create the new user.
        const params = _.assign(profile, {
          provider: provider,
          role: defaultRole.id,
          confirmed: true,
        });

        const createdUser = await strapi.query('user', 'users-permissions').create(params);

        return resolve([createdUser, null]);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

/**
 * Helper to get profiles
 *
 * @param {String} provider
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const access_token = query.access_token || query.code || query.oauth_token;

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
    return callback(new Error('Unknown provider.'));
  }

  // All handlers accept (access_token, query, grant, callback)
  handler(access_token, query, grant, callback);
};

/**
 * Build redirect URI for a provider.
 *
 * @param {String} provider
 *
 * @return {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

/**
 * Provider-specific profile retrieval handlers.
 *
 * Each handler follows the signature:
 *   (access_token, query, grant, callback)
 * Handlers may ignore unused parameters.
 */
const providerHandlers = {
  discord: getDiscordProfile,
  cognito: getCognitoProfile,
  facebook: getFacebookProfile,
  google: getGoogleProfile,
  github: getGithubProfile,
  microsoft: getMicrosoftProfile,
  twitter: getTwitterProfile,
  instagram: getInstagramProfile,
  vk: getVkProfile,
  twitch: getTwitchProfile,
  linkedin: getLinkedInProfile,
  reddit: getRedditProfile,
  auth0: getAuth0Profile,
  cas: getCasProfile,
};

/**
 * Retrieve Discord profile.
 */
const getDiscordProfile = (access_token, _query, _grant, callback) => {
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
    .auth(access_token)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      const username = `${body.username}#${body.discriminator}`;
      callback(null, {
        username,
        email: body.email,
      });
    });
};

/**
 * Retrieve Cognito profile.
 */
const getCognitoProfile = (_access_token, query, _grant, callback) => {
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
 * Retrieve Facebook profile.
 */
const getFacebookProfile = (access_token, _query, _grant, callback) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  facebook
    .query()
    .get('me?fields=name,email')
    .auth(access_token)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.name,
        email: body.email,
      });
    });
};

/**
 * Retrieve Google profile.
 */
const getGoogleProfile = (access_token, _query, _grant, callback) => {
  const google = purest({
    provider: 'google',
    config: purestConfig,
  });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token })
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.email.split('@')[0],
        email: body.email,
      });
    });
};

/**
 * Retrieve GitHub profile.
 */
const getGithubProfile = (access_token, _query, _grant, callback) => {
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
    .auth(access_token)
    .request((err, _res, userbody) => {
      if (err) {
        return callback(err);
      }

      if (userbody.email) {
        return callback(null, {
          username: userbody.login,
          email: userbody.email,
        });
      }

      github
        .query()
        .get('user/emails')
        .auth(access_token)
        .request((err, _res, emailsbody) => {
          if (err) {
            return callback(err);
          }

          const email =
            Array.isArray(emailsbody)
              ? emailsbody.find(email => email.primary === true).email
              : null;

          callback(null, {
            username: userbody.login,
            email,
          });
        });
    });
};

/**
 * Retrieve Microsoft profile.
 */
const getMicrosoftProfile = (access_token, _query, _grant, callback) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  microsoft
    .query()
    .get('me')
    .auth(access_token)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.userPrincipalName,
        email: body.userPrincipalName,
      });
    });
};

/**
 * Retrieve Twitter profile.
 */
const getTwitterProfile = (access_token, query, grant, callback) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

  twitter
    .query()
    .get('account/verify_credentials')
    .auth(access_token, query.access_secret)
    .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.screen_name,
        email: body.email,
      });
    });
};

/**
 * Retrieve Instagram profile.
 */
const getInstagramProfile = (access_token, _query, grant, callback) => {
  const instagram = purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });

  instagram
    .query()
    .get('me')
    .qs({ access_token, fields: 'id,username' })
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
};

/**
 * Retrieve VK profile.
 */
const getVkProfile = (access_token, query, _grant, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk
    .query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: `${body.response[0].last_name} ${body.response[0].first_name}`,
        email: query.raw.email,
      });
    });
};

/**
 * Retrieve Twitch profile.
 */
const getTwitchProfile = (access_token, _query, grant, callback) => {
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
    .auth(access_token, grant.twitch.key)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.data[0].login,
        email: body.data[0].email,
      });
    });
};

/**
 * Retrieve LinkedIn profile.
 */
const getLinkedInProfile = async (access_token, _query, _grant, callback) => {
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
    const getDetailsRequest = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(access_token)
          .request((err, _res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const getEmailRequest = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(access_token)
          .request((err, _res, body) => {
            if (err) return reject(err);
            resolve(body);
          });
      });

    const { localizedFirstName } = await getDetailsRequest();
    const { elements } = await getEmailRequest();
    const email = elements[0]['handle~'];

    callback(null, {
      username: localizedFirstName,
      email: email.emailAddress,
    });
  } catch (err) {
    callback(err);
  }
};

/**
 * Retrieve Reddit profile.
 */
const getRedditProfile = (access_token, _query, _grant, callback) => {
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
    .auth(access_token)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      callback(null, {
        username: body.name,
        email: `${body.name}@strapi.io`,
      });
    });
};

/**
 * Retrieve Auth0 profile.
 */
const getAuth0Profile = (access_token, _query, grant, callback) => {
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

  auth0
    .get('userinfo')
    .auth(access_token)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
      const username =
        body.username || body.nickname || body.name || body.email.split('@')[0];
      const email =
        body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Retrieve CAS profile.
 */
const getCasProfile = (access_token, _query, grant, callback) => {
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

  cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request((err, _res, body) => {
      if (err) {
        return callback(err);
      }
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
      callback(null, { username, email });
    });
};

module.exports = {
  connect,
  buildRedirectUri,
};