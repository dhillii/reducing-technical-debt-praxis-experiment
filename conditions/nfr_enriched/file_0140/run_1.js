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

const strapiQuery = (entity, plugin = 'users-permissions') => strapi.query(entity, plugin);

const generateActions = data =>
  Object.keys(data).reduce((acc, key) => {
    if (_.isFunction(data[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

const extractControllerActions = (controllers, generateActionsFn = generateActions) =>
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

const createActionString = (type, controller, action) =>
  `${type}.${controller}.${action}`;

const extractActionsFromControllers = (source, sourceKey = 'api') => {
  const sourceObj = sourceKey === 'api' ? strapi.api : strapi.plugins;
  
  return Object.keys(source).reduce((acc, key) => {
    Object.keys(source[key].controllers).forEach(controller => {
      const actions = Object.keys(source[key].controllers[controller])
        .filter(action => _.isFunction(source[key].controllers[controller][action]))
        .map(action => createActionString(sourceKey === 'api' ? 'application' : key, controller, action.toLowerCase()));

      acc = acc.concat(actions);
    });

    return acc;
  }, []);
};

const updateUserRoles = async (users, roleId) =>
  Promise.all(users.map(user => strapiQuery('user').update({ id: user.id }, { role: roleId })));

const deleteRolePermissions = async permissions =>
  Promise.all(permissions.map(permission => strapiQuery('permission').delete({ id: permission.id })));

const groupPermissionsByType = (permissions, plugins) =>
  permissions.reduce((acc, permission) => {
    _.set(
      acc,
      buildPermissionPath(permission.type, permission.controller, permission.action),
      {
        enabled: _.toNumber(permission.enabled) === 1,
        policy: permission.policy,
      }
    );

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information = plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

const createPermissionsFromParams = (params, roleId) => {
  const permissions = [];

  Object.keys(params.permissions || {}).forEach(type => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        permissions.push(
          strapiQuery('permission').create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...params.permissions[type].controllers[controller][action],
          })
        );
      });
    });
  });

  return permissions;
};

const updateRoleUsers = async (roleId, users) => {
  if (users && users.length > 0) {
    return strapiQuery('role').update({ id: roleId }, { users });
  }
};

const enrichRolesWithUserCount = async roles => {
  const enrichedRoles = await Promise.all(
    roles.map(async role => ({
      ...role,
      nb_users: await strapiQuery('user').count({ role: role.id }),
    }))
  );
  return enrichedRoles;
};

const buildPluginRoutes = (plugins, clonedPlugins) =>
  Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).map(curr => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      return { ...curr, path };
    });

    acc[current] = routes;
    return acc;
  }, {});

const compareAndUpdatePermissions = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap, primaryKey) => {
  if (_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    return;
  }

  const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
  const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

  const query = strapiQuery('permission');

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

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapiQuery('role').create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = createPermissionsFromParams(params, role.id);
    const userPromise = updateRoleUsers(role.id, params.users);

    const allPromises = userPromise ? [...permissionPromises, userPromise] : permissionPromises;
    return Promise.all(allPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapiQuery('role').findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userUpdatePromises = role.users.map(user =>
      strapiQuery('user').update({ id: user.id }, { role: publicRoleID })
    );

    const permissionDeletePromises = role.permissions.map(permission =>
      strapiQuery('permission').delete({ id: permission.id })
    );

    const roleDeletePromise = strapiQuery('role').delete({ id: roleID });

    return Promise.all([...userUpdatePromises, ...permissionDeletePromises, roleDeletePromise]);
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
        (acc, key) => ({
          ...acc,
          controllers: {
            ...acc.controllers,
            ...extractControllerActions(strapi.api[key].controllers),
          },
        }),
        { controllers: {} }
      );

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
      acc[key] = {
        controllers: extractControllerActions(strapi.plugins[key].controllers),
      };
      return acc;
    }, {});

    return _.merge({ application: { controllers: appControllers.controllers } }, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapiQuery('role').findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = groupPermissionsByType(role.permissions, plugins);

    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await strapiQuery('role').find({ _sort: 'name' }, []);
    return enrichRolesWithUserCount(roles);
  },

  async getRoutes() {
    const appRoutes = Object.keys(strapi.api || {}).reduce(
      (acc, current) => acc.concat(_.get(strapi.api[current].config, 'routes', [])),
      []
    );

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = buildPluginRoutes(strapi.plugins, clonedPlugins);

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapiQuery('permission');
    const roles = await strapiQuery('role').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapiQuery('permission').find({ _limit: -1 });
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

    await compareAndUpdatePermissions(permissionsFoundInDB, permissionsFoundInFiles, rolesMap, primaryKey);
  },

  async initialize() {
    const roleCount = await strapiQuery('role').count();

    if (roleCount === 0) {
      await Promise.all([
        strapiQuery('role').create({
          name: 'Authenticated',
          description: 'Default role given to authenticated user.',
          type: 'authenticated',
        }),
        strapiQuery('role').create({
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
      strapiQuery('role').findOne({ type: 'authenticated' }, []),
    ]);

    await strapiQuery('role').update(
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
            acc.push(
              strapiQuery('permission').update(
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
      updateUserRoles(newUsers, roleID),
      updateUserRoles(oldUsers, authenticated.id),
    ]);
  },

  async updateUserRole(user, role) {
    return strapiQuery('user').update({ id: user.id }, { role });
  },

  template(layout, data) {
    return _.template(layout)(data);
  },
};
```