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
 * Creates a new role with associated permissions and users
 * @param {Object} params - Role creation parameters
 * @returns {Promise<Array>} Array of created permissions and user associations
 */
async function createNewRole(params) {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  return role;
}

/**
 * Creates permissions for a role
 * @param {Object} params - Parameters containing permissions data
 * @param {Object} role - The role object
 * @returns {Array} Array of permission creation promises
 */
function createRolePermissions(params, role) {
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

  return arrayOfPromises;
}

/**
 * Associates users with a role
 * @param {Object} params - Parameters containing users data
 * @param {Object} role - The role object
 * @returns {Array} Updated array of promises including user association
 */
function associateRoleUsers(params, role, arrayOfPromises) {
  // Use Content Manager business logic to handle relation.
  if (params.users && params.users.length > 0)
    arrayOfPromises.push(
      strapi.query('role', 'users-permissions').update(
        {
          id: role.id,
        },
        { users: params.users }
      )
    );

  return arrayOfPromises;
}

/**
 * Finds a role by ID with specified populate fields
 * @param {string} roleID - The role ID to find
 * @param {Array} populateFields - Fields to populate
 * @returns {Promise<Object>} The found role
 */
async function findRoleById(roleID, populateFields) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, populateFields);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  return role;
}

/**
 * Moves users from one role to another
 * @param {Object} role - The source role
 * @param {string} publicRoleID - The target role ID
 * @returns {Array} Array of user update promises
 */
function moveUsersToRole(role, publicRoleID) {
  const arrayOfPromises = role.users.reduce((acc, user) => {
    acc.push(
      strapi.query('user', 'users-permissions').update(
        {
          id: user.id,
        },
        {
          role: publicRoleID,
        }
      )
    );

    return acc;
  }, []);

  return arrayOfPromises;
}

/**
 * Removes permissions associated with a role
 * @param {Object} role - The role whose permissions should be removed
 * @returns {Array} Array of permission deletion promises
 */
function removeRolePermissions(role) {
  const arrayOfPromises = role.permissions.map(permission => {
    return strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    });
  });

  return arrayOfPromises;
}

/**
 * Deletes a role from the database
 * @param {string} roleID - The role ID to delete
 * @returns {Array} Array containing the role deletion promise
 */
function deleteRoleFromDatabase(roleID) {
  const arrayOfPromises = [];
  arrayOfPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));
  return arrayOfPromises;
}

/**
 * Generates actions from controller data
 * @param {Object} data - Controller data
 * @returns {Object} Generated actions object
 */
function generateControllerActions(data) {
  return Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }

    return acc;
  }, {});
}

/**
 * Gets application controllers and their actions
 * @returns {Object} Application controllers structure
 */
function getAppControllers() {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce(
      (acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateControllerActions(strapi.api[key].controllers[controller]);
        });

        return acc;
      },
      { controllers: {} }
    );
}

/**
 * Gets plugins permissions structure
 * @returns {Object} Plugins permissions structure
 */
function getPluginsPermissions() {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateControllerActions(strapi.plugins[key].controllers[k]);

      return obj;
    }, initialState);

    return acc;
  }, {});
}

/**
 * Builds permissions object from role permissions
 * @param {Array} rolePermissions - Array of role permissions
 * @param {Array} plugins - Plugins information
 * @returns {Object} Formatted permissions object
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
 * Counts users for each role
 * @param {Array} roles - Array of roles
 * @returns {Promise<Array>} Roles with user counts
 */
async function countRoleUsers(roles) {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }

  return roles;
}

/**
 * Gets application routes
 * @returns {Array} Application routes
 */
function getAppRoutes() {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
}

/**
 * Gets and processes plugins routes
 * @returns {Object} Processed plugins routes
 */
function getProcessedPluginsRoutes() {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);

      return acc.concat(curr);
    }, []);

    acc[current] = routes;

    return acc;
  }, {});
}

/**
 * Gets unique permission identifiers from database permissions
 * @param {Array} dbPermissions - Database permissions
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Unique permission identifiers
 */
function getUniqueDbPermissionIdentifiers(dbPermissions, primaryKey) {
  let permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  return _.uniq(permissionsFoundInDB);
}

