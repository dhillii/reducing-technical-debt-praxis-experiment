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
 * Extract primary key field name from permission model.
 * @returns {string}
 */
function getPermissionPrimaryKey() {
  return strapi.query('permission', 'users-permissions').primaryKey;
}

/**
 * Build a map of roles keyed by their primary key.
 * @param {Array} roles
 * @param {string} primaryKey
 * @returns {Object}
 */
function mapRolesById(roles, primaryKey) {
  return roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
}

/**
 * Retrieve permission identifiers from DB.
 * @param {Array} dbPermissions
 * @param {string} primaryKey
 * @returns {Array<string>}
 */
function getDbPermissionKeys(dbPermissions, primaryKey) {
  const keys = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(keys);
}

/**
 * Generate list of application actions.
 * @returns {Array<string>}
 */
function getAppActions() {
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
 * Generate list of plugin actions.
 * @returns {Array<string>}
 */
function getPluginsActions() {
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
 * Build permission identifiers for each role based on actions.
 * @param {Array<string>} actions
 * @param {Array} roles
 * @param {string} primaryKey
 * @returns {Array<string>}
 */
function getPermissionKeysForRoles(actions, roles, primaryKey) {
  const keys = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(keys);
}

/**
 * Split a permission string into its components.
 * @param {string} str
 * @returns {{type:string,controller:string,action:string,roleId:string}}
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Synchronize permissions between DB and file definitions.
 * @param {Array<string>} dbKeys
 * @param {Array<string>} fileKeys
 * @param {Object} rolesMap
 * @param {string} primaryKey
 * @returns {Promise<void>}
 */
async function syncPermissions(dbKeys, fileKeys, rolesMap, primaryKey) {
  if (_.isEqual(dbKeys.sort(), fileKeys.sort())) {
    return;
  }

  const toRemove = _.difference(dbKeys, fileKeys).map(splitPermissionString);
  const toAdd = _.difference(fileKeys, dbKeys).map(splitPermissionString);
  const query = strapi.query('permission', 'users-permissions');

  await Promise.all(
    toAdd.map(permission =>
      query.create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: Boolean(isPermissionEnabled(permission, rolesMap[permission.roleId])),
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

/**
 * Update permissions based on current routes and roles.
 */
async function updatePermissions() {
  const primaryKey = getPermissionPrimaryKey();
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = mapRolesById(roles, primaryKey);

  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  const dbKeys = getDbPermissionKeys(dbPermissions, primaryKey);

  const appActions = getAppActions();
  const pluginsActions = getPluginsActions();
  const allActions = appActions.concat(pluginsActions);
  const fileKeys = getPermissionKeysForRoles(allActions, roles, primaryKey);

  await syncPermissions(dbKeys, fileKeys, rolesMap, primaryKey);
}

/**
 * Create a new role with associated permissions and users.
 * @param {Object} params
 */
async function createRole(params) {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const permissionPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
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
    permissionPromises.push(
      strapi.query('role', 'users-permissions').update(
        { id: role.id },
        { users: params.users }
      )
    );
  }

  return await Promise.all(permissionPromises);
}

/**
 * Delete a role and reassign its users.
 * @param {number} roleID
 * @param {number} publicRoleID
 */
async function deleteRole(roleID, publicRoleID) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const userPromises = role.users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleID }
    )
  );

  const permissionPromises = role.permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );

  const deleteRolePromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

  return await Promise.all([...userPromises, ...permissionPromises, deleteRolePromise]);
}

/**
 * Retrieve plugins list from marketplace.
 * @param {string} [lang='en']
 * @returns {Promise<Array>}
 */
function getPlugins(lang = 'en') {
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
}

/**
 * Generate actions map for application and plugins.
 * @returns {Object}
 */
function getActions() {
  const generateActions = data =>
    Object.keys(data).reduce((acc, key) => {
      if (_.isFunction(data[key])) {
        acc[key] = { enabled: false, policy: '' };
      }
      return acc;
    }, {});

  const appControllers = Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });

  const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
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
}

/**
 * Retrieve a role with its permissions.
 * @param {number} roleID
 * @param {Array} plugins
 */
async function getRole(roleID, plugins) {
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
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

  return { ...role, permissions };
}

/**
 * Retrieve all roles with user counts.
 */
async function getRoles() {
  const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
}

/**
 * Retrieve routes for application and plugins.
 */
async function getRoutes() {
  const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((a, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return a.concat(curr);
    }, []);
    acc[current] = routes;
    return acc;
  }, {});
  return _.merge({ application: routes }, pluginsRoutes);
}

/**
 * Initialize default roles and permissions.
 */
async function initialize() {
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
  return updatePermissions();
}

/**
 * Update an existing role.
 * @param {number} roleID
 * @param {Object} body
 */
async function updateRole(roleID, body) {
  const [role, authenticated] = await Promise.all([
    getRole(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  await strapi
    .query('role', 'users-permissions')
    .update({ id: roleID }, _.pick(body, ['name', 'description']));

  const permissionUpdates = Object.keys(body.permissions || {}).reduce((acc, type) => {
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
  }, []);

  await Promise.all(permissionUpdates);

  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
}

/**
 * Update a user's role.
 * @param {Object} user
 * @param {number} role
 */
async function updateUserRole(user, role) {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
}

/**
 * Render a template with data.
 * @param {string} layout
 * @param {Object} data
 */
function template(layout, data) {
  const compiledObject = _.template(layout);
  return compiledObject(data);
}

module.exports = {
  createRole,
  deleteRole,
  getPlugins,
  getActions,
  getRole,
  getRoles,
  getRoutes,
  updatePermissions,
  initialize,
  updateRole,
  updateUserRole,
  template,
};