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

const createPermissionPromises = (permissions, roleId) => {
  const promises = [];
  
  Object.entries(permissions || {}).forEach(([type, typeData]) => {
    Object.entries(typeData.controllers || {}).forEach(([controller, actions]) => {
      Object.entries(actions).forEach(([action, actionData]) => {
        promises.push(
          getQueryHelper('permission').create({
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
  Object.entries(data).reduce((acc, [key, value]) => {
    if (_.isFunction(value)) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});

const extractControllerActions = (controllers) =>
  Object.entries(controllers).reduce((acc, [controller, actions]) => {
    acc[controller] = generateActions(actions);
    return acc;
  }, {});

const parsePermissionString = (str) => {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
};

const buildPermissionString = (permission, roleId) =>
  `${permission.type}.${permission.controller}.${permission.action}.${roleId}`;

const aggregateControllerActions = (controllers, prefix = 'application') =>
  Object.entries(controllers).reduce((acc, [controller, actions]) => {
    const actions_list = Object.entries(actions)
      .filter(([, action]) => _.isFunction(action))
      .map(([action]) => `${prefix}.${controller}.${action.toLowerCase()}`);
    
    return acc.concat(actions_list);
  }, []);

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await getQueryHelper('role').create(
      _.omit(params, ['users', 'permissions'])
    );

    const promises = createPermissionPromises(params.permissions, role.id);

    if (params.users?.length > 0) {
      promises.push(
        getQueryHelper('role').update(
          { id: role.id },
          { users: params.users }
        )
      );
    }

    return Promise.all(promises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await getQueryHelper('role').findOne(
      { id: roleID },
      ['users', 'permissions']
    );

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const promises = role.users.map(user =>
      getQueryHelper('user').update(
        { id: user.id },
        { role: publicRoleID }
      )
    );

    role.permissions.forEach(permission => {
      promises.push(
        getQueryHelper('permission').delete({ id: permission.id })
      );
    });

    promises.push(getQueryHelper('role').delete({ id: roleID }));

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
          resolve((err || response?.statusCode !== 200) ? [] : body);
        }
      );
    });
  },

  getActions() {
    const appControllers = Object.entries(strapi.api || {})
      .filter(([, api]) => api.controllers)
      .reduce((acc, [, api]) => {
        Object.assign(acc.controllers, extractControllerActions(api.controllers));
        return acc;
      }, { controllers: {} });

    const pluginsPermissions = Object.entries(strapi.plugins).reduce((acc, [key, plugin]) => {
      acc[key] = {
        controllers: extractControllerActions(plugin.controllers),
      };
      return acc;
    }, {});

    return _.merge(
      { application: { controllers: appControllers.controllers } },
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

    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await getQueryHelper('role').find({ _sort: 'name' }, []);

    const rolesWithCount = await Promise.all(
      roles.map(async role => ({
        ...role,
        nb_users: await getQueryHelper('user').count({ role: role.id }),
      }))
    );

    return rolesWithCount;
  },

  async getRoutes() {
    const appRoutes = Object.values(strapi.api || {}).reduce(
      (acc, api) => acc.concat(_.get(api.config, 'routes', [])),
      []
    );

    const pluginsRoutes = Object.entries(strapi.plugins).reduce((acc, [pluginKey, plugin]) => {
      const routes = _.get(plugin.config, 'routes', []).map(route => {
        const prefix = route.config?.prefix;
        const path = prefix !== undefined ? `${prefix}${route.path}` : `/${pluginKey}${route.path}`;
        return { ...route, path };
      });

      acc[pluginKey] = routes;
      return acc;
    }, {});

    return _.merge({ application: appRoutes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = getQueryHelper('permission');
    const roles = await getQueryHelper('role').find({}, []);
    const rolesMap = Object.fromEntries(roles.map(role => [role[primaryKey], role]));

    const dbPermissions = await getQueryHelper('permission').find({ _limit: -1 });
    const permissionsFoundInDB = _.uniq(
      dbPermissions.map(p => buildPermissionString(p, p.role[primaryKey]))
    );

    const appActions = aggregateControllerActions(
      Object.entries(strapi.api || {}).reduce((acc, [, api]) => {
        Object.assign(acc, api.controllers || {});
        return acc;
      }, {})
    );

    const pluginsActions = Object.entries(strapi.plugins).reduce((acc, [plugin, pluginData]) => {
      return acc.concat(aggregateControllerActions(pluginData.controllers, plugin));
    }, []);

    const actionsFoundInFiles = appActions.concat(pluginsActions);
    const permissionsFoundInFiles = _.uniq(
      actionsFoundInFiles.flatMap(action =>
        roles.map(role => `${action}.${role[primaryKey]}`)
      )
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(parsePermissionString);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(parsePermissionString);

      const query = getQueryHelper('permission');

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
        toRemove.map(({ type, controller, action, roleId }) =>
          query.delete({ type, controller, action, role: roleId })
        )
      );
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

    const permissionUpdates = Object.entries(body.permissions || {}).flatMap(([type, typeData]) =>
      Object.entries(typeData.controllers || {}).flatMap(([controller, actions]) =>
        Object.entries(actions).reduce((acc, [action, bodyAction]) => {
          const currentAction = _.get(
            role.permissions,
            `${type}.controllers.${controller}.${action}`,
            {}
          );

          if (!_.isEqual(bodyAction, currentAction)) {
            acc.push(
              getQueryHelper('permission').update(
                { role: roleID, type, controller, action: action.toLowerCase() },
                bodyAction
              )
            );
          }

          return acc;
        }, [])
      )
    );

    await Promise.all(permissionUpdates);

    const newUsers = _.differenceBy(body.users, role.users, 'id');
    const oldUsers = _.differenceBy(role.users, body.users, 'id');

    await Promise.all([
      ...newUsers.map(user => this.updateUserRole(user, roleID)),
      ...oldUsers.map(user => this.updateUserRole(user, authenticated.id)),
    ]);
  },

  async updateUserRole(user, role) {
    return getQueryHelper('user').update({ id: user.id }, { role });
  },

  template(layout, data) {
    return _.template(layout)(data);
  },
};
```