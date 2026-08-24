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

        if (isEmptyUserAndRegistrationDisabled(user, advanced)) {
          return resolve([
            null,
            [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
            'Register action is actually not available.',
          ]);
        }

        if (!_.isEmpty(user)) {
          return resolve([user, null]);
        }

        if (hasOtherProviderAndUniqueEmail(users, advanced)) {
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
 * Check if user is empty and registration is disabled.
 *
 * @param {Object} user
 * @param {Object} advanced
 * @returns {Boolean}
 */
const isEmptyUserAndRegistrationDisabled = (user, advanced) => {
  return _.isEmpty(user) && !advanced.allow_register;
};

/**
 * Check if user has other provider and unique email is enabled.
 *
 * @param {Array} users
 * @param {Object} advanced
 * @returns {Boolean}
 */
const hasOtherProviderAndUniqueEmail = (users, advanced) => {
  return (
    !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
    advanced.unique_email
  );
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
      getDiscordProfile(access_token, callback);
      break;
    }
    case 'cognito': {
      getCognitoProfile(query.id_token, callback);
      break;
    }
    case 'facebook': {
      getFacebookProfile(access_token, callback);
      break;
    }
    case 'google': {
      getGoogleProfile(access_token, callback);
      break;
    }
    case 'github': {
      getGitHubProfile(access_token, callback);
      break;
    }
    case 'microsoft': {
      getMicrosoftProfile(access_token, callback);
      break;
    }
    case 'twitter': {
      getTwitterProfile(access_token, query, grant.twitter, callback);
      break;
    }
    case 'instagram': {
      getInstagramProfile(access_token, grant.instagram, callback);
      break;
    }
    case 'vk': {
      getVKProfile(access_token, query, callback);
      break;
    }
    case 'twitch': {
      getTwitchProfile(access_token, grant.twitch, callback);
      break;
    }
    case 'linkedin': {
      getLinkedInProfile(access_token, callback);
      break;
    }
    case 'reddit': {
      getRedditProfile(access_token, callback);
      break;
    }
    case 'auth0': {
      getAuth0Profile(access_token, grant.auth0, callback);
      break;
    }
    case 'cas': {
      getCASProfile(access_token, grant.cas, callback);
      break;
    }
    default:
      callback(new Error('Unknown provider.'));
      break;
  }
};

/**
 * Get Discord profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getDiscordProfile = (access_token, callback) => {
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
        username,
        email: body.email,
      });
    });
};

/**
 * Get Cognito profile.
 *
 * @param {String} idToken
 * @param {Function} callback
 */
const getCognitoProfile = (idToken, callback) => {
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
 * Get Facebook profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getFacebookProfile = (access_token, callback) => {
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
 * Get Google profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getGoogleProfile = (access_token, callback) => {
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
 * Get GitHub profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getGitHubProfile = (access_token, callback) => {
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

      getGitHubEmail(github, access_token, userbody.login, callback);
    });
};

/**
 * Get GitHub email.
 *
 * @param {Object} github
 * @param {String} access_token
 * @param {String} username
 * @param {Function} callback
 */
const getGitHubEmail = (github, access_token, username, callback) => {
  github
    .query()
    .get('user/emails')
    .auth(access_token)
    .request((err, res, emailsbody) => {
      if (err) {
        return callback(err);
      }

      const email = Array.isArray(emailsbody)
        ? emailsbody.find(email => email.primary === true).email
        : null;

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Get Microsoft profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getMicrosoftProfile = (access_token, callback) => {
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
 * Get Twitter profile.
 *
 * @param {String} access_token
 * @param {Object} query
 * @param {Object} twitterConfig
 * @param {Function} callback
 */
const getTwitterProfile = (access_token, query, twitterConfig, callback) => {
  const twitter = purest({
    provider: 'twitter',
    config: purestConfig,
    key: twitterConfig.key,
    secret: twitterConfig.secret,
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
 * Get Instagram profile.
 *
 * @param {String} access_token
 * @param {Object} instagramConfig
 * @param {Function} callback
 */
const getInstagramProfile = (access_token, instagramConfig, callback) => {
  const instagram = purest({
    provider: 'instagram',
    key: instagramConfig.key,
    secret: instagramConfig.secret,
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
 * Get VK profile.
 *
 * @param {String} access_token
 * @param {Object} query
 * @param {Function} callback
 */
const getVKProfile = (access_token, query, callback) => {
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
 * Get Twitch profile.
 *
 * @param {String} access_token
 * @param {Object} twitchConfig
 * @param {Function} callback
 */
const getTwitchProfile = (access_token, twitchConfig, callback) => {
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
    .auth(access_token, twitchConfig.key)
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
 * Get LinkedIn profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getLinkedInProfile = (access_token, callback) => {
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

  const getDetailsRequest = () => {
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

  const getEmailRequest = () => {
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

  Promise.all([getDetailsRequest(), getEmailRequest()])
    .then(([details, emailResponse]) => {
      const { localizedFirstName } = details;
      const { elements } = emailResponse;
      const email = elements[0]['handle~'];

      callback(null, {
        username: localizedFirstName,
        email: email.emailAddress,
      });
    })
    .catch(err => callback(err));
};

/**
 * Get Reddit profile.
 *
 * @param {String} access_token
 * @param {Function} callback
 */
const getRedditProfile = (access_token, callback) => {
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
 * Get Auth0 profile.
 *
 * @param {String} access_token
 * @param {Object} auth0Config
 * @param {Function} callback
 */
const getAuth0Profile = (access_token, auth0Config, callback) => {
  const purestAuth0Conf = {};
  purestAuth0Conf[`https://${auth0Config.subdomain}.auth0.com`] = {
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

      const username =
        body.username || body.nickname || body.name || body.email.split('@')[0];
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

      callback(null, {
        username,
        email,
      });
    });
};

/**
 * Get CAS profile.
 *
 * @param {String} access_token
 * @param {Object} casConfig
 * @param {Function} callback
 */
const getCASProfile = (access_token, casConfig, callback) => {
  const provider_url = 'https://' + _.get(casConfig, 'subdomain');
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

      // CAS attribute may be in body.attributes or "FLAT", depending on CAS config
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

      callback(null, {
        username,
        email,
      });
    });
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};