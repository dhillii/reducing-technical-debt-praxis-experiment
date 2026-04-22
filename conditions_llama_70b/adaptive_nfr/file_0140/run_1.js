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
 * @returns {Promise} Promise resolving to the created role.
 */
const createRole = async params => {
  const roleType = getRoleType(params);
  const role = await createRoleEntity(roleType, params);
  const permissions = getPermissions(params);
  await createPermissions(role, permissions);
  await updateRoleUsers(role, params.users);
  return role;
};

const getRoleType = params => {
  if (!params.type) {
    return _.snakeCase(_.deburr(_.toLower(params.name)));
  }
  return params.type;
};

const createRoleEntity = async (roleType, params) => {
  return strapi.query('role', 'users-permissions').create(_.omit(params, ['users', 'permissions']));
};

const getPermissions = params => {
  return Object.keys(params.permissions || {}).reduce((acc, type) => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        acc.push({
          role: params.id,
          type,
          controller,
          action: action.toLowerCase(),
          ...params.permissions[type].controllers[controller][action],
        });
      });
    });

    return acc;
  }, []);
};

const createPermissions = async (role, permissions) => {
  const promises = permissions.map(permission =>
    strapi.query('permission', 'users-permissions').create(permission)
  );
  await Promise.all(promises);
};

const updateRoleUsers = async (role, users) => {
  if (users && users.length > 0) {
    await strapi.query('role', 'users-permissions').update(
      {
        id: role.id,
      },
      { users }
    );
  }
};

/**
 * Deletes a role.
 * @param {Number} roleID - ID of the role to delete.
 * @param {Number} publicRoleID - ID of the public role.
 * @returns {Promise} Promise resolving to the deleted role.
 */
const deleteRole = async (roleID, publicRoleID) => {
  const role = await getRole(roleID);
  if (!role) {
    throw new Error('Cannot find this role');
  }
  await moveUsersToGuestRole(role, publicRoleID);
  await removePermissions(role);
  await deleteRoleEntity(roleID);
};

const getRole = async roleID => {
  return strapi.query('role', 'users-permissions').findOne({ id: roleID }, ['users', 'permissions']);
};

const moveUsersToGuestRole = async (role, publicRoleID) => {
  const promises = role.users.map(user =>
    strapi.query('user', 'users-permissions').update(
      {
        id: user.id,
      },
      {
        role: publicRoleID,
      }
    )
  );
  await Promise.all(promises);
};

const removePermissions = async role => {
  const promises = role.permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
  await Promise.all(promises);
};

const deleteRoleEntity = async roleID => {
  await strapi.query('role', 'users-permissions').delete({ id: roleID });
};

/**
 * Gets plugins.
 * @param {String} lang - Language.
 * @returns {Promise} Promise resolving to the plugins.
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
 * @param {Number} roleID - ID of the role.
 * @param {Array} plugins - Plugins.
 * @returns {Promise} Promise resolving to the role.
 */
const getRole = async (roleID, plugins) => {
  const role = await strapi.query('role', 'users-permissions').findOne({ id: roleID }, ['permissions']);
  if (!role) {
    throw new Error('Cannot find this role');
  }
  const permissions = getRolePermissions(role, plugins);
  return { ...role, permissions };
};

const getRolePermissions = (role, plugins) => {
  return role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: _.toNumber(permission.enabled) == true,
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information = plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
};

/**
 * Gets roles.
 * @returns {Promise} Promise resolving to the roles.
 */
const getRoles = async () => {
  const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi.query('user', 'users-permissions').count({ role: roles[i].id });
  }
  return roles;
};

/**
 * Gets routes.
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
 * Updates permissions.
 * @returns {Promise} Promise resolving to the updated permissions.
 */
const updatePermissions = async () => {
  const roles = await getRolesForUpdate();
  const dbPermissions = await getDBPermissions();
  const permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
  );
  const permissionsFoundInDBUnique = _.uniq(permissionsFoundInDB);
  const actionsFoundInFiles = getActionsFoundInFiles();
  const permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  const permissionsFoundInFilesUnique = _.uniq(permissionsFoundInFiles);
  if (!_.isEqual(permissionsFoundInDBUnique.sort(), permissionsFoundInFilesUnique.sort())) {
    const toRemove = _.difference(permissionsFoundInDBUnique, permissionsFoundInFilesUnique).map(splitted);
    const toAdd = _.difference(permissionsFoundInFilesUnique, permissionsFoundInDBUnique).map(splitted);
    await updatePermissionsInDB(toAdd, toRemove, roles);
  }
};

const getRolesForUpdate = async () => {
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
  return rolesMap;
};

const getDBPermissions = async () => {
  return strapi.query('permission', 'users-permissions').find({ _limit: -1 });
};

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

const splitted = str => {
  const [type, controller, action, roleId] = str.split('.');

  return { type, controller, action, roleId };
};

const updatePermissionsInDB = async (toAdd, toRemove, roles) => {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toAdd.map(permission =>
      query.create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: isPermissionEnabled(permission, roles[permission.roleId]),
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
};

/**
 * Initializes the service.
 * @returns {Promise} Promise resolving to the initialized service.
 */
const initialize = async () => {
  const roleCount = await strapi.query('role', 'users-permissions').count();
  if (roleCount === 0) {
    await createDefaultRoles();
  }
  return updatePermissions();
};

const createDefaultRoles = async () => {
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
};

/**
 * Updates a role.
 * @param {Number} roleID - ID of the role.
 * @param {Object} body - Role update parameters.
 * @returns {Promise} Promise resolving to the updated role.
 */
const updateRole = async (roleID, body) => {
  const [role, authenticated] = await Promise.all([
    getRole(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);
  await updateRoleEntity(roleID, body);
  await updateRolePermissions(role, body);
  await updateRoleUsers(role, body.users, authenticated);
  return role;
};

const updateRoleEntity = async (roleID, body) => {
  await strapi.query('role', 'users-permissions').update(
    {
      id: roleID,
    },
    _.pick(body, ['name', 'description'])
  );
};

const updateRolePermissions = async (role, body) => {
  const promises = Object.keys(body.permissions || {}).reduce((acc, type) => {
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
  await Promise.all(promises);
};

const updateRoleUsers = async (role, users, authenticated) => {
  const newUsers = _.differenceBy(users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, role.id)));
  const oldUsers = _.differenceBy(role.users, users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
};

/**
 * Updates a user role.
 * @param {Object} user - User.
 * @param {Number} role - Role ID.
 * @returns {Promise} Promise resolving to the updated user.
 */
const updateUserRole = async (user, role) => {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
};

/**
 * Templates a string.
 * @param {String} layout - Layout string.
 * @param {Object} data - Data to template.
 * @returns {String} Templated string.
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