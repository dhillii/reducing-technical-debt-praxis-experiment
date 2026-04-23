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
 * Generate an object of actions for a controller.
 * @param {Object} controller
 * @returns {Object}
 */
const generateActions = controller =>
  Object.keys(controller).reduce((acc, key) => {
    if (_.isFunction(controller[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

/**
 * Create permission promises for a role.
 * @param {Number} roleId
 * @param {Object} permissions
 * @returns {Array<Promise>}
 */
const createPermissionPromises = (roleId, permissions) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    const typePermissions = permissions[type];
    if (!typePermissions || !typePermissions.controllers) return;
    Object.keys(typePermissions.controllers).forEach(controller => {
      const controllerActions = typePermissions.controllers[controller];
      Object.keys(controllerActions).forEach(action => {
        promises.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...controllerActions[action],
          })
        );
      });
    });
  });
  return promises;
};

/**
 * Update permission promises for a role.
 * @param {Number} roleId
 * @param {Object} bodyPermissions
 * @param {Object} existingPermissions
 * @returns {Array<Promise>}
 */
const updatePermissionPromises = (roleId, bodyPermissions, existingPermissions) => {
  const promises = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    const typePermissions = bodyPermissions[type];
    if (!typePermissions || !typePermissions.controllers) return;
    Object.keys(typePermissions.controllers).forEach(controller => {
      const controllerActions = typePermissions.controllers[controller];
      Object.keys(controllerActions).forEach(action => {
        const bodyAction = controllerActions[action];
        const currentAction = _.get(
          existingPermissions,
          `${type}.controllers.${controller}.${action}`,
          {}
        );
        if (!_.isEqual(bodyAction, currentAction)) {
          promises.push(
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
  });
  return promises;
};

/**
 * Retrieve all actions from API and plugins.
 * @returns {Array<string>}
 */
const getAllActions = () => {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    const controllers = _.get(strapi.api[api], 'controllers', {});
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    const controllers = strapi.plugins[plugin].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  return appActions.concat(pluginsActions);
};

/**
 * Retrieve permissions from database.
 * @returns {Promise<Array<string>>}
 */
const getPermissionsFromDB = async () => {
  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  return _.uniq(
    dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    )
  );
};

/**
 * Split permission string into components.
 * @param {string} str
 * @returns {Object}
 */
const splitPermission = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = createPermissionPromises(role.id, params.permissions);

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

    const arrayOfPromises = role.users.map(user =>
      strapi.query('user', 'users-permissions').update(
        { id: user.id },
        { role: publicRoleID }
      )
    );

    role.permissions.forEach(permission =>
      arrayOfPromises.push(
        strapi.query('permission', 'users-permissions').delete({ id: permission.id })
      )
    );

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
    const appControllers = Object.keys(strapi.api || {})
      .filter(key => !!strapi.api[key].controllers)
      .reduce((acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
        });
        return acc;
      }, { controllers: {} });

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
      acc[key] = {
        controllers: Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
          obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
          return obj;
        }, { controllers: {} }),
      };
      return acc;
    }, {});

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

    const permissions = role.permissions.reduce((acc, permission) => {
      _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
        enabled: !!_.toNumber(permission.enabled),
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

    const permissionsFoundInDB = await getPermissionsFromDB();

    const actionsFoundInFiles = getAllActions();

    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce((acc, action) => {
        return acc.concat(roles.map(role => `${action}.${role[primaryKey]}`));
      }, [])
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermission);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermission);

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

    await Promise.all(
      updatePermissionPromises(roleID, body.permissions, role.permissions)
    );

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