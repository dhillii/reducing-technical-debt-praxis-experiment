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

const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Convert enabled flag to boolean.
 */
const toBoolean = value => _.toNumber(value) === 1;

/**
 * Build permission object for role permissions aggregation.
 */
const buildPermissionEntry = permission => ({
  enabled: toBoolean(permission.enabled),
  policy: permission.policy,
});

/**
 * Create permission promises from supplied permissions object.
 */
const buildPermissionCreatePromises = (roleId, permissions) => {
  const promises = [];

  Object.entries(permissions || {}).forEach(([type, typeObj]) => {
    Object.entries(typeObj.controllers || {}).forEach(([controller, actions]) => {
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

  return promises;
};

/**
 * Generate actions map for a given controller collection.
 */
const generateActionsMap = controllerObj =>
  Object.keys(controllerObj).reduce((acc, key) => {
    if (_.isFunction(controllerObj[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Collect application controllers actions.
 */
const collectAppControllers = () =>
  Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.entries(strapi.api[key].controllers).forEach(([controller, obj]) => {
        acc.controllers[controller] = generateActionsMap(obj);
      });
      return acc;
    }, { controllers: {} });

/**
 * Collect plugins permissions structure.
 */
const collectPluginsPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, pluginKey) => {
    const initial = { controllers: {} };
    acc[pluginKey] = Object.entries(strapi.plugins[pluginKey].controllers).reduce(
      (obj, [controller, ctrlObj]) => {
        obj.controllers[controller] = generateActionsMap(ctrlObj);
        return obj;
      },
      initial
    );
    return acc;
  }, {});

/**
 * Build full actions list for application.
 */
const buildAppActions = () =>
  Object.keys(strapi.api || {}).reduce((list, api) => {
    const controllers = _.get(strapi.api[api], 'controllers', {});
    Object.entries(controllers).forEach(([controller, ctrlObj]) => {
      const actions = Object.keys(ctrlObj)
        .filter(action => _.isFunction(ctrlObj[action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      list.push(...actions);
    });
    return list;
  }, []);

/**
 * Build full actions list for plugins.
 */
const buildPluginActions = () =>
  Object.keys(strapi.plugins).reduce((list, plugin) => {
    const controllers = strapi.plugins[plugin].controllers;
    Object.entries(controllers).forEach(([controller, ctrlObj]) => {
      const actions = Object.keys(ctrlObj)
        .filter(action => _.isFunction(ctrlObj[action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      list.push(...actions);
    });
    return list;
  }, []);

/**
 * Compute permission identifiers from DB entries.
 */
const mapDbPermissions = dbPermissions => {
  const primaryKey = strapi.query('permission', 'users-permissions').primaryKey;
  return _.uniq(
    dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
  );
};

/**
 * Compute permission identifiers from file actions and roles.
 */
const mapFilePermissions = (actions, roles) => {
  const primaryKey = strapi.query('permission', 'users-permissions').primaryKey;
  const list = actions.reduce((acc, action) => {
    const perRole = roles.map(role => `${action}.${role[primaryKey]}`);
    return acc.concat(perRole);
  }, []);
  return _.uniq(list);
};

/**
 * Split permission string into components.
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

    const permissionPromises = buildPermissionCreatePromises(role.id, params.permissions);

    if (Array.isArray(params.users) && params.users.length > 0) {
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

    const userUpdates = role.users.map(user =>
      strapi.query('user', 'users-permissions').update({ id: user.id }, { role: publicRoleID })
    );

    const permissionDeletes = role.permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({ id: permission.id })
    );

    const roleDelete = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return await Promise.all([...userUpdates, ...permissionDeletes, roleDelete]);
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
      _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
        enabled: toBoolean(permission.enabled),
        policy: permission.policy,
      });

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
    const appRoutes = Object.keys(strapi.api || {}).reduce((list, key) => {
      return list.concat(_.get(strapi.api[key].config, 'routes', []));
    }, []);

    const pluginsRoutes = Object.keys(strapi.plugins || {}).reduce((acc, pluginKey) => {
      const rawRoutes = _.get(strapi.plugins, [pluginKey, 'config', 'routes'], []);
      const processed = rawRoutes.map(route => {
        const prefix = route.config?.prefix;
        const path = prefix !== undefined ? `${prefix}${route.path}` : `/${pluginKey}${route.path}`;
        _.set(route, 'path', path);
        return route;
      });
      acc[pluginKey] = processed;
      return acc;
    }, {});

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    const permissionsInDb = mapDbPermissions(dbPermissions);

    const appActions = buildAppActions();
    const pluginActions = buildPluginActions();
    const allActions = appActions.concat(pluginActions);
    const permissionsInFiles = mapFilePermissions(allActions, roles);

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

    const permissionUpdates = [];

    Object.entries(body.permissions || {}).forEach(([type, typeObj]) => {
      Object.entries(typeObj.controllers || {}).forEach(([controller, actions]) => {
        Object.entries(actions).forEach(([action, bodyAction]) => {
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            permissionUpdates.push(
              strapi.query('permission', 'users-permissions').update(
                { role: roleID, type, controller, action: action.toLowerCase() },
                bodyAction
              )
            );
          }
        });
      });
    });

    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users || [], role.users || [], 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users || [], body.users || [], 'id');
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