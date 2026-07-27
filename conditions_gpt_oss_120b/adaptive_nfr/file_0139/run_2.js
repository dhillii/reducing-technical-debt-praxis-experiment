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
 * @returns {Promise}
 */
const connect = (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  if (!hasAccessToken(accessToken)) {
    return Promise.reject([null, { message: 'No access_token.' }]);
  }

  return new Promise((resolve, reject) => {
    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (!hasEmail(profile)) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
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

        if (isUserEmpty(existingUser) && !advanced.allow_register) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (!isUserEmpty(existingUser)) {
          return resolve([existingUser, null]);
        }

        if (isEmailTakenByOtherProvider(users, provider, advanced)) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
            'Email is already taken.',
          ]);
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

        return resolve([createdUser, null]);
      } catch (error) {
        return reject([null, error]);
      }
    });
  });
};

/**
 * Guard: checks if an access token is present.
 *
 * @param {String} token
 * @returns {Boolean}
 */
function hasAccessToken(token) {
  return Boolean(token);
}

/**
 * Guard: checks if profile contains an email.
 *
 * @param {Object} profile
 * @returns {Boolean}
 */
function hasEmail(profile) {
  return Boolean(profile && profile.email);
}

/**
 * Guard: checks if a user object is empty.
 *
 * @param {Object} user
 * @returns {Boolean}
 */
function isUserEmpty(user) {
  return _.isEmpty(user);
}

/**
 * Guard: checks if email is already taken by another provider and unique_email is enforced.
 *
 * @param {Array} users
 * @param {String} provider
 * @param {Object} advanced
 * @returns {Boolean}
 */
function isEmailTakenByOtherProvider(users, provider, advanced) {
  const otherProviderUser = _.find(users, u => u.provider !== provider);
  return Boolean(otherProviderUser) && Boolean(advanced.unique_email);
}

/**
 * Helper to get profiles.
 *
 * @param {String} provider
 * @param {Object} query
 * @param {Function} callback
 */
const getProfile = async (provider, query, callback) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  const grant = await strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

  const handlers = {
    discord: () => handleDiscord(accessToken, callback),
    cognito: () => handleCognito(query, callback),
    facebook: () => handleFacebook(accessToken, callback),
    google: () => handleGoogle(accessToken, callback),
    github: () => handleGithub(accessToken, callback),
    microsoft: () => handleMicrosoft(accessToken, callback),
    twitter: () => handleTwitter(accessToken, query, grant, callback),
    instagram: () => handleInstagram(accessToken, grant, callback),
    vk: () => handleVk(accessToken, query, callback),
    twitch: () => handleTwitch(accessToken, grant, callback),
    linkedin: () => handleLinkedin(accessToken, callback),
    reddit: () => handleReddit(accessToken, callback),
    auth0: () => handleAuth0(accessToken, grant, callback),
    cas: () => handleCas(accessToken, grant, callback),
  };

  const handler = handlers[provider];
  if (!handler) {
    return callback(new Error('Unknown provider.'));
  }
  return handler();
};

/**
 * Discord profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
function handleDiscord(token, cb) {
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
    .auth(token)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      const username = `${body.username}#${body.discriminator}`;
      return cb(null, { username, email: body.email });
    });
}

/**
 * Cognito profile handler.
 *
 * @param {Object} query
 * @param {Function} cb
 */
function handleCognito(query, cb) {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);
  if (!tokenPayload) {
    return cb(new Error('unable to decode jwt token'));
  }
  return cb(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
}

/**
 * Facebook profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
function handleFacebook(token, cb) {
  const facebook = purest({ provider: 'facebook', config: purestConfig });
  facebook
    .query()
    .get('me?fields=name,email')
    .auth(token)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, { username: body.name, email: body.email });
    });
}

/**
 * Google profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
function handleGoogle(token, cb) {
  const google = purest({ provider: 'google', config: purestConfig });
  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token: token })
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, {
        username: body.email.split('@')[0],
        email: body.email,
      });
    });
}

/**
 * Github profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
function handleGithub(token, cb) {
  const github = purest({
    provider: 'github',
    config: purestConfig,
    defaults: { headers: { 'user-agent': 'strapi' } },
  });

  github
    .query()
    .get('user')
    .auth(token)
    .request((err, res, userBody) => {
      if (err) {
        return cb(err);
      }

      if (userBody.email) {
        return cb(null, { username: userBody.login, email: userBody.email });
      }

      github
        .query()
        .get('user/emails')
        .auth(token)
        .request((err2, res2, emailsBody) => {
          if (err2) {
            return cb(err2);
          }
          const primaryEmail = Array.isArray(emailsBody)
            ? emailsBody.find(e => e.primary === true).email
            : null;
          return cb(null, { username: userBody.login, email: primaryEmail });
        });
    });
}

/**
 * Microsoft profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
function handleMicrosoft(token, cb) {
  const microsoft = purest({ provider: 'microsoft', config: purestConfig });
  microsoft
    .query()
    .get('me')
    .auth(token)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, {
        username: body.userPrincipalName,
        email: body.userPrincipalName,
      });
    });
}

/**
 * Twitter profile handler.
 *
 * @param {String} token
 * @param {Object} query
 * @param {Object} grant
 * @param {Function} cb
 */
