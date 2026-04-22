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
  { action: 'me', controller: 'user', type: 'users-permissions', roleType: null },
  { action: 'autoreload', controller: null, type: null, roleType: null },
];

/**
 * Checks if a permission should be enabled by default.
 */
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
 * Build permission creation promises from role params.
 */
function buildPermissionPromises(params, roleId) {
  const promises = [];

  Object.entries(params.permissions || {}).forEach(([type, { controllers }]) => {
    Object.entries(controllers).forEach(([controller, actions]) => {
      Object.entries(actions).forEach(([action, data]) => {
        promises.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...data,
          })
        );
      });
    });
  });

  if (Array.isArray(params.users) && params.users.length > 0) {
    promises.push(
      strapi.query('role', 'users-permissions').update({ id: roleId }, { users: params.users })
    );
  }

  return promises;
}

/**
 * Move a list of users to a target role.
 */
function moveUsersToRole(users, targetRoleId) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
  );
}

/**
 * Delete a list of permissions.
 */
function deletePermissions(permissions) {
  return permissions.map(p =>
    strapi.query('permission', 'users-permissions').delete({ id: p.id })
  );
}

/**
 * Generate actions map for a set of controllers.
 */
function generateActionsMap(controllers) {
  return Object.entries(controllers).reduce((acc, [name, controller]) => {
    acc[name] = Object.keys(controller).reduce((a, key) => {
      if (_.isFunction(controller[key])) {
        a[key] = { enabled: false, policy: '' };
      }
      return a;
    }, {});
    return acc;
  }, {});
}

/**
 * Collect application controllers actions.
 */
function collectAppControllers() {
  const app = {};

  Object.entries(strapi.api || {})
    .filter(([, api]) => api.controllers)
    .forEach(([, api]) => {
      Object.assign(app, generateActionsMap(api.controllers));
    });

  return { controllers: app };
}

/**
 * Collect plugins permissions actions.
 */
function collectPluginsPermissions() {
  return Object.entries(strapi.plugins).reduce((acc, [pluginName, plugin]) => {
    acc[pluginName] = {
      controllers: generateActionsMap(plugin.controllers),
    };
    return acc;
  }, {});
}

/**
 * Build a list of action identifiers for application controllers.
 */
function buildAppActionIdentifiers() {
  const actions = [];

  Object.entries(strapi.api || {}).forEach(([, api]) => {
    Object.entries(api.controllers || {}).forEach(([controller, ctrl]) => {
      Object.keys(ctrl)
        .filter(action => _.isFunction(ctrl[action]))
        .forEach(action => {
          actions.push(`application.${controller}.${action.toLowerCase()}`);
        });
    });
  });

  return actions;
}

/**
 * Build a list of action identifiers for plugin controllers.
 */
function buildPluginActionIdentifiers() {
  const actions = [];

  Object.entries(strapi.plugins).forEach(([pluginName, plugin]) => {
    Object.entries(plugin.controllers || {}).forEach(([controller, ctrl]) => {
      Object.keys(ctrl)
        .filter(action => _.isFunction(ctrl[action]))
        .forEach(action => {
          actions.push(`${pluginName}.${controller}.${action.toLowerCase()}`);
        });
    });
  });

  return actions;
}

/**
 * Split a permission string into its components.
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Compute differences between DB and file permissions.
 */
function computePermissionDiffs(dbPermissions, filePermissions) {
  const toRemove = _.difference(dbPermissions, filePermissions).map(splitPermissionString);
  const toAdd = _.difference(filePermissions, dbPermissions).map(splitPermissionString);
  return { toAdd, toRemove };
}

/**
 * Update user-role assignments based on differences.
 */
async function syncUserRoles(oldUsers, newUsers, roleId, fallbackRoleId) {
  await Promise.all(newUsers.map(user => strapi.query('user', 'users-permissions').update({ id: user.id }, { role: roleId })));
  await Promise.all(oldUsers.map(user => strapi.query('user', 'users-permissions').update({ id: user.id }, { role: fallbackRoleId })));
}

/**
 * Service methods.
 */
module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const promises = buildPermissionPromises(params, role.id);
    return Promise.all(promises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const movePromises = moveUsersToRole(role.users, publicRoleID);
    const deletePermPromises = deletePermissions(role.permissions);
    const deleteRolePromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return Promise.all([...movePromises, ...deletePermPromises, deleteRolePromise]);
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
    const appControllers = collectAppControllers();
    const pluginsPermissions = collectPluginsPermissions();

    const permissions = {
      application: { controllers: appControllers.controllers },
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

    const permissions = role.permissions.reduce((acc, permission) => {
      _.set(
        acc,
        `${permission.type}.controllers.${permission.controller}.${permission.action}`,
        {
          enabled: Boolean(Number(permission.enabled)),
          policy: permission.policy,
        }
      );

      if (permission.type !== 'application' && !acc[permission.type].information) {
        acc[permission.type].information =
          plugins.find(plugin => plugin.id === permission.type) || {};
      }

      return acc;
    }, {});

    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    await Promise.all(
      roles.map(async role => {
        role.nb_users = await strapi
          .query('user', 'users-permissions')
          .count({ role: role.id });
      })
    );

    return roles;
  },

  async getRoutes() {
    const appRoutes = Object.values(strapi.api || {})
      .flatMap(api => _.get(api.config, 'routes', []));

    const pluginsRoutes = Object.entries(_.cloneDeep(strapi.plugins) || {}).reduce(
      (acc, [pluginName, plugin]) => {
        const routes = _.get(plugin, ['config', 'routes'], []).map(route => {
          const prefix = route.config.prefix;
          const path = prefix !== undefined ? `${prefix}${route.path}` : `/${pluginName}${route.path}`;
          _.set(route, 'path', path);
          return route;
        });
        acc[pluginName] = routes;
        return acc;
      },
      {}
    );

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    const dbPermissionKeys = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const filePermissionKeys = _.uniq(
      [...buildAppActionIdentifiers(), ...buildPluginActionIdentifiers()]
        .flatMap(action => roles.map(role => `${action}.${role[primaryKey]}`))
    );

    if (!_.isEqual(dbPermissionKeys.sort(), filePermissionKeys.sort())) {
      const { toAdd, toRemove } = computePermissionDiffs(dbPermissionKeys, filePermissionKeys);
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

    const permissionUpdates = [];

    Object.entries(body.permissions || {}).forEach(([type, { controllers }]) => {
      Object.entries(controllers).forEach(([controller, actions]) => {
        Object.entries(actions).forEach(([action, bodyAction]) => {
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            permissionUpdates.push(
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

    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await syncUserRoles(oldUsers, newUsers, roleID, authenticated.id);
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};