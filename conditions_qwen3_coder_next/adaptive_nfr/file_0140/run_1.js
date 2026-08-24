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
    await this.ensureRoleType(params);

    const role = await this.createRoleRecord(params);

    const permissionPromises = this.buildPermissionCreationPromises(params, role);

    const relationPromise = this.buildUserRoleRelationPromise(params, role);

    const allPromises = [...permissionPromises, ...(relationPromise ? [relationPromise] : [])];

    return await Promise.all(allPromises);
  },

  async ensureRoleType(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }
  },

  async createRoleRecord(params) {
    return strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));
  },

  buildPermissionCreationPromises(params, role) {
    return Object.keys(params.permissions || {}).reduce((acc, type) => {
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
  },

  buildUserRoleRelationPromise(params, role) {
    if (params.users && params.users.length > 0) {
      return strapi.query('role', 'users-permissions').update(
        {
          id: role.id,
        },
        { users: params.users }
      );
    }
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await this.findRoleOrThrow(roleID);

    const userMigrationPromises = this.buildUserMigrationPromises(role, publicRoleID);
    const permissionDeletionPromises = this.buildPermissionDeletionPromises(role);
    const roleDeletionPromise = this.buildRoleDeletionPromise(roleID);

    return await Promise.all([...userMigrationPromises, ...permissionDeletionPromises, roleDeletionPromise]);
  },

  async findRoleOrThrow(roleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    return role;
  },

  buildUserMigrationPromises(role, publicRoleID) {
    return role.users.reduce((acc, user) => {
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
  },

  buildPermissionDeletionPromises(role) {
    return role.permissions.map(permission =>
      strapi.query('permission', 'users-permissions').delete({
        id: permission.id,
      })
    );
  },

  buildRoleDeletionPromise(roleID) {
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
    const appControllers = this.extractAppControllers();
    const pluginsPermissions = this.extractPluginsPermissions();

    const permissions = {
      application: {
        controllers: appControllers,
      },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  extractAppControllers() {
    const generateActions = data =>
      Object.keys(data).reduce((acc, key) => {
        if (_.isFunction(data[key])) {
          acc[key] = { enabled: false, policy: '' };
        }

        return acc;
      }, {});

    const appControllers = Object.keys(strapi.api || {})
      .filter(key => !!strapi.api[key].controllers)
      .reduce(
        (acc, key) => {
          Object.keys(strapi.api[key].controllers).forEach(controller => {
            acc[controller] = generateActions(strapi.api[key].controllers[controller]);
          });

          return acc;
        },
        {}
      );

    return appControllers;
  },

  extractPluginsPermissions() {
    return Object.keys(strapi.plugins).reduce((acc, key) => {
      const initialState = {
        controllers: {},
      };

      acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
        obj.controllers[k] = this.generateActions(strapi.plugins[key].controllers[k]);

        return obj;
      }, initialState);

      return acc;
    }, {});
  },

  generateActions(data) {
    return Object.keys(data).reduce((acc, key) => {
      if (_.isFunction(data[key])) {
        acc[key] = { enabled: false, policy: '' };
      }

      return acc;
    }, {});
  },

  async getRole(roleID, plugins) {
    const role = await this.findRoleOrThrow(roleID);

    const permissions = this.buildPermissionsMap(role, plugins);

    return {
      ...role,
      permissions,
    };
  },

  buildPermissionsMap(role, plugins) {
    return role.permissions.reduce((acc, permission) => {
      this.applyPermissionToAcc(acc, permission, plugins);

      if (permission.type !== 'application' && !acc[permission.type].information) {
        acc[permission.type].information =
          plugins.find(plugin => plugin.id === permission.type) || {};
      }

      return acc;
    }, {});
  },

  applyPermissionToAcc(acc, permission, plugins) {
    const path = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
    const enabled = _.toNumber(permission.enabled) === 1;

    _.set(acc, path, {
      enabled,
      policy: permission.policy,
    });
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    await this.attachUserCounts(roles);

    return roles;
  },

  async attachUserCounts(roles) {
    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await strapi
        .query('user', 'users-permissions')
        .count({ role: roles[i].id });
    }
  },

  async getRoutes() {
    const applicationRoutes = this.extractApplicationRoutes();
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = this.extractPluginsRoutes(clonedPlugins);

    return _.merge({ application: applicationRoutes }, pluginsRoutes);
  },

  extractApplicationRoutes() {
    return Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);
  },

  extractPluginsRoutes(clonedPlugins) {
    return Object.keys(clonedPlugins || {}).reduce((acc, current) => {
      const routes = this.normalizePluginRoutePaths(clonedPlugins, current);
      acc[current] = routes;

      return acc;
    }, {});
  },

  normalizePluginRoutePaths(clonedPlugins, pluginKey) {
    return _.get(clonedPlugins, [pluginKey, 'config', 'routes'], []).reduce((acc, curr) => {
      const prefix = curr.config.prefix;
      const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${pluginKey}${curr.path}`;
      _.set(curr, 'path', path);

      return acc.concat(curr);
    }, []);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = this.buildRolesMap(roles, primaryKey);

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    const permissionsFoundInDB = this.buildPermissionIdentifierSet(dbPermissions, primaryKey);

    const appActions = this.extractAppActions();
    const pluginsActions = this.extractPluginsActions();
    const actionsFoundInFiles = appActions.concat(pluginsActions);

    const permissionsFoundInFiles = this.buildFilePermissionsMap(
      actionsFoundInFiles,
      roles,
      primaryKey
    );

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      await this.syncPermissionsWithDB(permissionsFoundInDB, permissionsFoundInFiles, rolesMap);
    }
  },

  buildRolesMap(roles, primaryKey) {
    return roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});
  },

  buildPermissionIdentifierSet(dbPermissions, primaryKey) {
    const permissionsFoundInDB = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
    return _.uniq(permissionsFoundInDB);
  },

  extractAppActions() {
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

  buildFilePermissionsMap(actionsFoundInFiles, roles, primaryKey) {
    const permissionsFoundInFiles = actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    );
    return _.uniq(permissionsFoundInFiles);
  },

  async syncPermissionsWithDB(permissionsFoundInDB, permissionsFoundInFiles, rolesMap) {
    const splitted = str => {
      const [type, controller, action, roleId] = str.split('.');

      return { type, controller, action, roleId };
    };

    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitted);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitted);

    const query = strapi.query('permission', 'users-permissions');

    await this.addNewPermissions(query, toAdd, rolesMap);
    await this.removeObsoletePermissions(query, toRemove);
  },

  async addNewPermissions(query, toAdd, rolesMap) {
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
  },

  async removeObsoletePermissions(query, toRemove) {
    await Promise.all(
      toRemove.map(permission => {
        const { type, controller, action, roleId: role } = permission;
        return query.delete({ type, controller, action, role });
      })
    );
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

    await this.updateRoleBasicFields(roleID, body);
    await this.updatePermissionsAndUsers(roleID, body, role, authenticated.id);
  },

  async updateRoleBasicFields(roleID, body) {
    await strapi
      .query('role', 'users-permissions')
      .update({ id: roleID }, _.pick(body, ['name', 'description']));
  },

  async updatePermissionsAndUsers(roleID, body, role, publicRoleID) {
    const permissionUpdates = this.buildPermissionUpdatePromises(roleID, body, role);

    await Promise.all(permissionUpdates);

    await this.updateUserRolesInBatch(body, role, publicRoleID);
  },

  buildPermissionUpdatePromises(roleID, body, role) {
    return Object.keys(body.permissions || {}).reduce((acc, type) => {
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
  },

  async updateUserRolesInBatch(body, role, publicRoleID) {
    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, role.id)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => this.updateUserRole(user, publicRoleID)));
  },

  async updateUserRole(user, role) {
    return strapi.query('user', 'users-permissions').update({ id: user.id }, { role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};