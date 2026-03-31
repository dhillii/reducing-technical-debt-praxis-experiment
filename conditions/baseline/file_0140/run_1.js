```javascript
'use strict';

const _ = require('lodash');
const request = require('request');

const DEFAULT_PERMISSIONS = [
  { action: 'admincallback', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'adminregister', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'callback', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'connect', controller: 'auth', type: 'users-permissions', roleType: null },
  { action: 'forgotpassword', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'register', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'emailconfirmation', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'resetpassword', controller: 'auth', type: 'users-permissions', roleType: 'public' },
  { action: 'init', controller: 'userspermissions', type: null, roleType: null },
  { action: 'me', controller: 'user', type: 'users-permissions', roleType: null },
  { action: 'autoreload', controller: null, type: null, roleType: null },
];

const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(defaultPerm =>
    (defaultPerm.action === null || permission.action === defaultPerm.action) &&
    (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
    (defaultPerm.type === null || permission.type === defaultPerm.type) &&
    (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

const getQuery = (entity, plugin = 'users-permissions') =>
  strapi.query(entity, plugin);

const createPermissionPromises = (permissions, roleId) => {
  const promises = [];
  Object.entries(permissions || {}).forEach(([type, typeData]) => {
    Object.entries(typeData.controllers || {}).forEach(([controller, actions]) => {
      Object.entries(actions).forEach(([action, actionData]) => {
        promises.push(
          getQuery('permission').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...actionData,
          })
        );
      });
    });
  });
  return promises;
};

const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

const getAppControllers = () => {
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

const getPluginsPermissions = () =>
  Object.keys(strapi.plugins).reduce((acc, key) => {
    acc[key] = {
      controllers: Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
        obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
        return obj;
      }, {}),
    };
    return acc;
  }, {});

const getAppActions = () =>
  Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

const getPluginsActions = () =>
  Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);

const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

const getPluginsRoutes = () => {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).map(curr => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      return { ...curr, path };
    });
    acc[current] = routes;
    return acc;
  }, {});
};

const moveUsersToRole = (users, targetRoleId) =>
  users.map(user =>
    getQuery('user').update({ id: user.id }, { role: targetRoleId })
  );

const deletePermissions = permissions =>
  permissions.map(permission =>
    getQuery('permission').delete({ id: permission.id })
  );

const groupPermissionsByType = (permissions, plugins) =>
  permissions.reduce((acc, permission) => {
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

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await getQuery('role').create(_.omit(params, ['users', 'permissions']));
    const promises = createPermissionPromises(params.permissions, role.id);

    if (params.users && params.users.length > 0) {
      promises.push(
        getQuery('role').update({ id: role.id }, { users: params.users })
      );
    }

    return Promise.all(promises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await getQuery('role').findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const promises = [
      ...moveUsersToRole(role.users, publicRoleID),
      ...deletePermissions(role.permissions),
      getQuery('role').delete({ id: roleID }),
    ];

    return Promise.all(promises);
  },

  getPlugins(lang = 'en') {
    return new Promise(resolve => {
      request(
        {
          uri: `https://marketplace.strapi.io/plugins?lang=${lang}`,
          json: true,
          timeout: 3000,
          headers: { 'cache-control': 'max-age=3600' },
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
    const appControllers = getAppControllers();
    const pluginsPermissions = getPluginsPermissions();

    return _.merge(
      { application: { controllers: appControllers } },
      pluginsPermissions
    );
  },

  async getRole(roleID, plugins) {
    const role = await getQuery('role').findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = groupPermissionsByType(role.permissions, plugins);

    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await getQuery('role').find({ _sort: 'name' }, []);

    const rolesWithCount = await Promise.all(
      roles.map(async role => ({
        ...role,
        nb_users: await getQuery('user').count({ role: role.id }),
      }))
    );

    return rolesWithCount;
  },

  async getRoutes() {
    const appRoutes = Object.keys(strapi.api || {}).reduce(
      (acc, current) => acc.concat(_.get(strapi.api[current].config, 'routes', [])),
      []
    );

    const pluginsRoutes = getPluginsRoutes();

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = getQuery('permission');
    const roles = await getQuery('role').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await getQuery('permission').find({ _limit: -1 });
    let permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`)
    );

    const appActions = getAppActions();
    const pluginsActions = getPluginsActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce(
        (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
        []
      )
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

      const query = getQuery('permission');

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
        toRemove.map(({ type, controller, action, roleId: role }) =>
          query.delete({ type, controller, action, role })
        )
      );
    }
  },

  async initialize() {
    const roleCount = await getQuery('role').count();

    if (roleCount === 0) {
      await Promise.all([
        getQuery('role').create({
          name: 'Authenticated',
          description: 'Default role given to authenticated user.',
          type: 'authenticated',
        }),
        getQuery('role').create({
          name: 'Public',
          description: 'Default role given to unauthenticated user.',
          type: 'public',
        }),
      ]);
    }

    return this.updatePermissions();
  },

  async updateRole(roleID, body) {
    const [role, authenticated] = await Promise.all([
      this.getRole(roleID, []),
      getQuery('role').findOne({ type: 'authenticated' }, []),
    ]);

    await getQuery('role').update(
      { id: roleID },
      _.pick(body, ['name', 'description'])
    );

    const permissionUpdates = Object.entries(body.permissions || {}).reduce((acc, [type, typeData]) => {
      Object.entries(typeData.controllers || {}).forEach(([controller, actions]) => {
        Object.entries(actions).forEach(([action, bodyAction]) => {
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            acc.push(
              getQuery('permission').update(
                { role: roleID, type, controller, action: action.toLowerCase() },
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
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await Promise.all([
      ...newUsers.map(user => this.updateUserRole(user, roleID)),
      ...oldUsers.map(user => this.updateUserRole(user, authenticated.id)),
    ]);
  },

  async updateUserRole(user, role) {
    return getQuery('user').update({ id: user.id }, { role });
  },

  template(layout, data) {
    return _.template(layout)(data);
  },
};
```