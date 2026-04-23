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
 * Build an array of permission creation promises from the supplied params.
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
 * Add a user‑relation update promise when users are supplied.
 */
function maybeAddUserRelationPromise(promises, roleId, users) {
  if (users && users.length > 0) {
    promises.push(
      strapi.query('role', 'users-permissions').update({ id: roleId }, { users })
    );
  }
}

/**
 * Build an array of promises to move users from a deleted role to the public role.
 */
function buildUserMigrationPromises(users, publicRoleId) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: publicRoleId })
  );
}

/**
 * Build an array of promises to delete a role's permissions.
 */
function buildPermissionDeletionPromises(permissions) {
  return permissions.map(p =>
    strapi.query('permission', 'users-permissions').delete({ id: p.id })
  );
}

/**
 * Generate a map of actions (enabled flag + policy) for a controller object.
 */
function generateActions(controllerObj) {
  return Object.entries(controllerObj).reduce((acc, [key, value]) => {
    if (_.isFunction(value)) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Collect application controllers and their actions.
 */
function collectAppControllers() {
  return Object.entries(strapi.api || {})
    .filter(([, api]) => api.controllers)
    .reduce((acc, [, api]) => {
      Object.entries(api.controllers).forEach(([controller, actions]) => {
        acc.controllers[controller] = generateActions(actions);
      });
      return acc;
    }, { controllers: {} });
}

/**
 * Collect plugins permissions structure.
 */
function collectPluginsPermissions() {
  return Object.entries(strapi.plugins).reduce((acc, [pluginName, plugin]) => {
    const initial = { controllers: {} };
    acc[pluginName] = Object.entries(plugin.controllers).reduce((obj, [controller, actions]) => {
      obj.controllers[controller] = generateActions(actions);
      return obj;
    }, initial);
    return acc;
  }, {});
}

/**
 * Build a permissions map for a role, enriching with plugin information when needed.
 */
function buildPermissionsMap(rolePermissions, plugins) {
  return rolePermissions.reduce((acc, permission) => {
    _.set(
      acc,
      `${permission.type}.controllers.${permission.controller}.${permission.action}`,
      {
        enabled: Boolean(permission.enabled),
        policy: permission.policy,
      }
    );

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(p => p.id === permission.type) || {};
    }

    return acc;
  }, {});
}

/**
 * Build routes for the core application.
 */
function buildApplicationRoutes() {
  return Object.keys(strapi.api || {}).reduce((acc, apiKey) => {
    const routes = _.get(strapi.api[apiKey].config, 'routes', []);
    return acc.concat(routes);
  }, []);
}

/**
 * Build routes for plugins, normalising the path with any prefix.
 */
function buildPluginRoutes() {
  const cloned = _.cloneDeep(strapi.plugins);
  return Object.entries(cloned || {}).reduce((acc, [pluginName, plugin]) => {
    const routes = _.get(plugin, ['config', 'routes'], []).reduce((list, route) => {
      const prefix = route.config?.prefix;
      const path = prefix !== undefined ? `${prefix}${route.path}` : `/${pluginName}${route.path}`;
      _.set(route, 'path', path);
      return list.concat(route);
    }, []);
    acc[pluginName] = routes;
    return acc;
  }, {});
}

/**
 * Split a permission string into its components.
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Synchronise database permissions with file‑system actions.
 */
async function syncPermissions(roles, dbPermissions, actionsFoundInFiles) {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  const roleMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

  const dbKeys = _.uniq(
    dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
  );

  const fileKeys = _.uniq(
    actionsFoundInFiles.flatMap(action =>
      roles.map(r => `${action}.${r[primaryKey]}`)
    )
  );

  if (!_.isEqual(dbKeys.sort(), fileKeys.sort())) {
    const toRemove = _.difference(dbKeys, fileKeys).map(splitPermissionString);
    const toAdd = _.difference(fileKeys, dbKeys).map(splitPermissionString);
    const query = strapi.query('permission', 'users-permissions');

    await Promise.all(
      toAdd.map(p =>
        query.create({
          type: p.type,
          controller: p.controller,
          action: p.action,
          enabled: isPermissionEnabled(p, roleMap[p.roleId]),
          policy: '',
          role: p.roleId,
        })
      )
    );

    await Promise.all(
      toRemove.map(p => query.delete({ type: p.type, controller: p.controller, action: p.action, role: p.roleId }))
    );
  }
}

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const promises = buildPermissionPromises(role.id, params.permissions);
    maybeAddUserRelationPromise(promises, role.id, params.users);

    return Promise.all(promises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const promises = [
      ...buildUserMigrationPromises(role.users, publicRoleID),
      ...buildPermissionDeletionPromises(role.permissions),
      strapi.query('role', 'users-permissions').delete({ id: roleID }),
    ];

    return Promise.all(promises);
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

    const permissions = buildPermissionsMap(role.permissions, plugins);
    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    await Promise.all(
      roles.map(r =>
        strapi
          .query('user', 'users-permissions')
          .count({ role: r.id })
          .then(count => {
            r.nb_users = count;
          })
      )
    );
    return roles;
  },

  async getRoutes() {
    const applicationRoutes = buildApplicationRoutes();
    const pluginsRoutes = buildPluginRoutes();
    return _.merge({ application: applicationRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    const appActions = Object.entries(strapi.api || {}).reduce((acc, [, api]) => {
      Object.entries(api.controllers || {}).forEach(([controller, actions]) => {
        const list = Object.keys(actions)
          .filter(a => _.isFunction(actions[a]))
          .map(a => `application.${controller}.${a.toLowerCase()}`);
        acc.push(...list);
      });
      return acc;
    }, []);

    const pluginsActions = Object.entries(strapi.plugins).reduce((acc, [pluginName, plugin]) => {
      Object.entries(plugin.controllers).forEach(([controller, actions]) => {
        const list = Object.keys(actions)
          .filter(a => _.isFunction(actions[a]))
          .map(a => `${pluginName}.${controller}.${a.toLowerCase()}`);
        acc.push(...list);
      });
      return acc;
    }, []);

    const actionsFoundInFiles = appActions.concat(pluginsActions);
    await syncPermissions(roles, dbPermissions, actionsFoundInFiles);
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
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => this.updateUserRole(user, authenticated.id)));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiled = _.template(layout);
    return compiled(data);
  },
};