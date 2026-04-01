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

// Helper: Check if a value is a function
const isFunction = value => _.isFunction(value);

// Helper: Generate action map from controller methods
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

// Helper: Check if API has controllers
const hasControllers = key => !!strapi.api[key].controllers;

// Helper: Build application controllers map
const buildAppControllers = () =>
  Object.keys(strapi.api || {})
    .filter(hasControllers)
    .reduce(
      (acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
        });
        return acc;
      },
      { controllers: {} }
    );

// Helper: Build plugins permissions map
const buildPluginsPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});

// Helper: Create role with permissions
const createRolePermissions = async (role, permissions) => {
  const arrayOfPromises = Object.keys(permissions || {}).reduce((acc, type) => {
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
  return arrayOfPromises;
};

// Helper: Assign users to role
const assignUsersToRole = async (roleId, users) => {
  if (users && users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: roleId },
      { users }
    );
  }
};

// Helper: Move users to public role
const moveUsersToPublicRole = (users, publicRoleId) =>
  users.reduce((acc, user) => {
    acc.push(
      strapi.query('user', 'users-permissions').update(
        { id: user.id },
        { role: publicRoleId }
      )
    );
    return acc;
  }, []);

// Helper: Delete role permissions
const deleteRolePermissions = (permissions) =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );

// Helper: Parse permission string into components
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Helper: Aggregate application actions
const aggregateAppActions = () =>
  Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

// Helper: Aggregate plugin actions
const aggregatePluginActions = () =>
  Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

// Helper: Build permission strings for all roles
const buildPermissionStringsForRoles = (actions, roles, primaryKey) =>
  _.uniq(
    actions.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    )
  );

// Helper: Process permission differences
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

// Helper: Count users for each role
const countUsersForRoles = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

// Helper: Build plugin routes with prefixes
const buildPluginRoutes = clonedPlugins =>
  Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      _.set(curr, 'path', path);
      return acc.concat(curr);
    }, []);
    acc[current] = routes;
    return acc;
  }, {});

// Helper: Group permissions by type
const groupPermissionsByType = (permissions, plugins) =>
  permissions.reduce((acc, permission) => {
    const enabled = _.toNumber(permission.enabled) === 1;
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled,
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

// Helper: Update role permissions
const updateRolePermissions = async (roleID, permissions, currentPermissions) => {
  const promises = Object.keys(permissions || {}).reduce((acc, type) => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        const bodyAction = permissions[type].controllers[controller][action];
        const currentAction = _.get(
          currentPermissions,
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

  return Promise.all(promises);
};

// Helper: Update users in role
const updateUsersInRole = async (newUsers, oldUsers, roleID, authenticatedRoleId, service) => {
  await Promise.all(newUsers.map(user => service.updateUserRole(user, roleID)));
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

    const permissionPromises = await createRolePermissions(role, params.permissions);
    const userPromises = await assignUsersToRole(role.id, params.users);

    const allPromises = userPromises ? [...permissionPromises, userPromises] : permissionPromises;
    return await Promise.all(allPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userPromises = moveUsersToPublicRole(role.users, publicRoleID);
    const permissionPromises = deleteRolePermissions(role.permissions);
    const deleteRolePromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return await Promise.all([...userPromises, ...permissionPromises, deleteRolePromise]);
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

    const permissions = groupPermissionsByType(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return countUsersForRoles(roles);
  },

  async getRoutes() {
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = buildPluginRoutes(clonedPlugins);

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    let permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = buildPermissionStringsForRoles(
      actionsFoundInFiles,
      roles,
      primaryKey
    );

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
        description: 'Default role given to unauthenticated user.',
        type: 'public',
      });
    }

    return this.updatePermissions();
  },

  async updateRole(roleID, body) {
    const [role, authenticated] = await