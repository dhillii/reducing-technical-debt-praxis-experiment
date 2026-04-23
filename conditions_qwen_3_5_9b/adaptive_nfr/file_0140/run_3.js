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
  async createRole(params) {
    const normalizedType = this.normalizeRoleType(params);
    const role = await this.createBaseRole(params, normalizedType);
    const permissionPromises = this.createPermissionsForRole(params, role);
    const userUpdatePromise = this.assignUsersToRole(params, role);

    return await Promise.all([...permissionPromises, userUpdatePromise]);
  },

  normalizeRoleType(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }
    return params.type;
  },

  async createBaseRole(params, type) {
    const roleData = _.omit(params, ['users', 'permissions']);
    return await strapi
      .query('role', 'users-permissions')
      .create(roleData);
  },

  createPermissionsForRole(params, role) {
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
  },

  async assignUsersToRole(params, role) {
    // Use Content Manager business logic to handle relation.
    if (params.users && params.users.length > 0)
      return strapi.query('role', 'users-permissions').update(
        {
          id: role.id,
        },
        { users: params.users }
      );

    return Promise.resolve();
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await this.fetchRoleWithDetails(roleID);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userUpdatePromises = this.migrateUsersToGuestRole(role, publicRoleID);
    const permissionDeletePromises = this.deleteRolePermissions(role);
    const roleDeletePromise = this.deleteRoleEntity(roleID);

    return await Promise.all([...userUpdatePromises, ...permissionDeletePromises, roleDeletePromise]);
  },

  async fetchRoleWithDetails(roleID) {
    return await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);
  },

  migrateUsersToGuestRole(role, publicRoleID) {
    const arrayOfPromises = role.users.reduce((acc, user) => {
      acc.push(
        strapi.query('user', 'users-permissions').update(
          {
            id: user.id,
          },
          {
            role: publicRoleID,
          }
        )
      );

      return acc;
    }, []);

    return arrayOfPromises;
  },

  deleteRolePermissions(role) {
    const arrayOfPromises = role.permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({
        id: permission.id,
      })
    );

    return arrayOfPromises;
  },

  deleteRoleEntity(roleID) {
    return strapi.query('role', 'users-permissions').delete({ id: roleID });
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
    const appControllers = this.extractAppControllersActions();
    const pluginsPermissions = this.extractPluginsPermissions();
    const permissions = {
      application: {
        controllers: appControllers.controllers,
      },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  extractAppControllersActions() {
    const generateActions = data =>
      Object.keys(data).reduce((acc, key) => {
        if (_.isFunction(data[key])) {
          acc[key] = { enabled: false, policy: '' };
        }

        return acc;
      }, {});

    return Object.keys(strapi.api || {})
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
  },

  extractPluginsPermissions() {
    return Object.keys(strapi.plugins).reduce((acc, key) => {
      const initialState = {
        controllers: {},
      };

      acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
        obj.controllers[k] = this.generateActionsForController(strapi.plugins[key].controllers[k]);

        return obj;
      }, initialState);

      return acc;
    }, {});
  },

  generateActionsForController(controllerData) {
    const generateActions = data =>
      Object.keys(data).reduce((acc, key) => {
        if (_.isFunction(data[key])) {
          acc[key] = { enabled: false, policy: '' };
        }

        return acc;
      }, {});

    return generateActions(controllerData);
  },

  async getRole(roleID, plugins) {
    const role = await this.fetchRoleById(roleID);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = this.groupPermissionsByType(role.permissions, plugins);

    return {
      ...role,
      permissions,
    };
  },

  async fetchRoleById(roleID) {
    return await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);
  },

  groupPermissionsByType(permissions, plugins) {
    return permissions.reduce((acc, permission) => {
      _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
        enabled: _.toNumber(permission.enabled) == true,
        policy: permission.policy,
      });

      if (permission.type !== 'application' && !acc[permission.type].information) {
        acc[permission.type].information =
          plugins.find(plugin => plugin.id === permission.type) || {};
      }

      return acc;
    }, {});
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    const rolesWithCounts = await this.enrichRolesWithUserCounts(roles);

    return rolesWithCounts;
  },

  async enrichRolesWithUserCounts(roles) {
    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await strapi
        .query('user', 'users-permissions')
        .count({ role: roles[i].id });
    }

    return roles;
  },

  async getRoutes() {
    const applicationRoutes = this.extractApplicationRoutes();
    const pluginsRoutes = this.extractPluginsRoutes();

    return _.merge({ application: applicationRoutes }, pluginsRoutes);
  },

  extractApplicationRoutes() {
    return Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);
  },

  extractPluginsRoutes() {
    const clonedPlugins = _.cloneDeep(strapi.plugins);
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
  },

  async updatePermissions() {
    const roles = await this.fetchAllRoles();
    const rolesMap = this.buildRolesMap(roles);
    const dbPermissions = await this.fetchAllDbPermissions();
    const permissionsFoundInDB = this.extractUniquePermissionStrings(dbPermissions);

    const appActions = this.extractApplicationActions();
    const pluginsActions = this.extractPluginsActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);
    const permissionsFoundInFiles = this.generateFilePermissions(actionsFoundInFiles, roles);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = this.identifyPermissionsToRemove(permissionsFoundInDB, permissionsFoundInFiles);
      const toAdd = this.identifyPermissionsToAdd(permissionsFoundInFiles, permissionsFoundInDB);

      await this.createMissingPermissions(toAdd, rolesMap);
      await this.deleteObsoletePermissions(toRemove);
    }
  },

  async fetchAllRoles() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    return await strapi.query('role', 'users-permissions').find({}, []);
  },

  buildRolesMap(roles) {
    return roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
  },

  async fetchAllDbPermissions() {
    return await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
  },

  extractUniquePermissionStrings(dbPermissions) {
    return dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
  },

  extractApplicationActions() {
    return Object.keys(strapi.api || {}).reduce((acc, api) => {
      Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
        const actions = Object.keys(strapi.api[api].controllers[controller])
          .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
          .map(action => `application.${controller}.${action.toLowerCase()}`);

        acc = acc.concat(actions);
      });

      return acc;
    }, []);
  },

  extractPluginsActions() {
    return Object.keys(strapi.plugins).reduce((acc, plugin) => {
      Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
        const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
          .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
          .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

        acc = acc.concat(actions);
      });

      return acc;
    }, []);
  },

  generateFilePermissions(actions, roles) {
    return actions.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    );
  },

  identifyPermissionsToRemove(dbPermissions, filePermissions) {
    return _.difference(dbPermissions, filePermissions).map(splitted => {
      const [type, controller, action, roleId] = splitted.split('.');

      return { type, controller, action, roleId };
    });
  },

  identifyPermissionsToAdd(filePermissions, dbPermissions) {
    return _.difference(filePermissions, dbPermissions).map(splitted => {
      const [type, controller, action, roleId] = splitted.split('.');

      return { type, controller, action, roleId };
    });
  },

  async createMissingPermissions(permissions, rolesMap) {
    const query = strapi.query('permission', 'users-permissions');

    await Promise.all(
      permissions.map(permission =>
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
  },

  async deleteObsoletePermissions(permissions) {
    const query = strapi.query('permission', 'users-permissions');

    await Promise.all(
      permissions.map(permission => {
        const { type, controller, action, roleId: role } = permission;
        return query.delete({ type, controller, action, role });
      })
    );
  },

  async initialize() {
    const roleCount = await strapi.query('role', 'users-permissions').count();

    if (roleCount === 0) {
      await this.createDefaultAuthenticatedRole();
      await this.createDefaultPublicRole();
    }

    return this.updatePermissions();
  },

  async createDefaultAuthenticatedRole() {
    return await strapi.query('role', 'users-permissions').create({
      name: 'Authenticated',
      description: 'Default role given to authenticated user.',
      type: 'authenticated',
    });
  },

  async createDefaultPublicRole() {
    return await strapi.query('role', 'users-permissions').create({
      name: 'Public',
      description: 'Default role given to unauthenticated user.',
      type: 'public',
    });
  },

  async updateRole(roleID, body) {
    const [role, authenticated] = await Promise.all([
      this.getRole(roleID, []),
      strapi.query('role', 'users-permissions').findOne({ type: 'authenticated' }, []),
    ]);

    await this.updateRoleBasicInfo(roleID, body);
    await this.updateRolePermissions(role, body, roleID);
    await this.syncRoleUsers(role, body, authenticated);
  },

  async updateRoleBasicInfo(roleID, body) {
    await strapi
      .query('role', 'users-permissions')
      .update({ id: roleID }, _.pick(body, ['name', 'description']));
  },

  async updateRolePermissions(role, body, roleID) {
    await Promise.all(
      Object.keys(body.permissions || {}).reduce((acc, type) => {
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
      }, [])
    );
  },

  async syncRoleUsers(role, body, authenticated) {
    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, role.id)));

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