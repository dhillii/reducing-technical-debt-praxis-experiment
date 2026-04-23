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
 * Build permission creation promises for a role.
 * @param {Object} params - Role creation parameters.
 * @param {Number} roleId - ID of the created role.
 * @returns {Array<Promise>}
 */
const buildPermissionPromises = (params, roleId) => {
  const promises = [];

  Object.keys(params.permissions || {}).forEach(type => {
    const controllers = params.permissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        promises.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...actions[action],
          })
        );
      });
    });
  });

  return promises;
};

/**
 * Create relation between role and users.
 * @param {Number} roleId - Role ID.
 * @param {Array} users - Array of user objects.
 * @returns {Promise}
 */
const createRoleUsersRelation = (roleId, users) =>
  strapi.query('role', 'users-permissions').update(
    { id: roleId },
    { users }
  );

/**
 * Build promises to move users to public role.
 * @param {Object} role - Role object with users.
 * @param {Number} publicRoleID - ID of the public role.
 * @returns {Array<Promise>}
 */
const buildUserMovePromises = (role, publicRoleID) =>
  role.users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleID }
    )
  );

/**
 * Build promises to delete permissions of a role.
 * @param {Object} role - Role object with permissions.
 * @returns {Array<Promise>}
 */
const buildPermissionDeletePromises = role =>
  role.permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );

/**
 * Generate actions object for a controller.
 * @param {Object} controller - Controller object.
 * @returns {Object}
 */