/**
 * Gets application actions from API controllers
 * @returns {Array} Application actions
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
 * Gets plugins actions
 * @returns {Array} Plugins actions
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
 * Creates permission identifiers for all roles
 * @param {Array} actionsFoundInFiles - Actions found in files
 * @param {Array} roles - Roles array
 * @param {string} primaryKey - Primary key field name
 * @returns {Array} Permission identifiers
 */
function createRolePermissionIdentifiers(actionsFoundInFiles, roles, primaryKey) {
  let permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissionsFoundInFiles);
}

/**
 * Splits permission string into components
 * @param {string} str - Permission string
 * @returns {Object} Permission components
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');

  return { type, controller, action, roleId };
}

/**
 * Processes permissions to add to database
 * @param {Array} toAdd - Permissions to add
 * @param {Object} rolesMap - Roles mapping
 * @returns {Promise<Array>} Created permissions
 */
async function processPermissionsToAdd(toAdd, rolesMap) {
  const query = strapi.query('permission', 'users-permissions');

  return await Promise.all(
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
 * Processes permissions to remove from database
 * @param {Array} toRemove - Permissions to remove
 * @returns {Promise<Array>} Deleted permissions
 */
async function processPermissionsToRemove(toRemove) {
  const query = strapi.query('permission', 'users-permissions');

  return await Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
}

/**
 * Updates role permissions
 * @param {string} roleID - Role ID
 * @param {Object} body - Request body
 * @param {Object} role - Role object
 * @returns {Promise<Array>} Updated permissions
 */
async function updateRolePermissions(roleID, body, role) {
  return await Promise.all(
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
}

/**
 * Gets users to add to role
 * @param {Object} body - Request body
 * @param {Object} role - Role object
 * @returns {Array} New users
 */
function getUsersToAddToRole(body, role) {
  return _.differenceBy(body.users, role.users, 'id');
}

/**
 * Gets users to remove from role
 * @param {Object} body - Request body
 * @param {Object} role - Role object
 * @param {Object} authenticated - Authenticated role
 * @returns {Array} Old users
 */
function getUsersToRemoveFromRole(body, role, authenticated) {
  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  return oldUsers.map(user => ({ user, roleId: authenticated.id }));
}

module.exports = {
  async createRole(params) {
    const role = await createNewRole(params);
    const arrayOfPromises = createRolePermissions(params, role);
    const finalPromises = associateRoleUsers(params, role, arrayOfPromises);
    
    return await Promise.all(finalPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await findRoleById(roleID, ['users', 'permissions']);
    const moveUsersPromises = moveUsersToRole(role, publicRoleID);
    const removePermissionsPromises = removeRolePermissions(role);
    const deleteRolePromises = deleteRoleFromDatabase(roleID);
    
    const arrayOfPromises = [...moveUsersPromises, ...removePermissionsPromises, ...deleteRolePromises];
    
    return await Promise.all(arrayOfPromises);
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
    const appControllers = getAppControllers();
    const pluginsPermissions = getPluginsPermissions();

    const permissions = {
      application: {
        controllers: appControllers.controllers,
      },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await findRoleById(roleID, ['permissions']);
    const permissions = buildPermissionsObject(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return await countRoleUsers(roles);
  },

  async getRoutes() {
    const routes = getAppRoutes();
    const pluginsRoutes = getProcessedPluginsRoutes();

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    const permissionsFoundInDB = getUniqueDbPermissionIdentifiers(dbPermissions, primaryKey);

    // Aggregate first level actions.
    const appActions = getAppActions();

    // Aggregate plugins' actions.
    const pluginsActions = getPluginsActions();

    const actionsFoundInFiles = appActions.concat(pluginsActions);

    // create permissions for each role
    const permissionsFoundInFiles = createRolePermissionIdentifiers(actionsFoundInFiles, roles, primaryKey);

    // Compare to know if actions have been added or removed from controllers.
    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      // We have to know the difference to add or remove the permissions entries in the database.
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

      // Execute request to update entries in database for each role.
      await processPermissionsToAdd(toAdd, rolesMap);
      await processPermissionsToRemove(toRemove);
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

    await updateRolePermissions(roleID, body, role);

    // Add user to this role.
    const newUsers = getUsersToAddToRole(body, role);
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsersWithRoles = getUsersToRemoveFromRole(body, role, authenticated);
    await Promise.all(oldUsersWithRoles.map(({ user, roleId }) => this.updateUserRole(user, roleId)));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};