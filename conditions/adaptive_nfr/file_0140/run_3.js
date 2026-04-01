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
      ),
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
const countUsersPerRole = async (roles) => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

/**
 * Extracts routes from API configuration.
 * @returns {Array} Application routes
 */
const extractAppRoutes = () =>
  Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

/**
 * Processes plugin routes with proper path prefixing.
 * @param {Object} clonedPlugins - Cloned plugins object
 * @returns {Object} Plugins with processed routes
 */
const processPluginRoutes = (clonedPlugins) =>
  Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return acc.concat(curr);
    }, []);
    acc[current] = routes;
    return acc;
  }, {});

/**
 * Aggregates application controller actions.
 * @returns {Array} Array of action identifiers
 */
const aggregateAppActions = () =>
  Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

/**
 * Aggregates plugin controller actions.
 * @returns {Array} Array of action identifiers
 */
const aggregatePluginActions = () =>
  Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

/**
 * Generates permission strings for all roles and actions.
 * @param {Array} actions - Action identifiers
 * @param {Array} roles - Roles array
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const generatePermissionStrings = (actions, roles, primaryKey) => {
  let permissions = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissions);
};

/**
 * Parses permission string into components.
 * @param {string} str - Permission string
 * @returns {Object} Parsed permission object
 */
const parsePermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Creates permission entries for added permissions.
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
 * Deletes removed permissions.
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
 * Compares and syncs permissions between database and files.
 * @param {Array} permissionsFoundInDB - Permissions in database
 * @param {Array} permissionsFoundInFiles - Permissions in files
 * @param {Object} rolesMap - Map of roles by ID
 * @returns {Promise<void>}
 */
const syncPermissions = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
      parsePermissionString
    );
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
      parsePermissionString
    );

    await createAddedPermissions(toAdd, rolesMap);
    await deleteRemovedPermissions(toRemove);
  }
};

/**
 * Creates default roles if none exist.
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
 * Collects permission update promises for role.
 * @param {Object} body - Request body with permissions
 * @param {Object} role - Current role object
 * @param {number} roleID - Role ID
 * @returns {Array} Array of update promises
 */
const collectPermissionUpdates = (body, role, roleID) => {
  const promises = [];
  Object.keys(body.permissions || {}).forEach(type => {
    Object.keys(body.permissions[type].controllers).forEach(controller => {
      Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
        const bodyAction = body.permissions[type].controllers[controller][action];
        const currentAction = _.get(
          role.permissions,
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
 * Updates user role assignments for added and removed users.
 * @param {Object} body - Request body with users
 * @param {Object} role - Current role object
 * @param {number} roleID - Role ID
 * @param {Object} authenticated - Authenticated role object
 * @param {Object} service - Service context for updateUserRole
 * @returns {Promise<void>}
 */
const updateUserAssignments = async (body, role, roleID, authenticated, service) => {
  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => service.updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.