function handleTwitter(token, query, grant, cb) {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.twitter.key,
    secret: grant.twitter.secret,
  });

  twitter
    .query()
    .get('account/verify_credentials')
    .auth(token, query.access_secret)
    .qs({ screen_name: query['raw[screen_name]'], include_email: 'true' })
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, { username: body.screen_name, email: body.email });
    });
}

/**
 * Instagram profile handler.
 *
 * @param {String} token
 * @param {Object} grant
 * @param {Function} cb
 */
function handleInstagram(token, grant, cb) {
  const instagram = purest({
    provider: 'instagram',
    key: grant.instagram.key,
    secret: grant.instagram.secret,
    config: purestConfig,
  });

  instagram
    .query()
    .get('me')
    .qs({ access_token: token, fields: 'id,username' })
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
}

/**
 * VK profile handler.
 *
 * @param {String} token
 * @param {Object} query
 * @param {Function} cb
 */
function handleVk(token, query, cb) {
  const vk = purest({ provider: 'vk', config: purestConfig });
  vk.query()
    .get('users.get')
    .qs({ access_token: token, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, {
        username: `${body.response[0].last_name} ${body.response[0].first_name}`,
        email: query.raw.email,
      });
    });
}

/**
 * Twitch profile handler.
 *
 * @param {String} token
 * @param {Object} grant
 * @param {Function} cb
 */
function handleTwitch(token, grant, cb) {
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
    .auth(token, grant.twitch.key)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, {
        username: body.data[0].login,
        email: body.data[0].email,
      });
    });
}

/**
 * LinkedIn profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
async function handleLinkedin(token, cb) {
  const linkedIn = purest({
    provider: 'linkedin',
    config: {
      linkedin: {
        'https://api.linkedin.com': {
          __domain: {
            auth: [{ auth: { bearer: '[0]' } }],
          },
          '[version]/{endpoint}': {
            __path: { alias: '__default', version: 'v2' },
          },
        },
      },
    },
  });

  try {
    const getDetails = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(token)
          .request((err, res, body) => {
            if (err) {
              return reject(err);
            }
            resolve(body);
          });
      });

    const getEmail = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(token)
          .request((err, res, body) => {
            if (err) {
              return reject(err);
            }
            resolve(body);
          });
      });

    const { localizedFirstName } = await getDetails();
    const { elements } = await getEmail();
    const email = elements[0]['handle~'];

    return cb(null, { username: localizedFirstName, email: email.emailAddress });
  } catch (error) {
    return cb(error);
  }
}

/**
 * Reddit profile handler.
 *
 * @param {String} token
 * @param {Function} cb
 */
function handleReddit(token, cb) {
  const reddit = purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: { headers: { 'user-agent': 'strapi' } },
  });

  reddit
    .query('auth')
    .get('me')
    .auth(token)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      return cb(null, {
        username: body.name,
        email: `${body.name}@strapi.io`,
      });
    });
}

/**
 * Auth0 profile handler.
 *
 * @param {String} token
 * @param {Object} grant
 * @param {Function} cb
 */
function handleAuth0(token, grant, cb) {
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
    .auth(token)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
      }
      const username =
        body.username ||
        body.nickname ||
        body.name ||
        body.email.split('@')[0];
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
      return cb(null, { username, email });
    });
}

/**
 * CAS profile handler.
 *
 * @param {String} token
 * @param {Object} grant
 * @param {Function} cb
 */
function handleCas(token, grant, cb) {
  const providerUrl = 'https://' + _.get(grant.cas, 'subdomain');
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
    .auth(token)
    .request((err, res, body) => {
      if (err) {
        return cb(err);
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

      return cb(null, { username, email });
    });
}

/**
 * Build redirect URI for a provider.
 *
 * @param {String} [provider='']
 * @returns {String}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};