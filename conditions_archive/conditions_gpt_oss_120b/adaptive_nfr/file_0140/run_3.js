'use strict';

const _ = require('lodash');
const request = require('request');

/**
 * UsersPermissions.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

const DEFAULT_PERMISSIONS = [
  { action: 'admincallback', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'adminregister', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'callback', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'connect', controller: 'auth', type: 'users-permissions', roleType: null },
  { action: 'forgotpassword', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'register', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'emailconfirmation', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'resetpassword', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'init', controller: 'userspermissions', type: null, roleType: null },
  { action: 'me', controller: 'user', type: 'users-permissions', roleId: null },
  { action: 'autoreload', controller: null, type: null, roleType: null },
];

/**
 * Checks if a permission should be enabled by default.
 *
 * @param {Object} permission
 * @param {Object} role
 * @returns {boolean}
 */
const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(defaultPerm => {
    const actionMatch = defaultPerm.action === null || permission.action === defaultPerm.action;
    const controllerMatch =
      defaultPerm.controller === null || permission.controller === defaultPerm.controller;
    const typeMatch = defaultPerm.type === null || permission.type === defaultPerm.type;
    const roleMatch = defaultPerm.roleType === null || role.type === defaultPerm.roleType;
    return actionMatch && controllerMatch && typeMatch && roleMatch;
  });

/**
 * Generates a slug for a role based on its name.
 *
 * @param {Object} params
 */
function generateRoleSlug(params) {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }
}

/**
 * Persists role permissions to the database.
 *
 * @param {number} roleId
 * @param {Object} permissions
 * @returns {Promise<Array>}
 */
function createRolePermissions(roleId, permissions) {
  return Object.keys(permissions || {}).reduce((acc, type) => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...permissions[type].controllers[controller][action],
          })
        );
      });
    });
    return acc;
  }, []);
}

/**
 * Updates role‑user relations if users are provided.
 *
 * @param {Object} role
 * @param {Array} users
 * @param {Array} promises
 */
function maybeAddUserRelation(role, users, promises) {
  if (users && users.length > 0) {
    promises.push(
      strapi.query('role', 'users-permissions').update({ id: role.id }, { users })
    );
  }
}

/**
 * Moves all users of a role to another role.
 *
 * @param {Array} users
 * @param {number} targetRoleId
 * @returns {Array}
 */
function moveUsersToRole(users, targetRoleId) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
  );
}

/**
 * Deletes a list of permissions.
 *
 * @param {Array} permissions
 * @returns {Array}
 */
function deletePermissions(permissions) {
  return permissions.map(p =>
    strapi.query('permission', 'users-permissions').delete({ id: p.id })
  );
}

/**
 * Generates an actions map for a controller object.
 *
 * @param {Object} controllerObj
 * @returns {Object}
 */
