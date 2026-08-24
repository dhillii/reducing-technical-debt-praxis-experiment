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
 * Creates a new role and assigns permissions and users.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise<Array>} - Array of created entities.
 */
async function createRoleWithPermissions(params) {
  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const permissionPromises = buildPermissionCreatePromises(params, role.id);
  const userAssignmentPromise = buildUserRoleAssignmentPromise(params, role.id);

  return await Promise.all([...permissionPromises, userAssignmentPromise]);
}

/**
 * Builds permission creation promises for a new role.
 * @param {Object} params - Role creation parameters including permissions.
 * @param {String} roleId - ID of the newly created role.
 * @returns {Array} - Array of permission creation promises.
 */
function buildPermissionCreatePromises(params, roleId) {
  const promises = [];

  Object.keys(params.permissions || {}).forEach(type => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        promises.push(
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
  });

  return promises;
}

/**
 * Builds user assignment promise if users are provided.
 * @param {Object} params - Role creation parameters including users.
 * @param {String} roleId - ID of the newly created role.
 * @returns {Promise|null} - User assignment promise or null.
 */
function buildUserRoleAssignmentPromise(params, roleId) {
  if (params.users && params.users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: roleId },
      { users: params.users }
    );
  }

  return null;
}

/**
 * Deletes a role and reassigns its users and permissions.
 * @param {String} roleID - ID of the role to delete.
 * @param {String} publicRoleID - ID of the public role to reassign users to.
 * @returns {Promise<Array>} - Array of deletion/update promises.
 */
async function deleteRoleAndReassign(roleID, publicRoleID) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const userReassignmentPromises = reassignUsersToPublicRole(role.users, publicRoleID);
  const permissionRemovalPromises = removeRolePermissions(role.permissions);
  const roleDeletionPromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

  return await Promise.all([...userReassignmentPromises, ...permissionRemovalPromises, roleDeletionPromise]);
}

/**
 * Reassigns users from a deleted role to the public role.
 * @param {Array} users - Array of user objects.
 * @param {String} publicRoleID - ID of the public role.
 * @returns {Array} - Array of user update promises.
 */
function reassignUsersToPublicRole(users, publicRoleID) {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleID }
    )
  );
}

/**
 * Removes all permissions associated with a role.
 * @param {Array} permissions - Array of permission objects.
 * @returns {Array} - Array of permission deletion promises.
 */
function removeRolePermissions(permissions) {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );
}

/**
 * Retrieves plugins from the marketplace.
 * @param {String} lang - Language code.
 * @returns {Promise<Array>} - Array of plugin data.
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
 * Generates action definitions for controllers.
 * @param {Object} data - Controller actions object.
 * @returns {Object} - Mapped action definitions.
 */
function generateActions(data) {
  return Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }

    return acc;
  }, {});
}

/**
 * Aggregates application controller actions.
 * @returns {Object} - Aggregated application controller actions.
 */
function getAppControllerActions() {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce(
      (acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
        });

        return acc;
      },
      { controllers: {} }
    );
}

/**
 * Aggregates plugin controller actions.
 * @returns {Object} - Aggregated plugin controller actions.
 */
function getPluginControllerActions() {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);

      return obj;
    }, initialState);

    return acc;
  }, {});
}

/**
 * Retrieves all available permissions.
 * @returns {Object} - Merged permissions object.
 */
function getPermissions() {
  const appControllers = getAppControllerActions();
  const pluginsPermissions = getPluginControllerActions();

  const permissions = {
    application: {
      controllers: appControllers.controllers,
    },
  };

  return _.merge(permissions, pluginsPermissions);
}

/**
 * Retrieves a role with its permissions structured by type.
 * @param {String} roleID - ID of the role.
 * @param {Array} plugins - Available plugins metadata.
 * @returns {Object} - Role object with structured permissions.
 */
async function getRoleWithStructuredPermissions(roleID, plugins) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = buildPermissionStructure(role.permissions, plugins);

  return {
    ...role,
    permissions,
  };
}

/**
 * Builds structured permission object from role permissions.
 * @param {Array} permissions - Array of permission objects.
 * @param {Array} plugins - Available plugins metadata.
 * @returns {Object} - Structured permissions object.
 */
function buildPermissionStructure(permissions, plugins) {
  return permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: permission.enabled === 1,
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
 * Retrieves all roles with user counts.
 * @returns {Promise<Array>} - Array of roles with user counts.
 */
async function getRolesWithUserCounts() {
  const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }

  return roles;
}

/**
 * Retrieves all application and plugin routes.
 * @returns {Object} - Merged routes object.
 */
