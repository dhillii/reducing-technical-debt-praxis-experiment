```javascript
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
 * Normalizes role type by converting name to snake_case if type is not provided.
 * @param {Object} params - Role parameters
 * @returns {Object} Parameters with normalized type
 */
const normalizeRoleType = (params) => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }
  return params;
};

/**
 * Creates permission entries from nested permission structure.
 * @param {Object} permissions - Nested permissions object
 * @param {number} roleId - Role ID to associate with permissions
 * @returns {Array} Array of permission creation promises
 */
const createPermissionPromises = (permissions, roleId) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        promises.push(
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
  });
  return promises;
};

/**
 * Creates promise to update role users if users array is provided.
 * @param {Object} params - Parameters containing users array
 * @param {number} roleId - Role ID to update
 * @returns {Array} Array containing user update promise or empty array
 */
const createUserUpdatePromise = (params, roleId) => {
  if (params.users && params.users.length > 0) {
    return [
      strapi.query('role', 'users-permissions').update(
        { id: roleId },
        { users: params.users }
      )
    ];
  }
  return [];
};

/**
 * Creates promises to move users from deleted role to public role.
 * @param {Array} users - Users to reassign
 * @param {number} publicRoleId - Public role ID
 * @returns {Array} Array of user update promises
 */
const createUserReassignmentPromises = (users, publicRoleId) => {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleId }
    )
  );
};

/**
 * Creates promises to delete permissions associated with a role.
 * @param {Array} permissions - Permissions to delete
 * @returns {Array} Array of permission deletion promises
 */
const createPermissionDeletionPromises = (permissions) => {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

/**
 * Generates action map from controller methods.
 * @param {Object} data - Controller object
 * @returns {Object} Map of actions with enabled and policy properties
 */
const generateActions = (data) =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Builds application controllers action map.
 * @returns {Object} Controllers with their actions
 */
const buildAppControllers = () =>
  Object.keys(strapi.api || {})
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

/**
 * Builds plugins permissions action map.
 * @returns {Object} Plugins with their controllers and actions
 */
const buildPluginsPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});

/**
 * Groups role permissions by type and controller.
 * @param {Array} rolePermissions - Permissions from role
 * @param {Array} plugins - Available plugins
 * @returns {Object} Grouped permissions structure
 */
const groupPermissionsByType = (rolePermissions, plugins) => {
  return rolePermissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: _.toNumber(permission.enabled) === 1,
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
};

/**
 * Counts users for each role.
 * @param {Array} roles - Roles to count users for
 * @returns {Promise<Array>} Roles with user counts
 */
const enrichRolesWithUserCounts = async (roles) => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

/**
 * Processes plugin routes with proper path prefixing.
 * @param {Object} clonedPlugins - Deep cloned plugins object
 * @returns {Object} Plugins with processed routes
 */
const processPluginRoutes = (clonedPlugins) => {
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return acc.concat(curr);
    }, []);

    acc[current] = routes;
    return acc;
  }, {});
};

/**
 * Aggregates application controller actions.
 * @returns {Array} Array of action identifiers
 */
const aggregateAppActions = () => {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });

    return acc;
  }, []);
};

/**
 * Aggregates plugin controller actions.
 * @returns {Array} Array of action identifiers
 */
const aggregatePluginActions = () => {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });

    return acc;
  }, []);
};

/**
 * Parses permission string into components.
 * @param {string} str - Permission string in format "type.controller.action.roleId"
 * @returns {Object} Parsed permission object
 */
const parsePermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Creates permission entries for added actions.
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Map of roles by ID
 * @returns {Promise<Array>} Results of creation promises
 */
const createAddedPermissions = async (toAdd, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    toAdd.map(permission =>
      query.create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
        policy: '',
        role: permission.roleId,
      })
    )
  );
};

/**
 * Deletes permission entries for removed actions.
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise<Array>} Results of deletion promises
 */
const deleteRemovedPermissions = async (toRemove) => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
};

/**
 * Determines if permissions need updating by comparing database and file permissions.
 * @param {Array} permissionsFoundInDB - Permissions from database
 * @param {Array} permissionsFoundInFiles - Permissions from files
 * @returns {boolean} Whether permissions differ
 */
const permissionsDiffer = (permissionsFoundInDB, permissionsFoundInFiles) => {
  return !_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort());
};

/**
 * Builds permission strings for all roles and actions.
 * @param {Array} actionsFoundInFiles - All available actions
 * @param {Array} roles - All roles
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const buildPermissionStringsForRoles = (actionsFoundInFiles, roles, primaryKey) => {
  let permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissionsFoundInFiles);
};

/**
 * Builds permission strings from database records.
 * @param {Array} dbPermissions - Permissions from database
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const buildPermissionStringsFromDB = (dbPermissions, primaryKey) => {
  let permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissionsFoundInDB);
};

/**
 * Collects permission update promises for changed permissions.
 * @param {Object} bodyPermissions - New permission structure
 * @param {Object} rolePermissions - Current role permissions
 * @param {number} roleID - Role ID
 * @returns {Array} Array of update promises
 */
const collectPermissionUpdatePromises = (bodyPermissions, rolePermissions, roleID) => {
  const promises = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    Object.keys(bodyPermissions[type].controllers).forEach(controller => {
      Object.keys(bodyPermissions[type].controllers[controller]).forEach(action => {
        const bodyAction = bodyPermissions[type].controllers[controller][action];
        const currentAction = _.get(
          rolePermissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          promises.push(
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
  });
  return promises;
};

/**
 * Updates user role assignments based on differences.
 * @param {Array} newUsers - Users to add to role
 * @param {Array} oldUsers - Users to remove from role
 * @param {number} roleID - New role ID
 * @param {number} authenticatedId - Authenticated role ID
 * @param {Function} updateUserRole - Function to update user role
 * @returns {Promise<void>}
 */
const updateUserRoleAssignments = async (newUsers, oldUsers, roleID, authenticatedId, updateUserRole) => {
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticatedId)));
};

module.exports = {
  async createRole(params) {
    normalizeRoleType(params);

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = createPermissionPromises(params.permissions, role.id);
    const userPromises = createUserUpdatePromise(params, role.id);
    const arrayOfPromises = permissionPromises.concat(userPromises);

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id