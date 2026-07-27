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
 *
 * @param {String}    provider
 * @param {String}    access_token
 *
 * @return  {*}
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
 * @param {String}   provider
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

  switch (provider) {
    case 'discord': {
      handleDiscordProfile(access_token, callback);
      break;
    }
    case 'cognito': {
      handleCognitoProfile(query, callback);
      break;
    }
    case 'facebook': {
      handleFacebookProfile(access_token, callback);
      break;
    }
    case 'google': {
      handleGoogleProfile(access_token, callback);
      break;
    }
    case 'github': {
      handleGithubProfile(access_token, callback);
      break;
    }
    case 'microsoft': {
      handleMicrosoftProfile(access_token, callback);
      break;
    }
    case 'twitter': {
      handleTwitterProfile(access_token, query, grant, callback);
      break;
    }
    case 'instagram': {
      handleInstagramProfile(access_token, grant, callback);
      break;
    }
    case 'vk': {
      handleVkProfile(access_token, query, callback);
      break;
    }
    case 'twitch': {
      handleTwitchProfile(access_token, grant, callback);
      break;
    }
    case 'linkedin': {
      handleLinkedInProfile(access_token, callback);
      break;
    }
    case 'reddit': {
      handleRedditProfile(access_token, callback);
      break;
    }
    case 'auth0': {
      handleAuth0Profile(access_token, grant, callback);
      break;
    }
    case 'cas': {
      handleCasProfile(access_token, grant, callback);
      break;
    }
    default:
      callback(new Error('Unknown provider.'));
      break;
  }
};

/**
 * Handle Discord profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleDiscordProfile = (access_token, callback) => {
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
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }
      const username = `${body.username}#${body.discriminator}`;
      callback(null, {
        username: username,
        email: body.email,
      });
    });
};

/**
 * Handle Cognito profile retrieval
 * @param {Object} query
 * @param {Function} callback
 */
const handleCognitoProfile = (query, callback) => {
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
 * Handle Facebook profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleFacebookProfile = (access_token, callback) => {
  const facebook = purest({
    provider: 'facebook',
    config: purestConfig,
  });

  facebook
    .query()
    .get('me?fields=name,email')
    .auth(access_token)
    .request((err, res, body) => {
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
 * Handle Google profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleGoogleProfile = (access_token, callback) => {
  const google = purest({ provider: 'google', config: purestConfig });

  google
    .query('oauth')
    .get('tokeninfo')
    .qs({ access_token })
    .request((err, res, body) => {
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
 * Handle GitHub profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleGithubProfile = (access_token, callback) => {
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
    .request((err, res, userbody) => {
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
        .request((err, res, emailsbody) => {
          if (err) {
            return callback(err);
          }

          const email = extractPrimaryEmail(emailsbody);
          return callback(null, {
            username: userbody.login,
            email: email,
          });
        });
    });
};

/**
 * Extract primary email from GitHub emails array
 * @param {Array} emailsbody
 * @returns {String|null}
 */
const extractPrimaryEmail = (emailsbody) => {
  if (!Array.isArray(emailsbody)) {
    return null;
  }
  const primaryEmail = emailsbody.find(email => email.primary === true);
  return primaryEmail ? primaryEmail.email : null;
};

/**
 * Handle Microsoft profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleMicrosoftProfile = (access_token, callback) => {
  const microsoft = purest({
    provider: 'microsoft',
    config: purestConfig,
  });

  microsoft
    .query()
    .get('me')
    .auth(access_token)
    .request((err, res, body) => {
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
 * Handle Twitter profile retrieval
 * @param {String} access_token
 * @param {Object} query
 * @param {Object} grant
 * @param {Function} callback
 */
const handleTwitterProfile = (access_token, query, grant, callback) => {
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
    .request((err, res, body) => {
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
 * Handle Instagram profile retrieval
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleInstagramProfile = (access_token, grant, callback) => {
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
    .request((err, res, body) => {
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
 * Handle VK profile retrieval
 * @param {String} access_token
 * @param {Object} query
 * @param {Function} callback
 */
const handleVkProfile = (access_token, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk.query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
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
 * Handle Twitch profile retrieval
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleTwitchProfile = (access_token, grant, callback) => {
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
    .request((err, res, body) => {
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
 * Handle LinkedIn profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleLinkedInProfile = async (access_token, callback) => {
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
    const details = await getLinkedInDetails(linkedIn, access_token);
    const emailData = await getLinkedInEmail(linkedIn, access_token);
    const email = emailData.elements[0]['handle~'];

    callback(null, {
      username: details.localizedFirstName,
      email: email.emailAddress,
    });
  } catch (err) {
    callback(err);
  }
};

/**
 * Get LinkedIn user details
 * @param {Object} linkedIn
 * @param {String} access_token
 * @returns {Promise}
 */
const getLinkedInDetails = (linkedIn, access_token) => {
  return new Promise((resolve, reject) => {
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
};

/**
 * Get LinkedIn user email
 * @param {Object} linkedIn
 * @param {String} access_token
 * @returns {Promise}
 */
const getLinkedInEmail = (linkedIn, access_token) => {
  return new Promise((resolve, reject) => {
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
};

/**
 * Handle Reddit profile retrieval
 * @param {String} access_token
 * @param {Function} callback
 */
const handleRedditProfile = (access_token, callback) => {
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
    .request((err, res, body) => {
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
 * Handle Auth0 profile retrieval
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleAuth0Profile = (access_token, grant, callback) => {
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
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }
      const username = extractAuth0Username(body);
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Extract username from Auth0 body
 * @param {Object} body
 * @returns {String}
 */
const extractAuth0Username = (body) => {
  return body.username || body.nickname || body.name || body.email.split('@')[0];
};

/**
 * Handle CAS profile retrieval
 * @param {String} access_token
 * @param {Object} grant
 * @param {Function} callback
 */
const handleCasProfile = (access_token, grant, callback) => {
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
  cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }
      const username = extractCasUsername(body);
      const email = extractCasEmail(body);
      if (!username || !email) {
        strapi.log.warn(
          'CAS Response Body did not contain required attributes: ' + JSON.stringify(body)
        );
      }
      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Extract username from CAS body
 * @param {Object} body
 * @returns {String}
 */
const extractCasUsername = (body) => {
  if (body.attributes) {
    return body.attributes.strapiusername || body.id || body.sub;
  }
  return body.strapiusername || body.id || body.sub;
};

/**
 * Extract email from CAS body
 * @param {Object} body
 * @returns {String}
 */
const extractCasEmail = (body) => {
  if (body.attributes) {
    return body.attributes.strapiemail || body.attributes.email;
  }
  return body.strapiemail || body.email;
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};