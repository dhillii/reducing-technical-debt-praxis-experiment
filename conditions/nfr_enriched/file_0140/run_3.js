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

// Checks if a permission matches a default permission pattern
const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

// Generates action map with enabled and policy properties
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

// Builds application controllers permissions
const buildApplicationControllers = () => {
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

  return appControllers.controllers;
};

// Builds plugin permissions
const buildPluginPermissions = () => {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);

    return acc;
  }, {});
};

// Creates permission entries for a role from permission structure
const createPermissionEntries = (roleId, permissions) => {
  const arrayOfPromises = [];

  Object.keys(permissions || {}).forEach(type => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        arrayOfPromises.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...permissions[type].controllers[controller][action],
          })
        );
      });
    });
  });

  return arrayOfPromises;
};

// Reassigns users from a role to the public role
const reassignUsersToPublicRole = (users, publicRoleId) => {
  return users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleId }
    )
  );
};

// Deletes all permissions associated with a role
const deleteRolePermissions = (permissions) => {
  return permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );
};

// Parses permission string into components
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Aggregates actions from application controllers
const aggregateApplicationActions = () => {
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

// Aggregates actions from plugin controllers
const aggregatePluginActions = () => {
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

// Generates permission strings for all roles
const generatePermissionStringsForRoles = (actions, roles, primaryKey) => {
  return _.uniq(
    actions.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    )
  );
};

// Processes permission differences and updates database
const processPermissionDifferences = async (toAdd, toRemove, rolesMap) => {
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
};

// Counts users assigned to a role
const countUsersForRole = async roleId => {
  return strapi.query('user', 'users-permissions').count({ role: roleId });
};

// Enriches role with user count
const enrichRoleWithUserCount = async role => {
  role.nb_users = await countUsersForRole(role.id);
  return role;
};

// Builds permission structure from role permissions
const buildPermissionStructure = (rolePermissions, plugins) => {
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
};

// Processes route configuration for plugins
const processPluginRoutes = (clonedPlugins, current) => {
  return _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
    const prefix = curr.config.prefix;
    const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
    _.set(curr, 'path', path);

    return acc.concat(curr);
  }, []);
};

// Collects permission update operations for a role
const collectPermissionUpdates = (roleId, bodyPermissions, rolePermissions) => {
  return Object.keys(bodyPermissions || {}).reduce((acc, type) => {
    Object.keys(bodyPermissions[type].controllers).forEach(controller => {
      Object.keys(bodyPermissions[type].controllers[controller]).forEach(action => {
        const bodyAction = bodyPermissions[type].controllers[controller][action];
        const currentAction = _.get(
          rolePermissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          acc.push(
            strapi.query('permission', 'users-permissions').update(
              {
                role: roleId,
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
};

// Updates user role assignments
const updateUserRoleAssignments = async (newUsers, oldUsers, roleId, authenticatedRoleId, service) => {
  await Promise.all(newUsers.map(user => service.updateUserRole(user, roleId)));
  await Promise.all(oldUsers.map(user => service.updateUserRole(user, authenticatedRoleId)));
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = createPermissionEntries(role.id, params.permissions);

    // Use Content Manager business logic to handle relation.
    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(
        strapi.query('role', 'users-permissions').update(
          { id: role.id },
          { users: params.users }
        )
      );
    }

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = [];

    // Move users to guest role.
    arrayOfPromises.push(...reassignUsersToPublicRole(role.users, publicRoleID));

    // Remove permissions related to this role.
    arrayOfPromises.push(...deleteRolePermissions(role.permissions));

    // Delete the role.
    arrayOfPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));

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
    const appControllers = buildApplicationControllers();
    const pluginsPermissions = buildPluginPermissions();

    const permissions = {
      application: {
        controllers: appControllers,
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

    const permissions = buildPermissionStructure(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    const enrichedRoles = await Promise.all(
      roles.map(role => enrichRoleWithUserCount(role))
    );

    return enrichedRoles;
  },

  async getRoutes() {
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
      const routes = processPluginRoutes(clonedPlugins, current);
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

    const appActions = aggregateApplicationActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = generatePermissionStringsForRoles(
      actionsFoundInFiles,
      roles,
      primaryKey
    );

    // Compare to know if actions have been added or removed from controllers.
    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
        parsePermissionString
      );
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
        parsePermissionString
      );

      await processPermissionDifferences(toAdd, toRemove, rolesMap);
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