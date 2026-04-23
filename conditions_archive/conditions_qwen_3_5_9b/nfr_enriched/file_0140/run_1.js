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

/**
 * Checks if a permission should be enabled based on default permissions
 * @param {Object} permission - The permission object to check
 * @param {Object} role - The role object to check against
 * @returns {boolean} - Whether the permission is enabled
 */
const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Creates a permission object from controller action data
 * @param {string} type - The permission type
 * @param {string} controller - The controller name
 * @param {string} action - The action name
 * @param {Object} params - Additional permission parameters
 * @returns {Object} - The created permission object
 */
const createPermissionObject = (type, controller, action, params) => ({
  role: params.role,
  type,
  controller,
  action: action.toLowerCase(),
  ...params,
});

/**
 * Extracts permission creation promises from controller data
 * @param {Object} permissions - The permissions object with controller data
 * @param {Object} role - The role object
 * @returns {Promise[]} - Array of permission creation promises
 */
const extractPermissionPromises = (permissions, role) => {
  const arrayOfPromises = Object.keys(permissions || {}).reduce((acc, type) => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create(
            createPermissionObject(type, controller, action, permissions[type].controllers[controller][action])
          )
        );
      });
    });
    return acc;
  }, []);
  return arrayOfPromises;
};

/**
 * Updates role users with provided user list
 * @param {Object} role - The role object
 * @param {Array} users - Array of user IDs to update
 * @returns {Promise} - Promise for the update operation
 */
const updateRoleUsers = (role, users) =>
  strapi.query('role', 'users-permissions').update(
    { id: role.id },
    { users }
  );

/**
 * Moves users from a role to the public role
 * @param {Array} users - Array of user objects
 * @param {string} publicRoleID - The public role ID
 * @returns {Promise[]} - Array of user update promises
 */
const moveUsersToPublic = (users, publicRoleID) =>
  users.reduce((acc, user) => {
    acc.push(
      strapi.query('user', 'users-permissions').update(
        { id: user.id },
        { role: publicRoleID }
      )
    );
    return acc;
  }, []);

/**
 * Deletes permissions associated with a role
 * @param {Array} permissions - Array of permission objects
 * @returns {Promise[]} - Array of permission deletion promises
 */
const deleteRolePermissions = (permissions) =>
  permissions.reduce((acc, permission) => {
    acc.push(
      strapi.query('permission', 'users-permissions').delete({ id: permission.id })
    );
    return acc;
  }, []);

/**
 * Deletes a role from the database
 * @param {string} roleID - The role ID to delete
 * @returns {Promise} - Promise for the deletion operation
 */
const deleteRole = (roleID) =>
  strapi.query('role', 'users-permissions').delete({ id: roleID });

/**
 * Fetches plugins from Strapi marketplace
 * @param {string} lang - Language code for the request
 * @returns {Promise} - Promise resolving to plugins array
 */
const fetchPlugins = (lang = 'en') =>
  new Promise(resolve => {
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

/**
 * Generates action metadata from controller data
 * @param {Object} data - Controller data object
 * @returns {Object} - Object with action metadata
 */
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Collects application controller actions
 * @returns {Object} - Object containing application controller actions
 */
const collectAppControllers = () => {
  const appControllers = Object.keys(strapi.api || {})
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
  return appControllers;
};

/**
 * Collects plugin controller actions
 * @returns {Object} - Object containing plugin controller actions
 */
const collectPluginsControllers = () => {
  const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
  return pluginsPermissions;
};

/**
 * Merges application and plugin permissions into a single object
 * @returns {Object} - Merged permissions object
 */
const mergePermissions = () => {
  const permissions = {
    application: {
      controllers: collectAppControllers().controllers,
    },
  };
  return _.merge(permissions, collectPluginsControllers());
};

/**
 * Retrieves a role with its permissions
 * @param {string} roleID - The role ID to retrieve
 * @param {Array} plugins - Array of plugin objects
 * @returns {Promise} - Promise resolving to role object with permissions
 */
const fetchRole = (roleID, plugins) =>
  strapi.query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions'])
    .then(role => {
      if (!role) {
        throw new Error('Cannot find this role');
      }

      const permissions = role.permissions.reduce((acc, permission) => {
        _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
          enabled: !!_.toNumber(permission.enabled),
          policy: permission.policy,
        });

        if (permission.type !== 'application' && !acc[permission.type].information) {
          acc[permission.type].information =
            plugins.find(plugin => plugin.id === permission.type) || {};
        }

        return acc;
      }, {});

      return {
        ...role,
        permissions,
      };
    });