const generateActions = controller =>
  Object.keys(controller).reduce((acc, key) => {
    if (_.isFunction(controller[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Retrieve application controllers with actions.
 * @returns {Object}
 */
const getAppControllers = () => {
  const controllers = {};

  Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .forEach(key => {
      const apiControllers = strapi.api[key].controllers;
      Object.keys(apiControllers).forEach(controller => {
        controllers[controller] = generateActions(apiControllers[controller]);
      });
    });

  return { controllers };
};

/**
 * Retrieve plugin controllers with actions.
 * @returns {Object}
 */
const getPluginControllers = () => {
  const plugins = {};

  Object.keys(strapi.plugins).forEach(pluginKey => {
    const pluginControllers = strapi.plugins[pluginKey].controllers || {};
    const controllers = {};

    Object.keys(pluginControllers).forEach(controller => {
      controllers[controller] = generateActions(pluginControllers[controller]);
    });

    plugins[pluginKey] = { controllers };
  });

  return plugins;
};

/**
 * Aggregate all actions from application and plugins.
 * @returns {Array<string>}
 */
const aggregateAllActions = () => {
  const actions = [];

  // Application actions
  Object.keys(strapi.api || {}).forEach(apiKey => {
    const apiControllers = strapi.api[apiKey].controllers || {};
    Object.keys(apiControllers).forEach(controller => {
      const controllerActions = Object.keys(apiControllers[controller]).filter(action =>
        _.isFunction(apiControllers[controller][action])
      );
      controllerActions.forEach(action => {
        actions.push(`application.${controller}.${action.toLowerCase()}`);
      });
    });
  });

  // Plugin actions
  Object.keys(strapi.plugins).forEach(pluginKey => {
    const pluginControllers = strapi.plugins[pluginKey].controllers || {};
    Object.keys(pluginControllers).forEach(controller => {
      const controllerActions = Object.keys(pluginControllers[controller]).filter(action =>
        _.isFunction(pluginControllers[controller][action])
      );
      controllerActions.forEach(action => {
        actions.push(`${pluginKey}.${controller}.${action.toLowerCase()}`);
      });
    });
  });

  return actions;
};

/**
 * Build permission strings from actions and roles.
 * @param {Array<string>} actions - Array of action strings.
 * @param {Array<Object>} roles - Array of role objects.
 * @returns {Array<string>}
 */
const buildPermissionStrings = (actions, roles) =>
  actions.reduce((acc, action) => {
    const rolePermissions = roles.map(role => `${action}.${role.id}`);
    return acc.concat(rolePermissions);
  }, []);

/**
 * Compare permission sets and return differences.
 * @param {Array<string>} dbPermissions - Permissions in DB.
 * @param {Array<string>} filePermissions - Permissions from files.
 * @returns {Object} { toAdd, toRemove }
 */
const comparePermissionSets = (dbPermissions, filePermissions) => {
  const toAdd = _.difference(filePermissions, dbPermissions).map(splitPermission);
  const toRemove = _.difference(dbPermissions, filePermissions).map(splitPermission);
  return { toAdd, toRemove };
};

/**
 * Split permission string into components.
 * @param {string} str - Permission string.
 * @returns {Object}
 */
const splitPermission = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Create permissions in DB.
 * @param {Array<Object>} toAdd - Array of permission objects.
 * @param {Object} rolesMap - Map of role ID to role object.
 * @returns {Array<Promise>}
 */
const createPermissions = (toAdd, rolesMap) => {
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
 * Delete permissions from DB.
 * @param {Array<Object>} toRemove - Array of permission objects.
 * @returns {Array<Promise>}
 */
const deletePermissions = toRemove =>
  toRemove.map(permission => {
    const { type, controller, action, roleId: role } = permission;
    return strapi.query('permission', 'users-permissions').delete({ type, controller, action, role });
  });

/**
 * Update role permissions based on body.
 * @param {Object} bodyPermissions - Permissions from request body.
 * @param {Object} rolePermissions - Current role permissions.
 * @returns {Array<Promise>}
 */
const updateRolePermissions = (bodyPermissions, rolePermissions) => {
  const promises = [];

  Object.keys(bodyPermissions || {}).forEach(type => {
    const controllers = bodyPermissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        const bodyAction = actions[action];
        const currentAction = _.get(
          rolePermissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          promises.push(
            strapi.query('permission', 'users-permissions').update(
              {
                role: rolePermissions.id,
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
 * Update role users based on new and old user lists.
 * @param {Array} newUsers - Users to add.
 * @param {Array} oldUsers - Users to remove.
 * @param {Number} roleID - Role ID to assign.
 * @param {Number} authenticatedID - Authenticated role ID.
 * @returns {Array<Promise>}
 */
const updateRoleUsers = (newUsers, oldUsers, roleID, authenticatedID) => {
  const addPromises = newUsers.map(user => updateUserRole(user, roleID));
  const removePromises = oldUsers.map(user => updateUserRole(user, authenticatedID));
  return addPromises.concat(removePromises);
};

/**
 * Update user role.
 * @param {Object} user - User object.
 * @param {Number} role - Role ID.
 * @returns {Promise}
 */
const updateUserRole = (user, role) =>
  strapi.query('user', 'users-permissions').update({ id: user.id }, { role });

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = buildPermissionPromises(params, role.id);

    if (params.users && params.users.length > 0) {
      permissionPromises.push(createRoleUsersRelation(role.id, params.users));
    }

    return await Promise.all(permissionPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const promises = [
      ...buildUserMovePromises(role, publicRoleID),
      ...buildPermissionDeletePromises(role),
      strapi.query('role', 'users-permissions').delete({ id: roleID }),
    ];

    return await Promise.all(promises);
  },

  async getPlugins(lang = 'en') {
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
    const appControllers = getAppControllers();
    const pluginControllers = getPluginControllers();

    const permissions = {
      application: {
        controllers: appControllers.controllers,
      },
    };

    return _.merge(permissions, pluginControllers);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = role.permissions.reduce((acc, permission) => {
      _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
        enabled: Boolean(_.toNumber(permission.enabled)),
        policy: permission.policy,
      });

      if (permission.type !== 'application' && !acc[permission.type].information) {
        acc[permission.type].information =
          plugins.find(plugin => plugin.id === permission.type) || {};
      }

      return acc;
    }, {});

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
      const pluginRoutes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce(
        (routeAcc, curr) => {
          const prefix = curr.config.prefix;
          const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
          _.set(curr, 'path', path);
          return routeAcc.concat(curr);
        },
        []
      );

      acc[current] = pluginRoutes;
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

    const permissionsFoundInDB = _.uniq(
      dbPermissions.map(
        p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
      )
    );

    const actionsFoundInFiles = aggregateAllActions();

    const permissionsFoundInFiles = buildPermissionStrings(actionsFoundInFiles, roles);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const { toAdd, toRemove } = comparePermissionSets(
        permissionsFoundInDB,
        permissionsFoundInFiles
      );

      const query = strapi.query('permission', 'users-permissions');

      await Promise.all(createPermissions(toAdd, rolesMap));
      await Promise.all(deletePermissions(toRemove));
    }
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

    const permissionPromises = updateRolePermissions(body.permissions, role);

    await Promise.all(permissionPromises);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    const userPromises = updateRoleUsers(newUsers, oldUsers, roleID, authenticated.id);
    await Promise.all(userPromises);
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};