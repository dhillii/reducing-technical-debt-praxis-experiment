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
 * Build permissions object for a role.
 * @param {Array} rolePermissions
 * @param {Array} plugins
 * @returns {Object}
 */
function buildPermissionsObject(rolePermissions, plugins) {
  return rolePermissions.reduce((acc, permission) => {
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
}

/**
 * Aggregate application actions from core APIs.
 * @returns {Array<string>}
 */
function aggregateAppActions() {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Aggregate actions from plugins.
 * @returns {Array<string>}
 */
function aggregatePluginActions() {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Build list of permission identifiers found in files.
 * @param {Array<string>} actions
 * @param {Array<Object>} roles
 * @param {string} primaryKey
 * @returns {Array<string>}
 */
function buildPermissionsFromFiles(actions, roles, primaryKey) {
  const list = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(list);
}

/**
 * Split permission string into components.
 * @param {string} str
 * @returns {{type:string,controller:string,action:string,roleId:string}}
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Synchronize database permissions with file-defined permissions.
 * @param {Array<string>} dbList
 * @param {Array<string>} fileList
 * @param {Object} rolesMap
 * @param {Function} isEnabledFn
 * @returns {Promise<void>}
 */
async function syncPermissions(dbList, fileList, rolesMap, isEnabledFn) {
  if (_.isEqual(dbList.sort(), fileList.sort())) {
    return;
  }

  const toRemove = _.difference(dbList, fileList).map(splitPermissionString);
  const toAdd = _.difference(fileList, dbList).map(splitPermissionString);
  const query = strapi.query('permission', 'users-permissions');

  await Promise.all(
    toAdd.map(p =>
      query.create({
        type: p.type,
        controller: p.controller,
        action: p.action,
        enabled: isEnabledFn(p, rolesMap[p.roleId]),
        policy: '',
        role: p.roleId,
      })
    )
  );

  await Promise.all(
    toRemove.map(p => query.delete({ type: p.type, controller: p.controller, action: p.action, role: p.roleId }))
  );
}

/**
 * Build array of promises to update role users.
 * @param {Array<Object>} newUsers
 * @param {Array<Object>} oldUsers
 * @param {string} roleId
 * @param {string} authenticatedId
 * @param {Function} updateUserRoleFn
 * @returns {Promise<void>}
 */
async function updateRoleUsers(newUsers, oldUsers, roleId, authenticatedId, updateUserRoleFn) {
  await Promise.all(newUsers.map(user => updateUserRoleFn(user, roleId)));
  await Promise.all(oldUsers.map(user => updateUserRoleFn(user, authenticatedId)));
}

/**
 * Generate actions map for a set of controllers.
 * @param {Object} controllers
 * @returns {Object}
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
 * Build application controllers actions map.
 * @returns {Object}
 */
function buildAppControllers() {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActionsMap(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });
}

/**
 * Build plugins permissions map.
 * @returns {Object}
 */
function buildPluginsPermissions() {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActionsMap(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
}

/**
 * Build routes list for plugins.
 * @param {Object} clonedPlugins
 * @returns {Object}
 */
function buildPluginsRoutes(clonedPlugins) {
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((list, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return list.concat(curr);
    }, []);
    acc[current] = routes;
    return acc;
  }, {});
}

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
      Object.keys(params.permissions[type].controllers).forEach(controller => {
        Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
          acc.push(
            strapi.query('permission', 'users-permissions').create({
              role: role.id,
              type,
              controller,
              action: action.toLowerCase(),
              ...params.permissions[type].controllers[controller][action],
            })
          );
        });
      });
      return acc;
    }, []);

    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(
        strapi.query('role', 'users-permissions').update(
          { id: role.id },
          { users: params.users }
        )
      );
    }

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userPromises = role.users.reduce((acc, user) => {
      acc.push(
        strapi.query('user', 'users-permissions').update({ id: user.id }, { role: publicRoleID })
      );
      return acc;
    }, []);

    role.permissions.forEach(permission => {
      userPromises.push(
        strapi.query('permission', 'users-permissions').delete({ id: permission.id })
      );
    });

    userPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));

    return await Promise.all(userPromises);
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

    const permissions = buildPermissionsObject(role.permissions, plugins);

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
    const pluginsRoutes = buildPluginsRoutes(clonedPlugins);
    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    const dbList = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const appActions = aggregateAppActions();
    const pluginActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginActions);
    const fileList = buildPermissionsFromFiles(actionsFoundInFiles, roles, primaryKey);

    await syncPermissions(dbList, fileList, rolesMap, isPermissionEnabled);
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

    await Promise.all(
      Object.keys(body.permissions || {}).reduce((acc, type) => {
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
        return acc;
      }, [])
    );

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await updateRoleUsers(
      newUsers,
      oldUsers,
      roleID,
      authenticated.id,
      this.updateUserRole.bind(this)
    );
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};