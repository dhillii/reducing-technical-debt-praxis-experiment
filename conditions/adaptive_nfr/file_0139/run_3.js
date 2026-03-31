```javascript
'use strict';

const _ = require('lodash');
const request = require('request');
const purest = require('purest')({ request });
const purestConfig = require('@purest/providers');
const { getAbsoluteServerUrl } = require('strapi-utils');
const jwt = require('jsonwebtoken');

// Provider configurations
const PROVIDER_CONFIGS = {
  discord: {
    config: {
      discord: {
        'https://discordapp.com/api/': {
          __domain: { auth: { auth: { bearer: '[0]' } } },
          '{endpoint}': { __path: { alias: '__default' } },
        },
      },
    },
    endpoint: 'users/@me',
    transform: body => ({
      username: `${body.username}#${body.discriminator}`,
      email: body.email,
    }),
  },
  facebook: {
    config: purestConfig,
    endpoint: 'me?fields=name,email',
    transform: body => ({
      username: body.name,
      email: body.email,
    }),
  },
  google: {
    config: purestConfig,
    endpoint: 'tokeninfo',
    query: 'oauth',
    transform: body => ({
      username: body.email.split('@')[0],
      email: body.email,
    }),
  },
  github: {
    config: purestConfig,
    defaults: { headers: { 'user-agent': 'strapi' } },
    endpoint: 'user',
    transform: body => ({
      username: body.login,
      email: body.email,
    }),
  },
  microsoft: {
    config: purestConfig,
    endpoint: 'me',
    transform: body => ({
      username: body.userPrincipalName,
      email: body.userPrincipalName,
    }),
  },
  instagram: {
    config: purestConfig,
    endpoint: 'me',
    qs: { fields: 'id,username' },
    transform: body => ({
      username: body.username,
      email: `${body.username}@strapi.io`,
    }),
  },
  vk: {
    config: purestConfig,
    endpoint: 'users.get',
    qs: { v: '5.122' },
    transform: body => ({
      username: `${body.response[0].last_name} ${body.response[0].first_name}`,
    }),
  },
  reddit: {
    config: purestConfig,
    defaults: { headers: { 'user-agent': 'strapi' } },
    endpoint: 'me',
    query: 'auth',
    transform: body => ({
      username: body.name,
      email: `${body.name}@strapi.io`,
    }),
  },
};

const getStoredConfig = async (key) => {
  return strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key,
    })
    .get();
};

const extractAccessToken = (query) => query.access_token || query.code || query.oauth_token;

const validateAccessToken = (access_token) => {
  if (!access_token) {
    throw new Error('No access_token.');
  }
};

const findUserByEmail = async (email) => {
  return strapi.query('user', 'users-permissions').find({ email });
};

const findUserByProvider = (users, provider) => _.find(users, { provider });

const findUserByOtherProvider = (users, provider) => 
  _.find(users, user => user.provider !== provider);

const getDefaultRole = async (roleType) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: roleType }, []);
};

const createNewUser = async (profile, provider, roleId) => {
  const params = _.assign(profile, {
    provider,
    role: roleId,
    confirmed: true,
  });
  return strapi.query('user', 'users-permissions').create(params);
};

const handleUserExists = (user) => [user, null];

const handleRegistrationDisabled = () => [
  null,
  [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
  'Register action is actually not available.',
];

const handleEmailTaken = () => [
  null,
  [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
  'Email is already taken.',
];

const validateUserCreation = (users, user, provider, advanced) => {
  if (_.isEmpty(user) && !advanced.allow_register) {
    return handleRegistrationDisabled();
  }

  if (!_.isEmpty(user)) {
    return handleUserExists(user);
  }

  if (
    !_.isEmpty(findUserByOtherProvider(users, provider)) &&
    advanced.unique_email
  ) {
    return handleEmailTaken();
  }

  return null;
};

const promisifyCallback = (fn) => {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

const getProfileDiscord = (access_token) => {
  return promisifyCallback((callback) => {
    const discord = purest({
      provider: 'discord',
      config: PROVIDER_CONFIGS.discord.config,
    });
    discord
      .query()
      .get('users/@me')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) callback(err);
        else callback(null, PROVIDER_CONFIGS.discord.transform(body));
      });
  });
};