function getRoutes() {
  const applicationRoutes = Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

  const clonedPlugins = _.cloneDeep(strapi.plugins);
  const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);

      return acc.concat(curr);
    }, []);

    acc[current] = routes;

    return acc;
  }, {});

  return _.merge({ application: applicationRoutes }, pluginsRoutes);
}

/**
 * Updates permissions across all roles based on current controller actions.
 * @returns {Promise<void>}
 */
async function updatePermissions() {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  const permissionsFoundInDB = _.uniq(
    dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    )
  );

  const actionsFoundInFiles = [
    ...getApplicationActions(),
    ...getPluginActions(),
  ];

  const permissionsFoundInFiles = _.uniq(
    actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    )
  );

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles)
      .map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB)
      .map(splitPermissionString);

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
}

/**
 * Splits a permission string into its components.
 * @param {String} str - Permission string.
 * @returns {Object} - Object with type, controller, action, and roleId.
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Retrieves all application controller actions.
 * @returns {Array} - Array of action strings.
 */
function getApplicationActions() {
  const actions = [];

  Object.keys(strapi.api || {}).forEach(api => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const controllerActions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);

      actions.push(...controllerActions);
    });
  });

  return actions;
}

/**
 * Retrieves all plugin controller actions.
 * @returns {Array} - Array of action strings.
 */
function getPluginActions() {
  const actions = [];

  Object.keys(strapi.plugins).forEach(plugin => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const controllerActions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

      actions.push(...controllerActions);
    });
  });

  return actions;
}

/**
 * Initializes default roles and updates permissions.
 * @returns {Promise<void>}
 */
async function initializeSystemRoles() {
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

  await updatePermissions();
}

/**
 * Updates a role's metadata and permissions.
 * @param {String} roleID - ID of the role to update.
 * @param {Object} body - Update payload.
 * @returns {Promise<void>}
 */
async function updateRoleAndPermissions(roleID, body) {
  const [role, authenticated] = await Promise.all([
    getRoleWithStructuredPermissions(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  await strapi
    .query('role', 'users-permissions')
    .update({ id: roleID }, _.pick(body, ['name', 'description']));

  await updateRolePermissions(roleID, role, body);

  await updateRoleUsers(roleID, authenticated.id, body.users, role.users);
}

/**
 * Updates role permissions based on changes in the request body.
 * @param {String} roleID - ID of the role.
 * @param {Object} role - Current role object.
 * @param {Object} body - Update payload.
 * @returns {Promise<void>}
 */
async function updateRolePermissions(roleID, role, body) {
  const permissionUpdatePromises = [];

  Object.keys(body.permissions || {}).forEach(type => {
    Object.keys(body.permissions[type].controllers).forEach(controller => {
      Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
        const bodyAction = body.permissions[type].controllers[controller][action];
        const currentAction = _.get(
          role.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          permissionUpdatePromises.push(
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

  await Promise.all(permissionUpdatePromises);
}

/**
 * Updates role users by adding new ones and removing old ones.
 * @param {String} roleID - ID of the role.
 * @param {String} authenticatedID - ID of the authenticated role.
 * @param {Array} newUsers - New users to assign.
 * @param {Array} currentUsers - Current users assigned.
 * @returns {Promise<void>}
 */
async function updateRoleUsers(roleID, authenticatedID, newUsers, currentUsers) {
  const addedUsers = _.differenceBy(newUsers, currentUsers, 'id');
  const removedUsers = _.differenceBy(currentUsers, newUsers, 'id');

  await Promise.all(addedUsers.map(user => updateUserRole(user, roleID)));
  await Promise.all(removedUsers.map(user => updateUserRole(user, authenticatedID)));
}

/**
 * Updates a user's role.
 * @param {Object} user - User object.
 * @param {String} role - Role ID.
 * @returns {Promise<Object>} - Updated user.
 */
function updateUserRole(user, role) {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
}

module.exports = {
  async createRole(params) {
    return await createRoleWithPermissions(params);
  },

  async deleteRole(roleID, publicRoleID) {
    return await deleteRoleAndReassign(roleID, publicRoleID);
  },

  getPlugins,
  getActions() {
    return getPermissions();
  },

  async getRole(roleID, plugins) {
    return await getRoleWithStructuredPermissions(roleID, plugins);
  },

  async getRoles() {
    return await getRolesWithUserCounts();
  },

  getRoutes,

  async updatePermissions() {
    return await updatePermissions();
  },

  async initialize() {
    return await initializeSystemRoles();
  },

  async updateRole(roleID, body) {
    return await updateRoleAndPermissions(roleID, body);
  },

  async updateUserRole(user, role) {
    return await updateUserRole(user, role);
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};