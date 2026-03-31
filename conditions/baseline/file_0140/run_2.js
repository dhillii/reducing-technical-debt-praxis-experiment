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

const getQueryHelper = (entity, plugin = 'users-permissions') => 
  strapi.query(entity, plugin);

const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

const extractControllerActions = (controllers, generator = generateActions) =>
  Object.keys(controllers).reduce((acc, controller) => {
    acc[controller] = generator(controllers[controller]);
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

const createActionString = (type, controller, action) =>
  `${type}.${controller}.${action.toLowerCase()}`;

const extractActionsFromControllers = (source, sourceKey = 'api') => {
  const sourceObj = sourceKey === 'api' ? strapi.api : strapi.plugins;
  
  return Object.keys(source).reduce((acc, key) => {
    const controllers = _.get(sourceObj[key], 'controllers', {});
    
    Object.keys(controllers).forEach(controller => {
      const actions = Object.keys(controllers[controller])
        .filter(action => _.isFunction(controllers[controller][action]))
        .map(action => createActionString(sourceKey === 'api' ? 'application' : key, controller, action));
      
      acc = acc.concat(actions);
    });
    
    return acc;
  }, []);
};

const updateUserRoleAssignment = async (user, roleId) => {
  return getQueryHelper('user').update({ id: user.id }, { role: roleId });
};

const createPermissionsForActions = (permissions, type, controller, action, data) => {
  _.set(permissions, buildPermissionPath(type, controller, action), {
    enabled: _.toNumber(data.enabled) === 1,
    policy: data.policy,
  });
};

const addPluginInformation = (permissions, type, plugins) => {
  if (type !== 'application' && !permissions[type].information) {
    permissions[type].information = plugins.find(p => p.id === type) || {};
  }
};

const buildAppControllers = () => {
  const appControllers = Object.keys(strapi.api || {})
    .filter(key => !!strapi.api[key].controllers)
    .reduce((acc, key) => {
      const controllers = extractControllerActions(strapi.api[key].controllers);
      Object.assign(acc.controllers, controllers);
      return acc;
    }, { controllers: {} });

  return appControllers.controllers;
};

const buildPluginPermissions = () => {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    acc[key] = {
      controllers: extractControllerActions(strapi.plugins[key].controllers),
    };
    return acc;
  }, {});
};

const buildRouteWithPrefix = (route, pluginKey) => {
  const prefix = route.config?.prefix;
  const path = prefix !== undefined ? `${prefix}${route.path}` : `/${pluginKey}${route.path}`;
  return { ...route, path };
};

const buildPluginRoutes = () => {
  const clonedPlugins = _.cloneDeep(strapi.plugins);
  
  return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], [])
      .map(route => buildRouteWithPrefix(route, current));
    
    acc[current] = routes;
    return acc;
  }, {});
};

const createPermissionBatch = async (permissions, query) => {
  return Promise.all(
    permissions.map(permission =>
      query.create({
        type: permission.type,
        controller: permission.controller,
        action: permission.action,
        enabled: permission.enabled,
        policy: permission.policy,
        role: permission.roleId,
      })
    )
  );
};

