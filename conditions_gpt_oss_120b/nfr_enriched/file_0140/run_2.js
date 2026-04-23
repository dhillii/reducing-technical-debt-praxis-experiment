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
 * Determine if a permission should be enabled by default.
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
 * Build permission creation promises from role parameters.
 */
function buildPermissionPromises(roleId, permissions) {
  const promises = [];

  Object.keys(permissions || {}).forEach(type => {
    const controllers = permissions[type].controllers;
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
}

/**
 * Build user‑role association promises.
 */
function buildUserUpdatePromises(roleId, users) {
  if (!users || users.length === 0) {
    return [];
  }
  return [
    strapi
      .query('role', 'users-permissions')
      .update({ id: roleId }, { users })
  ];
}

/**
 * Transfer users from a role to another role.
 */
function buildUserTransferPromises(users, targetRoleId) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
  );
}

/**
 * Delete permissions associated with a role.
 */
function buildPermissionDeletionPromises(permissions) {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );
}

/**
 * Generate a map of enabled actions for a controller.
 */
function generateActions(controller) {
  return Object.keys(controller).reduce((acc, key) => {
    if (_.isFunction(controller[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Collect application controllers and their actions.
 */
function collectAppControllers() {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });
}

/**
 * Collect plugin permissions.
 */
function collectPluginPermissions() {
  return Object.keys(strapi.plugins).reduce((acc, pluginKey) => {
    const initialState = { controllers: {} };
    acc[pluginKey] = Object.keys(strapi.plugins[pluginKey].controllers).reduce((obj, ctrl) => {
      obj.controllers[ctrl] = generateActions(strapi.plugins[pluginKey].controllers[ctrl]);
      return obj;
    }, initialState);
    return acc;
  }, {});
}

/**
 * Build a permission map for a role.
 */
function buildRolePermissionMap(role, plugins) {
  return role.permissions.reduce((acc, permission) => {
    _.set(
      acc,
      `${permission.type}.controllers.${permission.controller}.${permission.action}`,
      {
        enabled: !!Number(permission.enabled),
        policy: permission.policy,
      }
    );

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
}

/**
 * Build routes for the core application.
 */
function collectAppRoutes() {
  return Object.keys(strapi.api || {}).reduce((acc, apiKey) => {
    return acc.concat(_.get(strapi.api[apiKey].config, 'routes', []));
  }, []);
}

/**
 * Build routes for plugins, normalising prefixes.
 */
function collectPluginRoutes() {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  return Object.keys(clonedPlugins || {}).reduce((acc, pluginKey) => {
    const routes = _.get(clonedPlugins, [pluginKey, 'config', 'routes'], []).reduce(
      (list, route) => {
        const prefix = route.config.prefix;
        const path = prefix !== undefined ? `${prefix}${route.path}` : `/${pluginKey}${route.path}`;
        _.set(route, 'path', path);
        return list.concat(route);
      },
      []
    );
    acc[pluginKey] = routes;
    return acc;
  }, {});
}

/**
 * Compute all actions defined in the core application.
 */
function computeAppActions() {
  return Object.keys(strapi.api || {}).reduce((acc, apiKey) => {
    const controllers = _.get(strapi.api[apiKey], 'controllers', {});
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Compute all actions defined in plugins.
 */
function computePluginActions() {
  return Object.keys(strapi.plugins).reduce((acc, pluginKey) => {
    const controllers = strapi.plugins[pluginKey].controllers;
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `${pluginKey}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Build a list of permission identifiers for each role.
 */
function buildPermissionIdentifiers(actions, roles, primaryKey) {
  const identifiers = actions.reduce((list, action) => {
    const perRole = roles.map(role => `${action}.${role[primaryKey]}`);
    return list.concat(perRole);
  }, []);
  return _.uniq(identifiers);
}

/**
 * Split a permission string into its components.
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Apply permission additions.
 */
async function addPermissions(toAdd, rolesMap) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toAdd.map(permission => {
      const { type, controller, action, roleId } = permission;
      return query.create({
        type,
        controller,
        action,
        enabled: isPermissionEnabled(permission, rolesMap[roleId]),
        policy: '',
        role: roleId,
      });
    })
  );
}

/**
 * Apply permission removals.
 */
async function removePermissions(toRemove) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId } = permission;
      return query.delete({ type, controller, action, role: roleId });
    })
  );
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
    const userPromises = buildUserUpdatePromises(role.id, params.users);
    const allPromises = permissionPromises.concat(userPromises);

    return await Promise.all(allPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userTransfer = buildUserTransferPromises(role.users, publicRoleID);
    const permissionDeletion = buildPermissionDeletionPromises(role.permissions);
    const roleDeletion = [strapi.query('role', 'users-permissions').delete({ id: roleID })];

    const allPromises = userTransfer.concat(permissionDeletion, roleDeletion);
    return await Promise.all(allPromises);
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
    const pluginsPermissions = collectPluginPermissions();

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

    const permissions = buildRolePermissionMap(role, plugins);
    return { ...role, permissions };
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
    const applicationRoutes = collectAppRoutes();
    const pluginRoutes = collectPluginRoutes();
    return _.merge({ application: applicationRoutes }, pluginRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    const permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const appActions = computeAppActions();
    const pluginActions = computePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginActions);

    const permissionsFoundInFiles = buildPermissionIdentifiers(
      actionsFoundInFiles,
      roles,
      primaryKey
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
        splitPermissionString
      );
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
        splitPermissionString
      );

      await addPermissions(toAdd, rolesMap);
      await removePermissions(toRemove);
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

    Object.keys(body.permissions || {}).forEach(type => {
      const controllers = body.permissions[type].controllers;
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
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};