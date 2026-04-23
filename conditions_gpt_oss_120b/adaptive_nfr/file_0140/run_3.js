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
 * Create a role and its associated permissions.
 */
async function createRole(params) {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const permissionPromises = buildPermissionPromises(params, role.id);
  const userRelationPromise = buildUserRelationPromise(params, role.id);

  if (userRelationPromise) {
    permissionPromises.push(userRelationPromise);
  }

  return await Promise.all(permissionPromises);
}

/**
 * Build promises for creating permissions based on the request payload.
 */
function buildPermissionPromises(params, roleId) {
  return Object.keys(params.permissions || {}).reduce((acc, type) => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
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
}

/**
 * Build a promise for linking users to the newly created role.
 */
function buildUserRelationPromise(params, roleId) {
  if (params.users && params.users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: roleId },
      { users: params.users }
    );
  }
  return null;
}

/**
 * Delete a role and clean up related data.
 */
async function deleteRole(roleID, publicRoleID) {
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
}

/**
 * Retrieve marketplace plugins.
 */
function getPlugins(lang = 'en') {
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
}

/**
 * Generate a map of actions for controllers.
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
    application: { controllers: appControllers.controllers },
  };

  return _.merge(permissions, pluginsPermissions);
}

/**
 * Retrieve a role with its permissions.
 */
async function getRole(roleID, plugins) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: Boolean(_.toNumber(permission.enabled)),
      policy: permission.policy,
    });

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
 * Retrieve all routes from application and plugins.
 */
async function getRoutes() {
  const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

  const pluginsRoutes = Object.keys(_.cloneDeep(strapi.plugins) || {}).reduce((acc, current) => {
    const routes = _.get(strapi.plugins, [current, 'config', 'routes'], []).reduce((list, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return list.concat(curr);
    }, []);
    acc[current] = routes;
    return acc;
  }, {});

  return _.merge({ application: routes }, pluginsRoutes);
}

/**
 * Update permissions for all roles based on current controllers.
 */
async function updatePermissions() {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = buildRolesMap(roles, primaryKey);
  const dbPermissions = await strapi.query('permission', 'users-permissions').find({ _limit: -1 });
  const permissionsFoundInDB = uniqPermissionKeys(dbPermissions, primaryKey);
  const appActions = collectAppActions();
  const pluginsActions = collectPluginActions();
  const actionsFoundInFiles = appActions.concat(pluginsActions);
  const permissionsFoundInFiles = uniqPermissionKeysFromActions(actionsFoundInFiles, roles, primaryKey);

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    await syncPermissions(permissionsFoundInDB, permissionsFoundInFiles, rolesMap, primaryKey);
  }
}

/**
 * Build a map of role IDs to role objects.
 */
function buildRolesMap(roles, primaryKey) {
  return roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
}

/**
 * Generate unique permission keys from DB entries.
 */
function uniqPermissionKeys(dbPermissions, primaryKey) {
  const keys = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(keys);
}

/**
 * Collect actions defined in the core application.
 */
function collectAppActions() {
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
 * Collect actions defined in plugins.
 */
function collectPluginActions() {
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
 * Generate unique permission keys from actions and roles.
 */
function uniqPermissionKeysFromActions(actions, roles, primaryKey) {
  const keys = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(keys);
}

/**
 * Synchronize permissions between DB and file system.
 */
async function syncPermissions(dbKeys, fileKeys, rolesMap, primaryKey) {
  const splitted = str => {
    const [type, controller, action, roleId] = str.split('.');
    return { type, controller, action, roleId };
  };

  const toRemove = _.difference(dbKeys, fileKeys).map(splitted);
  const toAdd = _.difference(fileKeys, dbKeys).map(splitted);
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
 * Update a role's details and permissions.
 */
async function updateRole(roleID, body) {
  const [role, authenticated] = await Promise.all([
    getRole(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  await strapi
    .query('role', 'users-permissions')
    .update({ id: roleID }, _.pick(body, ['name', 'description']));

  await applyPermissionUpdates(roleID, role, body);
  await syncUserAssignments(body, role, authenticated.id);
}

/**
 * Apply permission updates for a role.
 */
function applyPermissionUpdates(roleID, role, body) {
  const updates = Object.keys(body.permissions || {}).reduce((acc, type) => {
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
              { role: roleID, type, controller, action: action.toLowerCase() },
              bodyAction
            )
          );
        }
      });
    });
    return acc;
  }, []);

  return Promise.all(updates);
}

/**
 * Synchronize user assignments when a role is updated.
 */
async function syncUserAssignments(body, role, authenticatedId) {
  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, role.id)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticatedId)));
}

/**
 * Update a user's role.
 */
function updateUserRole(user, role) {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
}

/**
 * Render a template with data.
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