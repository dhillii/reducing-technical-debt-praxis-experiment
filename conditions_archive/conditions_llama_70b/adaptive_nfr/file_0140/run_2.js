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

const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Creates a new role.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise} Promise resolving with the created role.
 */
const createRole = async params => {
  const roleType = getRoleType(params);
  const role = await createRoleEntity(roleType, params);
  const permissions = createPermissions(role, params);
  const users = updateRoleUsers(role, params);

  return await Promise.all([permissions, users]);
};

/**
 * Gets the role type from the provided parameters.
 * @param {Object} params - Role creation parameters.
 * @returns {string} Role type.
 */
const getRoleType = params => {
  if (!params.type) {
    return _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  return params.type;
};

/**
 * Creates a new role entity.
 * @param {string} roleType - Role type.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise} Promise resolving with the created role entity.
 */
const createRoleEntity = async (roleType, params) => {
  return await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));
};

/**
 * Creates permissions for the provided role.
 * @param {Object} role - Created role.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise} Promise resolving with the created permissions.
 */
const createPermissions = async (role, params) => {
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

  return await Promise.all(arrayOfPromises);
};

/**
 * Updates the role users.
 * @param {Object} role - Created role.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise} Promise resolving with the updated role users.
 */
const updateRoleUsers = async (role, params) => {
  if (params.users && params.users.length > 0) {
    return await strapi.query('role', 'users-permissions').update(
      {
        id: role.id,
      },
      { users: params.users }
    );
  }

  return Promise.resolve();
};

/**
 * Deletes a role.
 * @param {number} roleID - Role ID.
 * @param {number} publicRoleID - Public role ID.
 * @returns {Promise} Promise resolving with the deleted role.
 */
const deleteRole = async (roleID, publicRoleID) => {
  const role = await getRoleEntity(roleID);
  const users = updateRoleUsersToPublic(role, publicRoleID);
  const permissions = deleteRolePermissions(role);
  const roleDeletion = deleteRoleEntity(roleID);

  return await Promise.all([users, permissions, roleDeletion]);
};

/**
 * Gets the role entity.
 * @param {number} roleID - Role ID.
 * @returns {Promise} Promise resolving with the role entity.
 */
const getRoleEntity = async roleID => {
  return await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);
};

/**
 * Updates the role users to the public role.
 * @param {Object} role - Role entity.
 * @param {number} publicRoleID - Public role ID.
 * @returns {Promise} Promise resolving with the updated role users.
 */
const updateRoleUsersToPublic = async (role, publicRoleID) => {
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

  return await Promise.all(arrayOfPromises);
};

/**
 * Deletes the role permissions.
 * @param {Object} role - Role entity.
 * @returns {Promise} Promise resolving with the deleted role permissions.
 */
const deleteRolePermissions = async role => {
  const arrayOfPromises = role.permissions.reduce((acc, permission) => {
    acc.push(
      strapi.query('permission', 'users-permissions').delete({
        id: permission.id,
      })
    );

    return acc;
  }, []);

  return await Promise.all(arrayOfPromises);
};

/**
 * Deletes the role entity.
 * @param {number} roleID - Role ID.
 * @returns {Promise} Promise resolving with the deleted role entity.
 */
const deleteRoleEntity = async roleID => {
  return await strapi.query('role', 'users-permissions').delete({ id: roleID });
};

/**
 * Gets the plugins.
 * @param {string} lang - Language.
 * @returns {Promise} Promise resolving with the plugins.
 */
const getPlugins = async lang => {
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
};

/**
 * Gets the actions.
 * @returns {Object} Actions.
 */
const getActions = () => {
  const generateActions = data =>
    Object.keys(data).reduce((acc, key) => {
      if (_.isFunction(data[key])) {
        acc[key] = { enabled: false, policy: '' };
      }

      return acc;
    }, {});

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

  const permissions = {
    application: {
      controllers: appControllers.controllers,
    },
  };

  return _.merge(permissions, pluginsPermissions);
};

