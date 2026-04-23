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

module.exports = {
  /**
   * Create a new role with permissions and optional users.
   * @param {Object} params
   */
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = buildPermissionPromises(params, role);
    const userPromises = addUsersToRole(role, params);

    return await Promise.all([...permissionPromises, ...userPromises]);
  },

  /**
   * Delete a role and reassign its users to a public role.
   * @param {Number} roleID
   * @param {Number} publicRoleID
   */
  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userPromises = reassignUsersToPublic(role, publicRoleID);
    const permissionPromises = deleteRolePermissions(role);
    const deleteRolePromise = deleteRoleEntry(roleID);

    return await Promise.all([...userPromises, ...permissionPromises, deleteRolePromise]);
  },

  /**
   * Retrieve plugins from marketplace.
   * @param {String} lang
   */
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

  /**
   * Generate actions for controllers.
   */
  getActions() {
    const generateActions = data =>
      Object.keys(data).reduce((acc, key) => {
        if (_.isFunction(data[key])) {
          acc[key] = { enabled: false, policy: '' };
        }

        return acc;
      }, {});

    const appControllers = buildAppControllers(generateActions);
    const pluginsPermissions = buildPluginsPermissions(generateActions);

    const permissions = {
      application: {
        controllers: appControllers.controllers,
      },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  /**
   * Retrieve a role with its permissions.
   * @param {Number} roleID
   * @param {Array} plugins
   */
  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = buildRolePermissions(role, plugins);

    return {
      ...role,
      permissions,
    };
  },

  /**
   * Retrieve all roles with user count.
   */
  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await strapi
        .query('user', 'users-permissions')
        .count({ role: roles[i].id });
    }

    return roles;
  },

  /**
   * Retrieve all routes from API and plugins.
   */
  async getRoutes() {
    const routes = getApiRoutes();
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = getPluginRoutes(clonedPlugins);

    return _.merge({ application: routes }, pluginsRoutes);
  },

  /**
   * Update permissions in the database.
   */
  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    const permissionsFoundInDB = _.uniq(
      dbPermissions.map(
        p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
      )
    );

    const appActions = gatherAppActions();
    const pluginsActions = gatherPluginActions();

    const actionsFoundInFiles = [...appActions, ...pluginsActions];

    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce(
        (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
        []
      )
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitted);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitted);

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
  },

  /**
   * Initialize default roles and update permissions.
   */
  async initialize() {
    const roleCount = await strapi.query('role', 'users-permissions').count();

    if (roleCount === 0) {
      await createDefaultRoles();
    }

    return this.updatePermissions();
  },

  /**
   * Update a role's information, permissions, and users.
   * @param {Number} roleID
   * @param {Object} body
   */
  async updateRole(roleID, body) {
    const [role, authenticated] = await Promise.all([
      this.getRole(roleID, []),
      strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
    ]);

    await strapi
      .query('role', 'users-permissions')
      .update({ id: roleID }, _.pick(body, ['name', 'description']));

    await Promise.all(
      updateRolePermissions(body, roleID)
    );

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => this.updateUserRole(user, authenticated.id)));
  },

  /**
   * Update a user's role.
   * @param {Object} user
   * @param {Number} role
   */
  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  /**
   * Compile a template with data.
   * @param {String} layout
   * @param {Object} data
   */
  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};

/* -------------------------------------------------------------------------- */
/* Helper functions for createRole */
/* -------------------------------------------------------------------------- */

/**
 * Build permission creation promises for a role.
 * @param {Object} params
 * @param {Object} role
 */
function buildPermissionPromises(params, role) {
  const promises = [];

  Object.keys(params.permissions || {}).forEach(type => {
    const controllers = params.permissions[type].controllers;
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        promises.push(
          strapi.query('permission', 'users-permissions').create({
            role: role.id,
            type,
            controller,
            action: action.toLowerCase(),
            ...actions[action],
          })
        );
      });
    });
  });

  return promises;
}

/**
 * Add users to a role if provided.
 * @param {Object} role
 * @param {Object} params
 */
function addUsersToRole(role, params) {
  if (!params.users || params.users.length === 0) {
    return [];
  }

  return [
    strapi.query('role', 'users-permissions').update(
      { id: role.id },
      { users: params.users }
    ),
  ];
}

/* -------------------------------------------------------------------------- */
/* Helper functions for deleteRole */
/* -------------------------------------------------------------------------- */

/**
 * Reassign users of a role to a public role.
 * @param {Object} role
 * @param {Number} publicRoleID
 */
function reassignUsersToPublic(role, publicRoleID) {
  return role.users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: publicRoleID }
    )
  );
}

/**
 * Delete all permissions associated with a role.
 * @param {Object} role
 */
function deleteRolePermissions(role) {
  return role.permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );
}

/**
 * Delete the role itself.
 * @param {Number} roleID
 */
function deleteRoleEntry(roleID) {
  return strapi.query('role', 'users-permissions').delete({ id: roleID });
}

/* -------------------------------------------------------------------------- */
/* Helper functions for getActions */
/* -------------------------------------------------------------------------- */

/**
 * Build application controllers with actions.
 * @param {Function} generateActions
 */
function buildAppControllers(generateActions) {
  const acc = { controllers: {} };

  Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .forEach(key => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
    });

  return acc;
}

/**
 * Build plugin permissions with actions.
 * @param {Function} generateActions
 */
function buildPluginsPermissions(generateActions) {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = { controllers: {} };
    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
    return acc;
  }, {});
}

/* -------------------------------------------------------------------------- */
/* Helper functions for getRole */
/* -------------------------------------------------------------------------- */

/**
 * Build permissions object for a role.
 * @param {Object} role
 * @param {Array} plugins
 */
function buildRolePermissions(role, plugins) {
  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: _.toNumber(permission.enabled) === 1,
      policy: permission.policy,
    });

    if (
      permission.type !== 'application' &&
      !acc[permission.type].information
    ) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

  return permissions;
}

/* -------------------------------------------------------------------------- */
/* Helper functions for getRoutes */
/* -------------------------------------------------------------------------- */

/**
 * Retrieve routes from Strapi API.
 */
function getApiRoutes() {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
}

/**
 * Retrieve routes from plugins.
 * @param {Object} clonedPlugins
 */
function getPluginRoutes(clonedPlugins) {
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
}

/* -------------------------------------------------------------------------- */
/* Helper functions for updatePermissions */
/* -------------------------------------------------------------------------- */

/**
 * Gather application actions.
 */
function gatherAppActions() {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Gather plugin actions.
 */
function gatherPluginActions() {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
}

/**
 * Split permission string into components.
 * @param {String} str
 */
function splitted(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/* -------------------------------------------------------------------------- */
/* Helper functions for initialize */
/* -------------------------------------------------------------------------- */

/**
 * Create default roles if none exist.
 */
async function createDefaultRoles() {
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

/* -------------------------------------------------------------------------- */
/* Helper functions for updateRole */
/* -------------------------------------------------------------------------- */

/**
 * Build permission update promises for a role.
 * @param {Object} body
 * @param {Number} roleID
 */
function updateRolePermissions(body, roleID) {
  const promises = [];

  Object.keys(body.permissions || {}).forEach(type => {
    const controllers = body.permissions[type].controllers;
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        const bodyAction = actions[action];
        const currentAction = _.get(
          body.permissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );

        if (!_.isEqual(bodyAction, currentAction)) {
          promises.push(
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
  });

  return promises;
}