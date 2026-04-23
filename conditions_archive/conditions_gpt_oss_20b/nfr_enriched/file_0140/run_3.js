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
 * Create permission promises for a role.
 *
 * @param {Object} params - Role creation parameters.
 * @param {Number} roleId - ID of the created role.
 * @returns {Array<Promise>}
 */
const createPermissionPromises = (params, roleId) => {
  const permissionQueries = [];
  const permissions = params.permissions || {};

  Object.keys(permissions).forEach(type => {
    const controllers = permissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        permissionQueries.push(
          strapi
            .query('permission', 'users-permissions')
            .create({
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

  return permissionQueries;
};

/**
 * Update role users relation.
 *
 * @param {Number} roleId - Role ID.
 * @param {Array<Object>} users - Users to associate.
 * @returns {Promise}
 */
const updateRoleUsers = (roleId, users) =>
  strapi
    .query('role', 'users-permissions')
    .update({ id: roleId }, { users });

/**
 * Delete role users by assigning them to the public role.
 *
 * @param {Object} role - Role object with users.
 * @param {Number} publicRoleId - Public role ID.
 * @returns {Array<Promise>}
 */
const deleteRoleUsers = (role, publicRoleId) =>
  role.users.map(user =>
    strapi
      .query('user', 'users-permissions')
      .update({ id: user.id }, { role: publicRoleId })
  );

/**
 * Delete permissions associated with a role.
 *
 * @param {Object} role - Role object with permissions.
 * @returns {Array<Promise>}
 */
const deleteRolePermissions = role =>
  role.permissions.map(permission =>
    strapi
      .query('permission', 'users-permissions')
      .delete({ id: permission.id })
  );

/**
 * Generate action map for a controller.
 *
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
 * Extract application controllers and actions.
 *
 * @returns {Object}
 */
const extractAppControllers = () => {
  const controllers = {};

  Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .forEach(key => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
    });

  return { controllers };
};

/**
 * Extract plugins permissions.
 *
 * @returns {Object}
 */
const extractPluginsPermissions = () => {
  const plugins = {};

  Object.keys(strapi.plugins).forEach(key => {
    const initialState = { controllers: {} };
    plugins[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
  });

  return plugins;
};

/**
 * Group permissions by type for a role.
 *
 * @param {Object} role - Role object.
 * @param {Array<Object>} plugins - Plugins array.
 * @returns {Object}
 */
const groupPermissionsByType = (role, plugins) => {
  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: !!_.toNumber(permission.enabled),
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

  return permissions;
};

/**
 * Extract application and plugin routes.
 *
 * @returns {Object}
 */
const extractRoutes = () => {
  const appRoutes = Object.keys(strapi.api || {}).reduce((acc, current) => {
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

  return _.merge({ application: appRoutes }, pluginsRoutes);
};

/**
 * Aggregate application actions.
 *
 * @returns {Array<string>}
 */
const aggregateAppActions = () => {
  const actions = [];

  Object.keys(strapi.api || {}).forEach(api => {
    const controllers = _.get(strapi.api[api], 'controllers', {});
    Object.keys(controllers).forEach(controller => {
      const controllerActions = Object.keys(controllers[controller]).filter(action =>
        _.isFunction(controllers[controller][action])
      );
      controllerActions.forEach(action => {
        actions.push(`application.${controller}.${action.toLowerCase()}`);
      });
    });
  });

  return actions;
};

/**
 * Aggregate plugin actions.
 *
 * @returns {Array<string>}
 */
const aggregatePluginActions = () => {
  const actions = [];

  Object.keys(strapi.plugins).forEach(plugin => {
    const controllers = strapi.plugins[plugin].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const controllerActions = Object.keys(controllers[controller]).filter(action =>
        _.isFunction(controllers[controller][action])
      );
      controllerActions.forEach(action => {
        actions.push(`${plugin}.${controller}.${action.toLowerCase()}`);
      });
    });
  });

  return actions;
};

/**
 * Build permission strings from actions and roles.
 *
 * @param {Array<string>} actions - Action strings.
 * @param {Array<Object>} roles - Roles array.
 * @returns {Array<string>}
 */
const buildPermissionsFromFiles = (actions, roles) =>
  actions.reduce((acc, action) => {
    const perms = roles.map(role => `${action}.${role.id}`);
    return acc.concat(perms);
  }, []);

/**
 * Compare DB permissions with file permissions.
 *
 * @param {Array<string>} dbPerms - Permissions in DB.
 * @param {Array<string>} filePerms - Permissions from files.
 * @returns {Object}
 */
const comparePermissions = (dbPerms, filePerms) => {
  const toRemove = _.difference(dbPerms, filePerms).map(str => {
    const [type, controller, action, roleId] = str.split('.');
    return { type, controller, action, roleId };
  });

  const toAdd = _.difference(filePerms, dbPerms).map(str => {
    const [type, controller, action, roleId] = str.split('.');
    return { type, controller, action, roleId };
  });

  return { toAdd, toRemove };
};

/**
 * Create permissions in DB.
 *
 * @param {Array<Object>} toAdd - Permissions to add.
 * @param {Object} rolesMap - Map of role ID to role object.
 * @returns {Array<Promise>}
 */
const createPermissions = (toAdd, rolesMap) =>
  toAdd.map(permission =>
    strapi
      .query('permission', 'users-permissions')
      .create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
        policy: '',
        role: permission.roleId,
      })
  );

/**
 * Delete permissions from DB.
 *
 * @param {Array<Object>} toRemove - Permissions to remove.
 * @returns {Array<Promise>}
 */
const deletePermissions = toRemove =>
  toRemove.map(permission => {
    const { type, controller, action, roleId: role } = permission;
    return strapi
      .query('permission', 'users-permissions')
      .delete({ type, controller, action, role });
  });

/**
 * Generate permission update promises for a role.
 *
 * @param {Object} body - Role update body.
 * @param {Object} role - Current role object.
 * @returns {Array<Promise>}
 */
const generatePermissionUpdatePromises = (body, role) => {
  const promises = [];

  Object.keys(body.permissions || {}).forEach(type => {
    const controllers = body.permissions[type].controllers || {};
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
 * Update user roles for a role change.
 *
 * @param {Array<Object>} newUsers - Users to add.
 * @param {Array<Object>} oldUsers - Users to remove.
 * @param {Number} roleID - New role ID.
 * @param {Number} authenticatedID - Authenticated role ID.
 * @returns {Array<Promise>}
 */
const updateUserRoles = (newUsers, oldUsers, roleID, authenticatedID) => {
  const addPromises = newUsers.map(user => updateUserRole(user, roleID));
  const removePromises = oldUsers.map(user => updateUserRole(user, authenticatedID));
  return addPromises.concat(removePromises);
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = createPermissionPromises(params, role.id);

    if (params.users && params.users.length > 0) {
      permissionPromises.push(updateRoleUsers(role.id, params.users));
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
      ...deleteRoleUsers(role, publicRoleID),
      ...deleteRolePermissions(role),
      strapi.query('role', 'users-permissions').delete({ id: roleID }),
    ];

    return await Promise.all(promises);
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
    const appControllers = extractAppControllers();
    const pluginsPermissions = extractPluginsPermissions();

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

    const permissions = groupPermissionsByType(role, plugins);

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
    return extractRoutes();
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

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = buildPermissionsFromFiles(actionsFoundInFiles, roles);
    const { toAdd, toRemove } = comparePermissions(permissionsFoundInDB, permissionsFoundInFiles);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const query = strapi.query('permission', 'users-permissions');

      await Promise.all(
        createPermissions(toAdd, rolesMap).map(p => query.create(p))
      );

      await Promise.all(deletePermissions(toRemove).map(p => query.delete(p)));
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

    const permissionPromises = generatePermissionUpdatePromises(body, role);
    await Promise.all(permissionPromises);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await Promise.all(updateUserRoles(newUsers, oldUsers, roleID, authenticated.id));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};