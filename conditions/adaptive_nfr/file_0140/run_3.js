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
 * Normalizes role type value to boolean.
 * @param {*} value - Value to normalize
 * @returns {boolean} Normalized boolean value
 */
const normalizeEnabledValue = value => _.toNumber(value) === 1;

/**
 * Sets permission information from plugins if applicable.
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
 * Processes a single permission and adds it to accumulator.
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
 * Builds permission structure from role permissions.
 * @param {Array} rolePermissions - Permissions from role
 * @param {Array} plugins - Available plugins
 * @returns {Object} Structured permissions
 */
const buildPermissionsStructure = (rolePermissions, plugins) =>
  rolePermissions.reduce((acc, permission) => processPermission(acc, permission, plugins), {});

/**
 * Creates permission entries for a role.
 * @param {number} roleId - Role ID
 * @param {Object} permissions - Permissions object
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
 * Updates user role associations.
 * @param {number} roleId - Role ID
 * @param {Array} users - Users to associate
 * @returns {Promise} Update promise
 */
const updateRoleUsers = (roleId, users) =>
  strapi.query('role', 'users-permissions').update({ id: roleId }, { users });

/**
 * Moves users from one role to another.
 * @param {Array} users - Users to move
 * @param {number} targetRoleId - Target role ID
 * @returns {Array} Array of update promises
 */
const moveUsersToRole = (users, targetRoleId) =>
  users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
  );

/**
 * Deletes permissions for a role.
 * @param {Array} permissions - Permissions to delete
 * @returns {Array} Array of delete promises
 */
const deleteRolePermissions = permissions =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );

/**
 * Extracts type, controller, action, and roleId from permission string.
 * @param {string} str - Permission string in format "type.controller.action.roleId"
 * @returns {Object} Parsed permission object
 */
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Aggregates actions from application controllers.
 * @returns {Array} Array of action strings
 */
const aggregateAppActions = () => {
  const actions = [];
  Object.keys(strapi.api || {}).forEach(api => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .forEach(action => {
          actions.push(`application.${controller}.${action.toLowerCase()}`);
        });
    });
  });
  return actions;
};

/**
 * Aggregates actions from plugin controllers.
 * @returns {Array} Array of action strings
 */
const aggregatePluginActions = () => {
  const actions = [];
  Object.keys(strapi.plugins).forEach(plugin => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .forEach(action => {
          actions.push(`${plugin}.${controller}.${action.toLowerCase()}`);
        });
    });
  });
  return actions;
};

/**
 * Builds permission strings for all roles.
 * @param {Array} actions - Action strings
 * @param {Array} roles - Role objects
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const buildPermissionStrings = (actions, roles, primaryKey) => {
  const permissions = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissions);
};

/**
 * Creates permission objects from database permissions.
 * @param {Array} dbPermissions - Permissions from database
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const buildDbPermissionStrings = (dbPermissions, primaryKey) => {
  const permissions = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissions);
};

/**
 * Creates new permissions in database.
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Map of role ID to role object
 * @returns {Promise} Promise resolving when all permissions created
 */
const createMissingPermissions = (toAdd, rolesMap) => {
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
 * Removes obsolete permissions from database.
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise} Promise resolving when all permissions deleted
 */
const removeObsoletePermissions = toRemove => {
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
 * @param {Object} rolesMap - Map of role ID to role object
 * @returns {Promise} Promise resolving when sync complete
 */
const syncPermissions = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    return;
  }

  const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
    parsePermissionString
  );
  const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
    parsePermissionString
  );

  await createMissingPermissions(toAdd, rolesMap);
  await removeObsoletePermissions(toRemove);
};

/**
 * Collects permission update promises for a role.
 * @param {Object} bodyPermissions - New permissions from request body
 * @param {Object} rolePermissions - Current role permissions
 * @param {number} roleId - Role ID
 * @returns {Array} Array of update promises
 */
const collectPermissionUpdates = (bodyPermissions, rolePermissions, roleId) => {
  const promises = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    Object.keys(bodyPermissions[type].controllers).forEach(controller => {
      Object.keys(bodyPermissions[type].controllers[controller]).forEach(action => {
        const bodyAction = bodyPermissions[type].controllers[controller][action];
        const currentAction = _.get(rolePermissions, `${type}.controllers.${controller}.${action}`, {});

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
 * Updates user associations for a role.
 * @param {number} roleId - Role ID
 * @param {Array} newUsers - Users to add to role
 * @param {Array} oldUsers - Users to remove from role
 * @param {number} authenticatedRoleId - Authenticated role ID
 * @returns {Promise} Promise resolving when updates complete
 */
const updateRoleUserAssociations = async (roleId, newUsers, oldUsers, authenticatedRoleId) => {
  const service = module.exports;
  await Promise.all(newUsers.map(user => service.updateUserRole(user, roleId)));
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

    const arrayOfPromises = createPermissionEntries(role.id, params.permissions);

    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(updateRoleUsers(role.id, params.users));
    }

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
    arrayOfPromises.push(...moveUsersToRole(role.users, publicRoleID));
    arrayOfPromises.push(...deleteRolePermissions(role.permissions));
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

    const permissions = buildPermissionsStructure(role.permissions, plugins);

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
    const permissionsFoundInDB = buildDbPermissionStrings(dbPermissions, primaryKey);

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

    const permissionUpdates = collectPermissionUpdates(body.permissions, role.permissions, roleID);
    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await updateRoleUserAssociations(roleID, newUsers, oldUsers, authenticated.id);
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};
```