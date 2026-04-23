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

// Checks if a permission matches a default permission configuration
const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

// Generates action objects with enabled and policy properties from controller methods
const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

// Builds application controllers actions map
const buildAppControllers = () =>
  Object.keys(strapi.api || {})
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

// Builds plugins permissions map
const buildPluginsPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});

// Converts permission enabled value to boolean
const getPermissionEnabled = permission => _.toNumber(permission.enabled) === 1;

// Builds permission entry with enabled and policy fields
const buildPermissionEntry = permission => ({
  enabled: getPermissionEnabled(permission),
  policy: permission.policy,
});

// Aggregates actions from application controllers
const aggregateAppActions = () =>
  Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

// Aggregates actions from plugin controllers
const aggregatePluginsActions = () =>
  Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

// Parses permission string into components
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Creates permission objects for database insertion
const createPermissionObjects = (toAdd, rolesMap) =>
  toAdd.map(permission => ({
    type: permission.type,
    controller: permission.controller,
    action: permission.action,
    enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
    policy: '',
    role: permission.roleId,
  }));

// Builds delete query parameters from permission
const buildDeleteQuery = permission => {
  const { type, controller, action, roleId: role } = permission;
  return { type, controller, action, role };
};

// Processes permission changes in database
const processPermissionChanges = async (toAdd, toRemove, rolesMap) => {
  const query = strapi.query('permission', 'users-permissions');

  if (toAdd.length > 0) {
    const permissionObjects = createPermissionObjects(toAdd, rolesMap);
    await Promise.all(permissionObjects.map(perm => query.create(perm)));
  }

  if (toRemove.length > 0) {
    await Promise.all(toRemove.map(permission => query.delete(buildDeleteQuery(permission))));
  }
};

// Builds role permissions structure from database records
const buildRolePermissions = (rolePermissions, plugins) => {
  return rolePermissions.reduce((acc, permission) => {
    _.set(
      acc,
      `${permission.type}.controllers.${permission.controller}.${permission.action}`,
      buildPermissionEntry(permission)
    );

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
};

// Counts users for each role
const enrichRolesWithUserCounts = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

// Builds plugin routes with prefixes
const buildPluginRoutes = clonedPlugins => {
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce(
      (acc, curr) => {
        const prefix = curr.config.prefix;
        const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
        _.set(curr, 'path', path);
        return acc.concat(curr);
      },
      []
    );
    acc[current] = routes;
    return acc;
  }, {});
};

// Creates permission entries for role from parameters
const createRolePermissions = async (roleId, permissions) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        promises.push(
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
  return promises;
};

// Assigns users to role
const assignUsersToRole = async (roleId, users) => {
  if (users && users.length > 0) {
    return strapi.query('role', 'users-permissions').update({ id: roleId }, { users });
  }
};

// Moves users from one role to another
const moveUsersToRole = async (users, targetRoleId) => {
  return Promise.all(
    users.map(user =>
      strapi.query('user', 'users-permissions').update({ id: user.id }, { role: targetRoleId })
    )
  );
};

// Deletes permissions for a role
const deleteRolePermissions = async permissions => {
  return Promise.all(
    permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({ id: permission.id })
    )
  );
};

// Updates permission for a single action
const updateSinglePermission = (roleID, type, controller, action, bodyAction) => {
  return strapi.query('permission', 'users-permissions').update(
    {
      role: roleID,
      type,
      controller,
      action: action.toLowerCase(),
    },
    bodyAction
  );
};

// Collects permission updates from body
const collectPermissionUpdates = (roleID, body, role) => {
  const updates = [];
  Object.keys(body.permissions || {}).forEach(type => {
    Object.keys(body.permissions[type].controllers).forEach(controller => {
      Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
        const bodyAction = body.permissions[type].controllers[controller][action];
        const currentAction = _.get(
          role.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          updates.push(updateSinglePermission(roleID, type, controller, action, bodyAction));
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

    const permissionPromises = await createRolePermissions(role.id, params.permissions);
    const userPromise = await assignUsersToRole(role.id, params.users);

    const allPromises = permissionPromises;
    if (userPromise) {
      allPromises.push(userPromise);
    }

    return Promise.all(allPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userPromises = await moveUsersToRole(role.users, publicRoleID);
    const permissionPromises = await deleteRolePermissions(role.permissions);
    const deleteRolePromise = strapi
      .query('role', 'users-permissions')
      .delete({ id: roleID });

    return Promise.all([...userPromises, ...permissionPromises, deleteRolePromise]);
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

    const permissions = buildRolePermissions(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return enrichRolesWithUserCounts(roles);
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

    let permissionsFoundInDB = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginsActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    );
    permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
        parsePermissionString
      );
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
        parsePermissionString
      );

      await processPermissionChanges(toAdd, toRemove, rolesMap);
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

    const permissionUpdates = collectPermissionUpdates(roleID, body, role);
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