/**
 * Gets a role.
 * @param {number} roleID - Role ID.
 * @param {Array} plugins - Plugins.
 * @returns {Promise} Promise resolving with the role.
 */
const getRole = async (roleID, plugins) => {
  const role = await getRoleEntity(roleID);
  const permissions = getRolePermissions(role, plugins);

  return {
    ...role,
    permissions,
  };
};

/**
 * Gets the role permissions.
 * @param {Object} role - Role entity.
 * @param {Array} plugins - Plugins.
 * @returns {Object} Role permissions.
 */
const getRolePermissions = (role, plugins) => {
  return role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: _.toNumber(permission.enabled) == true,
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
};

/**
 * Gets the roles.
 * @returns {Promise} Promise resolving with the roles.
 */
const getRoles = async () => {
  const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }

  return roles;
};

/**
 * Gets the routes.
 * @returns {Object} Routes.
 */
const getRoutes = () => {
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
 * Updates the permissions.
 * @returns {Promise} Promise resolving with the updated permissions.
 */
const updatePermissions = async () => {
  const roles = await getRolesMap();
  const dbPermissions = await getDBPermissions();
  const permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[roles.primaryKey]}`
  );
  permissionsFoundInDB = _.uniq(permissionsFoundInDB);

  const actionsFoundInFiles = getActionsFoundInFiles();
  const permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.values.map(role => `${action}.${role[roles.primaryKey]}`)],
    []
  );
  permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitted);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitted);

    await Promise.all(
      toAdd.map(permission =>
        strapi.query('permission', 'users-permissions').create({
          type: permission.type,
          controller: permission.controller,
          action: permission.action,
          enabled: isPermissionEnabled(permission, roles.get(permission.roleId)),
          policy: '',
          role: permission.roleId,
        })
      )
    );

    await Promise.all(
      toRemove.map(permission => {
        const { type, controller, action, roleId: role } = permission;
        return strapi.query('permission', 'users-permissions').delete({ type, controller, action, role });
      })
    );
  }
};

/**
 * Gets the roles map.
 * @returns {Promise} Promise resolving with the roles map.
 */
const getRolesMap = async () => {
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const primaryKey = strapi.query('role', 'users-permissions').primaryKey;

  return {
    primaryKey,
    values: roles,
    get: id => roles.find(role => role[id] === id),
  };
};

/**
 * Gets the DB permissions.
 * @returns {Promise} Promise resolving with the DB permissions.
 */
const getDBPermissions = async () => {
  return await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
};

/**
 * Gets the actions found in files.
 * @returns {Array} Actions found in files.
 */
const getActionsFoundInFiles = () => {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });

    return acc;
  }, []);

  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });

    return acc;
  }, []);

  return appActions.concat(pluginsActions);
};

/**
 * Splits a string into an object.
 * @param {string} str - String to split.
 * @returns {Object} Split object.
 */
const splitted = str => {
  const [type, controller, action, roleId] = str.split('.');

  return { type, controller, action, roleId };
};

/**
 * Initializes the service.
 * @returns {Promise} Promise resolving with the initialized service.
 */
const initialize = async () => {
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

  return await updatePermissions();
};

/**
 * Updates a role.
 * @param {number} roleID - Role ID.
 * @param {Object} body - Role update body.
 * @returns {Promise} Promise resolving with the updated role.
 */
const updateRole = async (roleID, body) => {
  const [role, authenticated] = await Promise.all([
    getRole(roleID, []),
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
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
};

/**
 * Updates a user role.
 * @param {Object} user - User.
 * @param {number} role - Role ID.
 * @returns {Promise} Promise resolving with the updated user role.
 */
const updateUserRole = async (user, role) => {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
};

/**
 * Compiles a template.
 * @param {string} layout - Template layout.
 * @param {Object} data - Template data.
 * @returns {string} Compiled template.
 */
const template = (layout, data) => {
  const compiledObject = _.template(layout);
  return compiledObject(data);
};

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