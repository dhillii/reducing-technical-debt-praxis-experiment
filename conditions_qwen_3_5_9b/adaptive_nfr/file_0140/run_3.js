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
  {
    action: 'emailconfirmation',
    controller: 'auth',
    type: 'users-permissions',
    roleType: 'public',
  },
  { action: 'resetpassword', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'init', controller: 'userspermissions', type: null, roleType: null },
  { action: 'me', controller: 'user', type: 'users-permissions', roleType: null },
  { action: 'autoreload', controller: null, type: null, roleType: null },
];

const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Normalize role type from name parameter
 * @param {string} name - Role name
 * @returns {string} - Normalized role type
 */
const normalizeRoleType = (name) => _.snakeCase(_.deburr(_.toLower(name)));

/**
 * Create role entity in database
 * @param {Object} params - Role parameters
 * @returns {Promise<Object>} - Created role entity
 */
const createRoleEntity = async (params) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));
  return role;
};

/**
 * Create permissions for a role
 * @param {Object} role - Role entity
 * @param {Object} permissions - Permissions configuration
 * @returns {Promise<Array>} - Array of created permissions
 */
const createPermissionsForRole = async (role, permissions) => {
  const arrayOfPromises = Object.keys(permissions || {}).reduce((acc, type) => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create({
            role: role.id,
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
  return arrayOfPromises;
};

/**
 * Assign users to a role
 * @param {Object} role - Role entity
 * @param {Array} users - Users to assign
 * @returns {Promise<Array>} - Array of update operations
 */
const assignUsersToRole = async (role, users) => {
  if (!users || users.length === 0) return [];
  return [
    strapi.query('role', 'users-permissions').update(
      {
        id: role.id,
      },
      { users }
    ),
  ];
};

/**
 * Find role in database
 * @param {number} roleID - Role ID
 * @param {Array} fields - Fields to fetch
 * @returns {Promise<Object|null>} - Role entity or null
 */
const findRole = async (roleID, fields) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, fields);
  return role;
};

/**
 * Migrate users to guest role
 * @param {Array} users - Users to migrate
 * @param {number} publicRoleID - Public role ID
 * @returns {Promise<Array>} - Array of update operations
 */
const migrateUsersToGuest = async (users, publicRoleID) => {
  const arrayOfPromises = users.reduce((acc, user) => {
    acc.push(
      strapi.query('user', 'users-permissions').update(
        {
          id: user.id,
        },
        {
          role: publicRoleID,
        }
      )
    );
    return acc;
  }, []);
  return arrayOfPromises;
};

/**
 * Delete permissions for a role
 * @param {Array} permissions - Permissions to delete
 * @returns {Promise<Array>} - Array of delete operations
 */
const deleteRolePermissions = async (permissions) => {
  const arrayOfPromises = permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
  return arrayOfPromises;
};

/**
 * Delete role from database
 * @param {number} roleID - Role ID to delete
 * @returns {Promise<Object>} - Delete operation
 */
const deleteRole = async (roleID) => {
  return strapi.query('role', 'users-permissions').delete({ id: roleID });
};

/**
 * Generate actions from controller data
 * @param {Object} data - Controller data
 * @returns {Object} - Generated actions
 */
const generateActions = (data) =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Get application controllers
 * @returns {Object} - Application controllers with actions
 */
const getAppControllers = () => {
  const appControllers = Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce(
      (acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
        });
        return acc;
      },
      { controllers: {} }
    );
  return appControllers;
};

/**
 * Get plugin controllers
 * @returns {Object} - Plugin controllers with actions
 */
const getPluginsControllers = () => {
  const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
  return pluginsPermissions;
};

/**
 * Merge application and plugin permissions
 * @returns {Object} - Merged permissions
 */
const mergePermissions = () => {
  const appControllers = getAppControllers();
  const pluginsPermissions = getPluginsControllers();
  const permissions = {
    application: {
      controllers: appControllers.controllers,
    },
  };
  return _.merge(permissions, pluginsPermissions);
};

/**
 * Find role with permissions
 * @param {number} roleID - Role ID
 * @param {Array} plugins - Plugins array
 * @returns {Promise<Object>} - Role with grouped permissions
 */
const getRoleWithPermissions = async (roleID, plugins) => {
  const role = await findRole(roleID, ['permissions']);
  if (!role) {
    throw new Error('Cannot find this role');
  }

  // Group by `type`.
  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: _.toNumber(permission.enabled) == true,
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

  return {
    ...role,
    permissions,
  };
};

/**
 * Get all roles with user counts
 * @returns {Promise<Array>} - Roles with user counts
 */
