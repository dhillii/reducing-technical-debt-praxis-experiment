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
 * Builds an array of promises to create permissions for a role.
 * @param {Object} role - The role object.
 * @param {Object} permissions - Permissions structure.
 * @returns {Array} Array of promises.
 */
const buildPermissionCreationPromises = (role, permissions) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    const controllers = permissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        promises.push(
          strapi
            .query('permission', 'users-permissions')
            .create({
              role: role.id,
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
 * Builds an array of promises to update role users.
 * @param {Object} role - The role object.
 * @param {Array} users - Array of user objects.
 * @returns {Array} Array of promises.
 */
const buildUserUpdatePromises = (role, users) => {
  if (!users || users.length === 0) return [];
  return [
    strapi
      .query('role', 'users-permissions')
      .update({ id: role.id }, { users }),
  ];
};

/**
 * Groups permissions by type and controller/action.
 * @param {Array} permissions - Array of permission objects.
 * @param {Array} plugins - Array of plugin objects.
 * @returns {Object} Grouped permissions.
 */
const groupPermissions = (permissions, plugins) => {
  const grouped = permissions.reduce((acc, permission) => {
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
  return grouped;
};

/**
 * Builds an array of promises to delete permissions.
 * @param {Array} permissions - Array of permission objects.
 * @returns {Array} Array of promises.
 */
const buildPermissionDeletionPromises = permissions => {
  return permissions.map(permission =>
    strapi
      .query('permission', 'users-permissions')
      .delete({ id: permission.id })
  );
};

/**
 * Builds an array of promises to move users to a new role.
 * @param {Array} users - Array of user objects.
 * @param {Number} newRoleId - ID of the new role.
 * @returns {Array} Array of promises.
 */
const buildUserMovePromises = (users, newRoleId) => {
  return users.map(user =>
    strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { role: newRoleId })
  );
};

/**
 * Builds an array of promises to update role permissions.
 * @param {Object} role - Role object.
 * @param {Object} bodyPermissions - Permissions from request body.
 * @returns {Array} Array of promises.
 */
const buildPermissionUpdatePromises = (role, bodyPermissions) => {
  const promises = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    const controllers = bodyPermissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        const bodyAction = actions[action];
        const currentAction = _.get(
          role.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          promises.push(
            strapi
              .query('permission', 'users-permissions')
              .update(
                {
                  role: role.id,
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
 * Builds an array of promises to update user roles.
 * @param {Array} users - Array of user objects.
 * @param {Number} roleId - Role ID to assign.
 * @returns {Array} Array of promises.
 */
const buildUserRoleUpdatePromises = (users, roleId) => {
  return users.map(user =>
    strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { role: roleId })
  );
};

/**
 * Generates actions for a controller object.
 * @param {Object} controller - Controller object.
 * @returns {Object} Actions map.
 */
const generateActions = controller => {
  return Object.keys(controller).reduce((acc, key) => {
    if (_.isFunction(controller[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
};

/**
 * Builds application permissions structure.
 * @returns {Object} Application permissions.
 */
const buildAppPermissions = () => {
  const appControllers = Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });

  return {
    application: {
      controllers: appControllers.controllers,
    },
  };
};

/**
 * Builds plugin permissions structure.
 * @returns {Object} Plugin permissions.
 */
const buildPluginPermissions = () => {
  const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
  return pluginsPermissions;
};

/**
 * Builds application routes array.
 * @returns {Array} Routes array.
 */
const buildAppRoutes = () => {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
};

/**
 * Builds plugin routes structure.
 * @returns {Object} Plugin routes.
 */
const buildPluginRoutes = () => {
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
  return pluginsRoutes;
};

/**
 * Builds application actions array.
 * @returns {Array} Actions array.
 */
const buildAppActions = () => {
  const actions = [];
  Object.keys(strapi.api || {}).forEach(api => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const controllerActions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      actions.push(...controllerActions);
    });
  });
  return actions;
};

/**
 * Builds plugin actions array.
 * @returns {Array} Actions array.
 */
const buildPluginActions = () => {
  const actions = [];
  Object.keys(strapi.plugins).forEach(plugin => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const controllerActions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      actions.push(...controllerActions);
    });
  });
  return actions;
};

/**
 * Splits a permission string into its components.
 * @param {String} str - Permission string.
 * @returns {Object} Components.
 */
const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = buildPermissionCreationPromises(role, params.permissions);
    const userPromises = buildUserUpdatePromises(role, params.users);

    return await Promise.all([...permissionPromises, ...userPromises]);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const moveUserPromises = buildUserMovePromises(role.users, publicRoleID);
    const deletePermissionPromises = buildPermissionDeletionPromises(role.permissions);
    const deleteRolePromise = strapi
      .query('role', 'users-permissions')
      .delete({ id: roleID });

    return await Promise.all([...moveUserPromises, ...deletePermissionPromises, deleteRolePromise]);
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
    const appPermissions = buildAppPermissions();
    const pluginPermissions = buildPluginPermissions();
    return _.merge(appPermissions, pluginPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = groupPermissions(role.permissions, plugins);

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
    const routes = buildAppRoutes();
    const pluginsRoutes = buildPluginRoutes();
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

    const appActions = buildAppActions();
    const pluginsActions = buildPluginActions();
    const actionsFoundInFiles = [...appActions, ...pluginsActions];

    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce((acc, action) => {
        return acc.concat(roles.map(role => `${action}.${role[primaryKey]}`));
      }, [])
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

      const query = strapi.query('permission', 'users-permissions');

      await Promise.all(
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

      await Promise.all(
        toRemove.map(permission => {
          const { type, controller, action, roleId: role } = permission;
          return query.delete({ type, controller, action, role });
        })
      );
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

    const permissionPromises = buildPermissionUpdatePromises(role, body.permissions || {});

    await Promise.all(permissionPromises);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await Promise.all([
      ...buildUserRoleUpdatePromises(newUsers, roleID),
      ...buildUserRoleUpdatePromises(oldUsers, authenticated.id),
    ]);
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};