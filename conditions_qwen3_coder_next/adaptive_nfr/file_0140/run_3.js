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
 * Extracts permission data from a role's permissions array into a grouped structure.
 * @param {Array} permissions - Array of permission objects.
 * @param {Array} plugins - List of available plugins.
 * @returns {Object} Grouped permissions object.
 */
const buildPermissionsGrouping = (permissions, plugins) => {
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
};

/**
 * Creates a new role and assigns permissions and users.
 * @param {Object} params - Role creation parameters.
 * @returns {Promise<Array>} Results of all database operations.
 */
const createRoleWithPermissionsAndUsers = async (params) => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }

  const role = await strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));

  const permissionPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
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

  if (params.users && params.users.length > 0) {
    permissionPromises.push(
      strapi.query('role', 'users-permissions').update(
        { id: role.id },
        { users: params.users }
      )
    );
  }

  return await Promise.all(permissionPromises);
};

/**
 * Deletes a role and migrates its users and permissions.
 * @param {String} roleID - ID of the role to delete.
 * @param {String} publicRoleID - ID of the public role to migrate users to.
 * @returns {Promise<Array>} Results of all database operations.
 */
const deleteRoleAndMigrateDependencies = async (roleID, publicRoleID) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['users', 'permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const userMigrationPromises = role.users.reduce((acc, user) => {
    acc.push(
      strapi.query('user', 'users-permissions').update(
        { id: user.id },
        { role: publicRoleID }
      )
    );
    return acc;
  }, []);

  const permissionDeletionPromises = role.permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );

  const roleDeletionPromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

  return await Promise.all([
    ...userMigrationPromises,
    ...permissionDeletionPromises,
    roleDeletionPromise,
  ]);
};

/**
 * Retrieves plugins from the marketplace.
 * @param {String} lang - Language code.
 * @returns {Promise<Array>} List of plugins.
 */
