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
 *
 * @param {Object} params - Role parameters.
 * @param {Number} roleId - Created role ID.
 * @returns {Array<Promise>}
 */
const buildPermissionPromises = (params, roleId) => {
  const promises = [];
  const permissions = params.permissions || {};

  Object.keys(permissions).forEach(type => {
    const controllers = permissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        promises.push(
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

  return promises;
};

/**
 * Update users for a role.
 *
 * @param {Number} roleId - Role ID.
 * @param {Array<Object>} users - Users to assign.
 * @returns {Promise}
 */
const updateRoleUsers = (roleId, users) =>
  strapi.query('role', 'users-permissions').update({ id: roleId }, { users });

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
 * Aggregate all application actions.
 *
 * @returns {Object}
 */
const aggregateAppActions = () => {
  const appControllers = Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });

  return { application: { controllers: appControllers.controllers } };
};

/**
 * Aggregate all plugin actions.
 *
 * @returns {Object}
 */
const aggregatePluginActions = () => {
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
 * Build permissions map from role data.
 *
 * @param {Object} role - Role object.
 * @param {Array<Object>} plugins - List of plugins.
 * @returns {Object}
 */
const buildRolePermissions = (role, plugins) => {
  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: !!permission.enabled,
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
 * Build plugin routes.
 *
 * @returns {Object}
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
 * Aggregate all actions from application and plugins.
 *
 * @returns {Array<string>}
 */
const aggregateAllActions = () => {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  return appActions.concat(pluginsActions);
};

/**
 * Build permission string from components.
 *
 * @param {string} type
 * @param {string} controller
 * @param {string} action
 * @param {string} roleId
 * @returns {string}
 */
const buildPermissionString = (type, controller, action, roleId) =>
  `${type}.${controller}.${action}.${roleId}`;

/**
 * Split permission string into components.
 *
 * @param {string} str
 * @returns {Object}
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

    const permissionPromises = buildPermissionPromises(params, role.id);

    if (params.users && params.users.length > 0) {
      permissionPromises.push(updateRoleUsers(role.id, params.users));
    }

    return Promise.all(permissionPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userPromises = role.users.map(user =>
      strapi
        .query('user', 'users-permissions')
        .update({ id: user.id }, { role: publicRoleID })
    );

    const permissionPromises = role.permissions.map(permission =>
      strapi
        .query('permission', 'users-permissions')
        .delete({ id: permission.id })
    );

    const deleteRolePromise = strapi
      .query('role', 'users-permissions')
      .delete({ id: roleID });

    return Promise.all([...userPromises, ...permissionPromises, deleteRolePromise]);
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
    const appPermissions = aggregateAppActions();
    const pluginPermissions = aggregatePluginActions();
    return _.merge(appPermissions, pluginPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = buildRolePermissions(role, plugins);

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
      dbPermissions.map(p => buildPermissionString(p.type, p.controller, p.action, p.role[primaryKey]))
    );

    const actionsFoundInFiles = aggregateAllActions();

    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce((acc, action) => {
        return acc.concat(roles.map(role => buildPermissionString(action, role[primaryKey])));
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

    const permissionPromises = Object.keys(body.permissions || {}).reduce((acc, type) => {
      Object.keys(body.permissions[type].controllers).forEach(controller => {
        Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
          const bodyAction = body.permissions[type].controllers[controller][action];
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            acc.push(
              strapi
                .query('permission', 'users-permissions')
                .update(
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
      return acc;
    }, []);

    await Promise.all(permissionPromises);

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