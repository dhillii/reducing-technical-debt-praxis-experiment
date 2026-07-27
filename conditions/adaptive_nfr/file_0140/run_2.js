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
 * Converts permission enabled value to boolean.
 * @param {*} enabled - The enabled value to convert
 * @returns {boolean} True if enabled is truthy, false otherwise
 */
const convertPermissionEnabled = (enabled) => {
  return _.toNumber(enabled) !== 0;
};

/**
 * Creates permission entry for role permissions structure.
 * @param {Object} permission - The permission object
 * @returns {Object} Permission entry with enabled and policy
 */
const createPermissionEntry = (permission) => {
  return {
    enabled: convertPermissionEnabled(permission.enabled),
    policy: permission.policy,
  };
};

/**
 * Sets permission in accumulator with path structure.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @returns {Object} Updated accumulator
 */
const setPermissionInAccumulator = (acc, permission) => {
  const path = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
  _.set(acc, path, createPermissionEntry(permission));
  return acc;
};

/**
 * Adds plugin information to permission structure if applicable.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @param {Array} plugins - Available plugins
 * @returns {Object} Updated accumulator
 */
const addPluginInformation = (acc, permission, plugins) => {
  if (permission.type !== 'application' && !acc[permission.type].information) {
    acc[permission.type].information =
      plugins.find(plugin => plugin.id === permission.type) || {};
  }
  return acc;
};

/**
 * Processes a single permission and updates accumulator.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @param {Array} plugins - Available plugins
 * @returns {Object} Updated accumulator
 */
const processPermission = (acc, permission, plugins) => {
  setPermissionInAccumulator(acc, permission);
  addPluginInformation(acc, permission, plugins);
  return acc;
};

/**
 * Groups role permissions by type and controller.
 * @param {Array} rolePermissions - Array of permission objects
 * @param {Array} plugins - Available plugins
 * @returns {Object} Grouped permissions structure
 */
const groupPermissionsByType = (rolePermissions, plugins) => {
  return rolePermissions.reduce((acc, permission) => {
    return processPermission(acc, permission, plugins);
  }, {});
};

/**
 * Creates permission creation promises for role.
 * @param {number} roleId - The role ID
 * @param {Object} permissions - Permissions structure
 * @returns {Array} Array of promises
 */
const createPermissionPromises = (roleId, permissions) => {
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
 * Creates user role update promises.
 * @param {Array} users - Array of user objects
 * @param {number} roleId - The role ID
 * @returns {Array} Array of promises
 */
const createUserUpdatePromises = (users, roleId) => {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: roleId }
    )
  );
};

/**
 * Creates permission deletion promises.
 * @param {Array} permissions - Array of permission objects
 * @returns {Array} Array of promises
 */
const createPermissionDeletionPromises = (permissions) => {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

/**
 * Aggregates actions from API controllers.
 * @returns {Array} Array of action strings
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
 * Aggregates actions from plugin controllers.
 * @returns {Array} Array of action strings
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
 * Generates action objects for controllers.
 * @param {Object} data - Controller data
 * @returns {Object} Action objects with enabled and policy
 */
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }

    return acc;
  }, {});

/**
 * Builds application controllers structure.
 * @returns {Object} Application controllers with actions
 */
const buildAppControllers = () => {
  return Object.keys(strapi.api || {})
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
};

/**
 * Builds plugin permissions structure.
 * @returns {Object} Plugin permissions with actions
 */
const buildPluginPermissions = () => {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);

      return obj;
    }, initialState);

    return acc;
  }, {});
};

/**
 * Splits permission string into components.
 * @param {string} str - Permission string in format "type.controller.action.roleId"
 * @returns {Object} Parsed permission object
 */
const splitPermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Creates permission objects for database insertion.
 * @param {Array} permissions - Array of parsed permission objects
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Array} Array of permission objects ready for creation
 */
const createPermissionObjects = (permissions, rolesMap) => {
  return permissions.map(permission => ({
    type: permission.type,
    controller: permission.controller,
    action: permission.action,
    enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
    policy: '',
    role: permission.roleId,
  }));
};

/**
 * Processes permissions to add to database.
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Promise} Promise resolving when all permissions are created
 */
const processPermissionsToAdd = (toAdd, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');
  const permissionObjects = createPermissionObjects(toAdd, rolesMap);

  return Promise.all(
    permissionObjects.map(permission => query.create(permission))
  );
};

/**
 * Processes permissions to remove from database.
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise} Promise resolving when all permissions are deleted
 */
const processPermissionsToRemove = (toRemove) => {
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
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Promise} Promise resolving when sync is complete
 */
const syncPermissions = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

    await processPermissionsToAdd(toAdd, rolesMap);
    await processPermissionsToRemove(toRemove);
  }
};

/**
 * Builds permission strings from actions and roles.
 * @param {Array} actionsFoundInFiles - Actions found in files
 * @param {Array} roles - Array of role objects
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Array of unique permission strings
 */
const buildPermissionStrings = (actionsFoundInFiles, roles, primaryKey) => {
  let permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissionsFoundInFiles);
};

/**
 * Builds permission strings from database permissions.
 * @param {Array} dbPermissions - Permissions from database
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Array of unique permission strings
 */
const buildDBPermissionStrings = (dbPermissions, primaryKey) => {
  let permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissionsFoundInDB);
};

/**
 * Finds changed permissions between body and current role.
 * @param {Object} bodyPermissions - Permissions from request body
 * @param {Object} rolePermissions - Current role permissions
 * @param {number} roleID - Role ID
 * @returns {Array} Array of update promises
 */
const findChangedPermissions = (bodyPermissions, rolePermissions, roleID) => {
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

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = createPermissionPromises(role.id, params.permissions);

    // Use Content Manager business logic to handle relation.
    if (params.users && params.users.length > 0)
      arrayOfPromises.push(
        strapi.query('role', 'users-permissions').update(
          {
            id: role.id,
          },
          { users: params.users }
        )
      );

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    // Move users to guest role.
    const arrayOfPromises = createUserUpdatePromises(role.users, publicRoleID);

    // Remove permissions related to this role.
    arrayOfPromises.push(...createPermissionDeletionPromises(role.permissions));

    // Delete the role.
    arrayOfPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));

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
    const pluginsPermissions = buildPluginPermissions();

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

    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await strapi
        .query('user', 'users-permissions')
        .count({ role: roles[i].id });
    }

    return roles;
  },

  async getRoutes() {
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);
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

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    const permissionsFoundInDB = buildDBPermissionStrings(dbPermissions, primaryKey);

    // Aggregate first level actions.
    const appActions = aggregateAppActions();

    // Aggregate plugins' actions.
    const pluginsActions = aggregatePluginActions();

    const actionsFoundInFiles = appActions.concat(pluginsActions);

    // create permissions for each role
    const permissionsFoundInFiles = buildPermissionStrings(actionsFoundInFiles, roles, primaryKey);

    // Compare to know if actions have been added or removed from controllers.
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

    const permissionUpdates = findChangedPermissions(body.permissions, role.permissions, roleID);
    await Promise.all(permissionUpdates);

    // Add user to this role.
    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => this.updateUserRole(user, authenticated.id)));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};