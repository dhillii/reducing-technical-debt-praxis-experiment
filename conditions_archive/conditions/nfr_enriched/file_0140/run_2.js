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

// Extracts role type from permission
const getRoleTypeFromPermission = (permission, plugins) => {
  if (permission.type === 'application') {
    return null;
  }
  return plugins.find(plugin => plugin.id === permission.type) || {};
};

// Converts permission enabled value to boolean
const isPermissionEnabledInRole = (permission) => {
  return _.toNumber(permission.enabled) === 1;
};

// Aggregates actions from API controllers
const aggregateAppActions = () => {
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

// Parses permission string into components
const parsePermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Creates permission objects for database insertion
const createPermissionObjects = (toAdd, rolesMap, primaryKey) => {
  return toAdd.map(permission =>
    ({
      type: permission.type,
      controller: permission.controller,
      action: permission.action,
      enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
      policy: '',
      role: permission.roleId,
    })
  );
};

// Builds delete query objects for permissions
const buildDeleteQueries = (toRemove) => {
  return toRemove.map(permission => {
    const { type, controller, action, roleId: role } = permission;
    return { type, controller, action, role };
  });
};

// Processes permission differences and updates database
const processDifferences = async (toAdd, toRemove, rolesMap, primaryKey) => {
  const query = strapi.query('permission', 'users-permissions');

  const permissionObjects = createPermissionObjects(toAdd, rolesMap, primaryKey);
  await Promise.all(permissionObjects.map(permission => query.create(permission)));

  const deleteQueries = buildDeleteQueries(toRemove);
  await Promise.all(deleteQueries.map(deleteQuery => query.delete(deleteQuery)));
};

// Generates role type string for permission lookup
const generateRoleTypeString = (permission, primaryKey) => {
  return `${permission.type}.${permission.controller}.${permission.action}.${permission.role[primaryKey]}`;
};

// Generates permission string for file-based actions
const generatePermissionString = (action, role, primaryKey) => {
  return `${action}.${role[primaryKey]}`;
};

// Builds user role update promises
const buildUserRoleUpdatePromises = (newUsers, roleID, service) => {
  return newUsers.map(user => service.updateUserRole(user, roleID));
};

// Builds role permission update promises
const buildRolePermissionUpdatePromises = (body, role, roleID) => {
  return Object.keys(body.permissions || {}).reduce((acc, type) => {
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
};

// Creates permission entries for a role
const createRolePermissions = async (role, params) => {
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
};

// Updates role users association
const updateRoleUsers = async (role, params) => {
  if (params.users && params.users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: role.id },
      { users: params.users }
    );
  }
  return null;
};

// Moves users from one role to another
const moveUsersToRole = async (users, targetRoleID) => {
  return Promise.all(
    users.map(user =>
      strapi.query('user', 'users-permissions').update(
        { id: user.id },
        { role: targetRoleID }
      )
    )
  );
};

// Deletes permissions for a role
const deleteRolePermissions = async (permissions) => {
  return Promise.all(
    permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({
        id: permission.id,
      })
    )
  );
};

// Groups permissions by type and controller
const groupPermissionsByType = (permissions, plugins) => {
  return permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: isPermissionEnabledInRole(permission),
      policy: permission.policy,
    });

    const roleInfo = getRoleTypeFromPermission(permission, plugins);
    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information = roleInfo;
    }

    return acc;
  }, {});
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = await createRolePermissions(role, params);
    const userUpdatePromise = await updateRoleUsers(role, params);

    const arrayOfPromises = permissionPromises;
    if (userUpdatePromise) {
      arrayOfPromises.push(userUpdatePromise);
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
    arrayOfPromises.push(moveUsersToRole(role.users, publicRoleID));

    // Remove permissions related to this role.
    arrayOfPromises.push(deleteRolePermissions(role.permissions));

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

    const permissions = groupPermissionsByType(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await strapi
        .query('user', 'users-permissions')
        .count({ role: roles[i].id });
    }

    return roles;
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

    let permissionsFoundInDB = dbPermissions.map(p =>
      generateRoleTypeString(p, primaryKey)
    );
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => generatePermissionString(action, role, primaryKey))],
      []
    );
    permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

    // Compare to know if actions have been added or removed from controllers.
    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

      await processDifferences(toAdd, toRemove, rolesMap, primaryKey);
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

    const permissionUpdatePromises = buildRolePermissionUpdatePromises(body, role, roleID);
    await Promise.all(permissionUpdatePromises);

    // Add user to this role.
    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(buildUserRoleUpdatePromises(newUsers, roleID, this));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(buildUserRoleUpdatePromises(oldUsers, authenticated.id, this));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};
```