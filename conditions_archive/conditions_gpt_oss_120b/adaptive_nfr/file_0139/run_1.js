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
 * Predicate: checks if access token is missing.
 * @param {string} token
 * @returns {boolean}
 */
const isAccessTokenMissing = token => !token;

/**
 * Predicate: checks if email is missing.
 * @param {string} email
 * @returns {boolean}
 */
const isEmailMissing = email => !email;

/**
 * Predicate: checks if a user object is empty.
 * @param {object} user
 * @returns {boolean}
 */
const isUserEmpty = user => _.isEmpty(user);

/**
 * Predicate: checks if registration is disabled.
 * @param {boolean} userEmpty
 * @param {boolean} allowRegister
 * @returns {boolean}
 */
const isRegisterNotAllowed = (userEmpty, allowRegister) => userEmpty && !allowRegister;

/**
 * Predicate: checks if email is already taken by another provider.
 * @param {Array} users
 * @param {string} provider
 * @param {boolean} uniqueEmail
 * @returns {boolean}
 */
const isEmailTaken = (users, provider, uniqueEmail) =>
  !_.isEmpty(_.find(users, u => u.provider !== provider)) && uniqueEmail;

/**
 * Connect thanks to a third‑party provider.
 *
 * @param {string} provider
 * @param {object} query
 * @returns {Promise}
 */
const connect = (provider, query) => {
  const accessToken = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (isAccessTokenMissing(accessToken)) {
      return reject([null, { message: 'No access_token.' }]);
    }

    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (isEmailMissing(profile.email)) {
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

        if (isRegisterNotAllowed(isUserEmpty(existingUser), advanced.allow_register)) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (!isUserEmpty(existingUser)) {
          return resolve([existingUser, null]);
        }

        if (isEmailTaken(users, provider, advanced.unique_email)) {
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
 * Helper to get profiles.
 *
 * @param {string} provider
 * @param {object} query
 * @param {function} callback
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

  switch (provider) {
    case 'discord':
      return fetchDiscordProfile(accessToken, callback);
    case 'cognito':
      return fetchCognitoProfile(query, callback);
    case 'facebook':
      return fetchFacebookProfile(accessToken, callback);
    case 'google':
      return fetchGoogleProfile(accessToken, callback);
    case 'github':
      return fetchGithubProfile(accessToken, callback);
    case 'microsoft':
      return fetchMicrosoftProfile(accessToken, callback);
    case 'twitter':
      return fetchTwitterProfile(accessToken, query, grant, callback);
    case 'instagram':
      return fetchInstagramProfile(accessToken, grant, callback);
    case 'vk':
      return fetchVkProfile(accessToken, query, callback);
    case 'twitch':
      return fetchTwitchProfile(accessToken, grant, callback);
    case 'linkedin':
      return fetchLinkedinProfile(accessToken, callback);
    case 'reddit':
      return fetchRedditProfile(accessToken, callback);
    case 'auth0':
      return fetchAuth0Profile(accessToken, grant, callback);
    case 'cas':
      return fetchCasProfile(accessToken, grant, callback);
    default:
      return callback(new Error('Unknown provider.'));
  }
};

/**
 * Fetch Discord profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchDiscordProfile = (token, cb) => {
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
};

/**
 * Fetch Cognito profile.
 * @param {object} query
 * @param {function} cb
 */
const fetchCognitoProfile = (query, cb) => {
  const idToken = query.id_token;
  const tokenPayload = jwt.decode(idToken);
  if (!tokenPayload) {
    return cb(new Error('unable to decode jwt token'));
  }
  return cb(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
};

/**
 * Fetch Facebook profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchFacebookProfile = (token, cb) => {
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
};

/**
 * Fetch Google profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchGoogleProfile = (token, cb) => {
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
};

/**
 * Fetch Github profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchGithubProfile = (token, cb) => {
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
};

/**
 * Fetch Microsoft profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchMicrosoftProfile = (token, cb) => {
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
};

/**
 * Fetch Twitter profile.
 * @param {string} token
 * @param {object} query
 * @param {object} grant
 * @param {function} cb
 */
const fetchTwitterProfile = (token, query, grant, cb) => {
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
};

/**
 * Fetch Instagram profile.
 * @param {string} token
 * @param {object} grant
 * @param {function} cb
 */
const fetchInstagramProfile = (token, grant, cb) => {
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
};

/**
 * Fetch VK profile.
 * @param {string} token
 * @param {object} query
 * @param {function} cb
 */
const fetchVkProfile = (token, query, cb) => {
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
};

/**
 * Fetch Twitch profile.
 * @param {string} token
 * @param {object} grant
 * @param {function} cb
 */
const fetchTwitchProfile = (token, grant, cb) => {
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
};

/**
 * Fetch LinkedIn profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchLinkedinProfile = async (token, cb) => {
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

  try {
    const getDetails = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('me')
          .auth(token)
          .request((err, res, body) => (err ? reject(err) : resolve(body)));
      });

    const getEmail = () =>
      new Promise((resolve, reject) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(token)
          .request((err, res, body) => (err ? reject(err) : resolve(body)));
      });

    const { localizedFirstName } = await getDetails();
    const { elements } = await getEmail();
    const email = elements[0]['handle~'];

    return cb(null, { username: localizedFirstName, email: email.emailAddress });
  } catch (error) {
    return cb(error);
  }
};

/**
 * Fetch Reddit profile.
 * @param {string} token
 * @param {function} cb
 */
const fetchRedditProfile = (token, cb) => {
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
};

/**
 * Fetch Auth0 profile.
 * @param {string} token
 * @param {object} grant
 * @param {function} cb
 */
const fetchAuth0Profile = (token, grant, cb) => {
  const purestAuth0Conf = {};
  purestAuth0Conf[`https://${grant.auth0.subdomain}.auth0.com`] = {
    __domain: { auth: { auth: { bearer: '[0]' } } },
    '{endpoint}': { __path: { alias: '__default' } },
  };

  const auth0 = purest({
    provider: 'auth0',
    config: { auth0: purestAuth0Conf },
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
};

/**
 * Fetch CAS profile.
 * @param {string} token
 * @param {object} grant
 * @param {function} cb
 */
const fetchCasProfile = (token, grant, cb) => {
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
};

/**
 * Build redirect URI for a provider.
 *
 * @param {string} [provider='']
 * @returns {string}
 */
const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};