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

// Helper: Convert permission enabled field to boolean
const isPermissionEnabledValue = (permission) => _.toNumber(permission.enabled) === 1;

// Helper: Build permission object for role
const buildPermissionObject = (permission) => ({
  enabled: isPermissionEnabledValue(permission),
  policy: permission.policy,
});

// Helper: Set plugin information if applicable
const setPluginInformation = (acc, permission, plugins) => {
  if (permission.type !== 'application' && !acc[permission.type].information) {
    acc[permission.type].information =
      plugins.find(plugin => plugin.id === permission.type) || {};
  }
};

// Helper: Aggregate permissions by type and controller
const aggregatePermissionsByType = (role, plugins) =>
  role.permissions.reduce((acc, permission) => {
    _.set(
      acc,
      `${permission.type}.controllers.${permission.controller}.${permission.action}`,
      buildPermissionObject(permission)
    );

    setPluginInformation(acc, permission, plugins);

    return acc;
  }, {});

// Helper: Create permission entries for a role
const createPermissionsForRole = (type, controller, action, params) =>
  strapi.query('permission', 'users-permissions').create({
    role: params.roleId,
    type,
    controller,
    action: action.toLowerCase(),
    ...params.permissionData,
  });

// Helper: Process permission creation from params
const processPermissionCreation = (params) => {
  const arrayOfPromises = [];

  Object.keys(params.permissions || {}).forEach(type => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        arrayOfPromises.push(
          createPermissionsForRole(type, controller, action, {
            roleId: params.roleId,
            permissionData: params.permissions[type].controllers[controller][action],
          })
        );
      });
    });
  });

  return arrayOfPromises;
};

// Helper: Assign users to role
const assignUsersToRole = (roleId, users) => {
  if (users && users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: roleId },
      { users }
    );
  }
  return null;
};

// Helper: Move users to public role
const moveUsersToPublicRole = (users, publicRoleId) =>
  users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleId }
    )
  );

// Helper: Delete role permissions
const deleteRolePermissions = (permissions) =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );

// Helper: Generate action map for controllers
const generateActions = (data) =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

// Helper: Build application controllers permissions
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

// Helper: Build plugin permissions
const buildPluginPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);

    return acc;
  }, {});

// Helper: Extract action string from permission
const extractActionString = (permission, primaryKey) =>
  `${permission.type}.${permission.controller}.${permission.action}.${permission.role[primaryKey]}`;

// Helper: Aggregate application actions
const aggregateApplicationActions = () => {
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

// Helper: Aggregate plugin actions
const aggregatePluginActions = () => {
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

// Helper: Build permissions found in files
const buildPermissionsFoundInFiles = (actionsFoundInFiles, roles, primaryKey) => {
  let permissionsFoundInFiles = actionsFoundInFiles.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissionsFoundInFiles);
};

// Helper: Split permission string into components
const splitPermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Helper: Create permission from split data
const createPermissionFromSplit = (permission, rolesMap) =>
  strapi.query('permission', 'users-permissions').create({
    type: permission.type,
    controller: permission.controller,
    action: permission.action,
    enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
    policy: '',
    role: permission.roleId,
  });

// Helper: Delete permission from split data
const deletePermissionFromSplit = (permission) => {
  const { type, controller, action, roleId: role } = permission;
  return strapi.query('permission', 'users-permissions').delete({ type, controller, action, role });
};

// Helper: Process route path with prefix
const processRoutePath = (curr, current) => {
  const prefix = curr.config.prefix;
  const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
  _.set(curr, 'path', path);
  return curr;
};

// Helper: Build plugin routes
const buildPluginRoutes = (clonedPlugins) =>
  Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const processedRoute = processRoutePath(curr, current);
      return acc.concat(processedRoute);
    }, []);

    acc[current] = routes;
    return acc;
  }, {});

// Helper: Get application routes
const getApplicationRoutes = () =>
  Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

// Helper: Update permission if changed
const updatePermissionIfChanged = (roleID, type, controller, action, bodyAction, currentAction) => {
  if (!_.isEqual(bodyAction, currentAction)) {
    return strapi.query('permission', 'users-permissions').update(
      {
        role: roleID,
        type,
        controller,
        action: action.toLowerCase(),
      },
      bodyAction
    );
  }
  return null;
};

// Helper: Process role permission updates
const processRolePermissionUpdates = (roleID, role, bodyPermissions) => {
  const updates = [];

  Object.keys(bodyPermissions || {}).forEach(type => {
    Object.keys(bodyPermissions[type].controllers).forEach(controller => {
      Object.keys(bodyPermissions[type].controllers[controller]).forEach(action => {
        const bodyAction = bodyPermissions[type].controllers[controller][action];
        const currentAction = _.get(
          role.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        const update = updatePermissionIfChanged(roleID, type, controller, action, bodyAction, currentAction);
        if (update) {
          updates.push(update);
        }
      });
    });
  });

  return updates;
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = processPermissionCreation({
      roleId: role.id,
      permissions: params.permissions,
    });

    const userAssignment = assignUsersToRole(role.id, params.users);
    if (userAssignment) {
      arrayOfPromises.push(userAssignment);
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

    const arrayOfPromises = [
      ...moveUsersToPublicRole(role.users, publicRoleID),
      ...deleteRolePermissions(role.permissions),
      strapi.query('role', 'users-permissions').delete({ id: roleID }),
    ];

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

    const permissions = aggregatePermissionsByType(role, plugins);

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
    const applicationRoutes = getApplicationRoutes();
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = buildPluginRoutes(clonedPlugins);

    return _.merge({ application: applicationRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    let permissionsFoundInDB = dbPermissions.map(p => extractActionString(p, primaryKey));
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    const appActions = aggregateApplicationActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = buildPermissionsFoundInFiles(actionsFoundInFiles, roles, primaryKey);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);

      await Promise.all(
        toAdd.map(permission => createPermissionFromSplit(permission, rolesMap))
      );

      await Promise.all(
        toRemove.map(permission => deletePermissionFromSplit(permission))
      );
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

    const permissionUpdates = processRolePermissionUpdates(roleID, role, body.permissions);
    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => this.updateUserRole(user, authenticated.id)));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};