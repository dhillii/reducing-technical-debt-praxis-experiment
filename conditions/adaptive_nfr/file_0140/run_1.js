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
 * Generates action objects from controller methods
 * @param {Object} data - Controller data containing methods
 * @returns {Object} Action objects with enabled and policy properties
 */
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Builds application controllers permissions
 * @returns {Object} Application controllers with generated actions
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
 * Builds plugin permissions
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
 * Normalizes role type for permission comparison
 * @param {number} value - The value to normalize
 * @returns {boolean} Whether the value equals true
 */
const normalizeEnabledValue = value => _.toNumber(value) === 1;

/**
 * Sets permission information from plugins
 * @param {Object} acc - Accumulator object
 * @param {Object} permission - Permission object
 * @param {Array} plugins - Available plugins
 */
const setPermissionInformation = (acc, permission, plugins) => {
  if (permission.type !== 'application' && !acc[permission.type].information) {
    acc[permission.type].information =
      plugins.find(plugin => plugin.id === permission.type) || {};
  }
};

/**
 * Processes a single permission into the accumulator
 * @param {Object} acc - Accumulator object
 * @param {Object} permission - Permission to process
 * @param {Array} plugins - Available plugins
 * @returns {Object} Updated accumulator
 */
const processPermission = (acc, permission, plugins) => {
  _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
    enabled: normalizeEnabledValue(permission.enabled),
    policy: permission.policy,
  });
  setPermissionInformation(acc, permission, plugins);
  return acc;
};

/**
 * Aggregates permissions by type
 * @param {Array} rolePermissions - Array of permission objects
 * @param {Array} plugins - Available plugins
 * @returns {Object} Grouped permissions
 */
const groupPermissionsByType = (rolePermissions, plugins) =>
  rolePermissions.reduce((acc, permission) => processPermission(acc, permission, plugins), {});

/**
 * Counts users for each role
 * @param {Array} roles - Array of role objects
 * @returns {Promise<Array>} Roles with user counts
 */
const enrichRolesWithUserCounts = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

/**
 * Builds route path with plugin prefix
 * @param {Object} route - Route configuration
 * @param {string} pluginName - Name of the plugin
 * @returns {string} Formatted route path
 */
const buildRoutePath = (route, pluginName) => {
  const prefix = route.config.prefix;
  return prefix !== undefined ? `${prefix}${route.path}` : `/${pluginName}${route.path}`;
};

/**
 * Processes plugin routes with prefixes
 * @param {Object} route - Route object
 * @param {string} pluginName - Plugin name
 * @returns {Object} Updated route
 */
const processPluginRoute = (route, pluginName) => {
  _.set(route, 'path', buildRoutePath(route, pluginName));
  return route;
};

/**
 * Aggregates routes from plugins
 * @param {Object} clonedPlugins - Cloned plugins object
 * @returns {Object} Plugin routes by plugin name
 */
const aggregatePluginRoutes = clonedPlugins =>
  Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce(
      (acc, curr) => acc.concat(processPluginRoute(curr, current)),
      []
    );
    acc[current] = routes;
    return acc;
  }, {});

/**
 * Aggregates application API actions
 * @returns {Array} Array of action strings
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
 * Aggregates plugin actions
 * @returns {Array} Array of action strings
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
 * Splits permission string into components
 * @param {string} str - Permission string in format "type.controller.action.roleId"
 * @returns {Object} Parsed permission object
 */
const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Creates permission objects for database insertion
 * @param {Object} permission - Permission data
 * @param {Object} rolesMap - Map of roles by ID
 * @returns {Object} Permission object for creation
 */
const createPermissionObject = (permission, rolesMap) => ({
  type: permission.type,
  controller: permission.controller,
  action: permission.action,
  enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
  policy: '',
  role: permission.roleId,
});

/**
 * Processes permissions to add to database
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Map of roles by ID
 * @returns {Promise<Array>} Results of creation
 */
const addPermissions = async (toAdd, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    toAdd.map(permission => query.create(createPermissionObject(permission, rolesMap)))
  );
};

/**
 * Processes permissions to remove from database
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise<Array>} Results of deletion
 */
const removePermissions = async toRemove => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
};

/**
 * Compares and syncs permissions between database and files
 * @param {Array} permissionsFoundInDB - Permissions in database
 * @param {Array} permissionsFoundInFiles - Permissions in files
 * @param {Object} rolesMap - Map of roles by ID
 */
const syncPermissions = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
      splitPermissionString
    );
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
      splitPermissionString
    );

    await addPermissions(toAdd, rolesMap);
    await removePermissions(toRemove);
  }
};

/**
 * Builds permission strings from actions and roles
 * @param {Array} actionsFoundInFiles - Actions found in files
 * @param {Array} roles - Array of roles
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const buildPermissionStrings = (actionsFoundInFiles, roles, primaryKey) => {
  let permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissionsFoundInFiles);
};

/**
 * Fetches and maps database permissions
 * @param {string} primaryKey - Primary key field name
 * @returns {Promise<Array>} Unique permission strings from database
 */
