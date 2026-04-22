```javascript
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
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Build permission creation promises for a role.
 * @param {Object} role - Created role.
 * @param {Object} permissions - Permissions payload.
 * @returns {Array<Promise>}
 */
function buildPermissionPromises(role, permissions) {
  return Object.keys(permissions || {}).reduce((acc, type) => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create({
            role: role.id,
            type,
            controller,
            action: action.toLowerCase(),
            ...permissions[type].controllers[controller][action],
          })
        );
      });
    });
    return acc;
  }, []);
}

/**
 * Append user relation update promise if needed.
 * @param {Array<Promise>} promises - Existing promises.
 * @param {Object} role - Created role.
 * @param {Array} users - Users to associate.
 */
function maybeAddUserRelation(promises, role, users) {
  if (users && users.length > 0) {
    promises.push(
      strapi.query('role', 'users-permissions').update({ id: role.id }, { users })
    );
  }
}

/**
 * Create a new role with permissions and optional users.
 */
async function createRole(params) {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const promises = buildPermissionPromises(role, params.permissions);
  maybeAddUserRelation(promises, role, params.users);
  return Promise.all(promises);
}

/**
 * Build promises to move users to a new role.
 * @param {Array} users - Users to move.
 * @param {String} targetRoleId - Destination role ID.
 * @returns {Array<Promise>}
 */
function buildUserTransferPromises(users, targetRoleId) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
  );
}

/**
 * Build promises to delete a set of permissions.
 * @param {Array} permissions - Permissions to delete.
 * @returns {Array<Promise>}
 */
function buildPermissionDeletionPromises(permissions) {
  return permissions.map(p =>
    strapi.query('permission', 'users-permissions').delete({ id: p.id })
  );
}

/**
 * Delete a role and reassign its users.
 */
async function deleteRole(roleID, publicRoleID) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const promises = [
    ...buildUserTransferPromises(role.users, publicRoleID),
    ...buildPermissionDeletionPromises(role.permissions),
    strapi.query('role', 'users-permissions').delete({ id: roleID })
  ];

  return Promise.all(promises);
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
 * Generate an actions map for a controller object.
 * @param {Object} controllerObj - Controller definitions.
 * @returns {Object}
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
 * Build application controllers actions map.
 */
function buildAppControllers() {
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
 * Build plugins permissions map.
 */
function buildPluginsPermissions() {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
}

/**
 * Retrieve all actions from application and plugins.
 */
function getActions() {
  const appControllers = buildAppControllers();
  const pluginsPermissions = buildPluginsPermissions();

  const permissions = {
    application: { controllers: appControllers.controllers },
  };

  return _.merge(permissions, pluginsPermissions);
}

/**
 * Build permission object for a role.
 * @param {Object} role - Role with permissions.
 * @param {Array} plugins - Plugin list.
 * @returns {Object}
 */
function buildRolePermissions(role, plugins) {
  return role.permissions.reduce((acc, permission) => {
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

  const permissions = buildRolePermissions(role, plugins);
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
 * Build routes for application.
 */
function buildAppRoutes() {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
}

/**
 * Build routes for plugins.
 */
function buildPluginRoutes() {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
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

/**
 * Retrieve all routes from application and plugins.
 */
async function getRoutes() {
  const routes = buildAppRoutes();
  const pluginsRoutes = buildPluginRoutes();
  return _.merge({ application: routes }, pluginsRoutes);
}

/**
 * Extract first‑level actions from the application.
 */
function extractAppActions() {
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
 * Extract first‑level actions from plugins.
 */
function extractPluginActions() {
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
 * Split a permission string into its components.
 * @param {String} str - Permission string.
 * @returns {Object}
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Update all permissions based on current codebase.
 */
async function updatePermissions() {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });

  let permissionsFoundInDB = _.uniq(
    dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
  );

  const appActions = extractAppActions();
  const pluginsActions = extractPluginActions();
  const actionsFoundInFiles = appActions.concat(pluginsActions);

  const permissionsFoundInFiles = _.uniq(
    actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    )
  );

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);
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
 * Build update promises for changed permissions.
 * @param {Object} role - Existing role data.
 * @param {Object} body - Incoming role payload.
 * @returns {Array<Promise>}
 */
function buildPermissionUpdatePromises(role, body) {
  return Object.keys(body.permissions || {}).reduce((acc, type) => {
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
                role: role.id,
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
}

/**
 * Update a role, its permissions and user assignments.
 */
async function updateRole(roleID, body) {
  const [role, authenticated] = await Promise.all([
    getRole(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  await strapi
    .query('role', 'users-permissions')
    .update({ id: roleID }, _.pick(body, ['name', 'description']));

  await Promise.all(buildPermissionUpdatePromises(role, body));

  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
}

/**
 * Update a single user's role.
 */
async function updateUserRole(user, role) {
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
```