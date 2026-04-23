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
 * @param {Object} params - Role parameters
 * @returns {string} Normalized role type
 */
const normalizeRoleType = params => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }
  return params.type;
};

/**
 * Create role entity in database
 * @param {Object} params - Role parameters
 * @returns {Promise<Object>} Created role entity
 */
const createRoleEntity = params =>
  strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

/**
 * Create permissions for a role
 * @param {Object} params - Role parameters
 * @param {Object} role - Created role entity
 * @returns {Promise<Array>} Array of created permissions
 */
const createPermissionsForRole = (params, role) => {
  const arrayOfPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create({
            role: role.id,
            type,
            controller,
            action: action.toLowerCase(),
            ...params.permissions[type].controllers[controller][action],
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
 * @param {Object} params - Role parameters
 * @param {Object} role - Created role entity
 * @returns {Promise<Array>} Array of update promises
 */
const assignUsersToRole = (params, role) => {
  if (params.users && params.users.length > 0) {
    return [
      strapi.query('role', 'users-permissions').update(
        {
          id: role.id,
        },
        { users: params.users }
      ),
    ];
  }
  return [];
};

/**
 * Create a new role with all related permissions and users
 * @param {Object} params - Role parameters
 * @returns {Promise<Array>} Array of created permissions
 */
async function createRole(params) {
  const role = await createRoleEntity({
    ...params,
    type: normalizeRoleType(params),
  });

  const arrayOfPromises = await createPermissionsForRole(params, role);

  const userPromises = await assignUsersToRole(params, role);
  arrayOfPromises.push(...userPromises);

  return await Promise.all(arrayOfPromises);
}

/**
 * Find role by ID with users and permissions
 * @param {number} roleID - Role ID
 * @returns {Promise<Object|null>} Role entity or null
 */
const findRoleById = async (roleID) =>
  strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

/**
 * Reassign users from deleted role to guest role
 * @param {Array} users - Users to reassign
 * @param {number} publicRoleID - Guest role ID
 * @returns {Promise<Array>} Array of update promises
 */
const reassignUsersToGuestRole = (users, publicRoleID) =>
  users.reduce((acc, user) => {
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

/**
 * Delete all permissions for a role
 * @param {Array} permissions - Role permissions
 * @returns {Promise<Array>} Array of delete promises
 */
const deleteRolePermissions = permissions =>
  permissions.reduce((acc, permission) => {
    acc.push(
      strapi.query('permission', 'users-permissions').delete({
        id: permission.id,
      })
    );
    return acc;
  }, []);

/**
 * Delete role entity from database
 * @param {number} roleID - Role ID
 * @returns {Promise<Object>} Delete promise
 */
const deleteRoleEntity = roleID =>
  strapi.query('role', 'users-permissions').delete({ id: roleID });

/**
 * Delete a role and all its related data
 * @param {number} roleID - Role ID
 * @param {number} publicRoleID - Guest role ID
 * @returns {Promise<Array>} Array of delete promises
 */
async function deleteRole(roleID, publicRoleID) {
  const role = await findRoleById(roleID);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const arrayOfPromises = await reassignUsersToGuestRole(role.users, publicRoleID);
  arrayOfPromises.push(...deleteRolePermissions(role.permissions));
  arrayOfPromises.push(deleteRoleEntity(roleID));

  return await Promise.all(arrayOfPromises);
}

/**
 * Generate actions object from controller data
 * @param {Object} data - Controller data
 * @returns {Object} Actions object
 */
const generateActionsFromController = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Get actions for all application controllers
 * @returns {Object} Application controllers actions
 */
const getAppControllersActions = () => {
  const appControllers = Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce(
      (acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateActionsFromController(
            strapi.api[key].controllers[controller]
          );
        });
        return acc;
      },
      { controllers: {} }
    );
  return appControllers;
};

/**
 * Get actions for all plugin controllers
 * @returns {Object} Plugin controllers actions
 */
const getPluginsControllersActions = () => {
  const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActionsFromController(
        strapi.plugins[key].controllers[k]
      );
      return obj;
    }, initialState);
    return acc;
  }, {});
  return pluginsPermissions;
};

/**
 * Merge application and plugin permissions
 * @returns {Object} Merged permissions object
 */
const mergePermissions = () => {
  const permissions = {
    application: {
      controllers: getAppControllersActions().controllers,
    },
  };
  return _.merge(permissions, getPluginsControllersActions());
};

/**
 * Get all available actions from controllers
 * @param {string} lang - Language code
 * @returns {Promise<Object>} Merged permissions object
 */
function getActions(lang = 'en') {
  return mergePermissions();
}

/**
 * Group permissions by type
 * @param {Array} permissions - Role permissions
 * @param {Array} plugins - Available plugins
 * @returns {Object} Grouped permissions
 */
