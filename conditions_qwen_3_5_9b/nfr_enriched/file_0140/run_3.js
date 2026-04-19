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
 * Checks if a permission is enabled based on default permissions configuration.
 * @param {Object} permission - The permission object to check.
 * @param {Object} role - The role object to validate against.
 * @returns {boolean} True if permission is enabled, false otherwise.
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
 * Generates action metadata for controllers.
 * @param {Object} data - Controller data object.
 * @returns {Object} Object with action metadata.
 */
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }

    return acc;
  }, {});

/**
 * Extracts action paths from API controllers.
 * @param {Object} api - API object.
 * @returns {string[]} Array of action paths.
 */
const extractApiActions = api =>
  Object.keys(_.get(api, 'controllers', {})).reduce((acc, controller) => {
    const actions = Object.keys(api.controllers[controller])
      .filter(action => _.isFunction(api.controllers[controller][action]))
      .map(action => `application.${controller}.${action.toLowerCase()}`);

    return acc.concat(actions);
  }, []);

/**
 * Extracts action paths from plugin controllers.
 * @param {string} plugin - Plugin name.
 * @param {Object} pluginData - Plugin object.
 * @returns {string[]} Array of action paths.
 */
const extractPluginActions = (plugin, pluginData) =>
  Object.keys(pluginData.controllers).reduce((acc, controller) => {
    const actions = Object.keys(pluginData.controllers[controller])
      .filter(action => _.isFunction(pluginData.controllers[controller][action]))
      .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

    return acc.concat(actions);
  }, []);

/**
 * Builds application permissions structure.
 * @param {Object} strapi - Strapi instance.
 * @returns {Object} Application permissions object.
 */
const buildApplicationPermissions = strapi => {
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

  return {
    application: {
      controllers: appControllers.controllers,
    },
  };
};

/**
 * Builds plugin permissions structure.
 * @param {Object} strapi - Strapi instance.
 * @returns {Object} Plugin permissions object.
 */
const buildPluginPermissions = strapi =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);

      return obj;
    }, initialState);

    return acc;
  }, {});

/**
 * Builds complete permissions structure from API and plugins.
 * @param {Object} strapi - Strapi instance.
 * @returns {Object} Complete permissions object.
 */
const buildPermissions = strapi =>
  _.merge(buildApplicationPermissions(strapi), buildPluginPermissions(strapi));

/**
 * Builds complete routes structure from API and plugins.
 * @param {Object} strapi - Strapi instance.
 * @returns {Object} Complete routes object.
 */
const buildRoutes = strapi => {
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
 * Splits permission string into components.
 * @param {string} str - Permission string in format "type.controller.action.roleId".
 * @returns {Object} Object with type, controller, action, and roleId.
 */
const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');

  return { type, controller, action, roleId };
};

/**
 * Creates permissions for each role based on file actions.
 * @param {string[]} actionsFoundInFiles - Array of action strings.
 * @param {Object} rolesMap - Map of roles by ID.
 * @returns {string[]} Array of permission strings.
 */
const createRolePermissions = (actionsFoundInFiles, rolesMap) =>
  actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );

/**
 * Updates user role assignment.
 * @param {Object} user - User object.
 * @param {string} role - Role ID.
 * @returns {Promise} Promise that resolves when update is complete.
 */
const updateUserRole = (user, role) =>
  strapi.query('user', 'users-permissions').update({ id: user.id }, { role });

/**
 * Creates a role with permissions.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise} Promise that resolves when role is created.
 */
const createRole = async params => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

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

  if (params.users && params.users.length > 0)
    arrayOfPromises.push(
      strapi.query('role', 'users-permissions').update(
        {
          id: role.id,
        },
        { users: params.users }
      )
    );

  return await Promise.all(arrayOfPromises);
};

/**
 * Deletes a role and its associated permissions.
 * @param {string} roleID - Role ID to delete.
 * @param {string} publicRoleID - Public role ID for user migration.
 * @returns {Promise} Promise that resolves when role is deleted.
 */
const deleteRole = async (roleID, publicRoleID) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

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

  role.permissions.forEach(permission => {
    arrayOfPromises.push(
      strapi.query('permission', 'users-permissions').delete({
        id: permission.id,
      })
    );
  });

  arrayOfPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));

  return await Promise.all(arrayOfPromises);
};

/**
 * Retrieves a role with its permissions.
 * @param {string} roleID - Role ID to retrieve.
 * @param {Array} plugins - Array of plugins.
 * @returns {Promise} Promise that resolves with role and permissions.
 */
const getRole = async (roleID, plugins) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = role.permissions.reduce((acc, permission) => {
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

  return {
    ...role,
    permissions,
  };
};

/**
 * Retrieves all roles with user counts.
 * @returns {Promise} Promise that resolves with roles array.
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
 * Retrieves all routes from API and plugins.
 * @returns {Promise} Promise that resolves with routes object.
 */
const getRoutes = async () => buildRoutes(strapi);

/**
 * Updates permissions based on file changes.
 * @returns {Promise} Promise that resolves when permissions are updated.
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

  const appActions = extractApiActions(strapi.api);
  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    return acc.concat(extractPluginActions(plugin, strapi.plugins[plugin]));
  }, []);

  const actionsFoundInFiles = appActions.concat(pluginsActions);

  const permissionsFoundInFiles = createRolePermissions(actionsFoundInFiles, rolesMap);
  permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

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
 * Initializes default roles and permissions.
 * @returns {Promise} Promise that resolves when initialization is complete.
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
 * Updates a role with new permissions and user assignments.
 * @param {string} roleID - Role ID to update.
 * @param {Object} body - Update body with permissions and users.
 * @returns {Promise} Promise that resolves when role is updated.
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
 * Retrieves available plugins from marketplace.
 * @param {string} lang - Language code for plugin retrieval.
 * @returns {Promise} Promise that resolves with plugins array.
 */
const getPlugins = (lang = 'en') =>
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
 * Retrieves all available actions from API and plugins.
 * @returns {Promise} Promise that resolves with actions object.
 */
const getActions = () => buildPermissions(strapi);

/**
 * Renders a template with provided data.
 * @param {string} layout - Template layout string.
 * @param {Object} data - Data to render in template.
 * @returns {string} Rendered template string.
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
  template,
};
```