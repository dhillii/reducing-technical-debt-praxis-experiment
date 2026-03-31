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
          __domain: {
            auth: { auth: { bearer: '[0]' } },
          },
          '{endpoint}': {
            __path: { alias: '__default' },
          },
        },
      },
    },
    endpoint: 'users/@me',
    transform: (body) => ({
      username: `${body.username}#${body.discriminator}`,
      email: body.email,
    }),
  },
  facebook: {
    endpoint: 'me?fields=name,email',
    transform: (body) => ({
      username: body.name,
      email: body.email,
    }),
  },
  google: {
    endpoint: 'tokeninfo',
    transform: (body) => ({
      username: body.email.split('@')[0],
      email: body.email,
    }),
  },
  github: {
    defaults: { headers: { 'user-agent': 'strapi' } },
    transform: (body) => ({
      username: body.login,
      email: body.email,
    }),
  },
  microsoft: {
    endpoint: 'me',
    transform: (body) => ({
      username: body.userPrincipalName,
      email: body.userPrincipalName,
    }),
  },
  instagram: {
    transform: (body) => ({
      username: body.username,
      email: `${body.username}@strapi.io`,
    }),
  },
  reddit: {
    defaults: { headers: { 'user-agent': 'strapi' } },
    transform: (body) => ({
      username: body.name,
      email: `${body.name}@strapi.io`,
    }),
  },
  twitch: {
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
            __path: { alias: '__default' },
          },
          'oauth2/{endpoint}': {
            __path: { alias: 'oauth' },
          },
        },
      },
    },
    endpoint: 'users',
    transform: (body) => ({
      username: body.data[0].login,
      email: body.data[0].email,
    }),
  },
  linkedin: {
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
  },
};

const getStoreConfig = async (key) => {
  return strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key,
    })
    .get();
};

const findUserByEmail = async (email) => {
  return strapi.query('user', 'users-permissions').find({ email });
};

const getDefaultRole = async (roleType) => {
  return strapi
    .query('role', 'users-permissions')
    .findOne({ type: roleType }, []);
};

const createUser = async (profile, provider, roleId) => {
  const params = _.assign(profile, {
    provider,
    role: roleId,
    confirmed: true,
  });
  return strapi.query('user', 'users-permissions').create(params);
};

const validateUserRegistration = (user, users, provider, advancedConfig) => {
  if (_.isEmpty(user) && !advancedConfig.allow_register) {
    return {
      error: [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      message: 'Register action is actually not available.',
    };
  }

  if (!_.isEmpty(user)) {
    return { user };
  }

  if (
    !_.isEmpty(_.find(users, (u) => u.provider !== provider)) &&
    advancedConfig.unique_email
  ) {
    return {
      error: [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      message: 'Email is already taken.',
    };
  }

  return null;
};

const handleProviderProfile = async (provider, query, grant) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  switch (provider) {
    case 'cognito':
      return handleCognito(query);
    case 'twitter':
      return handleTwitter(access_token, query, grant);
    case 'vk':
      return handleVK(access_token, query);
    case 'linkedin':
      return handleLinkedIn(access_token);
    case 'auth0':
      return handleAuth0(access_token, grant);
    case 'cas':
      return handleCAS(access_token, grant);
    default:
      return handleStandardProvider(provider, access_token, grant);
  }
};

const handleCognito = (query) => {
  return new Promise((resolve, reject) => {
    const idToken = query.id_token;
    const tokenPayload = jwt.decode(idToken);
    if (!tokenPayload) {
      reject(new Error('unable to decode jwt token'));
    } else {
      resolve({
        username: tokenPayload['cognito:username'],
        email: tokenPayload.email,
      });
    }
  });
};

const handleTwitter = (access_token, query, grant) => {
  return new Promise((resolve, reject) => {
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
        if (err) reject(err);
        else
          resolve({
            username: body.screen_name,
            email: body.email,
          });
      });
  });
};

const handleVK = (access_token, query) => {
  return new Promise((resolve, reject) => {
    const vk = purest({
      provider: 'vk',
      config: purestConfig,
    });

    vk.query()
      .get('users.get')
      .qs({ access_token, id: query.raw.user_id, v: '5.122' })
      .request((err, res, body) => {
        if (err) reject(err);
        else
          resolve({
            username: `${body.response[0].last_name} ${body.response[0].first_name}`,
            email: query.raw.email,
          });
      });
  });
};