const groupPermissionsByType = (permissions, plugins) =>
  permissions.reduce((acc, permission) => {
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

/**
 * Get role with grouped permissions
 * @param {number} roleID - Role ID
 * @param {Array} plugins - Available plugins
 * @returns {Promise<Object>} Role with permissions
 */
async function getRole(roleID, plugins) {
  const role = await findRoleById(roleID);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = groupPermissionsByType(role.permissions, plugins);

  return {
    ...role,
    permissions,
  };
}

/**
 * Find all roles sorted by name
 * @returns {Promise<Array>} Array of roles
 */
const findRoles = async () =>
  strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

/**
 * Count users for each role
 * @param {Array} roles - Roles to count
 * @returns {Promise<Array>} Roles with user counts
 */
const countUsersForRole = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

/**
 * Get all roles with user counts
 * @returns {Promise<Array>} Roles with user counts
 */
async function getRoles() {
  const roles = await findRoles();
  return await countUsersForRole(roles);
}

/**
 * Get routes from API configuration
 * @returns {Array} API routes
 */
const getApiRoutes = () =>
  Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

/**
 * Get routes from plugins configuration
 * @returns {Object} Plugin routes by plugin name
 */
const getPluginsRoutes = () => {
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
 * Get all routes from API and plugins
 * @returns {Object} Merged routes object
 */
const getRoutes = () =>
  _.merge({ application: getApiRoutes() }, getPluginsRoutes());

/**
 * Get primary key from permission query
 * @returns {Object} Primary key configuration
 */
const getPrimaryKey = () => strapi.query('permission', 'users-permissions');

/**
 * Find all roles in database
 * @returns {Promise<Array>} Array of roles
 */
const findRolesInDatabase = async () =>
  strapi.query('role', 'users-permissions').find({}, []);

/**
 * Create roles map from roles array
 * @param {Array} roles - Roles array
 * @returns {Object} Roles map by primary key
 */
const createRolesMap = roles =>
  roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

/**
 * Find all permissions in database
 * @returns {Promise<Array>} Array of permissions
 */
const findDbPermissions = async () =>
  strapi.query('permission', 'users-permissions').find({ _limit: -1 });

/**
 * Format permission string for comparison
 * @param {Object} p - Permission object
 * @returns {string} Formatted permission string
 */
const formatPermissionString = p =>
  `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`;

/**
 * Get all permissions found in database
 * @returns {Promise<Array>} Unique permission strings
 */
const getPermissionsFoundInDB = async () => {
  const dbPermissions = await findDbPermissions();
  const permissionsFoundInDB = dbPermissions.map(formatPermissionString);
  return _.uniq(permissionsFoundInDB);
};

/**
 * Aggregate actions from application controllers
 * @returns {Array} Array of application action strings
 */
const aggregateAppActions = () => {
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
 * Aggregate actions from plugin controllers
 * @returns {Array} Array of plugin action strings
 */
const aggregatePluginsActions = () => {
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
 * Get all actions found in controller files
 * @returns {Array} Array of action strings
 */
const getActionsFoundInFiles = () =>
  aggregateAppActions().concat(aggregatePluginsActions());

/**
 * Get all permissions found in controller files
 * @param {Array} roles - Roles array
 * @returns {Array} Array of permission strings
 */
const getPermissionsFoundInFiles = roles =>
  getActionsFoundInFiles().reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );

/**
 * Compare permissions and return differences
 * @param {Array} permissionsFoundInDB - Permissions in database
 * @param {Array} permissionsFoundInFiles - Permissions in files
 * @returns {Object} Object with toRemove and toAdd arrays
 */
const comparePermissions = (permissionsFoundInDB, permissionsFoundInFiles) => {
  const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitted);
  const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitted);
  return { toRemove, toAdd };
};

/**
 * Split permission string into components
 * @param {string} str - Permission string
 * @returns {Object} Permission components
 */
const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Create new permissions in database
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Roles map
 * @returns {Promise<Array>} Array of create promises
 */
const createNewPermissions = async (toAdd, rolesMap) =>
  await Promise.all(
    toAdd.map(permission =>
      strapi.query('permission', 'users-permissions').create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
        policy: '',
        role: permission.roleId,
      })
    )
  );

/**
 * Remove permissions from database
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise<Array>} Array of delete promises
 */
const removePermissions = toRemove =>
  Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return strapi.query('permission', 'users-permissions').delete({
        type,
        controller,
        action,
        role,
      });
    })
  );

/**
 * Update permissions in database based on controller changes
 * @returns {Promise<void>}
 */
async function updatePermissions() {
  const { primaryKey } = getPrimaryKey();
  const roles = await findRolesInDatabase();
  const rolesMap = createRolesMap(roles);

  const dbPermissions = await getPermissionsFoundInDB();

  const appActions = aggregateAppActions();
  const pluginsActions = aggregatePluginsActions();
  const actionsFoundInFiles = appActions.concat(pluginsActions);

  const permissionsFoundInFiles = getPermissionsFoundInFiles(roles);

  if (!_.isEqual(dbPermissions.sort(), permissionsFoundInFiles.sort())) {
    const { toRemove, toAdd } = comparePermissions(dbPermissions, permissionsFoundInFiles);

    await createNewPermissions(toAdd, rolesMap);
    await removePermissions(toRemove);
  }
}

/**
 * Create default roles if none exist
 * @returns {Promise<void>}
 */
const createDefaultRoles = async () => {
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
};

/**
 * Initialize users-permissions service
 * @returns {Promise<void>}
 */
async function initialize() {
  await createDefaultRoles();
  return updatePermissions();
}

/**
 * Update role name, description, permissions, and users
 * @param {number} roleID - Role ID
 * @param {Object} body - Update body
 * @returns {Promise<void>}
 */
async function updateRole(roleID, body) {
  const [role, authenticated] = await Promise.all([
    getRole(roleID, []),
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

  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
}

/**
 * Update user role
 * @param {Object} user - User object
 * @param {number} role - Role ID
 * @returns {Promise<Object>} Update promise
 */
const updateUserRole = (user, role) =>
  strapi.query('user', 'users-permissions').update({ id: user.id }, { role });

/**
 * Compile template with data
 * @param {string} layout - Template layout
 * @param {Object} data - Template data
 * @returns {string} Compiled template
 */
const template = (layout, data) => {
  const compiledObject = _.template(layout);
  return compiledObject(data);
};

module.exports = {
  createRole,
  deleteRole,
  getPlugins,
  getActions,
  getRole,
  getRoles,
  getRoutes,
  updatePermissions,
  initialize,
  updateRole,
  updateUserRole,
  template,
};