const deletePermissionBatch = async (permissions, query) => {
  return Promise.all(
    permissions.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
};

const createPermissionsForRole = (permissions, type, controller, action, data) => {
  permissions.push(
    getQueryHelper('permission').create({
      role: data.roleId,
      type,
      controller,
      action: action.toLowerCase(),
      ...data.permissionData,
    })
  );
};

const updatePermissionsForRole = (permissions, type, controller, action, roleId, data) => {
  permissions.push(
    getQueryHelper('permission').update(
      { role: roleId, type, controller, action: action.toLowerCase() },
      data
    )
  );
};

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await getQueryHelper('role').create(
      _.omit(params, ['users', 'permissions'])
    );

    const permissionPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
      Object.keys(params.permissions[type].controllers).forEach(controller => {
        Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
          createPermissionsForRole(
            acc,
            type,
            controller,
            action,
            {
              roleId: role.id,
              permissionData: params.permissions[type].controllers[controller][action],
            }
          );
        });
      });
      return acc;
    }, []);

    if (params.users?.length > 0) {
      permissionPromises.push(
        getQueryHelper('role').update({ id: role.id }, { users: params.users })
      );
    }

    return Promise.all(permissionPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await getQueryHelper('role').findOne(
      { id: roleID },
      ['users', 'permissions']
    );

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const promises = [
      ...role.users.map(user =>
        updateUserRoleAssignment(user, publicRoleID)
      ),
      ...role.permissions.map(permission =>
        getQueryHelper('permission').delete({ id: permission.id })
      ),
      getQueryHelper('role').delete({ id: roleID }),
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
          resolve(err || response?.statusCode !== 200 ? [] : body);
        }
      );
    });
  },

  getActions() {
    const appControllers = buildAppControllers();
    const pluginsPermissions = buildPluginPermissions();

    return _.merge(
      { application: { controllers: appControllers } },
      pluginsPermissions
    );
  },

  async getRole(roleID, plugins) {
    const role = await getQueryHelper('role').findOne(
      { id: roleID },
      ['permissions']
    );

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = role.permissions.reduce((acc, permission) => {
      createPermissionPath(acc, permission);
      addPluginInformation(acc, permission.type, plugins);
      return acc;
    }, {});

    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await getQueryHelper('role').find({ _sort: 'name' }, []);

    return Promise.all(
      roles.map(async role => ({
        ...role,
        nb_users: await getQueryHelper('user').count({ role: role.id }),
      }))
    );
  },

  async getRoutes() {
    const appRoutes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);

    const pluginRoutes = buildPluginRoutes();

    return _.merge({ application: appRoutes }, pluginRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = getQueryHelper('permission');
    const roles = await getQueryHelper('role').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await getQueryHelper('permission').find({ _limit: -1 });
    const permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => createPermissionString(p.type, p.controller, p.action, p.role[primaryKey]))
    );

    const appActions = extractActionsFromControllers(strapi.api || {}, 'api');
    const pluginsActions = extractActionsFromControllers(strapi.plugins, 'plugins');
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.reduce(
        (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
        []
      )
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

      const query = getQueryHelper('permission');

      const toAddWithEnabled = toAdd.map(permission => ({
        ...permission,
        enabled: isPermissionEnabled(permission, rolesMap[permission.roleId]),
        policy: '',
      }));

      await createPermissionBatch(toAddWithEnabled, query);
      await deletePermissionBatch(toRemove, query);
    }
  },

  async initialize() {
    const roleCount = await getQueryHelper('role').count();

    if (roleCount === 0) {
      await Promise.all([
        getQueryHelper('role').create({
          name: 'Authenticated',
          description: 'Default role given to authenticated user.',
          type: 'authenticated',
        }),
        getQueryHelper('role').create({
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
      getQueryHelper('role').findOne({ type: 'authenticated' }, []),
    ]);

    await getQueryHelper('role').update(
      { id: roleID },
      _.pick(body, ['name', 'description'])
    );

    const permissionUpdates = Object.keys(body.permissions || {}).reduce((acc, type) => {
      Object.keys(body.permissions[type].controllers).forEach(controller => {
        Object.keys(body.permissions[type].controllers[controller]).forEach(action => {
          const bodyAction = body.permissions[type].controllers[controller][action];
          const currentAction = _.get(
            role.permissions,
            buildPermissionPath(type, controller, action),
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            updatePermissionsForRole(acc, type, controller, action, roleID, bodyAction);
          }
        });
      });
      return acc;
    }, []);

    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await Promise.all([
      ...newUsers.map(user => updateUserRoleAssignment(user, roleID)),
      ...oldUsers.map(user => updateUserRoleAssignment(user, authenticated.id)),
    ]);
  },

  async updateUserRole(user, role) {
    return updateUserRoleAssignment(user, role);
  },

  template(layout, data) {
    return _.template(layout)(data);
  },
};

// Helper function for creating permission paths
const createPermissionPath = (acc, permission) => {
  createPermissionsForActions(
    acc,
    permission.type,
    permission.controller,
    permission.action,
    permission
  );
};
```