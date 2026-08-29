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
 * Creates a new role with associated permissions
 * @param {Object} params - Role creation parameters
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
 * @param {Object} params - Permission parameters
 * @param {Object} role - Role object
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
 * Updates user relations for a role
 * @param {Array} arrayOfPromises - Array of promises to append to
 * @param {Object} params - Parameters containing users
 * @param {Object} role - Role object
 */
function updateUserRelations(arrayOfPromises, params, role) {
  if (params.users && params.users.length > 0)
    arrayOfPromises.push(
      strapi.query('role', 'users-permissions').update(
        {
          id: role.id,
        },
        { users: params.users }
      )
    );
}

/**
 * Finds a role by ID with relations
 * @param {string} roleID - Role ID to find
 */
async function findRoleById(roleID) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  return role;
}

/**
 * Moves users to a different role
 * @param {Array} users - Users to move
 * @param {string} publicRoleID - Target role ID
 */
function moveUsersToRole(users, publicRoleID) {
  const arrayOfPromises = users.reduce((acc, user) => {
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
 * Deletes role permissions
 * @param {Array} permissions - Permissions to delete
 */
function deleteRolePermissions(permissions) {
  const arrayOfPromises = permissions.map(permission => 
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );

  return arrayOfPromises;
}

/**
 * Generates controller actions
 * @param {Object} data - Controller data
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
 * Builds application controllers structure
 */
function buildAppControllers() {
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
 * Builds plugins permissions structure
 */
function buildPluginsPermissions() {
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
 * Processes role permissions grouping
 * @param {Array} permissions - Raw permissions
 * @param {Array} plugins - Plugins information
 */
function processRolePermissions(permissions, plugins) {
  return permissions.reduce((acc, permission) => {
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
 * @param {Array} roles - Roles to count users for
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
 * Aggregates application actions
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
 * Aggregates plugins actions
 */
function aggregatePluginsActions() {
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
 * Creates permissions for all roles
 * @param {Array} actionsFoundInFiles - Available actions
 * @param {Array} roles - All roles
 */
function createPermissionsForRoles(actionsFoundInFiles, roles) {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  
  let permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

  return permissionsFoundInFiles;
}

/**
 * Splits permission string into components
 * @param {string} str - Permission string
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');

  return { type, controller, action, roleId };
}

/**
 * Updates database permissions
 * @param {Array} toAdd - Permissions to add
 * @param {Array} toRemove - Permissions to remove
 * @param {Object} rolesMap - Role mapping
 */
async function updateDatabasePermissions(toAdd, toRemove, rolesMap) {
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
 * Initializes default roles if none exist
 */
async function initializeDefaultRoles() {
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
}

/**
 * Updates role permissions
 * @param {string} roleID - Role ID
 * @param {Object} body - Update body
 * @param {Object} role - Current role
 */
async function updateRolePermissions(roleID, body, role) {
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
}

/**
 * Updates user role assignments
 * @param {Array} newUsers - Users to add to role
 * @param {Array} oldUsers - Users to remove from role
 * @param {string} roleID - Target role ID
 * @param {Object} authenticated - Authenticated role
 */
async function updateUserRoleAssignments(newUsers, oldUsers, roleID, authenticated) {
  await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));
  await Promise.all(oldUsers.map(user => this.updateUserRole(user, authenticated.id)));
}

module.exports = {
  async createRole(params) {
    const role = await createNewRole(params);
    const arrayOfPromises = createRolePermissions(params, role);
    updateUserRelations(arrayOfPromises, params, role);
    
    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await findRoleById(roleID);
    const arrayOfPromises = moveUsersToRole(role.users, publicRoleID);
    const deletePromises = deleteRolePermissions(role.permissions);
    const allPromises = [...arrayOfPromises, ...deletePromises];
    
    allPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));
    
    return await Promise.all(allPromises);
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
    const appControllers = buildAppControllers();
    const pluginsPermissions = buildPluginsPermissions();

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

    const permissions = processRolePermissions(role.permissions, plugins);

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
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
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

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    let permissionsFoundInDB = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginsActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = createPermissionsForRoles(actionsFoundInFiles, roles);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

      await updateDatabasePermissions(toAdd, toRemove, rolesMap);
    }
  },

  async initialize() {
    await initializeDefaultRoles();
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

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    
    await updateUserRoleAssignments(newUsers, oldUsers, roleID, authenticated);
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};