const fetchDatabasePermissions = async primaryKey => {
  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  let permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissionsFoundInDB);
};

/**
 * Creates role map from roles array
 * @param {Array} roles - Array of roles
 * @param {string} primaryKey - Primary key field name
 * @returns {Object} Map of roles by ID
 */
const createRolesMap = (roles, primaryKey) =>
  roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

/**
 * Moves users from one role to another
 * @param {Array} users - Users to move
 * @param {number} targetRoleId - Target role ID
 * @returns {Promise<Array>} Update results
 */
const moveUsersToRole = async (users, targetRoleId) =>
  Promise.all(
    users.map(user =>
      strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
    )
  );

/**
 * Deletes permissions for a role
 * @param {Array} permissions - Permissions to delete
 * @returns {Promise<Array>} Deletion results
 */
const deleteRolePermissions = async permissions =>
  Promise.all(
    permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({ id: permission.id })
    )
  );

/**
 * Creates permission entries for role
 * @param {Object} params - Parameters containing permissions structure
 * @param {number} roleId - Role ID
 * @returns {Array} Array of creation promises
 */
const createRolePermissions = (params, roleId) => {
  const promises = [];
  Object.keys(params.permissions || {}).forEach(type => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        promises.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...params.permissions[type].controllers[controller][action],
          })
        );
      });
    });
  });
  return promises;
};

/**
 * Adds users to role if provided
 * @param {Object} params - Parameters containing users
 * @param {number} roleId - Role ID
 * @returns {Array} Array of update promises
 */
const addUsersToRole = (params, roleId) => {
  const promises = [];
  if (params.users && params.users.length > 0) {
    promises.push(
      strapi.query('role', 'users-permissions').update({ id: roleId }, { users: params.users })
    );
  }
  return promises;
};

/**
 * Compares action with current state and creates update if different
 * @param {Object} bodyAction - Action from request body
 * @param {Object} currentAction - Current action state
 * @param {number} roleID - Role ID
 * @param {string} type - Permission type
 * @param {string} controller - Controller name
 * @param {string} action - Action name
 * @returns {Promise|null} Update promise or null
 */
const compareAndUpdateAction = (bodyAction, currentAction, roleID, type, controller, action) => {
  if (!_.isEqual(bodyAction, currentAction)) {
    return strapi.query('permission', 'users-permissions').update(
      {
        role: roleID,
        type,
        controller,
        action: action.toLowerCase(),
      },
      bodyAction
    );
  }
  return null;
};

/**
 * Processes permission updates for a role
 * @param {Object} body - Request body with permissions
 * @param {number} roleID - Role ID
 * @param {Object} role - Current role object
 * @returns {Array} Array of update promises
 */
const processPermissionUpdates = (body, roleID, role) => {
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
        const updatePromise = compareAndUpdateAction(
          bodyAction,
          currentAction,
          roleID,
          type,
          controller,
          action
        );
        if (updatePromise) {
          promises.push(updatePromise);
        }
      });
    });
  });
  return promises;
};

/**
 * Updates user roles based on differences
 * @param {Array} newUsers - Users to add to role
 * @param {Array} oldUsers - Users to remove from role
 * @param {number} roleID - Target role ID
 * @param {number} authenticatedRoleId - Authenticated role ID
 * @param {Object} service - Service context
 */
const updateUserRoles = async (newUsers, oldUsers, roleID, authenticatedRoleId, service) => {
  await Promise.all(newUsers.map(user => service.updateUserRole(user, roleID)));
  await Promise.all(oldUsers.map(user => service.updateUserRole(user, authenticatedRoleId)));
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = [
      ...createRolePermissions(params, role.id),
      ...addUsersToRole(params, role.id),
    ];

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = [
      ...(await moveUsersToRole(role.users, publicRoleID)),
      ...(await deleteRolePermissions(role.permissions)),
      strapi.query('role', 'users-permissions').delete({ id: roleID }),
    ];

    return await Promise.all(arrayOfPromises);
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
    const appControllers = buildAppControllers();
    const pluginsPermissions = buildPluginsPermissions();

    const permissions = {
      application: {
        controllers: appControllers.controllers,
      },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = groupPermissionsByType(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return enrichRolesWithUserCounts(roles);
  },

  async getRoutes() {
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = aggregatePluginRoutes(clonedPlugins);

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = createRolesMap(roles, primaryKey);

    const permissionsFoundInDB = await fetchDatabasePermissions(primaryKey);

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = buildPermissionStrings(actionsFoundInFiles, roles, primaryKey);

    await syncPermissions(permissionsFoundInDB, permissionsFoundInFiles, rolesMap);
  },

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

  async updateRole(roleID, body) {
    const [role, authenticated] = await Promise.all([
      this.getRole(roleID, []),
      strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
    ]);

    await strapi
      .query('role', 'users-permissions')
      .update({ id: roleID }, _.pick(body, ['name', 'description']));

    const permissionUpdates = processPermissionUpdates(body, roleID, role);
    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await updateUserRoles(newUsers, oldUsers, roleID, authenticated.id, this);
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};