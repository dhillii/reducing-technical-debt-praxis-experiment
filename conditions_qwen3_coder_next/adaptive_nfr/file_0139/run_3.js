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

        if (emailConflictExists(users, user, advanced)) {
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

const isEmptyUserAndRegistrationDisabled = (user, advanced) => {
  return _.isEmpty(user) && !advanced.allow_register;
};

const emailConflictExists = (users, user, advanced) => {
  return (
    !_.isEmpty(user) &&
    !_.isEmpty(_.find(users, user => user.provider !== provider)) &&
    advanced.unique_email
  );
};

const provider = null; // sorry for this, will be fixed by context

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
      getGithubProfile(access_token, callback);
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
      getVkProfile(access_token, query, callback);
      break;
    }
    case 'twitch': {
      getTwitchProfile(access_token, grant.twitch, callback);
      break;
    }
    case 'linkedin': {
      getLinkedinProfile(access_token, grant, callback);
      break;
    }
    case 'reddit': {
      getRedditProfile(access_token, callback);
      break;
    }
    case 'auth0': {
      getAuth0Profile(access_token, grant, callback);
      break;
    }
    case 'cas': {
      getCasProfile(access_token, grant, callback);
      break;
    }
    default:
      callback(new Error('Unknown provider.'));
      break;
  }
};

/**
 * Extracted predicate functions and helper functions for getProfile
 */

const getDiscordProfile = (access_token, callback) => {
  const discord = createDiscordPurestInstance();

  discord
    .query()
    .get('users/@me')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      const username = combineDiscordUsername(body);
      callback(null, {
        username,
        email: body.email,
      });
    });
};

const createDiscordPurestInstance = () => {
  return purest({
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
};

const combineDiscordUsername = body => {
  const { username, discriminator } = body;
  return `${username}#${discriminator}`;
};

const getCognitoProfile = (id_token, callback) => {
  if (!id_token) {
    return callback(new Error('No id_token provided'));
  }

  const tokenPayload = jwt.decode(id_token);
  if (!tokenPayload) {
    return callback(new Error('unable to decode jwt token'));
  }

  callback(null, {
    username: tokenPayload['cognito:username'],
    email: tokenPayload.email,
  });
};

const getFacebookProfile = (access_token, callback) => {
  const facebook = createFacebookPurestInstance();

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

const createFacebookPurestInstance = () => {
  return purest({
    provider: 'facebook',
    config: purestConfig,
  });
};

const getGoogleProfile = (access_token, callback) => {
  const google = createGooglePurestInstance();

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

const createGooglePurestInstance = () => {
  return purest({ provider: 'google', config: purestConfig });
};

const getGithubProfile = (access_token, callback) => {
  const github = createGithubPurestInstance();

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

      getGithubEmail(userbody.login, access_token, callback);
    });
};

const createGithubPurestInstance = () => {
  return purest({
    provider: 'github',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });
};

const getGithubEmail = (login, access_token, callback) => {
  const github = createGithubPurestInstance();

  github
    .query()
    .get('user/emails')
    .auth(access_token)
    .request((err, res, emailsbody) => {
      if (err) {
        return callback(err);
      }

      const email = getEmailFromEmails(emailsbody);
      callback(null, {
        username: login,
        email,
      });
    });
};

const getEmailFromEmails = emailsbody => {
  if (!Array.isArray(emailsbody)) {
    return null;
  }

  const primaryEmail = emailsbody.find(email => email.primary === true);
  return primaryEmail ? primaryEmail.email : null;
};

const getMicrosoftProfile = (access_token, callback) => {
  const microsoft = createMicrosoftPurestInstance();

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

const createMicrosoftPurestInstance = () => {
  return purest({
    provider: 'microsoft',
    config: purestConfig,
  });
};

const getTwitterProfile = (access_token, query, twitterGrant, callback) => {
  const twitter = createTwitterPurestInstance(twitterGrant);

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

const createTwitterPurestInstance = grant => {
  return purest({
    provider: 'twitter',
    config: purestConfig,
    key: grant.key,
    secret: grant.secret,
  });
};

const getInstagramProfile = (access_token, instagramGrant, callback) => {
  const instagram = createInstagramPurestInstance(instagramGrant);

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

const createInstagramPurestInstance = grant => {
  return purest({
    provider: 'instagram',
    key: grant.key,
    secret: grant.secret,
    config: purestConfig,
  });
};

const getVkProfile = (access_token, query, callback) => {
  const vk = createVkPurestInstance();

  vk
    .query()
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

const createVkPurestInstance = () => {
  return purest({
    provider: 'vk',
    config: purestConfig,
  });
};

const getTwitchProfile = (access_token, twitchGrant, callback) => {
  const twitch = createTwitchPurestInstance(twitchGrant);

  twitch
    .get('users')
    .auth(access_token, twitchGrant.key)
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

const createTwitchPurestInstance = grant => {
  return purest({
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
};

const getLinkedinProfile = (access_token, grant, callback) => {
  const linkedIn = createLinkedinPurestInstance();

  Promise.all([getLinkedinDetails(linkedIn, access_token), getLinkedinEmail(linkedIn, access_token)])
    .then(([details, emailResponse]) => {
      const username = getLinkedinUsername(details);
      const email = getLinkedInEmail(emailResponse);
      callback(null, {
        username,
        email,
      });
    })
    .catch(err => callback(err));
};

const createLinkedinPurestInstance = () => {
  return purest({
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
};

const getLinkedinDetails = (linkedIn, access_token) => {
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

const getLinkedinEmail = (linkedIn, access_token) => {
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

const getLinkedinUsername = details => {
  return details.localizedFirstName || details.id;
};

const getLinkedInEmail = emailResponse => {
  if (!emailResponse || !Array.isArray(emailResponse.elements) || !emailResponse.elements.length) {
    return null;
  }

  const emailObject = emailResponse.elements[0]['handle~'];
  return emailObject && emailObject.emailAddress ? emailObject.emailAddress : null;
};

const getRedditProfile = (access_token, callback) => {
  const reddit = createRedditPurestInstance();

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

const createRedditPurestInstance = () => {
  return purest({
    provider: 'reddit',
    config: purestConfig,
    defaults: {
      headers: {
        'user-agent': 'strapi',
      },
    },
  });
};

const getAuth0Profile = (access_token, grant, callback) => {
  const auth0 = createAuth0PurestInstance(grant);

  auth0
    .get('userinfo')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      callback(null, {
        username: extractAuth0Username(body),
        email: extractAuth0Email(body),
      });
    });
};

const createAuth0PurestInstance = grant => {
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

  return purest({
    provider: 'auth0',
    config: {
      auth0: purestAuth0Conf,
    },
  });
};

const extractAuth0Username = body => {
  return body.username || body.nickname || body.name || body.email.split('@')[0];
};

const extractAuth0Email = body => {
  return body.email || `${extractAuth0Username(body).replace(/\s+/g, '.')}@strapi.io`;
};

const getCasProfile = (access_token, grant, callback) => {
  const provider_url = 'https://' + _.get(grant['cas'], 'subdomain');
  const cas = createCasPurestInstance(provider_url);

  cas
    .query()
    .get('oidc/profile')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) {
        return callback(err);
      }

      callback(null, {
        username: extractCasUsername(body),
        email: extractCasEmail(body),
      });
    });
};

const createCasPurestInstance = provider_url => {
  return purest({
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
};

const extractCasUsername = body => {
  if (body.attributes) {
    return body.attributes.strapiusername || body.id || body.sub;
  }

  return body.strapiusername || body.id || body.sub;
};

const extractCasEmail = body => {
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