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

const getTokenFromQuery = query =>
  query.access_token || query.code || query.oauth_token;

const getAdvancedSettings = () =>
  strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'advanced',
    })
    .get();

const getGrantSettings = () =>
  strapi
    .store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
      key: 'grant',
    })
    .get();

const findUserByEmail = email =>
  strapi.query('user', 'users-permissions').find({ email });

const findDefaultRole = roleType =>
  strapi
    .query('role', 'users-permissions')
    .findOne({ type: roleType }, []);

const createUser = params =>
  strapi.query('user', 'users-permissions').create(params);

const validateAccessToken = access_token => {
  if (!access_token) {
    throw new Error('No access_token.');
  }
};

const validateEmail = profile => {
  if (!profile.email) {
    throw new Error('Email was not available.');
  }
};

const validateUserRegistration = (user, users, advanced) => {
  if (_.isEmpty(user) && !advanced.allow_register) {
    return [
      null,
      [{ messages: [{ id: 'Auth.advanced.allow_register' }] }],
      'Register action is actually not available.',
    ];
  }

  if (!_.isEmpty(user)) {
    return [user, null];
  }

  if (
    !_.isEmpty(_.find(users, u => u.provider !== 'provider')) &&
    advanced.unique_email
  ) {
    return [
      null,
      [{ messages: [{ id: 'Auth.form.error.email.taken' }] }],
      'Email is already taken.',
    ];
  }

  return null;
};

const handleDiscordProfile = (access_token, callback) => {
  const discord = purest({
    provider: 'discord',
    config: PROVIDER_CONFIGS.discord.config,
  });

  discord
    .query()
    .get('users/@me')
    .auth(access_token)
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, PROVIDER_CONFIGS.discord.transform(body));
    });
};

const handleCognitoProfile = (query, callback) => {
  try {
    const tokenPayload = jwt.decode(query.id_token);
    if (!tokenPayload) {
      return callback(new Error('unable to decode jwt token'));
    }
    callback(null, {
      username: tokenPayload['cognito:username'],
      email: tokenPayload.email,
    });
  } catch (err) {
    callback(err);
  }
};

const handleGithubProfile = (access_token, callback) => {
  const github = purest({
    provider: 'github',
    config: PROVIDER_CONFIGS.github.config,
    defaults: PROVIDER_CONFIGS.github.defaults,
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
};

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
      if (err) return callback(err);
      callback(null, {
        username: body.screen_name,
        email: body.email,
      });
    });
};

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
      if (err) return callback(err);
      callback(null, {
        username: body.username,
        email: `${body.username}@strapi.io`,
      });
    });
};

const handleVkProfile = (access_token, query, callback) => {
  const vk = purest({
    provider: 'vk',
    config: purestConfig,
  });

  vk.query()
    .get('users.get')
    .qs({ access_token, id: query.raw.user_id, v: '5.122' })
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, {
        username: `${body.response[0].last_name} ${body.response[0].first_name}`,
        email: query.raw.email,
      });
    });
};

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
      if (err) return callback(err);
      callback(null, {
        username: body.data[0].login,
        email: body.data[0].email,
      });
    });
};

const handleLinkedInProfile = (access_token, callback) => {
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

  const getDetailsRequest = () =>
    new Promise((resolve, reject) => {
      linkedIn
        .query()
        .get('me')
        .auth(access_token)
        .request((err, res, body) => {
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
        .request((err, res, body) => {
          if (err) return reject(err);
          resolve(body);
        });
    });

  Promise.all([getDetailsRequest(), getEmailRequest()])
    .then(([details, emailData]) => {
      callback(null, {
        username: details.localizedFirstName,
        email: emailData.elements[0]['handle~'].emailAddress,
      });
    })
    .catch(callback);
};

const handleAuth0Profile = (access_token, grant, callback) => {
  const purestAuth0Conf = {
    [`https://${grant.auth0.subdomain}.auth0.com`]: {
      __domain: { auth: { auth: { bearer: '[0]' } } },
      '{endpoint}': { __path: { alias: '__default' } },
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
      if (err) return callback(err);

      const username =
        body.username || body.nickname || body.name || body.email.split('@')[0];
      const email = body.email || `${username.replace(/\s+/g, '.')}@strapi.io`;

      callback(null, { username, email });
    });
};

const handleCasProfile = (access_token, grant, callback) => {
  const provider_url = `https://${_.get(grant, 'cas.subdomain')}`;
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
      if (err) return callback(err);

      const username = body.attributes
        ? body.attributes.strapiusername || body.id || body.sub
        : body.strapiusername || body.id || body.sub;

      const email = body.attributes
        ? body.attributes.strapiemail || body.attributes.email
        : body.strapiemail || body.email;

      if (!username || !email) {
        strapi.log.warn(
          `CAS Response Body did not contain required attributes: ${JSON.stringify(body)}`
        );
      }

      callback(null, { username, email });
    });
};

const handleStandardProfile = (provider, access_token, callback) => {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return callback(new Error('Unknown provider.'));
  }

  const query = config.query || '';
  const purestInstance = purest({
    provider,
    config: config.config,
    ...(config.defaults && { defaults: config.defaults }),
  });

  const request = query
    ? purestInstance.query(query).get(config.endpoint)
    : purestInstance.query().get(config.endpoint);

  request
    .auth(access_token)
    .request((err, res, body) => {
      if (err) return callback(err);
      callback(null, config.transform(body));
    });
};

const getProfile = async (provider, query, callback) => {
  const access_token = getTokenFromQuery(query);

  try {
    switch (provider) {
      case 'discord':
        return handleDiscordProfile(access_token, callback);
      case 'cognito':
        return handleCognitoProfile(query, callback);
      case 'github':
        return handleGithubProfile(access_token, callback);
      case 'twitter': {
        const grant = await getGrantSettings();
        return handleTwitterProfile(access_token, query, grant, callback);
      }
      case 'instagram': {
        const grant = await getGrantSettings();
        return handleInstagramProfile(access_token, grant, callback);
      }
      case 'vk':
        return handleVkProfile(access_token, query, callback);
      case 'twitch': {
        const grant = await getGrantSettings();
        return handleTwitchProfile(access_token, grant, callback);
      }
      case 'linkedin':
        return handleLinkedInProfile(access_token, callback);
      case 'auth0': {
        const grant = await getGrantSettings();
        return handleAuth0Profile(access_token, grant, callback);
      }
      case 'cas': {
        const grant = await getGrantSettings();
        return handleCasProfile(access_token, grant, callback);
      }
      case 'facebook':
      case 'google':
      case 'microsoft':
      case 'reddit':
        return handleStandardProfile(provider, access_token, callback);
      default:
        return callback(new Error('Unknown provider.'));
    }
  } catch (err) {
    callback(err);
  }
};

const connect = (provider, query) => {
  return new Promise(async (resolve, reject) => {
    try {
      const access_token = getTokenFromQuery(query);
      validateAccessToken(access_token);

      getProfile(provider, query, async (err, profile) => {
        try {
          if (err) return reject([null, err]);

          validateEmail(profile);

          const [users, advanced] = await Promise.all([
            findUserByEmail(profile.email),
            getAdvancedSettings(),
          ]);

          const user = _.find(users, { provider });

          const validationResult = validateUserRegistration(user, users, advanced);
          if (validationResult) return resolve(validationResult);

          const defaultRole = await