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

const queryRole = () => strapi.query('role', 'users-permissions');
const queryUser = () => strapi.query('user', 'users-permissions');
const queryPermission = () => strapi.query('permission', 'users-permissions');

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

const formatPermissionString = (type, controller, action, roleId) =>
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

const createPermissionPromises = (permissions, roleId) =>
  Object.keys(permissions).reduce((acc, type) => {
    Object.keys(permissions[type].controllers).forEach(controller => {
      Object.keys(permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          queryPermission().create({
            role: roleId,
            type,
            controller,
            action: action.toLowerCase(),
            ...permissions[type].controllers[controller][action],
          })
        );
      });
    });
    return acc;
  }, []);

const reassignUsersToRole = (users, targetRoleId) =>
  users.map(user =>
    queryUser().update({ id: user.id }, { role: targetRoleId })
  );

const deletePermissions = permissions =>
  permissions.map(permission =>
    queryPermission().delete({ id: permission.id })
  );

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
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});

const enrichRolesWithUserCount = async roles => {
  for (let i = 0; i < roles.length; i++) {
    roles[i].nb_users = await queryUser().count({ role: roles[i].id });
  }
  return roles;
};

const buildPluginRoutes = clonedPlugins =>
  Object.keys(clonedPlugins || {}).reduce((acc, current) => {
    const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).map(curr => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
      return { ...curr, path };
    });
    acc[current] = routes;
    return acc;
  }, {});

const compareAndUpdatePermissions = async (permissionsFoundInDB, permissionsFoundInFiles, rolesMap) => {
  if (_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    return;
  }

  const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
  const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

  const query = queryPermission();

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

    const role = await queryRole().create(_.omit(params, ['users', 'permissions']));
    const arrayOfPromises = createPermissionPromises(params.permissions || {}, role.id);

    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(
        queryRole().update({ id: role.id }, { users: params.users })
      );
    }

    return Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await queryRole().findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = [
      ...reassignUsersToRole(role.users, publicRoleID),
      ...deletePermissions(role.permissions),
      queryRole().delete({ id: roleID }),
    ];

    return Promise.all(arrayOfPromises);
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
      .reduce((acc, key) => {
        acc.controllers = {
          ...acc.controllers,
          ...extractControllerActions(strapi.api[key].controllers, generateActions),
        };
        return acc;
      }, { controllers: {} });

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
    const role = await queryRole().findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    return {
      ...role,
      permissions: groupPermissionsByType(role.permissions, plugins),
    };
  },

  async getRoles() {
    const roles = await queryRole().find({ _sort: 'name' }, []);
    return enrichRolesWithUserCount(roles);
  },

  async getRoutes() {
    const appRoutes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = buildPluginRoutes(clonedPlugins);

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = queryPermission();
    const roles = await queryRole().find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await queryPermission().find({ _limit: -1 });
    let permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => formatPermissionString(p.type, p.controller, p.action, p.role[primaryKey]))
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

    await compareAndUpdatePermissions(permissionsFoundInDB, permissionsFoundInFiles, rolesMap);
  },

  async initialize() {
    const roleCount = await queryRole().count();

    if (roleCount === 0) {
      await queryRole().create({
        name: 'Authenticated',
        description: 'Default role given to authenticated user.',
        type: 'authenticated',
      });

      await queryRole().create({
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
      queryRole().findOne({ type: 'authenticated' }, []),
    ]);

    await queryRole().update({ id: roleID }, _.pick(body, ['name', 'description']));

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
              queryPermission().update(
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
    return queryUser().update({ id: user.id }, { role });
  },

  template(layout, data) {
    return _.template(layout)(data);
  },
};
```