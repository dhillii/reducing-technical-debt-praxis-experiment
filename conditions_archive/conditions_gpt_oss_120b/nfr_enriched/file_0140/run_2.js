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
 * Generates an actions map for a controller object.
 */
function generateActions(controllerObj) {
  return Object.keys(controllerObj).reduce((acc, key) => {
    if (_.isFunction(controllerObj[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Builds application controllers permission structure.
 */
function buildAppControllers() {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, apiKey) => {
      Object.keys(strapi.api[apiKey].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[apiKey].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });
}

/**
 * Builds plugins permission structure.
 */
function buildPluginsPermissions() {
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
 * Maps role permissions into a nested object.
 */
function mapRolePermissions(role, plugins) {
  return role.permissions.reduce((acc, permission) => {
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
}

/**
 * Splits a permission key string into its components.
 */
function splitPermissionKey(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Computes permission keys from DB entries.
 */
function computeDbPermissionKeys(dbPermissions, primaryKey) {
  const keys = dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`);
  return _.uniq(keys);
}

/**
 * Computes permission keys from file actions and roles.
 */
function computeFilePermissionKeys(actions, roles, primaryKey) {
  const keys = actions.reduce(
    (acc, action) => acc.concat(roles.map(role => `${action}.${role[primaryKey]}`)),
    []
  );
  return _.uniq(keys);
}

/**
 * Retrieves all actions defined in application and plugins.
 */
function collectAllActions() {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    const controllers = _.get(strapi.api[api], 'controllers', {});
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  const pluginActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    const controllers = strapi.plugins[plugin].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  return appActions.concat(pluginActions);
}

/**
 * Applies permission additions to the database.
 */
async function addMissingPermissions(toAdd, rolesMap) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toAdd.map(p => {
      const { type, controller, action, roleId } = p;
      return query.create({
        type,
        controller,
        action,
        enabled: isPermissionEnabled(p, rolesMap[roleId]),
        policy: '',
        role: roleId,
      });
    })
  );
}

/**
 * Removes obsolete permissions from the database.
 */
async function removeObsoletePermissions(toRemove) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toRemove.map(p => {
      const { type, controller, action, roleId } = p;
      return query.delete({ type, controller, action, role: roleId });
    })
  );
}

/**
 * Updates role permissions based on differences.
 */
async function syncPermissions(roles, dbPermissions, primaryKey) {
  const dbKeys = computeDbPermissionKeys(dbPermissions, primaryKey);
  const allActions = collectAllActions();
  const fileKeys = computeFilePermissionKeys(allActions, roles, primaryKey);

  if (!_.isEqual(dbKeys.sort(), fileKeys.sort())) {
    const toRemove = _.difference(dbKeys, fileKeys).map(splitPermissionKey);
    const toAdd = _.difference(fileKeys, dbKeys).map(splitPermissionKey);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    await addMissingPermissions(toAdd, rolesMap);
    await removeObsoletePermissions(toRemove);
  }
}

/**
 * Builds routes for application and plugins.
 */
function buildRoutes() {
  const appRoutes = Object.keys(strapi.api || {}).reduce((acc, key) => {
    return acc.concat(_.get(strapi.api[key].config, 'routes', []));
  }, []);

  const pluginsRoutes = Object.keys(strapi.plugins || {}).reduce((acc, plugin) => {
    const rawRoutes = _.get(strapi.plugins, [plugin, 'config', 'routes'], []);
    const processed = rawRoutes.map(route => {
      const prefix = route.config && route.config.prefix;
      const path = prefix !== undefined ? `${prefix}${route.path}` : `/${plugin}${route.path}`;
      _.set(route, 'path', path);
      return route;
    });
    acc[plugin] = processed;
    return acc;
  }, {});

  return _.merge({ application: appRoutes }, pluginsRoutes);
}

/**
 * Updates a user's role.
 */
async function updateUserRole(user, roleId) {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role: roleId });
}

/**
 * Updates role permissions based on the provided body.
 */
async function applyPermissionUpdates(roleId, bodyPermissions, existingPermissions) {
  const updates = [];

  Object.keys(bodyPermissions || {}).forEach(type => {
    const controllers = bodyPermissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        const newAction = actions[action];
        const currentPath = `${type}.controllers.${controller}.${action}`;
        const currentAction = _.get(existingPermissions, currentPath, {});

        if (!_.isEqual(newAction, currentAction)) {
          updates.push(
            strapi
              .query('permission', 'users-permissions')
              .update(
                { role: roleId, type, controller, action: action.toLowerCase() },
                newAction
              )
          );
        }
      });
    });
  });

  await Promise.all(updates);
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

    const permissionPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
      const controllers = params.permissions[type].controllers || {};
      Object.keys(controllers).forEach(controller => {
        const actions = controllers[controller];
        Object.keys(actions).forEach(action => {
          acc.push(
            strapi.query('permission', 'users-permissions').create({
              role: role.id,
              type,
              controller,
              action: action.toLowerCase(),
              ...actions[action],
            })
          );
        });
      });
      return acc;
    }, []);

    if (params.users && params.users.length > 0) {
      permissionPromises.push(
        strapi.query('role', 'users-permissions').update({ id: role.id }, { users: params.users })
      );
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

    const userUpdates = role.users.map(user =>
      strapi.query('user', 'users-permissions').update({ id: user.id }, { role: publicRoleID })
    );

    const permissionDeletes = role.permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({ id: permission.id })
    );

    const roleDelete = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return Promise.all([...userUpdates, ...permissionDeletes, roleDelete]);
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
    const appControllers = buildAppControllers();
    const pluginsPermissions = buildPluginsPermissions();

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

    const permissions = mapRolePermissions(role, plugins);
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
    return buildRoutes();
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    await syncPermissions(roles, dbPermissions, primaryKey);
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

    await applyPermissionUpdates(roleID, body.permissions, role.permissions);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiled = _.template(layout);
    return compiled(data);
  },
};