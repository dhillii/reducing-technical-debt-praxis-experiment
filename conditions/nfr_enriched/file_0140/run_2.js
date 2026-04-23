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

// Extracts role type from permission enabled value
const extractRoleType = enabled => _.toNumber(enabled) === 1;

// Finds plugin information by type
const findPluginInfo = (type, plugins) =>
  type !== 'application' ? (plugins.find(plugin => plugin.id === type) || {}) : null;

// Builds permission structure from role permissions array
const buildPermissionsStructure = (rolePermissions, plugins) =>
  rolePermissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: extractRoleType(permission.enabled),
      policy: permission.policy,
    });

    const pluginInfo = findPluginInfo(permission.type, plugins);
    if (pluginInfo !== null && !acc[permission.type].information) {
      acc[permission.type].information = pluginInfo;
    }

    return acc;
  }, {});

// Counts users for each role
const enrichRolesWithUserCount = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

// Builds plugin routes with proper path prefixes
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

// Extracts application routes
const extractAppRoutes = () =>
  Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);

// Parses permission string into components
const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

// Aggregates application controller actions
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

// Aggregates plugin controller actions
const aggregatePluginActions = () =>
  Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

// Creates permission entries for all roles
const createPermissionsForRoles = (actions, roles, primaryKey) => {
  const permissions = actions.reduce(
    (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
    []
  );
  return _.uniq(permissions);
};

// Processes permission differences and updates database
const processDifferences = async (toAdd, toRemove, rolesMap) => {
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

// Assigns users to role
const assignUsersToRole = async (role, users) => {
  if (users && users.length > 0) {
    return strapi.query('role', 'users-permissions').update(
      { id: role.id },
      { users }
    );
  }
};

// Moves users from one role to another
const moveUsersToRole = (users, targetRoleId) =>
  users.reduce((acc, user) => {
    acc.push(
      strapi.query('user', 'users-permissions').update(
        { id: user.id },
        { role: targetRoleId }
      )
    );
    return acc;
  }, []);

// Removes permissions for a role
const removeRolePermissions = (permissions) =>
  permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({
      id: permission.id,
    })
  );

// Generates role type slug from name
const generateRoleType = name => _.snakeCase(_.deburr(_.toLower(name)));

// Updates permission for a role if changed
const updateChangedPermission = (roleID, type, controller, action, bodyAction, currentAction) => {
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

// Collects permission updates for a role
const collectPermissionUpdates = (roleID, role, bodyPermissions) =>
  Object.keys(bodyPermissions || {}).reduce((acc, type) => {
    Object.keys(bodyPermissions[type].controllers).forEach(controller => {
      Object.keys(bodyPermissions[type].controllers[controller]).forEach(action => {
        const bodyAction = bodyPermissions[type].controllers[controller][action];
        const currentAction = _.get(
          role.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        const updatePromise = updateChangedPermission(
          roleID,
          type,
          controller,
          action,
          bodyAction,
          currentAction
        );
        if (updatePromise) {
          acc.push(updatePromise);
        }
      });
    });
    return acc;
  }, []);

// Handles user role changes for role update
const handleUserRoleChanges = async (body, role, authenticatedRoleId, updateUserRoleFn) => {
  const newUsers = _.differenceBy(body.users, role.users, 'id');
  await Promise.all(newUsers.map(user => updateUserRoleFn(user, body.roleID)));

  const oldUsers = _.differenceBy(role.users, body.users, 'id');
  await Promise.all(oldUsers.map(user => updateUserRoleFn(user, authenticatedRoleId)));
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = generateRoleType(params.name);
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = await createRolePermissions(role, params);
    const userAssignmentPromise = await assignUsersToRole(role, params.users);

    const allPromises = userAssignmentPromise
      ? [...permissionPromises, userAssignmentPromise]
      : permissionPromises;

    return await Promise.all(allPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userMovePromises = moveUsersToRole(role.users, publicRoleID);
    const permissionRemovalPromises = removeRolePermissions(role.permissions);
    const roleDeletionPromise = strapi.query('role', 'users-permissions').delete({ id: roleID });

    const allPromises = [
      ...userMovePromises,
      ...permissionRemovalPromises,
      roleDeletionPromise,
    ];

    return await Promise.all(allPromises);
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

    const permissions = buildPermissionsStructure(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return await enrichRolesWithUserCount(roles);
  },

  async getRoutes() {
    const appRoutes = extractAppRoutes();
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = buildPluginRoutes(clonedPlugins);

    return _.merge({ application: appRoutes }, pluginsRoutes);
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
    const pluginsActions = aggregatePluginActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = createPermissionsForRoles(actionsFoundInFiles, roles, primaryKey);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

      await processDifferences(toAdd, toRemove, rolesMap);
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

    const permissionUpdates = collectPermissionUpdates(roleID, role, body.permissions);
    await Promise.all(permissionUpdates);

    body.roleID = roleID;
    await handleUserRoleChanges(body, role, authenticated.id, this.updateUserRole.bind(this));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};