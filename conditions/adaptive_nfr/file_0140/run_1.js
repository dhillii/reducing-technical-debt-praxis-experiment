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
const isEnabledPermission = (enabled) => _.toNumber(enabled) !== 0;

/**
 * Creates permission object with enabled and policy fields.
 * @param {Object} permission - The permission object
 * @returns {Object} Permission object with enabled and policy
 */
const createPermissionObject = (permission) => ({
  enabled: isEnabledPermission(permission.enabled),
  policy: permission.policy,
});

/**
 * Sets permission in accumulator by type, controller, and action.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @returns {Object} Updated accumulator
 */
const setPermissionInAccumulator = (acc, permission) => {
  _.set(
    acc,
    `${permission.type}.controllers.${permission.controller}.${permission.action}`,
    createPermissionObject(permission)
  );
  return acc;
};

/**
 * Adds plugin information to permission if applicable.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @param {Array} plugins - The plugins array
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
 * Groups permissions by type, controller, and action.
 * @param {Array} rolePermissions - Array of permission objects
 * @param {Array} plugins - Array of plugin objects
 * @returns {Object} Grouped permissions object
 */
const groupPermissionsByType = (rolePermissions, plugins) => {
  return rolePermissions.reduce((acc, permission) => {
    setPermissionInAccumulator(acc, permission);
    addPluginInformation(acc, permission, plugins);
    return acc;
  }, {});
};

/**
 * Creates permission entries for a role from params.
 * @param {number} roleId - The role ID
 * @param {Object} permissions - The permissions object
 * @returns {Array} Array of promises for permission creation
 */
const createPermissionEntries = (roleId, permissions) => {
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
 * Adds user assignment promise if users are provided.
 * @param {Array} promises - Array of promises
 * @param {number} roleId - The role ID
 * @param {Array} users - Array of user objects
 */
const addUserAssignmentPromise = (promises, roleId, users) => {
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
 * Creates promises to move users to a different role.
 * @param {Array} users - Array of user objects
 * @param {number} newRoleId - The new role ID
 * @returns {Array} Array of update promises
 */
const createUserMigrationPromises = (users, newRoleId) => {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: newRoleId }
    )
  );
};

/**
 * Creates promises to delete permissions.
 * @param {Array} permissions - Array of permission objects
 * @returns {Array} Array of delete promises
 */
const createPermissionDeletionPromises = (permissions) => {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

/**
 * Generates action objects for a controller.
 * @param {Object} controller - The controller object
 * @returns {Object} Object with action names as keys and action objects as values
 */
const generateActions = (controller) =>
  Object.keys(controller).reduce((acc, key) => {
    if (_.isFunction(controller[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Builds application controllers permissions.
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
 * Builds plugin permissions.
 * @returns {Object} Plugins with their controllers and actions
 */
const buildPluginPermissions = () => {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
};

/**
 * Extracts actions from a controller.
 * @param {Object} controller - The controller object
 * @returns {Array} Array of action names that are functions
 */
const extractControllerActions = (controller) => {
  return Object.keys(controller).filter(action =>
    _.isFunction(controller[action])
  );
};

/**
 * Creates action strings for application controllers.
 * @returns {Array} Array of action strings in format 'application.controller.action'
 */
const createAppActionStrings = () => {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = extractControllerActions(strapi.api[api].controllers[controller])
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
};

/**
 * Creates action strings for plugin controllers.
 * @returns {Array} Array of action strings in format 'plugin.controller.action'
 */
const createPluginActionStrings = () => {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = extractControllerActions(strapi.plugins[plugin].controllers[controller])
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
};

/**
 * Splits permission string into components.
 * @param {string} str - Permission string in format 'type.controller.action.roleId'
 * @returns {Object} Object with type, controller, action, and roleId
 */
const splitPermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Creates permission objects for database insertion.
 * @param {Array} permissions - Array of permission objects
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Array} Array of permission objects ready for creation
 */
const createPermissionsForDB = (permissions, rolesMap) => {
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
 * Executes permission creation in database.
 * @param {Array} toAdd - Array of permissions to add
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Promise} Promise that resolves when all permissions are created
 */
const executePermissionCreation = (toAdd, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');
  const permissionsToCreate = createPermissionsForDB(toAdd, rolesMap);
  return Promise.all(
    permissionsToCreate.map(permission => query.create(permission))
  );
};

/**
 * Executes permission deletion in database.
 * @param {Array} toRemove - Array of permissions to remove
 * @returns {Promise} Promise that resolves when all permissions are deleted
 */
const executePermissionDeletion = (toRemove) => {
  const query = strapi.query('permission', 'users-permissions');
  return Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
};

/**
 * Processes permission differences and updates database.
 * @param {Array} permissionsFoundInDB - Permissions found in database
 * @param {Array} permissionsFoundInFiles - Permissions found in files
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Promise} Promise that resolves when updates are complete
 */
const processDifferences = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

    await executePermissionCreation(toAdd, rolesMap);
    await executePermissionDeletion(toRemove);
  }
};

/**
 * Compares body and current action for equality.
 * @param {Object} bodyAction - Action from request body
 * @param {Object} currentAction - Current action from role
 * @returns {boolean} True if actions are different
 */
const isActionDifferent = (bodyAction, currentAction) => {
  return !_.isEqual(bodyAction, currentAction);
};

/**
 * Creates update promise for a permission.
 * @param {number} roleId - The role ID
 * @param {string} type - The permission type
 * @param {string} controller - The controller name
 * @param {string} action - The action name
 * @param {Object} bodyAction - The action data
 * @returns {Promise} Update promise
 */
const createPermissionUpdatePromise = (roleId, type, controller, action, bodyAction) => {
  return strapi.query('permission', 'users-permissions').update(
    {
      role: roleId,
      type,
      controller,
      action: action.toLowerCase(),
    },
    bodyAction
  );
};

/**
 * Collects permission update promises from body.
 * @param {number} roleId - The role ID
 * @param {Object} bodyPermissions - Permissions from request body
 * @param {Object} rolePermissions - Current role permissions
 * @returns {Array} Array of update promises
 */
const collectPermissionUpdates = (roleId, bodyPermissions, rolePermissions) => {
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

        if (isActionDifferent(bodyAction, currentAction)) {
          promises.push(
            createPermissionUpdatePromise(roleId, type, controller, action, bodyAction)
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

    const arrayOfPromises = createPermissionEntries(role.id, params.permissions);
    addUserAssignmentPromise(arrayOfPromises, role.id, params.users);

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = createUserMigrationPromises(role.users, publicRoleID);
    arrayOfPromises.push(...createPermissionDeletionPromises(role.permissions));
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
    let permissionsFoundInDB = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    const appActions = createAppActionStrings();
    const pluginsActions = createPluginActionStrings();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    );
    permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

    await processDifferences(permissionsFoundInDB, permissionsFoundInFiles, rolesMap);
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

    const updatePromises = collectPermissionUpdates(roleID, body.permissions, role.permissions);
    await Promise.all(updatePromises);

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