const getRolesWithCounts = async () => {
  const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }

  return roles;
};

/**
 * Get application routes
 * @returns {Array} - Application routes
 */
const getAppRoutes = () => {
  const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
  return routes;
};

/**
 * Get plugin routes
 * @returns {Object} - Plugin routes by plugin name
 */
const getPluginRoutes = () => {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);

      return acc.concat(curr);
    }, []);

    acc[current] = routes;
    return acc;
  }, {});
  return pluginsRoutes;
};

/**
 * Merge application and plugin routes
 * @returns {Object} - Merged routes
 */
const mergeRoutes = () => {
  const appRoutes = getAppRoutes();
  const pluginsRoutes = getPluginRoutes();
  return _.merge({ application: appRoutes }, pluginsRoutes);
};

/**
 * Get primary key from permission query
 * @returns {Object} - Primary key configuration
 */
const getPrimaryKey = () => {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  return primaryKey;
};

/**
 * Get all roles
 * @returns {Promise<Array>} - All roles
 */
const getAllRoles = async () => {
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  return roles;
};

/**
 * Create roles map from roles array
 * @param {Array} roles - Roles array
 * @returns {Object} - Roles map
 */
const createRolesMap = (roles) => {
  return roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
};

/**
 * Get all permissions from database
 * @returns {Promise<Array>} - All permissions
 */
const getAllPermissions = async () => {
  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  return dbPermissions;
};

/**
 * Map permissions to strings
 * @param {Array} permissions - Permissions array
 * @returns {Array} - Permission strings
 */
const mapPermissionsToStrings = (permissions) => {
  return permissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
};

/**
 * Get unique permission strings
 * @param {Array} permissions - Permission strings
 * @returns {Array} - Unique permission strings
 */
const getUniquePermissions = (permissions) => {
  return _.uniq(permissions);
};

/**
 * Get application actions
 * @returns {Array} - Application action strings
 */
const getAppActions = () => {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });
    return acc;
  }, []);
  return appActions;
};

/**
 * Get plugin actions
 * @returns {Array} - Plugin action strings
 */
const getPluginActions = () => {
  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });
    return acc;
  }, []);
  return pluginsActions;
};

/**
 * Combine application and plugin actions
 * @returns {Array} - Combined action strings
 */
const combineActions = () => {
  const appActions = getAppActions();
  const pluginsActions = getPluginActions();
  return appActions.concat(pluginsActions);
};

/**
 * Create permissions for each role
 * @param {Array} actions - Action strings
 * @param {Object} rolesMap - Roles map
 * @returns {Array} - Permission strings for each role
 */
const createRolePermissions = (actions, rolesMap) => {
  return actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
};

/**
 * Get unique role permissions
 * @param {Array} permissions - Permission strings
 * @returns {Array} - Unique permission strings
 */
const getUniqueRolePermissions = (permissions) => {
  return _.uniq(permissions);
};

/**
 * Compare DB and file permissions
 * @param {Array} dbPermissions - DB permission strings
 * @param {Array} filePermissions - File permission strings
 * @returns {Object} - Comparison result
 */
const comparePermissions = (dbPermissions, filePermissions) => {
  const toRemove = _.difference(dbPermissions, filePermissions);
  const toAdd = _.difference(filePermissions, dbPermissions);
  return { toRemove, toAdd };
};

/**
 * Split permission string into components
 * @param {string} str - Permission string
 * @returns {Object} - Permission components
 */
const splitPermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Get permissions to add
 * @param {Array} toAdd - Permission strings to add
 * @param {Object} rolesMap - Roles map
 * @returns {Array} - Permission objects to create
 */
const getPermissionsToAdd = (toAdd, rolesMap) => {
  return toAdd.map(permission => {
    const { type, controller, action, roleId } = splitPermissionString(permission);
    return {
      type,
      controller,
      action,
      enabled: isPermissionEnabled({ type, controller, action }, rolesMap[roleId]),
      policy: '',
      role: roleId,
    };
  });
};

/**
 * Get permissions to remove
 * @param {Array} toRemove - Permission strings to remove
 * @returns {Array} - Permission objects to delete
 */
const getPermissionsToRemove = (toRemove) => {
  return toRemove.map(permission => {
    const { type, controller, action, roleId: role } = splitPermissionString(permission);
    return { type, controller, action, role };
  });
};

/**
 * Create new permissions in database
 * @param {Array} permissions - Permissions to create
 * @returns {Promise<Array>} - Array of create operations
 */