const handleLinkedIn = async (access_token) => {
  const linkedIn = purest({
    provider: 'linkedin',
    config: PROVIDER_CONFIGS.linkedin.config,
  });

  const getDetailsRequest = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('me')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) reject(err);
          else resolve(body);
        });
    });

  const getEmailRequest = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('emailAddress?q=members&projection=(elements*(handle~))')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) reject(err);
          else resolve(body);
        });
    });

  const { localizedFirstName } = await getDetailsRequest();
  const { elements } = await getEmailRequest();
  const email = elements[0]['handle~'];

  return {
    username: localizedFirstName,
    email: email.emailAddress,
  };
};

const handleAuth0 = async (access_token, grant) => {
  return new Promise((resolve, reject) => {
    const purestAuth0Conf = {};
    purestAuth0Conf[`https://${grant.auth0.subdomain}.auth0.com`] = {
      __domain: {
        auth: { auth: { bearer: '[0]' } },
      },
      '{endpoint}': {
        __path: { alias: '__default' },
      },
    };

    const auth0 = purest({
      provider: 'auth0',
      config: { auth0: purestAuth0Conf },
    });

    auth0
      .get('userinfo')
      .auth(access_token)
      .request((err, res, body) => {
        if (err) reject(err);
        else {
          const username =
            body.username || body.nickname || body.name || body.email.split('@')[0];
          const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;
          resolve({ username, email });
        }
      });
  });
};

const handleCAS = async (access_token, grant) => {
  return new Promise((resolve, reject) => {
    const provider_url = `https://${_.get(grant['cas'], 'subdomain')}`;
    const cas = purest({
      provider: 'cas',
      config: {
        cas: {
          [provider_url]: {
            __domain: {
              auth: { auth: { bearer: '[0]' } },
            },
            '{endpoint}': {
              __path: { alias: '__default' },
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
        if (err) reject(err);
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

          resolve({ username, email });
        }
      });
  });
};

const handleStandardProvider = (provider, access_token, grant) => {
  return new Promise((resolve, reject) => {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      reject(new Error('Unknown provider.'));
      return;
    }

    const providerConfig = {
      provider,
      ...(config.config && { config: config.config }),
      ...(config.defaults && { defaults: config.defaults }),
    };

    if (provider === 'github') {
      providerConfig.config = purestConfig;
      providerConfig.defaults = { headers: { 'user-agent': 'strapi' } };
    } else if (provider === 'instagram') {
      providerConfig.key = grant.instagram.key;
      providerConfig.secret = grant.instagram.secret;
      providerConfig.config = purestConfig;
    } else if (provider === 'twitch') {
      providerConfig.config = config.config;
    } else {
      providerConfig.config = purestConfig;
    }

    const p = purest(providerConfig);
    let query = p.query();

    if (provider === 'google') {
      query = query.get(config.endpoint).qs({ access_token });
    } else if (provider === 'instagram') {
      query = query.get('me').qs({ access_token, fields: 'id,username' });
    } else if (provider === 'reddit') {
      query = query.query('auth').get(config.endpoint).auth(access_token);
    } else if (provider === 'twitch') {
      query = p.get(config.endpoint).auth(access_token, grant.twitch.key);
    } else if (provider === 'github') {
      query = query.get(config.endpoint).auth(access_token);
    } else {
      query = query.get(config.endpoint).auth(access_token);
    }

    query.request((err, res, body) => {
      if (err) {
        reject(err);
      } else if (provider === 'github' && !body.email) {
        p.query()
          .get('user/emails')
          .auth(access_token)
          .request((err, res, emailsbody) => {
            if (err) reject(err);
            else
              resolve({
                username: body.login,
                email: Array.isArray(emailsbody)
                  ? emailsbody.find((email) => email.primary === true).email
                  : null,
              });
          });
      } else {
        resolve(config.transform(body));
      }
    });
  });
};

const getProfile = async (provider, query, callback) => {
  try {
    const grant = await getStoreConfig('grant');
    const profile = await handleProviderProfile(provider, query, grant);
    callback(null, profile);
  } catch (err) {
    callback(err);
  }
};

const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!access_token) {
      return reject([null, { message: 'No access_token.' }]);
    }

    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      if (!profile.email) {
        return reject([null, { message: 'Email was not available.' }]);
      }

      try {
        const users = await findUserByEmail(profile.email);
        const advanced = await getStoreConfig('advanced');
        const user = _.find(users, { provider });

        const validation = validateUserRegistration(user, users, provider, advanced);
        if (validation?.error) {
          return resolve([null, validation.error, validation.message]);
        }
        if (validation?.user) {
          return resolve([validation.user, null]);
        }

        const defaultRole = await getDefaultRole(advanced.default_role);
        const createdUser = await createUser(profile, provider, defaultRole.id);

        return resolve([createdUser, null]);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

const buildRedirectUri = (provider = '') =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
```