function generateActions(controllerObj) {
  return Object.keys(controllerObj).reduce((acc, key) => {
    if (_.isFunction(controllerObj[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Retrieves application controllers with generated actions.
 *
 * @returns {Object}
 */
function getAppControllers() {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });
}

/**
 * Retrieves plugins permissions structure.
 *
 * @returns {Object}
 */
function getPluginsPermissions() {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
}

/**
 * Splits a permission string into its components.
 *
 * @param {string} str
 * @returns {Object}
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Aggregates actions defined in the core application.
 *
 * @returns {Array}
 */
function aggregateAppActions() {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Aggregates actions defined in plugins.
 *
 * @returns {Array}
 */
function aggregatePluginActions() {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Computes differences between DB and file permissions.
 *
 * @param {Array} dbPermissions
 * @param {Array} filePermissions
 * @returns {Object}
 */
function computePermissionsDiff(dbPermissions, filePermissions) {
  const toRemove = _.difference(dbPermissions, filePermissions).map(splitPermissionString);
  const toAdd = _.difference(filePermissions, dbPermissions).map(splitPermissionString);
  return { toRemove, toAdd };
}

/**
 * Updates role permissions based on differences.
 *
 * @param {Array} toAdd
 * @param {Array} toRemove
 * @param {Object} rolesMap
 */
async function applyPermissionChanges(toAdd, toRemove, rolesMap) {
  const query = strapi.query('permission', 'users-permissions');

  await Promise.all(
    toAdd.map(p =>
      query.create({
        type: p.type,
        controller: p.controller,
        action: p.action,
        enabled: isPermissionEnabled(p, rolesMap[p.roleId]),
        policy: '',
        role: p.roleId,
      })
    )
  );

  await Promise.all(
    toRemove.map(p => {
      const { type, controller, action, roleId: role } = p;
      return query.delete({ type, controller, action, role });
    })
  );
}

/**
 * Retrieves routes from core application.
 *
 * @returns {Array}
 */
function getApplicationRoutes() {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
}

/**
 * Retrieves routes from plugins, adjusting prefixes.
 *
 * @returns {Object}
 */
function getPluginsRoutes() {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((list, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return list.concat(curr);
    }, []);
    acc[current] = routes;
    return acc;
  }, {});
}

/**
 * Counts users for each role.
 *
 * @param {Array} roles
 * @returns {Promise<Array>}
 */
async function attachUserCounts(roles) {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
}

/**
 * Updates a user's role.
 *
 * @param {Object} user
 * @param {number} roleId
 * @returns {Promise}
 */
function updateUserRole(user, roleId) {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role: roleId });
}

/**
 * Retrieves plugins from marketplace.
 *
 * @param {string} lang
 * @returns {Promise<Array>}
 */
function fetchMarketplacePlugins(lang = 'en') {
  return new Promise(resolve => {
    request(
      {
        uri: `https://marketplace.strapi.io/plugins?lang=${lang}`,
        json: true,
        timeout: 3000,
        headers: { 'cache-control': 'max-age=3600' },
      },
      (err, response, body) => {
        if (err || response.statusCode !== 200) {
          return resolve([]);
        }
        resolve(body);
      }
    );
  });
}

/**
 * Formats role data with permissions.
 *
 * @param {Object} role
 * @param {Array} plugins
 * @returns {Object}
 */
function formatRoleWithPermissions(role, plugins) {
  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(
      acc,
      `${permission.type}.controllers.${permission.controller}.${permission.action}`,
      {
        enabled: !!_.toNumber(permission.enabled),
        policy: permission.policy,
      }
    );

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

  return { ...role, permissions };
}

/**
 * Service methods.
 */
module.exports = {
  /**
   * Creates a new role and its permissions.
   *
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async createRole(params) {
    generateRoleSlug(params);
    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const promises = createRolePermissions(role.id, params.permissions);
    maybeAddUserRelation(role, params.users, promises);
    return await Promise.all(promises);
  },

  /**
   * Deletes a role and reassigns its users.
   *
   * @param {number} roleID
   * @param {number} publicRoleID
   * @returns {Promise<Array>}
   */
  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const promises = [
      ...moveUsersToRole(role.users, publicRoleID),
      ...deletePermissions(role.permissions),
      strapi.query('role', 'users-permissions').delete({ id: roleID }),
    ];

    return await Promise.all(promises);
  },

  /**
   * Retrieves marketplace plugins.
   *
   * @param {string} lang
   * @returns {Promise<Array>}
   */
  getPlugins(lang = 'en') {
    return fetchMarketplacePlugins(lang);
  },

  /**
   * Retrieves all actions from core and plugins.
   *
   * @returns {Object}
   */
  getActions() {
    const appControllers = getAppControllers();
    const pluginsPermissions = getPluginsPermissions();

    const permissions = {
      application: { controllers: appControllers.controllers },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  /**
   * Retrieves a role with its permissions.
   *
   * @param {number} roleID
   * @param {Array} plugins
   * @returns {Promise<Object>}
   */
  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    return formatRoleWithPermissions(role, plugins);
  },

  /**
   * Retrieves all roles with user counts.
   *
   * @returns {Promise<Array>}
   */
  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return await attachUserCounts(roles);
  },

  /**
   * Retrieves all routes from core and plugins.
   *
   * @returns {Promise<Object>}
   */
  async getRoutes() {
    const routes = getApplicationRoutes();
    const pluginsRoutes = getPluginsRoutes();
    return _.merge({ application: routes }, pluginsRoutes);
  },

  /**
   * Synchronises permissions between DB and code.
   *
   * @returns {Promise<void>}
   */
  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    const dbKeys = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const appActions = aggregateAppActions();
    const pluginActions = aggregatePluginActions();
    const fileActions = appActions.concat(pluginActions);

    const fileKeys = _.uniq(
      fileActions.reduce((acc, action) => {
        return acc.concat(roles.map(role => `${action}.${role[primaryKey]}`));
      }, [])
    );

    if (!_.isEqual(dbKeys.sort(), fileKeys.sort())) {
      const { toRemove, toAdd } = computePermissionsDiff(dbKeys, fileKeys);
      await applyPermissionChanges(toAdd, toRemove, rolesMap);
    }
  },

  /**
   * Initializes default roles and permissions.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    const roleCount = await strapi.query('role', 'users-permissions').count();

    if (roleCount === 0) {
      await strapi.query('role', 'users-permissions').create({
        name: 'Authenticated',
        description: 'Default role given to authenticated user.',
        type: 'authenticated',
      });

      await strapi.query('role', 'users-permissions').create({
        name: 'Public',
        description: 'Default role given to unauthenticated user.',
        type: 'public',
      });
    }

    return this.updatePermissions();
  },

  /**
   * Updates a role and its permissions.
   *
   * @param {number} roleID
   * @param {Object} body
   * @returns {Promise<void>}
   */
  async updateRole(roleID, body) {
    const [role, authenticated] = await Promise.all([
      this.getRole(roleID, []),
      strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
    ]);

    await strapi
      .query('role', 'users-permissions')
      .update({ id: roleID }, _.pick(body, ['name', 'description']));

    const permissionUpdates = Object.keys(body.permissions || {}).reduce((acc, type) => {
      Object.keys(body.permissions[type].controllers).forEach(controller => {
        Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
          const bodyAction = body.permissions[type].controllers[controller][action];
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            acc.push(
              strapi.query('permission', 'users-permissions').update(
                {
                  role: roleID,
                  type,
                  controller,
                  action: action.toLowerCase(),
                },
                bodyAction
              )
            );
          }
        });
      });
      return acc;
    }, []);

    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
  },

  /**
   * Updates a single user's role.
   *
   * @param {Object} user
   * @param {number} role
   * @returns {Promise}
   */
  async updateUserRole(user, role) {
    return updateUserRole(user, role);
  },

  /**
   * Renders a template with data.
   *
   * @param {string} layout
   * @param {Object} data
   * @returns {string}
   */
  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};