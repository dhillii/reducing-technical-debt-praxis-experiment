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
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const arrayOfPromises = createPermissions(role, params.permissions);
  if (params.users && params.users.length > 0) {
    arrayOfPromises.push(updateRoleUsers(role, params.users));
  }

  return await Promise.all(arrayOfPromises);
};

/**
 * Creates permissions for a role.
 * @param {Object} role - Role object.
 * @param {Object} permissions - Permissions object.
 * @returns {Array} Array of promises for creating permissions.
 */
const createPermissions = (role, permissions) => {
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
};

/**
 * Updates role users.
 * @param {Object} role - Role object.
 * @param {Array} users - Array of user IDs.
 * @returns {Promise} Promise resolving with the updated role.
 */
const updateRoleUsers = async (role, users) => {
  return strapi.query('role', 'users-permissions').update(
    {
      id: role.id,
    },
    { users }
  );
};

/**
 * Deletes a role.
 * @param {Number} roleID - Role ID.
 * @param {Number} publicRoleID - Public role ID.
 * @returns {Promise} Promise resolving with the deleted role.
 */
const deleteRole = async (roleID, publicRoleID) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const arrayOfPromises = moveUsersToGuestRole(role, publicRoleID);
  arrayOfPromises.push(removePermissions(role));
  arrayOfPromises.push(deleteRoleEntry(roleID));

  return await Promise.all(arrayOfPromises);
};

/**
 * Moves users to the guest role.
 * @param {Object} role - Role object.
 * @param {Number} publicRoleID - Public role ID.
 * @returns {Array} Array of promises for moving users.
 */
const moveUsersToGuestRole = (role, publicRoleID) => {
  return role.users.reduce((acc, user) => {
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
};

/**
 * Removes permissions related to a role.
 * @param {Object} role - Role object.
 * @returns {Array} Array of promises for removing permissions.
 */
const removePermissions = role => {
  return role.permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

/**
 * Deletes a role entry.
 * @param {Number} roleID - Role ID.
 * @returns {Promise} Promise resolving with the deleted role entry.
 */
const deleteRoleEntry = async roleID => {
  return strapi.query('role', 'users-permissions').delete({ id: roleID });
};

/**
 * Gets plugins.
 * @param {String} lang - Language code.
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
 * Gets actions.
 * @returns {Object} Actions object.
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
 * @param {Number} roleID - Role ID.
 * @param {Array} plugins - Array of plugins.
 * @returns {Promise} Promise resolving with the role.
 */
const getRole = async (roleID, plugins) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = groupPermissionsByType(role.permissions, plugins);

  return {
    ...role,
    permissions,
  };
};

/**
 * Groups permissions by type.
 * @param {Array} permissions - Array of permissions.
 * @param {Array} plugins - Array of plugins.
 * @returns {Object} Permissions object grouped by type.
 */
const groupPermissionsByType = (permissions, plugins) => {
  return permissions.reduce((acc, permission) => {
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
 * Gets roles.
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
 * Gets routes.
 * @returns {Object} Routes object.
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
 * Updates permissions.
 * @returns {Promise} Promise resolving with the updated permissions.
 */
const updatePermissions = async () => {
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

  const actionsFoundInFiles = getActionsFoundInFiles();

  const permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitted);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitted);

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
};

/**
 * Gets actions found in files.
 * @returns {Array} Array of actions found in files.
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
 * @param {String} str - String to split.
 * @returns {Object} Object with type, controller, action, and roleId properties.
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

  return updatePermissions();
};

/**
 * Updates a role.
 * @param {Number} roleID - Role ID.
 * @param {Object} body - Role update parameters.
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
 * Updates a user's role.
 * @param {Object} user - User object.
 * @param {Number} role - Role ID.
 * @returns {Promise} Promise resolving with the updated user.
 */
const updateUserRole = async (user, role) => {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
};

/**
 * Compiles a template.
 * @param {String} layout - Template layout.
 * @param {Object} data - Template data.
 * @returns {String} Compiled template.
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