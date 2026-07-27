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
          !_.isEmpty(_.find(users, (u) => u.provider !== provider)) &&
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
          provider,
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
 * Provider-specific profile handlers.
 * Each returns a Promise resolving to { username, email }.
 */

/**
 * Discord profile handler.
 */
const handleDiscord = (access_token) => {
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
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        const username = `${body.username}#${body.discriminator}`;
        resolve({ username, email: body.email });
      });
  });
};

/**
 * Cognito profile handler.
 */
const handleCognito = (query) => {
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

/**
 * Facebook profile handler.
 */
const handleFacebook = (access_token) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    facebook
      .query()
      .get('me?fields=name,email')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({ username: body.name, email: body.email });
      });
  });
};

/**
 * Google profile handler.
 */
const handleGoogle = (access_token) => {
  const google = purest({ provider: 'google', config: purestConfig });

  return new Promise((resolve, reject) => {
    google
      .query('oauth')
      .get('tokeninfo')
      .qs({ access_token })
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({ username: body.email.split('@')[0], email: body.email });
      });
  });
};

/**
 * Github profile handler.
 */
const handleGithub = (access_token) => {
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
      .auth(access_token)
      .request((err, res, userbody) => {
        if (err) {
          return reject(err);
        }

        if (userbody.email) {
          return resolve({ username: userbody.login, email: userbody.email });
        }

        // Fallback to emails API
        github
          .query()
          .get('user/emails')
          .auth(access_token)
          .request((err2, res2, emailsbody) => {
            if (err2) {
              return reject(err2);
            }
            const primary = Array.isArray(emailsbody)
              ? emailsbody.find((e) => e.primary === true)
              : null;
            resolve({ username: userbody.login, email: primary ? primary.email : null });
          });
      });
  });
};

/**
 * Microsoft profile handler.
 */
const handleMicrosoft = (access_token) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    microsoft
      .query()
      .get('me')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({ username: body.userPrincipalName, email: body.userPrincipalName });
      });
  });
};

/**
 * Twitter profile handler.
 */
const handleTwitter = (access_token, query, grant) => {
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
      .auth(access_token, query.access_secret)
      .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({ username: body.screen_name, email: body.email });
      });
  });
};

/**
 * Instagram profile handler.
 */
const handleInstagram = (access_token, grant) => {
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
      .qs({ access_token, fields: 'id,username' })
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.username,
          email: `${body.username}@strapi.io`,
        });
      });
  });
};

/**
 * VK profile handler.
 */
const handleVk = (access_token, query) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  return new Promise((resolve, reject) => {
    vk.query()
      .get('users.get')
      .qs({ access_token, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: `${body.response[0].last_name} ${body.response[0].first_name}`,
          email: query.raw.email,
        });
      });
  });
};

/**
 * Twitch profile handler.
 */
const handleTwitch = (access_token, grant) => {
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
      .auth(access_token, grant.twitch.key)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({ username: body.data[0].login, email: body.data[0].email });
      });
  });
};

/**
 * LinkedIn profile handler.
 */
const handleLinkedin = async (access_token, grant) => {
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

  const getDetailsRequest = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) {
            return reject(err);
          }
          resolve(body);
        });
    });

  const getEmailRequest = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) {
            return reject(err);
          }
          resolve(body);
        });
    });

  const { localizedFirstName } = await getDetailsRequest();
  const { elements } = await getEmailRequest();
  const email = elements[0]['handle~'];

  return { username: localizedFirstName, email: email.emailAddress };
};

/**
 * Reddit profile handler.
 */
const handleReddit = (access_token) => {
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
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        resolve({
          username: body.name,
          email: `${body.name}@strapi.io`,
        });
      });
  });
};

/**
 * Auth0 profile handler.
 */
const handleAuth0 = (access_token, grant) => {
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
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
        const username =
          body.username || body.nickname || body.name || body.email.split('@')[0];
        const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
        resolve({ username, email });
      });
  });
};

/**
 * CAS profile handler.
 */
const handleCas = (access_token, grant) => {
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

  return new Promise((resolve, reject) => {
    cas
      .query()
      .get('oidc/profile')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) {
          return reject(err);
        }
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
 * Retrieves a user profile from a third‑party provider.
 *
 * @param {String} provider
 * @param {Object} query
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

  const handlers = {
    discord: () => handleDiscord(access_token),
    cognito: () => handleCognito(query),
    facebook: () => handleFacebook(access_token),
    google: () => handleGoogle(access_token),
    github: () => handleGithub(access_token),
    microsoft: () => handleMicrosoft(access_token),
    twitter: () => handleTwitter(access_token, query, grant),
    instagram: () => handleInstagram(access_token, grant),
    vk: () => handleVk(access_token, query),
    twitch: () => handleTwitch(access_token, grant),
    linkedin: () => handleLinkedin(access_token, grant),
    reddit: () => handleReddit(access_token),
    auth0: () => handleAuth0(access_token, grant),
    cas: () => handleCas(access_token, grant),
  };

  const handler = handlers[provider];
  if (!handler) {
    return callback(new Error('Unknown provider.'));
  }

  try {
    const profile = await handler();
    callback(null, profile);
  } catch (err) {
    callback(err);
  }
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};