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
 * Creates a permission object with enabled and policy fields.
 * @param {Object} permission - The permission object
 * @returns {Object} Permission object with enabled and policy
 */
const createPermissionObject = (permission) => {
  return {
    enabled: convertPermissionEnabled(permission.enabled),
    policy: permission.policy,
  };
};

/**
 * Sets permission in accumulator by path.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @returns {Object} The updated accumulator
 */
const setPermissionInAccumulator = (acc, permission) => {
  const path = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
  _.set(acc, path, createPermissionObject(permission));
  return acc;
};

/**
 * Adds plugin information to permission accumulator if applicable.
 * @param {Object} acc - The accumulator object
 * @param {Object} permission - The permission object
 * @param {Array} plugins - The plugins array
 * @returns {Object} The updated accumulator
 */
const addPluginInformation = (acc, permission, plugins) => {
  if (permission.type !== 'application' && !acc[permission.type].information) {
    acc[permission.type].information =
      plugins.find(plugin => plugin.id === permission.type) || {};
  }
  return acc;
};

/**
 * Reduces role permissions into a structured object.
 * @param {Array} rolePermissions - Array of permission objects
 * @param {Array} plugins - Array of plugin objects
 * @returns {Object} Structured permissions object
 */
const groupPermissionsByType = (rolePermissions, plugins) => {
  return rolePermissions.reduce((acc, permission) => {
    setPermissionInAccumulator(acc, permission);
    addPluginInformation(acc, permission, plugins);
    return acc;
  }, {});
};

/**
 * Creates permission entries from nested permission structure.
 * @param {Object} permissions - Nested permissions object
 * @param {number} roleId - The role ID
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
 * Adds user role update promises to array.
 * @param {Array} promises - The promises array
 * @param {Array} users - Array of user objects
 * @param {number} roleId - The role ID
 */
const addUserRoleUpdatePromises = (promises, users, roleId) => {
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
 * @param {number} targetRoleId - The target role ID
 * @returns {Array} Array of update promises
 */
const createUserMovePromises = (users, targetRoleId) => {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: targetRoleId }
    )
  );
};

/**
 * Creates promises to delete permissions.
 * @param {Array} permissions - Array of permission objects
 * @returns {Array} Array of delete promises
 */
const createPermissionDeletePromises = (permissions) => {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

/**
 * Generates action objects for a controller.
 * @param {Object} data - The controller data
 * @returns {Object} Object with action keys and enabled/policy values
 */
const generateActions = (data) =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
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
 * Aggregates application actions.
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
 * Aggregates plugin actions.
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
 * Splits permission string into components.
 * @param {string} str - Permission string in format "type.controller.action.roleId"
 * @returns {Object} Object with type, controller, action, roleId
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
const createPermissionObjectsForDB = (permissions, rolesMap) => {
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
 * Executes permission additions to database.
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Promise} Promise resolving when all additions complete
 */
const executePermissionAdditions = (toAdd, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');
  const permissionObjects = createPermissionObjectsForDB(toAdd, rolesMap);
  return Promise.all(
    permissionObjects.map(permission => query.create(permission))
  );
};

/**
 * Executes permission removals from database.
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise} Promise resolving when all removals complete
 */
const executePermissionRemovals = (toRemove) => {
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
 * @param {Array} permissionsFoundInDB - Permissions in database
 * @param {Array} permissionsFoundInFiles - Permissions in files
 * @param {Object} rolesMap - Map of role IDs to role objects
 * @returns {Promise} Promise resolving when updates complete
 */
const processPermissionDifferences = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

    await executePermissionAdditions(toAdd, rolesMap);
    await executePermissionRemovals(toRemove);
  }
};

/**
 * Collects all action strings from application and plugins.
 * @returns {Array} Combined array of all actions
 */
const collectAllActions = () => {
  const appActions = aggregateAppActions();
  const pluginsActions = aggregatePluginActions();
  return appActions.concat(pluginsActions);
};

/**
 * Generates permission strings for all roles and actions.
 * @param {Array} actions - Array of action strings
 * @param {Array} roles - Array of role objects
 * @param {string} primaryKey - The primary key field name
 * @returns {Array} Array of unique permission strings
 */
const generatePermissionStringsForRoles = (actions, roles, primaryKey) => {
  const permissions = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissions);
};

/**
 * Generates permission strings from database records.
 * @param {Array} dbPermissions - Array of permission records
 * @param {string} primaryKey - The primary key field name
 * @returns {Array} Array of unique permission strings
 */
const generatePermissionStringsFromDB = (dbPermissions, primaryKey) => {
  const permissions = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissions);
};

/**
 * Builds role map from roles array.
 * @param {Array} roles - Array of role objects
 * @param {string} primaryKey - The primary key field name
 * @returns {Object} Map of role IDs to role objects
 */
const buildRolesMap = (roles, primaryKey) => {
  return roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
};

/**
 * Compares body action with current action and creates update promise if different.
 * @param {Object} bodyAction - Action from request body
 * @param {Object} currentAction - Current action from role
 * @param {number} roleID - The role ID
 * @param {string} type - Permission type
 * @param {string} controller - Controller name
 * @param {string} action - Action name
 * @returns {Promise|null} Update promise or null if no change
 */
const createActionUpdatePromiseIfChanged = (bodyAction, currentAction, roleID, type, controller, action) => {
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
 * Collects permission update promises from body permissions.
 * @param {Object} bodyPermissions - Permissions from request body
 * @param {Object} rolePermissions - Current role permissions
 * @param {number} roleID - The role ID
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
        const promise = createActionUpdatePromiseIfChanged(bodyAction, currentAction, roleID, type, controller, action);
        if (promise) {
          promises.push(promise);
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

    const arrayOfPromises = createPermissionPromises(params.permissions, role.id);
    addUserRoleUpdatePromises(arrayOfPromises, params.users, role.id);

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = createUserMovePromises(role.users, publicRoleID);
    arrayOfPromises.push(...createPermissionDeletePromises(role.permissions));
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
    const rolesMap = buildRolesMap(roles, primaryKey);

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    const permissionsFoundInDB = generatePermissionStringsFromDB(dbPermissions, primaryKey);

    const actionsFoundInFiles = collectAllActions();
    const permissionsFoundInFiles = generatePermissionStringsForRoles(actionsFoundInFiles, roles, primaryKey);

    await processPermissionDifferences(permissionsFoundInDB, permissionsFoundInFiles, rolesMap);
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

    const updatePromises = collectPermissionUpdatePromises(body.permissions, role.permissions, roleID);
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