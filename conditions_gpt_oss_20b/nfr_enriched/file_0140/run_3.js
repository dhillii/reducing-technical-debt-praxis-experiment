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

const createRoleEntity = async params => {
  if (!params.type) {
    params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
  }
  return strapi
    .query('role', 'users-permissions')
    .create(_.omit(params, ['users', 'permissions']));
};

const createPermissionPromises = (role, permissions) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    const controllers = permissions[type].controllers || {};
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
};

const updateRoleUsers = async (role, users) => {
  if (!users || users.length === 0) return null;
  return strapi.query('role', 'users-permissions').update(
    { id: role.id },
    { users }
  );
};

const deleteRoleEntity = async roleID => {
  return strapi.query('role', 'users-permissions').delete({ id: roleID });
};

const moveUsersToRole = async (users, roleID) => {
  const promises = users.map(user =>
    strapi.query('user', 'users-permissions').update(
      { id: user.id },
      { role: roleID }
    )
  );
  return Promise.all(promises);
};

const deletePermissions = async permissions => {
  const promises = permissions.map(permission =>
    strapi.query('permission', 'users-permissions').delete({ id: permission.id })
  );
  return Promise.all(promises);
};

const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: Boolean(0), policy: '' };
    }
    return acc;
  }, {});

const collectAppControllers = () => {
  const controllers = {};
  Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .forEach(key => {
      Object.keys(strapi.api[key].controllers).forEach(controller => {
        controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
      });
    });
  return { controllers };
};

const collectPluginPermissions = () => {
  const permissions = {};
  Object.keys(strapi.plugins).forEach(key => {
    const initialState = { controllers: {} };
    permissions[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
      return obj;
    }, initialState);
  });
  return permissions;
};

const mergePermissions = (app, plugins) => _.merge({ application: app.controllers }, plugins);

const buildRolePermissions = (role, plugins) => {
  const permissions = role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: Boolean(_.toNumber(permission.enabled)),
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }
    return acc;
  }, {});
  return permissions;
};

const countUsersPerRole = async roles => {
  for (let i = 0; i < roles.length; ++i) {
    roles[i].nb_users = await strapi
      .query('user', 'users-permissions')
      .count({ role: roles[i].id });
  }
  return roles;
};

const collectAppRoutes = () => {
  return Object.keys(strapi.api || {}).reduce((acc, current) => {
    return acc.concat(_.get(strapi.api[current].config, 'routes', []));
  }, []);
};

const collectPluginRoutes = () => {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  const routes = {};
  Object.keys(clonedPlugins || {}).forEach(current => {
    const pluginRoutes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce(
      (acc, curr) => {
        const prefix = curr.config.prefix;
        const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
        _.set(curr, 'path', path);
        return acc.concat(curr);
      },
      []
    );
    routes[current] = pluginRoutes;
  });
  return routes;
};

const mergeRoutes = (app, plugins) => _.merge({ application: app }, plugins);

const aggregateActions = () => {
  const appActions = Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  const pluginsActions = Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

  return appActions.concat(pluginsActions);
};

const comparePermissions = (db, files) => {
  const sortedDb = db.sort();
  const sortedFiles = files.sort();
  return !_.isEqual(sortedDb, sortedFiles);
};

const splitPermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

const addPermissions = async (toAdd, rolesMap) => {
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
};

const removePermissions = async toRemove => {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
};

module.exports = {
  async createRole(params) {
    const role = await createRoleEntity(params);
    const permissionPromises = createPermissionPromises(role, params.permissions);
    const userUpdate = await updateRoleUsers(role, params.users);
    const promises = [...permissionPromises];
    if (userUpdate) promises.push(userUpdate);
    return Promise.all(promises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const moveUsers = await moveUsersToRole(role.users, publicRoleID);
    const deletePerms = await deletePermissions(role.permissions);
    const deleteRole = await deleteRoleEntity(roleID);

    return Promise.all([moveUsers, deletePerms, deleteRole]);
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
    const appControllers = collectAppControllers();
    const pluginsPermissions = collectPluginPermissions();
    return mergePermissions(appControllers, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = buildRolePermissions(role, plugins);
    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    return countUsersPerRole(roles);
  },

  async getRoutes() {
    const appRoutes = collectAppRoutes();
    const pluginRoutes = collectPluginRoutes();
    return mergeRoutes(appRoutes, pluginRoutes);
  },

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

    const actionsFoundInFiles = aggregateActions();

    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce((acc, action) => {
        return acc.concat(roles.map(role => `${action}.${role[primaryKey]}`));
      }, [])
    );

    if (comparePermissions(permissionsFoundInDB, permissionsFoundInFiles)) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(
        splitPermissionString
      );
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(
        splitPermissionString
      );

      await addPermissions(toAdd, rolesMap);
      await removePermissions(toRemove);
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

    const permissionUpdates = Object.keys(body.permissions || {}).reduce((acc, type) => {
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