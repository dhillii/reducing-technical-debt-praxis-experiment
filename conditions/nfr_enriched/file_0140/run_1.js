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

// Builds controllers map from API controllers
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

// Builds permissions map from plugin controllers
const buildPluginsPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});

// Normalizes role type to snake_case
const normalizeRoleType = name => _.snakeCase(_.deburr(_.toLower(name)));

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

// Assigns users to a role
const assignUsersToRole = (roleId, users) => {
  if (users && users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: roleId },
      { users }
    );
  }
  return null;
};

// Moves users from one role to another
const moveUsersToRole = (users, targetRoleId) =>
  users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: targetRoleId }
    )
  );

// Removes permissions associated with a role
const removeRolePermissions = permissions =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );

// Aggregates actions from API controllers
const aggregateAppActions = () => {
  const actions = [];
  Object.keys(strapi.api || {}).forEach(api => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .forEach(action => {
          actions.push(`application.${controller}.${action.toLowerCase()}`);
        });
    });
  });
  return actions;
};

// Aggregates actions from plugin controllers
const aggregatePluginsActions = () => {
  const actions = [];
  Object.keys(strapi.plugins).forEach(plugin => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .forEach(action => {
          actions.push(`${plugin}.${controller}.${action.toLowerCase()}`);
        });
    });
  });
  return actions;
};

// Parses permission string into components
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Builds permission string from components
const buildPermissionString = (type, controller, action, roleId) =>
  `${type}.${controller}.${action}.${roleId}`;

// Generates permission strings for all roles
const generatePermissionStringsForRoles = (actions, roles, primaryKey) =>
  _.uniq(
    actions.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    )
  );

// Retrieves permission strings from database
const getPermissionsFromDB = async primaryKey => {
  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  return _.uniq(
    dbPermissions.map(p => buildPermissionString(p.type, p.controller, p.action, p.role[primaryKey]))
  );
};

// Processes permission differences and updates database
const processDifferences = async (toAdd, toRemove, rolesMap, primaryKey) => {
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

// Groups permissions by type and controller
const groupPermissionsByType = (permissions, plugins) => {
  const grouped = permissions.reduce((acc, permission) => {
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

  return grouped;
};

// Counts users for each role
const enrichRolesWithUserCounts = async roles => {
  const enriched = [...roles];
  for (let i = 0; i < enriched.length; ++i) {
    enriched[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: enriched[i].id });
  }
  return enriched;
};

// Builds route path with plugin prefix
const buildRoutePath = (curr, current) => {
  const prefix = curr.config.prefix;
  return prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
};

// Processes plugin routes with path prefixes
const processPluginRoutes = clonedPlugins => {
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((acc, curr) => {
      const path = buildRoutePath(curr, current);
      _.set(curr, 'path', path);
      return acc.concat(curr);
    }, []);

    acc[current] = routes;
    return acc;
  }, {});
};

// Collects application routes
const collectAppRoutes = () =>
  Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

// Updates permission for a single action
const updateSinglePermission = async (roleID, type, controller, action, bodyAction, currentAction) => {
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

// Collects all permission update promises
const collectPermissionUpdates = (roleID, bodyPermissions, rolePermissions) => {
  const updates = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    Object.keys(bodyPermissions[type].controllers).forEach(controller => {
      Object.keys(bodyPermissions[type].controllers[controller]).forEach(action => {
        const bodyAction = bodyPermissions[type].controllers[controller][action];
        const currentAction = _.get(
          rolePermissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        const promise = updateSinglePermission(roleID, type, controller, action, bodyAction, currentAction);
        if (promise) {
          updates.push(promise);
        }
      });
    });
  });
  return updates;
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = normalizeRoleType(params.name);
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = createPermissionEntries(role.id, params.permissions);

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

    const arrayOfPromises = [];

    arrayOfPromises.push(...moveUsersToRole(role.users, publicRoleID));
    arrayOfPromises.push(...removeRolePermissions(role.permissions));
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
    return await enrichRolesWithUserCounts(roles);
  },

  async getRoutes() {
    const routes = collectAppRoutes();
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = processPluginRoutes(clonedPlugins);

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const permissionsFoundInDB = await getPermissionsFromDB(primaryKey);

    const appActions = aggregateAppActions();
    const pluginsActions = aggregatePluginsActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = generatePermissionStringsForRoles(
      actionsFoundInFiles,
      roles,
      primaryKey
    );

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

    const permissionUpdates = collectPermissionUpdates(roleID, body.permissions, role.permissions);
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
```