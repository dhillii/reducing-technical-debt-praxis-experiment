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
 * Build a permission map for a role.
 * @param {Array} permissionsList - List of permission objects from DB.
 * @param {Array} plugins - List of plugins for information enrichment.
 * @returns {Object} Permission map grouped by type.
 */
function buildPermissionMap(permissionsList, plugins) {
  return permissionsList.reduce((acc, permission) => {
    _.set(
      acc,
      `${permission.type}.controllers.${permission.controller}.${permission.action}`,
      {
        enabled: _.toNumber(permission.enabled) === 1,
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
 * Generate actions object for a controller.
 * @param {Object} controllerObj - Controller definition.
 * @returns {Object} Actions map with default disabled state.
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
 * Collect application actions from core APIs.
 * @returns {Array<string>} List of action identifiers.
 */
function collectAppActions() {
  return Object.keys(strapi.api || {})
    .reduce((acc, api) => {
      const controllers = _.get(strapi.api[api], 'controllers', {});
      Object.keys(controllers).forEach(controller => {
        const actions = Object.keys(controllers[controller])
          .filter(action => _.isFunction(controllers[controller][action]))
          .map(action => `application.${controller}.${action.toLowerCase()}`);
        acc.push(...actions);
      });
      return acc;
    }, []);
}

/**
 * Collect plugin actions from installed plugins.
 * @returns {Array<string>} List of action identifiers.
 */
function collectPluginActions() {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    const controllers = strapi.plugins[plugin].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc.push(...actions);
    });
    return acc;
  }, []);
}

/**
 * Build a list of permission identifiers from actions and roles.
 * @param {Array<string>} actions - List of action identifiers.
 * @param {Array<Object>} roles - List of role objects.
 * @returns {Array<string>} Unique permission identifiers.
 */
function buildPermissionsFromActions(actions, roles) {
  const primaryKey = strapi.query('permission', 'users-permissions').primaryKey;
  const list = actions.reduce((acc, action) => {
    const perRole = roles.map(role => `${action}.${role[primaryKey]}`);
    acc.push(...perRole);
    return acc;
  }, []);
  return _.uniq(list);
}

/**
 * Split a permission string into its components.
 * @param {string} str - Permission identifier.
 * @returns {Object} Decomposed parts.
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Apply permission additions to the database.
 * @param {Array<Object>} toAdd - List of permission parts to add.
 * @param {Object} rolesMap - Mapping of role IDs to role objects.
 */
async function applyPermissionAdditions(toAdd, rolesMap) {
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
}

/**
 * Apply permission removals from the database.
 * @param {Array<Object>} toRemove - List of permission parts to remove.
 */
async function applyPermissionRemovals(toRemove) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
}

/**
 * Build promises for permission creation based on role parameters.
 * @param {Object} params - Role creation parameters.
 * @param {Object} role - Created role entity.
 * @returns {Array<Promise>} List of promises to execute.
 */
function buildPermissionCreationPromises(params, role) {
  const promises = [];
  Object.keys(params.permissions || {}).forEach(type => {
    const controllers = params.permissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        promises.push(
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
  });
  return promises;
}

/**
 * Build promises for migrating users to a new role.
 * @param {Array<Object>} users - List of user objects.
 * @param {string} targetRoleId - Role ID to assign.
 * @returns {Array<Promise>} List of promises to execute.
 */
function buildUserMigrationPromises(users, targetRoleId) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
  );
}

/**
 * Build promises for deleting role permissions.
 * @param {Array<Object>} permissions - List of permission objects.
 * @returns {Array<Promise>} List of promises to execute.
 */
function buildPermissionDeletionPromises(permissions) {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );
}

/**
 * Build promises for updating role permissions based on diff.
 * @param {Object} role - Existing role data.
 * @param {Object} bodyPermissions - Desired permissions structure.
 * @returns {Array<Promise>} List of update promises.
 */
function buildPermissionUpdatePromises(role, bodyPermissions) {
  const promises = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    const controllers = bodyPermissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        const desired = actions[action];
        const current = _.get(
          role.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );
        if (!_.isEqual(desired, current)) {
          promises.push(
            strapi.query('permission', 'users-permissions').update(
              {
                role: role.id,
                type,
                controller,
                action: action.toLowerCase(),
              },
              desired
            )
          );
        }
      });
    });
  });
  return promises;
}

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const promises = buildPermissionCreationPromises(params, role);

    if (params.users && params.users.length > 0) {
      promises.push(
        strapi.query('role', 'users-permissions').update({ id: role.id }, { users: params.users })
      );
    }

    return await Promise.all(promises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const migratePromises = buildUserMigrationPromises(role.users, publicRoleID);
    const deletePermissionPromises = buildPermissionDeletionPromises(role.permissions);
    const deleteRolePromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return await Promise.all([...migratePromises, ...deletePermissionPromises, deleteRolePromise]);
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
    const appControllers = Object.keys(strapi.api || {})
      .filter(key => !!strapi.api[key].controllers)
      .reduce((acc, key) => {
        const controllers = strapi.api[key].controllers;
        Object.keys(controllers).forEach(controller => {
          acc.controllers[controller] = generateActions(controllers[controller]);
        });
        return acc;
      }, { controllers: {} });

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
      const initialState = { controllers: {} };
      const pluginControllers = strapi.plugins[key].controllers || {};
      acc[key] = Object.keys(pluginControllers).reduce((obj, k) => {
        obj.controllers[k] = generateActions(pluginControllers[k]);
        return obj;
      }, initialState);
      return acc;
    }, {});

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

    const permissions = buildPermissionMap(role.permissions, plugins);
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
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
      const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((list, curr) => {
        const prefix = curr.config.prefix;
        const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
        _.set(curr, 'path', path);
        return list.concat(curr);
      }, []);
      acc[current] = routes;
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
    let permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const appActions = collectAppActions();
    const pluginActions = collectPluginActions();
    const actionsFoundInFiles = appActions.concat(pluginActions);
    const permissionsFoundInFiles = _.uniq(buildPermissionsFromActions(actionsFoundInFiles, roles));

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

      await applyPermissionAdditions(toAdd, rolesMap);
      await applyPermissionRemovals(toRemove);
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

    const permissionPromises = buildPermissionUpdatePromises(role, body.permissions);
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