const getProfileCognito = (query) => {
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

const getProfileStandard = (provider, access_token, query, grant) => {
  return promisifyCallback((callback) => {
    const config = PROVIDER_CONFIGS[provider];
    const providerInstance = purest({
      provider,
      config: config.config,
      ...(config.defaults && { defaults: config.defaults }),
      ...(grant[provider] && { 
        key: grant[provider].key,
        secret: grant[provider].secret,
      }),
    });

    let query_builder = providerInstance.query(config.query || '');
    
    if (config.qs) {
      query_builder = query_builder.qs({ 
        ...config.qs, 
        access_token 
      });
    } else {
      query_builder = query_builder.auth(access_token);
    }

    if (provider === 'twitter') {
      query_builder = query_builder.qs({
        screen_name: query['raw[screen_name]'],
        include_email: 'true',
      });
    }

    if (provider === 'vk') {
      query_builder = query_builder.qs({
        id: query.raw.user_id,
      });
    }

    query_builder
      .get(config.endpoint)
      .request((err, res, body) => {
        if (err) callback(err);
        else {
          const profile = config.transform(body);
          if (provider === 'vk') {
            profile.email = query.raw.email;
          }
          callback(null, profile);
        }
      });
  });
};

const getProfileGithub = (access_token) => {
  return promisifyCallback((callback) => {
    const github = purest({
      provider: 'github',
      config: purestConfig,
      defaults: { headers: { 'user-agent': 'strapi' } },
    });

    github
      .query()
      .get('user')
      .auth(access_token)
      .request((err, res, userbody) => {
        if (err) return callback(err);

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
            if (err) return callback(err);

            const email = Array.isArray(emailsbody)
              ? emailsbody.find(e => e.primary === true)?.email
              : null;

            callback(null, {
              username: userbody.login,
              email,
            });
          });
      });
  });
};

const getProfileTwitter = (access_token, query, grant) => {
  return promisifyCallback((callback) => {
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
        if (err) callback(err);
        else
          callback(null, {
            username: body.screen_name,
            email: body.email,
          });
      });
  });
};

const getProfileLinkedIn = (access_token) => {
  return promisifyCallback((callback) => {
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

    Promise.all([
      promisifyCallback((cb) => {
        linkedIn
          .query()
          .get('me')
          .auth(access_token)
          .request((err, res, body) => {
            if (err) cb(err);
            else cb(null, body);
          });
      }),
      promisifyCallback((cb) => {
        linkedIn
          .query()
          .get('emailAddress?q=members&projection=(elements*(handle~))')
          .auth(access_token)
          .request((err, res, body) => {
            if (err) cb(err);
            else cb(null, body);
          });
      }),
    ])
      .then(([details, emailData]) => {
        callback(null, {
          username: details.localizedFirstName,
          email: emailData.elements[0]['handle~'].emailAddress,
        });
      })
      .catch(callback);
  });
};

const getProfileTwitch = (access_token, grant) => {
  return promisifyCallback((callback) => {
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
      .auth(access_token, grant.twitch.key)
      .request((err, res, body) => {
        if (err) callback(err);
        else
          callback(null, {
            username: body.data[0].login,
            email: body.data[0].email,
          });
      });
  });
};

const getProfileAuth0 = (access_token, grant) => {
  return promisifyCallback((callback) => {
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
      .auth(access_token)
      .request((err, res, body) => {
        if (err) callback(err);
        else {
          const username =
            body.username || body.nickname || body.name || body.email.split('@')[0];
          const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

          callback(null, { username, email });
        }
      });
  });
};

const getProfileCAS = (access_token, grant) => {
  return promisifyCallback((callback) => {
    const provider_url = 'https://' + _.get(grant['cas'], 'subdomain');
    const cas = purest({
      provider: 'cas',
      config: {
        cas: {
          [provider_url]: {
            __domain: { auth: { auth: { bearer: '[0]' } } },
            '{endpoint}': { __path: { alias: '__default' } },
          },
        },
      },
    });

    cas
      .query()
      .get('oidc/profile')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) callback(err);
        else {
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

          callback(null, { username, email });
        }
      });
  });
};

const PROFILE_GETTERS = {
  discord: getProfileDiscord,
  cognito: getProfileCognito,
  github: getProfileGithub,
  twitter: getProfileTwitter,
  linkedin: getProfileLinkedIn,
  twitch: getProfileTwitch,
  auth0: getProfileAuth0,
  cas: getProfileCAS,
};

const getProfile = async (provider, query) => {
  const access_token = extractAccessToken(query);
  validateAccessToken(access_token);

  const grant = await getStoredConfig('grant');

  if (PROFILE_GETTERS[provider]) {
    return PROFILE_GETTERS[provider](access_token, query, grant);
  }

  if (PROVIDER_CONFIGS[provider]) {
    return getProfileStandard(provider, access_token, query, grant);
  }

  throw new Error('Unknown provider.');
};

const connect = async (provider, query) => {
  try {
    const access_token = extractAccessToken(query);
    validateAccessToken(access_token);

    const profile = await getProfile(provider, query);

    if (!profile.email) {
      throw new Error('Email was not available.');
    }

    const users = await findUserByEmail(profile.email);
    const advanced = await getStoredConfig('advanced');
    const user = findUserByProvider(users, provider);

    const validationResult = validateUserCreation(users, user, provider, advanced);
    if (validationResult) {