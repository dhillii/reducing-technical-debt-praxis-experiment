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

const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

const extractControllerActions = (controllers, generateActionsFn) =>
  Object.keys(controllers).reduce((acc, controller) => {
    acc[controller] = generateActionsFn(controllers[controller]);
    return acc;
  }, {});

const buildPermissionPath = (type, controller, action) =>
  `${type}.controllers.${controller}.${action}`;

const parsePermissionString = str => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

const createPermissionString = (type, controller, action, roleId) =>
  `${type}.${controller}.${action}.${roleId}`;

const aggregateControllerActions = (source, sourceKey) => {
  return Object.keys(source).reduce((acc, key) => {
    const controllers = _.get(source[key], 'controllers', {});
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => `${sourceKey}.${controller}.${action.toLowerCase()}`);
      acc = acc.concat(actions);
    });
    return acc;
  }, []);
};

const updateUserRoles = async (users, roleId) => {
  return Promise.all(
    users.map(user => getQuery('user').update({ id: user.id }, { role: roleId }))
  );
};

const createPermissionsForRole = async (permissions, roleId) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        promises.push(
          getQuery('permission').create({
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

const deleteRolePermissions = async role => {
  const promises = [];
  role.permissions.forEach(permission => {
    promises.push(getQuery('permission').delete({ id: permission.id }));
  });
  return promises;
};

const groupPermissionsByType = (permissions, plugins) => {
  return permissions.reduce((acc, permission) => {
    _.set(
      acc,
      buildPermissionPath(permission.type, permission.controller, permission.action),
      {
        enabled: _.toNumber(permission.enabled) === 1,
        policy: permission.policy,
      }
    );

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
};

const updatePermissionsForRole = async (roleId, permissions) => {
  const promises = [];
  Object.keys(permissions || {}).forEach(type => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        promises.push(
          getQuery('permission').update(
            {
              role: roleId,
              type,
              controller,
              action: action.toLowerCase(),
            },
            permissions[type].controllers[controller][action]
          )
        );
      });
    });
  });
  return promises;
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await getQuery('role').create(_.omit(params, ['users', 'permissions']));
    const promises = await createPermissionsForRole(params.permissions, role.id);

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

    const promises = [];
    promises.push(...await updateUserRoles(role.users, publicRoleID));
    promises.push(...await deleteRolePermissions(role));
    promises.push(getQuery('role').delete({ id: roleID }));

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
    const appControllers = Object.keys(strapi.api || {})
      .filter(key => !!strapi.api[key].controllers)
      .reduce(
        (acc, key) => {
          acc.controllers = {
            ...acc.controllers,
            ...extractControllerActions(strapi.api[key].controllers, generateActions),
          };
          return acc;
        },
        { controllers: {} }
      );

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
      acc[key] = {
        controllers: extractControllerActions(strapi.plugins[key].controllers, generateActions),
      };
      return acc;
    }, {});

    return _.merge(
      { application: { controllers: appControllers.controllers } },
      pluginsPermissions
    );
  },

  async getRole(roleID, plugins) {
    const role = await getQuery('role').findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    return {
      ...role,
      permissions: groupPermissionsByType(role.permissions, plugins),
    };
  },

  async getRoles() {
    const roles = await getQuery('role').find({ _sort: 'name' }, []);

    return Promise.all(
      roles.map(async role => ({
        ...role,
        nb_users: await getQuery('user').count({ role: role.id }),
      }))
    );
  },

  async getRoutes() {
    const appRoutes = Object.keys(strapi.api || {}).reduce(
      (acc, current) => acc.concat(_.get(strapi.api[current].config, 'routes', [])),
      []
    );

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
      const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).map(curr => {
        const prefix = curr.config.prefix;
        const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
        return { ...curr, path };
      });

      acc[current] = routes;
      return acc;
    }, {});

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = getQuery('permission');
    const roles = await getQuery('role').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await getQuery('permission').find({ _limit: -1 });
    let permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => createPermissionString(p.type, p.controller, p.action, p.role[primaryKey]))
    );

    const appActions = aggregateControllerActions(strapi.api || {}, 'application');
    const pluginsActions = aggregateControllerActions(strapi.plugins, null);
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
        toRemove.map(permission =>
          query.delete({
            type: permission.type,
            controller: permission.controller,
            action: permission.action,
            role: permission.roleId,
          })
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

    await getQuery('role').update({ id: roleID }, _.pick(body, ['name', 'description']));

    const permissionUpdates = [];
    Object.keys(body.permissions || {}).forEach(type => {
      Object.keys(body.permissions[type].controllers).forEach(controller => {
        Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
          const bodyAction = body.permissions[type].controllers[controller][action];
          const currentAction = _.get(
            role.permissions,
            buildPermissionPath(type, controller, action),
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            permissionUpdates.push(
              getQuery('permission').update(
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