const fetchPluginsFromMarketplace = (lang = 'en') => {
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
 * Generates action definitions for a controller.
 * @param {Object} controller - Controller object.
 * @returns {Object} Mapped controller actions.
 */
const generateControllerActions = controller => {
  return Object.keys(controller).reduce((acc, key) => {
    if (_.isFunction(controller[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
};

/**
 * Aggregates application controller actions.
 * @returns {Object} Aggregated application controller actions.
 */
const aggregateAppControllers = () => {
  return Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateControllerActions(strapi.api[key].controllers[controller]);
      });
      return acc;
    }, { controllers: {} });
};

/**
 * Aggregates plugin controller actions.
 * @returns {Object} Aggregated plugin controller actions.
 */
const aggregatePluginsPermissions = () => {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateControllerActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
};

/**
 * Builds the full permissions structure from application and plugins.
 * @returns {Object} Merged permissions object.
 */
const buildFullPermissionsStructure = () => {
  const appControllers = aggregateAppControllers();
  const pluginsPermissions = aggregatePluginsPermissions();

  const permissions = {
    application: {
      controllers: appControllers.controllers,
    },
  };

  return _.merge(permissions, pluginsPermissions);
};

/**
 * Retrieves a role with its permissions grouped and enriched with plugin metadata.
 * @param {String} roleID - Role ID.
 * @param {Array} plugins - List of plugins.
 * @returns {Promise<Object>} Role object with permissions.
 */
const getRoleWithPermissions = async (roleID, plugins) => {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = buildPermissionsGrouping(role.permissions, plugins);

  return {
    ...role,
    permissions,
  };
};

/**
 * Counts users per role.
 * @param {Array} roles - Array of role objects.
 * @returns {Promise<Array>} Roles with user counts.
 */
const enrichRolesWithUserCounts = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

/**
 * Aggregates all application routes.
 * @returns {Array} List of application routes.
 */
const collectApplicationRoutes = () => {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
};

/**
 * Aggregates plugin routes with path prefixing.
 * @returns {Object} Plugin routes keyed by plugin name.
 */
const collectPluginRoutes = () => {
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
};

/**
 * Builds full route structure from application and plugins.
 * @returns {Object} Merged route structure.
 */
const buildFullRouteStructure = () => {
  const applicationRoutes = collectApplicationRoutes();
  const pluginsRoutes = collectPluginRoutes();
  return _.merge({ application: applicationRoutes }, pluginsRoutes);
};

/**
 * Splits a permission string into its components.
 * @param {String} str - Permission string in format "type.controller.action.roleId".
 * @returns {Object} Parsed permission object.
 */
const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

/**
 * Aggregates all application controller actions.
 * @returns {Array} List of application action strings.
 */
const collectAppActions = () => {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
};

/**
 * Aggregates all plugin controller actions.
 * @returns {Array} List of plugin action strings.
 */
const collectPluginActions = () => {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
};

/**
 * Compares DB permissions with file-based permissions and updates DB accordingly.
 * @param {Array} roles - List of roles.
 * @param {Object} rolesMap - Map of role IDs to role objects.
 * @param {Array} dbPermissions - List of existing DB permissions.
 * @param {Array} appActions - List of application actions.
 * @param {Array} pluginActions - List of plugin actions.
 * @returns {Promise<void>}
 */
const syncPermissionsWithFiles = async (roles, rolesMap, dbPermissions, appActions, pluginActions) => {
  const permissionsFoundInDB = dbPermissions.map(
    p => `${p.type}.${p.controller}.${p.action}.${p.role[Object.keys(p.role)[0]]}`
  );
  const permissionsFoundInDBUnique = _.uniq(permissionsFoundInDB);

  const actionsFoundInFiles = appActions.concat(pluginActions);

  const permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[Object.keys(role)[0]]}`)],
    []
  );
  const permissionsFoundInFilesUnique = _.uniq(permissionsFoundInFiles);

  if (!_.isEqual(permissionsFoundInDBUnique.sort(), permissionsFoundInFilesUnique.sort())) {
    const toRemove = _.difference(permissionsFoundInDBUnique, permissionsFoundInFilesUnique).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFilesUnique, permissionsFoundInDBUnique).map(splitPermissionString);

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
 * Updates permissions across all roles based on current controller definitions.
 * @returns {Promise<void>}
 */
const updatePermissions = async () => {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });

  const appActions = collectAppActions();
  const pluginActions = collectPluginActions();

  await syncPermissionsWithFiles(roles, rolesMap, dbPermissions, appActions, pluginActions);
};

/**
 * Initializes default roles if none exist.
 * @returns {Promise<void>}
 */
const initializeDefaultRoles = async () => {
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
};

/**
 * Updates a role's metadata and permissions.
 * @param {String} roleID - Role ID.
 * @param {Object} body - Update payload.
 * @returns {Promise<void>}
 */
const updateRoleWithPermissions = async (roleID, body) => {
  const [role, authenticated] = await Promise.all([
    getRoleWithPermissions(roleID, []),
    strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
  ]);

  await strapi
    .query('role', 'users-permissions')
    .update({ id: roleID }, _.pick(body, ['name', 'description']));

  const permissionUpdatePromises = Object.keys(body.permissions || {}).reduce((acc, type) => {
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

  await Promise.all(permissionUpdatePromises);

  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRole(user, roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRole(user, authenticated.id)));
};

/**
 * Updates a user's role.
 * @param {Object} user - User object.
 * @param {String} role - Role ID.
 * @returns {Promise<Object>} Updated user.
 */
const updateUserRole = async (user, role) => {
  return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
};

module.exports = {
  async createRole(params) {
    return await createRoleWithPermissionsAndUsers(params);
  },

  async deleteRole(roleID, publicRoleID) {
    return await deleteRoleAndMigrateDependencies(roleID, publicRoleID);
  },

  async getPlugins(lang = 'en') {
    return await fetchPluginsFromMarketplace(lang);
  },

  getActions() {
    return buildFullPermissionsStructure();
  },

  async getRole(roleID, plugins) {
    return await getRoleWithPermissions(roleID, plugins);
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return await enrichRolesWithUserCounts(roles);
  },

  async getRoutes() {
    return buildFullRouteStructure();
  },

  async updatePermissions() {
    return await updatePermissions();
  },

  async initialize() {
    await initializeDefaultRoles();
    return await updatePermissions();
  },

  async updateRole(roleID, body) {
    return await updateRoleWithPermissions(roleID, body);
  },

  async updateUserRole(user, role) {
    return await updateUserRole(user, role);
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};