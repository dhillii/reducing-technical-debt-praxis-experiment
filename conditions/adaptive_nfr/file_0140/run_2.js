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
 */
const normalizeRoleType = (params) => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }
};

/**
 * Creates permission entries for a role from nested permission structure.
 * @param {number} roleId - The role ID
 * @param {Object} permissions - Nested permissions object
 * @returns {Array} Array of permission creation promises
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
 * Creates user role assignment promises.
 * @param {Array} users - Array of users to assign
 * @param {number} roleId - The role ID
 * @returns {Array} Array of role update promises
 */
const createUserRolePromises = (users, roleId) => {
  return users.map(user =>
    strapi.query('role', 'users-permissions').update(
      { id: roleId },
      { users }
    )
  );
};

/**
 * Moves users from one role to another.
 * @param {Array} users - Users to move
 * @param {number} targetRoleId - Target role ID
 * @returns {Array} Array of user update promises
 */
const createMoveUsersPromises = (users, targetRoleId) => {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: targetRoleId }
    )
  );
};

/**
 * Creates permission deletion promises.
 * @param {Array} permissions - Permissions to delete
 * @returns {Array} Array of deletion promises
 */
const createDeletePermissionPromises = (permissions) => {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

/**
 * Generates action map for controllers.
 * @param {Object} data - Controller data
 * @returns {Object} Action map with enabled and policy properties
 */
const generateActions = (data) => {
  return Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
};

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
 * @returns {Object} Plugin permissions by plugin key
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
 * @param {Array} roles - Array of roles
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
 * Aggregates application controller actions.
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
 * Aggregates plugin controller actions.
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
 * @returns {Array} Array of creation promises
 */
const createAddPermissionPromises = (toAdd, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');
  return toAdd.map(permission =>
    query.create({
      type: permission.type,
      controller: permission.controller,
      action: permission.action,
      enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
      policy: '',
      role: permission.roleId,
    })
  );
};

/**
 * Creates permission deletion entries for removed permissions.
 * @param {Array} toRemove - Permissions to remove
 * @returns {Array} Array of deletion promises
 */
const createRemovePermissionPromises = (toRemove) => {
  const query = strapi.query('permission', 'users-permissions');
  return toRemove.map(permission => {
    const { type, controller, action, roleId: role } = permission;
    return query.delete({ type, controller, action, role });
  });
};

/**
 * Processes permission differences and updates database.
 * @param {Array} permissionsFoundInDB - Permissions in database
 * @param {Array} permissionsFoundInFiles - Permissions in files
 * @param {Object} rolesMap - Map of roles by ID
 */
const processDifferences = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    return;
  }

  const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
  const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

  await Promise.all(createAddPermissionPromises(toAdd, rolesMap));
  await Promise.all(createRemovePermissionPromises(toRemove));
};

/**
 * Builds database permission strings.
 * @param {Array} dbPermissions - Permissions from database
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission strings
 */
const buildDBPermissionStrings = (dbPermissions, primaryKey) => {
  const permissions = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissions);
};

/**
 * Collects permission update promises for changed permissions.
 * @param {Object} bodyPermissions - New permissions from request
 * @param {Object} rolePermissions - Current role permissions
 * @param {number} roleID - Role ID
 * @returns {Array} Array of update promises
 */
const collectPermissionUpdates = (bodyPermissions, rolePermissions, roleID) => {
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
 * Processes user role changes.
 * @param {Array} newUsers - Users to add to role
 * @param {Array} oldUsers - Users to remove from role
 * @param {number} roleID - Target role ID
 * @param {number} authenticatedRoleId - Authenticated role ID
 * @param {Function} updateUserRole - Function to update user role
 */
const processUserRoleChanges = async (newUsers, oldUsers, roleID, authenticatedRoleId, updateUserRole) => {
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticatedRoleId)));
};

module.exports = {
  async createRole(params) {
    normalizeRoleType(params);

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = createPermissionPromises(role.id, params.permissions);

    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(
        strapi.query('role', 'users-permissions').update(
          { id: role.id },
          { users: params.users }
        )
      );
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

    const arrayOfPromises = createMoveUsersPromises(role.users, publicRoleID);
    arrayOfPromises.push(...createDeletePermissionPromises(role.permissions));
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
    return enrichRolesWithUserCounts(roles);
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

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = buildPermissionStrings(actionsFoundInFiles, roles, primaryKey);

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

    const permissionUpdates = collectPermissionUpdates(body.permissions, role.permissions, roleID);
    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await processUserRoleChanges(newUsers, oldUsers, roleID, authenticated.id, this.updateUserRole.bind(this));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};