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
  { action: 'emailconfirmation', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'resetpassword', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'init', controller: 'userspermissions', type: null, roleType: null },
  { action: 'me', controller: 'user', type: 'users-permissions', roleId: null },
  { action: 'autoreload', controller: null, type: null, roleType: null },
];

const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(defaultPerm => {
    const actionMatch = defaultPerm.action === null || permission.action === defaultPerm.action;
    const controllerMatch =
      defaultPerm.controller === null || permission.controller === defaultPerm.controller;
    const typeMatch = defaultPerm.type === null || permission.type === defaultPerm.type;
    const roleMatch = defaultPerm.roleType === null || role.type === defaultPerm.roleType;
    return actionMatch && controllerMatch && typeMatch && roleMatch;
  });

/**
 * Build permission creation promises from role parameters.
 */
function buildPermissionPromises(roleId, permissions) {
  const promises = [];

  Object.entries(permissions || {}).forEach(([type, { controllers }]) => {
    Object.entries(controllers).forEach(([controller, actions]) => {
      Object.entries(actions).forEach(([action, meta]) => {
        promises.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...meta,
          })
        );
      });
    });
  });

  return promises;
}

/**
 * Update user-role relations.
 */
async function syncUserRoles(roleId, newUserList, oldUserList, targetRoleId) {
  const addPromises = newUserList.map(user => strapi.query('user', 'users-permissions').update({ id: user.id }, { role: roleId }));
  const removePromises = oldUserList.map(user => strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId }));
  await Promise.all([...addPromises, ...removePromises]);
}

/**
 * Generate actions map for a given controller collection.
 */
function generateActionsMap(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Collect actions from application APIs.
 */
function collectAppActions() {
  return Object.keys(strapi.api || {})
    .flatMap(api => {
      const ctrl = _.get(strapi.api[api], 'controllers', {});
      return Object.keys(ctrl).flatMap(controller => {
        return Object.keys(ctrl[controller])
          .filter(action => _.isFunction(ctrl[controller][action]))
          .map(action => `application.${controller}.${action.toLowerCase()}`);
      });
    });
}

/**
 * Collect actions from plugins.
 */
function collectPluginActions() {
  return Object.keys(strapi.plugins).flatMap(plugin => {
    const ctrl = strapi.plugins[plugin].controllers || {};
    return Object.keys(ctrl).flatMap(controller => {
      return Object.keys(ctrl[controller])
        .filter(action => _.isFunction(ctrl[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
    });
  });
}

/**
 * Split permission identifier string into its components.
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = buildPermissionPromises(role.id, params.permissions);
    if (params.users && params.users.length > 0) {
      permissionPromises.push(
        strapi.query('role', 'users-permissions').update({ id: role.id }, { users: params.users })
      );
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

    const userPromises = role.users.map(user =>
      strapi.query('user', 'users-permissions').update({ id: user.id }, { role: publicRoleID })
    );

    const permissionPromises = role.permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({ id: permission.id })
    );

    const deleteRolePromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return await Promise.all([...userPromises, ...permissionPromises, deleteRolePromise]);
  },

  getPlugins(lang = 'en') {
    return new Promise(resolve => {
      request(
        {
          uri: `https://marketplace.strapi.io/plugins?lang=${lang}`,
          json: true,
          timeout: 3000,
          headers: { 'cache-control': 'max-age=3600' },
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
    const appControllers = Object.keys(strapi.api || {})
      .filter(key => !!strapi.api[key].controllers)
      .reduce((acc, key) => {
        acc.controllers[key] = generateActionsMap(strapi.api[key].controllers);
        return acc;
      }, { controllers: {} });

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
      const initial = { controllers: {} };
      acc[plugin] = Object.keys(strapi.plugins[plugin].controllers || {}).reduce((obj, controller) => {
        obj.controllers[controller] = generateActionsMap(strapi.plugins[plugin].controllers[controller]);
        return obj;
      }, initial);
      return acc;
    }, {});

    const permissions = { application: { controllers: appControllers.controllers } };
    return _.merge(permissions, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = role.permissions.reduce((acc, permission) => {
      _.set(
        acc,
        `${permission.type}.controllers.${permission.controller}.${permission.action}`,
        {
          enabled: Boolean(_.toNumber(permission.enabled)),
          policy: permission.policy,
        }
      );

      if (permission.type !== 'application' && !acc[permission.type].information) {
        acc[permission.type].information = plugins.find(p => p.id === permission.type) || {};
      }

      return acc;
    }, {});

    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    await Promise.all(
      roles.map(async role => {
        role.nb_users = await strapi.query('user', 'users-permissions').count({ role: role.id });
      })
    );
    return roles;
  },

  async getRoutes() {
    const appRoutes = Object.keys(strapi.api || {}).reduce((acc, key) => {
      return acc.concat(_.get(strapi.api[key].config, 'routes', []));
    }, []);

    const pluginsRoutes = Object.keys(strapi.plugins || {}).reduce((acc, plugin) => {
      const routes = _.get(strapi.plugins, [plugin, 'config', 'routes'], []).map(route => {
        const prefix = route.config.prefix;
        const path = prefix !== undefined ? `${prefix}${route.path}` : `/${plugin}${route.path}`;
        _.set(route, 'path', path);
        return route;
      });
      acc[plugin] = routes;
      return acc;
    }, {});

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi.query('permission', 'users-permissions').find({ _limit: -1 });
    const permissionsInDb = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const actionsInFiles = [...collectAppActions(), ...collectPluginActions()];
    const permissionsInFiles = _.uniq(
      actionsInFiles.flatMap(action => roles.map(role => `${action}.${role[primaryKey]}`))
    );

    if (!_.isEqual(permissionsInDb.sort(), permissionsInFiles.sort())) {
      const toRemove = _.difference(permissionsInDb, permissionsInFiles).map(splitPermissionString);
      const toAdd = _.difference(permissionsInFiles, permissionsInDb).map(splitPermissionString);
      const query = strapi.query('permission', 'users-permissions');

      await Promise.all(
        toAdd.map(p =>
          query.create({
            type: p.type,
            controller: p.controller,
            action: p.action,
            enabled: isPermissionEnabled(p, rolesMap[p.roleId]),
            policy: '',
            role: p.roleId,
          })
        )
      );

      await Promise.all(
        toRemove.map(p => query.delete({ type: p.type, controller: p.controller, action: p.action, role: p.roleId }))
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

    const permissionUpdates = Object.entries(body.permissions || {}).flatMap(([type, { controllers }]) => {
      return Object.entries(controllers).flatMap(([controller, actions]) => {
        return Object.entries(actions).flatMap(([action, bodyAction]) => {
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );
          if (!_.isEqual(bodyAction, currentAction)) {
            return strapi
              .query('permission', 'users-permissions')
              .update(
                { role: roleID, type, controller, action: action.toLowerCase() },
                bodyAction
              );
          }
          return [];
        });
      });
    });

    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await syncUserRoles(
      roleID,
      newUsers,
      oldUsers,
      authenticated.id
    );
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiled = _.template(layout);
    return compiled(data);
  },
};