/**
 * Retrieves all roles with user counts
 * @returns {Promise} - Promise resolving to array of roles with user counts
 */
const fetchRoles = () =>
  strapi.query('role', 'users-permissions')
    .find({ _sort: 'name' }, [])
    .then(roles => {
      const rolesWithCounts = roles.map(role => ({
        ...role,
        nb_users: strapi
          .query('user', 'users-permissions')
          .count({ role: role.id })
          .then(count => count),
      }));
      return Promise.all(rolesWithCounts);
    });

/**
 * Retrieves all routes from application and plugins
 * @returns {Promise} - Promise resolving to routes object
 */
const fetchRoutes = () => {
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
};

/**
 * Extracts permission components from a string
 * @param {string} str - The permission string to split
 * @returns {Object} - Object with type, controller, action, and roleId
 */
const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Determines if a permission should be enabled based on default permissions
 * @param {Object} permission - The permission object to check
 * @param {Object} role - The role object to check against
 * @returns {boolean} - Whether the permission is enabled
 */
const shouldEnablePermission = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Creates permission entries for a role
 * @param {Array} permissions - Array of permission objects
 * @param {string} roleId - The role ID
 * @returns {Promise[]} - Array of permission creation promises
 */
const createRolePermissions = (permissions, roleId) =>
  permissions.reduce((acc, permission) => {
    acc.push(
      strapi.query('permission', 'users-permissions').create({
        role: roleId,
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: shouldEnablePermission(permission, { type: permission.roleType }),
        policy: '',
      })
    );
    return acc;
  }, []);

/**
 * Deletes permission entries for a role
 * @param {Array} permissions - Array of permission objects
 * @returns {Promise[]} - Array of permission deletion promises
 */
const deleteRolePermissions = (permissions) =>
  permissions.reduce((acc, permission) => {
    acc.push(
      strapi.query('permission', 'users-permissions').delete({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        role: permission.roleId,
      })
    );
    return acc;
  }, []);

/**
 * Updates a user's role
 * @param {Object} user - The user object
 * @param {string} role - The role ID to assign
 * @returns {Promise} - Promise for the update operation
 */
const updateUserRole = (user, role) =>
  strapi.query('user', 'users-permissions').update({ id: user.id }, { role });

/**
 * Updates a role's name and description
 * @param {string} roleID - The role ID to update
 * @param {Object} body - The update data
 * @returns {Promise} - Promise for the update operation
 */
const updateRoleInfo = (roleID, body) =>
  strapi.query('role', 'users-permissions').update({ id: roleID }, _.pick(body, ['name', 'description']));

/**
 * Updates a role's permissions
 * @param {string} roleID - The role ID
 * @param {Object} body - The permissions data
 * @param {Object} role - The role object
 * @returns {Promise[]} - Array of permission update promises
 */
const updateRolePermissions = (roleID, body, role) =>
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
  }, []);

/**
 * Retrieves the primary key field name for permissions
 * @returns {Object} - Object with primaryKey property
 */
const getPermissionPrimaryKey = () =>
  strapi.query('permission', 'users-permissions').primaryKey;

/**
 * Retrieves all roles from the database
 * @returns {Promise} - Promise resolving to array of roles
 */
const fetchAllRoles = () =>
  strapi.query('role', 'users-permissions').find({}, []);

/**
 * Retrieves all permissions from the database
 * @returns {Promise} - Promise resolving to array of permissions
 */
const fetchAllPermissions = () =>
  strapi.query('permission', 'users-permissions').find({ _limit: -1 });

/**
 * Aggregates application controller actions
 * @returns {Array} - Array of application action strings
 */
const aggregateAppActions = () => {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
  return appActions;
};

/**
 * Aggregates plugin controller actions
 * @returns {Array} - Array of plugin action strings
 */
const aggregatePluginsActions = () => {
  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
  return pluginsActions;
};

