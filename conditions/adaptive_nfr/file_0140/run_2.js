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
 * Generates action objects from controller methods.
 * @param {Object} data - Controller data containing methods
 * @returns {Object} Action map with enabled and policy properties
 */
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Builds application controllers action map.
 * @returns {Object} Application controllers with actions
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
 * Normalizes role type to snake_case.
 * @param {Object} params - Role parameters
 */
const normalizeRoleType = params => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }
};

/**
 * Creates permission entries for a role.
 * @param {number} roleId - Role ID
 * @param {Object} permissions - Permissions structure
 * @returns {Promise[]} Array of permission creation promises
 */
const createPermissionEntries = (roleId, permissions) => {
  const arrayOfPromises = [];
  Object.keys(permissions || {}).forEach(type => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        arrayOfPromises.push(
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
  return arrayOfPromises;
};

/**
 * Adds users to role if provided.
 * @param {number} roleId - Role ID
 * @param {Array} users - User array
 * @param {Promise[]} promises - Promise array to append to
 */
const addUsersToRole = (roleId, users, promises) => {
  if (users && users.length > 0) {
    promises.push(
      strapi.query('role', 'users-permissions').update(
        { id: roleId },
        { users }
      )
    );
  }
};

/**
 * Moves users from deleted role to public role.
 * @param {Array} users - Users to move
 * @param {number} publicRoleId - Public role ID
 * @returns {Promise[]} Array of update promises
 */
const moveUsersToPublicRole = (users, publicRoleId) =>
  users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleId }
    )
  );

/**
 * Deletes permissions associated with a role.
 * @param {Array} permissions - Permissions to delete
 * @returns {Promise[]} Array of delete promises
 */
const deleteRolePermissions = permissions =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );

/**
 * Aggregates application controller actions.
 * @returns {Array} Array of action strings
 */
const aggregateAppActions = () => {
  const acc = [];
  Object.keys(strapi.api || {}).forEach(api => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc.push(...actions);
    });
  });
  return acc;
};

/**
 * Aggregates plugin controller actions.
 * @returns {Array} Array of action strings
 */
const aggregatePluginActions = () => {
  const acc = [];
  Object.keys(strapi.plugins).forEach(plugin => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc.push(...actions);
    });
  });
  return acc;
};

/**
 * Generates permission strings for all roles.
 * @param {Array} actions - Action strings
 * @param {Array} roles - Role objects
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const generatePermissionStrings = (actions, roles, primaryKey) => {
  const permissions = actions.reduce(
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
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Creates permission objects for database insertion.
 * @param {Array} permissions - Parsed permission objects
 * @param {Object} rolesMap - Map of role ID to role object
 * @returns {Promise[]} Array of creation promises
 */
const createMissingPermissions = (permissions, rolesMap) =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').create({
      type: permission.type,
      controller: permission.controller,
      action: permission.action,
      enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
      policy: '',
      role: permission.roleId,
    })
  );

/**
 * Removes obsolete permissions from database.
 * @param {Array} permissions - Parsed permission objects
 * @returns {Promise[]} Array of deletion promises
 */
const removeObsoletePermissions = permissions =>
  permissions.map(permission => {
    const { type, controller, action, roleId: role } = permission;
    return strapi.query('permission', 'users-permissions').delete({ type, controller, action, role });
  });

/**
 * Processes permission differences and updates database.
 * @param {Array} dbPermissions - Permissions in database
 * @param {Array} filePermissions - Permissions in files
 * @param {Object} rolesMap - Map of role ID to role object
 */
const syncPermissionDifferences = async (dbPermissions, filePermissions, rolesMap) => {
  if (_.isEqual(dbPermissions.sort(), filePermissions.sort())) {
    return;
  }

  const toRemove = _.difference(dbPermissions, filePermissions).map(parsePermissionString);
  const toAdd = _.difference(filePermissions, dbPermissions).map(parsePermissionString);

  await Promise.all(createMissingPermissions(toAdd, rolesMap));
  await Promise.all(removeObsoletePermissions(toRemove));
};

/**
 * Retrieves database permissions as strings.
 * @param {string} primaryKey - Primary key field name
 * @returns {Promise<Array>} Unique permission strings
 */
const getDbPermissionStrings = async primaryKey => {
  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  const permissionStrings = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissionStrings);
};

/**
 * Groups role permissions by type and controller.
 * @param {Array} rolePermissions - Permission objects
 * @param {Array} plugins - Plugin list
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
 * @param {Array} roles - Role objects
 */
const enrichRolesWithUserCount = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
};

/**
 * Processes plugin routes with prefix.
 * @param {Object} clonedPlugins - Cloned plugins object
 * @returns {Object} Plugins with processed routes
 */
const processPluginRoutes = clonedPlugins => {
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
 * Collects application routes.
 * @returns {Array} Application routes
 */
const getApplicationRoutes = () =>
  Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

/**
 * Builds permission update promises for role.
 * @param {number} roleId - Role ID
 * @param {Object} bodyPermissions - New permissions
 * @param {Object} rolePermissions - Current permissions
 * @returns {Promise[]} Array of update promises
 */
const buildPermissionUpdatePromises = (roleId, bodyPermissions, rolePermissions) => {
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
                role: roleId,
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
 * Updates user role assignments.
 * @param {Array} newUsers - Users to add to role
 * @param {Array} oldUsers - Users to remove from role
 * @param {number} roleId - New role ID
 * @param {number} authenticatedRoleId - Authenticated role ID
 * @param {Function} updateUserRole - Update function
 */
const updateUserRoleAssignments = async (newUsers, oldUsers, roleId, authenticatedRoleId, updateUserRole) => {
  await Promise.all(newUsers.map(user => updateUserRole(user, roleId)));
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticatedRoleId)));
};

module.exports = {
  async createRole(params) {
    normalizeRoleType(params);

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = createPermissionEntries(role.id, params.permissions);
    addUsersToRole(role.id, params.users, arrayOfPromises);

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = [];
    array