const createNewPermissions = async (permissions) => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    permissions.map(permission =>
      query.create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: permission.enabled,
        policy: permission.policy,
        role: permission.role,
      })
    )
  );
};

/**
 * Delete permissions from database
 * @param {Array} permissions - Permissions to delete
 * @returns {Promise<Array>} - Array of delete operations
 */
const deletePermissions = async (permissions) => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    permissions.map(permission => {
      return query.delete({ type: permission.type, controller: permission.controller, action: permission.action, role: permission.role });
    })
  );
};

/**
 * Update permissions in database
 * @returns {Promise<void>}
 */
const updatePermissions = async () => {
  const primaryKey = getPrimaryKey();
  const roles = await getAllRoles();
  const rolesMap = createRolesMap(roles);

  const dbPermissions = await getAllPermissions();
  let permissionsFoundInDB = mapPermissionsToStrings(dbPermissions);
  permissionsFoundInDB = getUniquePermissions(permissionsFoundInDB);

  const appActions = getAppActions();
  const pluginsActions = getPluginActions();
  const actionsFoundInFiles = combineActions();

  const permissionsFoundInFiles = createRolePermissions(actionsFoundInFiles, rolesMap);
  permissionsFoundInFiles = getUniqueRolePermissions(permissionsFoundInFiles);

  const comparison = comparePermissions(permissionsFoundInDB, permissionsFoundInFiles);

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toAdd = getPermissionsToAdd(comparison.toAdd, rolesMap);
    const toRemove = getPermissionsToRemove(comparison.toRemove);

    await createNewPermissions(toAdd);
    await deletePermissions(toRemove);
  }
};

/**
 * Initialize default roles and permissions
 * @returns {Promise<void>}
 */
const initialize = async () => {
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

  return updatePermissions();
};

/**
 * Update role with permissions and users
 * @param {number} roleID - Role ID
 * @param {Object} body - Update body
 * @returns {Promise<void>}
 */
const updateRole = async (roleID, body) => {
  const [role, authenticated] = await Promise.all([
    getRoleWithPermissions(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  await strapi
    .query('role', 'users-permissions')
    .update({ id: roleID }, _.pick(body, ['name', 'description']));

  await Promise.all(
    Object.keys(body.permissions || {}).reduce((acc, type) => {
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
    }, [])
  );

  // Add user to this role.
  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
};

/**
 * Update user role
 * @param {Object} user - User object
 * @param {number} role - Role ID
 * @returns {Promise<Object>} - Update operation
 */
const updateUserRole = (user, role) => {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
};

/**
 * Template function for rendering layouts
 * @param {string} layout - Layout template
 * @param {Object} data - Template data
 * @returns {string} - Compiled template
 */
const template = (layout, data) => {
  const compiledObject = _.template(layout);
  return compiledObject(data);
};

module.exports = {
  async createRole(params) {
    const normalizedType = normalizeRoleType(params.name);
    const role = await createRoleEntity({ ...params, type: normalizedType });
    const permissions = await createPermissionsForRole(role, params.permissions);
    const users = await assignUsersToRole(role, params.users);
    return await Promise.all([...permissions, ...users]);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await findRole(roleID, ['users', 'permissions']);
    if (!role) {
      throw new Error('Cannot find this role');
    }

    const migrateUsers = await migrateUsersToGuest(role.users, publicRoleID);
    const deletePermissions = await deleteRolePermissions(role.permissions);
    const deleteRoleEntity = await deleteRole(roleID);

    return await Promise.all([...migrateUsers, ...deletePermissions, deleteRoleEntity]);
  },

  getPlugins(lang = 'en') {
    return new Promise(resolve => {
      request(
        {
          uri: `https://marketplace.strapi.io/plugins?lang=${lang}`,
          json: true,
          timeout: 3000,
          headers: {
            'cache-control': 'max-age=3600',
          },
        },
        (err, response, body) => {
          if (err || response.statusCode !== 200) {
            return resolve([]);
          }

          resolve(body);
        }
      );
    });
  },

  getActions() {
    return mergePermissions();
  },

  async getRole(roleID, plugins) {
    return getRoleWithPermissions(roleID, plugins);
  },

  async getRoles() {
    return getRolesWithCounts();
  },

  async getRoutes() {
    return mergeRoutes();
  },

  async updatePermissions() {
    await updatePermissions();
  },

  async initialize() {
    await initialize();
  },

  async updateRole(roleID, body) {
    await updateRole(roleID, body);
  },

  async updateUserRole(user, role) {
    await updateUserRole(user, role);
  },

  template(layout, data) {
    return template(layout, data);
  },
};