/**
 * Generates permission strings from action strings
 * @param {Array} actions - Array of action strings
 * @param {Array} roles - Array of role objects
 * @returns {Array} - Array of permission strings
 */
const generatePermissionStrings = (actions, roles) =>
  actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );

/**
 * Compares two arrays and returns differences
 * @param {Array} array1 - First array
 * @param {Array} array2 - Second array
 * @returns {Object} - Object with toAdd and toRemove arrays
 */
const compareArrays = (array1, array2) => ({
  toAdd: _.difference(array2, array1),
  toRemove: _.difference(array1, array2),
});

/**
 * Creates a role with default permissions
 * @param {Object} params - Role creation parameters
 * @returns {Promise} - Promise resolving to created role
 */
const createRole = (params) => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const arrayOfPromises = extractPermissionPromises(params.permissions, role);

  if (params.users && params.users.length > 0) {
    arrayOfPromises.push(updateRoleUsers(role, params.users));
  }

  return Promise.all(arrayOfPromises);
};

/**
 * Deletes a role and moves its users to public role
 * @param {string} roleID - The role ID to delete
 * @param {string} publicRoleID - The public role ID
 * @returns {Promise} - Promise resolving to deletion results
 */
const deleteRole = (roleID, publicRoleID) =>
  strapi.query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions'])
    .then(role => {
      if (!role) {
        throw new Error('Cannot find this role');
      }

      const arrayOfPromises = [
        ...moveUsersToPublic(role.users, publicRoleID),
        ...deleteRolePermissions(role.permissions),
        deleteRole(roleID),
      ];

      return Promise.all(arrayOfPromises);
    });

/**
 * Initializes the users-permissions system
 * @returns {Promise} - Promise resolving to update result
 */
const initialize = () =>
  strapi.query('role', 'users-permissions')
    .count()
    .then(roleCount => {
      if (roleCount === 0) {
        strapi.query('role', 'users-permissions').create({
          name: 'Authenticated',
          description: 'Default role given to authenticated user.',
          type: 'authenticated',
        });

        strapi.query('role', 'users-permissions').create({
          name: 'Public',
          description: 'Default role given to unauthenticated user.',
          type: 'public',
        });
      }
      return updatePermissions();
    });

/**
 * Updates role permissions based on current application state
 * @returns {Promise} - Promise resolving to update result
 */
const updatePermissions = () => {
  const { primaryKey } = getPermissionPrimaryKey();
  const roles = fetchAllRoles();
  const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

  const dbPermissions = fetchAllPermissions();
  let permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  permissionsFoundInDB = _.uniq(permissionsFoundInDB);

  const appActions = aggregateAppActions();
  const pluginsActions = aggregatePluginsActions();
  const actionsFoundInFiles = appActions.concat(pluginsActions);

  const permissionsFoundInFiles = generatePermissionStrings(actionsFoundInFiles, roles);
  permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

  const comparison = compareArrays(permissionsFoundInDB, permissionsFoundInFiles);

  if (comparison.toAdd.length > 0 || comparison.toRemove.length > 0) {
    const query = strapi.query('permission', 'users-permissions');

    Promise.all(
      comparison.toAdd.map(permission =>
        query.create({
          type: permission.type,
          controller: permission.controller,
          action: permission.action,
          enabled: shouldEnablePermission(permission, rolesMap[permission.roleId]),
          policy: '',
          role: permission.roleId,
        })
      )
    );

    Promise.all(
      comparison.toRemove.map(permission => {
        const { type, controller, action, roleId: role } = permission;
        return query.delete({ type, controller, action, role });
      })
    );
  }
};

/**
 * Updates a role with new information and permissions
 * @param {string} roleID - The role ID to update
 * @param {Object} body - The update data
 * @returns {Promise} - Promise resolving to update result
 */
const updateRole = (roleID, body) => {
  const [role, authenticated] = Promise.all([
    fetchRole(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  updateRoleInfo(roleID, body);

  Promise.all(
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
  Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
};

module.exports = {
  createRole,
  deleteRole,
  getPlugins: fetchPlugins,
  getActions: mergePermissions,
  getRole: fetchRole,
  getRoles: fetchRoles,
  getRoutes: fetchRoutes,
  updatePermissions,
  initialize,
  updateRole,
  updateUserRole,
  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};
```