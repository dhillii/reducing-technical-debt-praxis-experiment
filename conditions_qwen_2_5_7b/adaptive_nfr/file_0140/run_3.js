```javascript
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
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await this.createRoleInDatabase(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = this.createPermissionsForRole(role.id, params.permissions);

    // Use Content Manager business logic to handle relation.
    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(
        this.updateUserRoleInDatabase({
          id: role.id,
          users: params.users,
        })
      );
    }

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await this.findRoleById(roleID, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    // Move users to guest role.
    const arrayOfPromises = role.users.reduce((acc, user) => {
      acc.push(
        this.updateUserRoleInDatabase({
          id: user.id,
          role: publicRoleID,
        })
      );

      return acc;
    }, []);

    // Remove permissions related to this role.
    role.permissions.forEach(permission => {
      arrayOfPromises.push(
        this.deletePermissionFromDatabase({
          id: permission.id,
        })
      );
    });

    // Delete the role.
    arrayOfPromises.push(this.deleteRoleFromDatabase({ id: roleID }));

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
            acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
          });

          return acc;
        },
        { controllers: {} }
      );

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
      const initialState = {
        controllers: {},
      };

      acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
        obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);

        return obj;
      }, initialState);

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
    const role = await this.findRoleById(roleID, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    // Group by `type`.
    const permissions = role.permissions.reduce((acc, permission) => {
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

    return {
      ...role,
      permissions,
    };
  },

  async getRoles() {
    const roles = await this.findRoles([], { _sort: 'name' });

    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await this.countUsersByRole(roles[i].id);
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
    const roles = await this.findRoles({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await this.findPermissions({ _limit: -1 });
    let permissionsFoundInDB = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    // Aggregate first level actions.
    const appActions = this.generateAppActions();

    // Aggregate plugins' actions.
    const pluginsActions = this.generatePluginsActions();

    const actionsFoundInFiles = appActions.concat(pluginsActions);

    // create permissions for each role
    let permissionsFoundInFiles = actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    );
    permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

    // Compare to know if actions have been added or removed from controllers.
    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const toRemove = this.getPermissionsToRemove(permissionsFoundInDB, permissionsFoundInFiles);
      const toAdd = this.getPermissionsToAdd(permissionsFoundInFiles, permissionsFoundInDB);

      const query = strapi.query('permission', 'users-permissions');

      // Execute request to update entries in database for each role.
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
    const roleCount = await this.countRoles();

    if (roleCount === 0) {
      await this.createRoleInDatabase({
        name: 'Authenticated',
        description: 'Default role given to authenticated user.',
        type: 'authenticated',
      });

      await this.createRoleInDatabase({
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
      this.findRoleById(authenticated.id, []),
    ]);

    await this.updateRoleInDatabase({ id: roleID }, _.pick(body, ['name', 'description']));

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
                this.updatePermissionInDatabase({
                  role: roleID,
                  type,
                  controller,
                  action: action.toLowerCase(),
                }, bodyAction)
              );
            }
          });
        });

        return acc;
      }, [])
    );

    // Add user to this role.
    const newUsers = _.differenceBy(body.users, role.users, 'id');
    await Promise.all(newUsers.map(user => this.updateUserRole(user, roleID)));

    const oldUsers = _.differenceBy(role.users, body.users, 'id');
    await Promise.all(oldUsers.map(user => this.updateUserRole(user, authenticated.id)));
  },

  async updateUserRole(user, role) {
    return this.updateUserRoleInDatabase({ id: user.id, role });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },

  async createRoleInDatabase(params) {
    return strapi
      .query('role', 'users-permissions')
      .create(params);
  },

  async createPermissionsForRole(roleID, permissions) {
    const arrayOfPromises = Object.keys(permissions || {}).reduce((acc, type) => {
      Object.keys(permissions[type].controllers).forEach(controller => {
        Object.keys(permissions[type].controllers[controller]).forEach(action => {
          acc.push(
            strapi.query('permission', 'users-permissions').create({
              role: roleID,
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

    return arrayOfPromises;
  },

  async updateRoleInDatabase(params) {
    return strapi
      .query('role', 'users-permissions')
      .update(params);
  },

  async updatePermissionInDatabase(params, body) {
    return strapi.query('permission', 'users-permissions').update(params, body);
  },

  async deleteRoleFromDatabase(params) {
    return strapi.query('role', 'users-permissions').delete(params);
  },

  async deletePermissionFromDatabase(params) {
    return strapi.query('permission', 'users-permissions').delete(params);
  },

  async findRoleById(roleID, fields) {
    return strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, fields);
  },

  async findRoles(query, fields) {
    return strapi
      .query('role', 'users-permissions')
      .find(query, fields);
  },

  async countUsersByRole(roleID) {
    return strapi
      .query('user', 'users-permissions')
      .count({ role: roleID });
  },

  async findPermissions(query, fields) {
    return strapi
      .query('permission', 'users-permissions')
      .find(query, fields);
  },

  generateAppActions() {
    return Object.keys(strapi.api || {}).reduce((acc, api) => {
      return acc.concat(_.get(strapi.api[api], 'controllers', {}).reduce((acc, controller) => {
        return acc.concat(Object.keys(controller).filter(action => _.isFunction(controller[action])).map(action => `application.${controller}.${action.toLowerCase()}`));
      }, []));
    }, []);
  },

  generatePluginsActions() {
    return Object.keys(strapi.plugins).reduce((acc, plugin) => {
      return acc.concat(_.get(strapi.plugins[plugin], 'controllers', {}).reduce((acc, controller) => {
        return acc.concat(Object.keys(controller).filter(action => _.isFunction(controller[action])).map(action => `${plugin}.${controller}.${action.toLowerCase()}`));
      }, []));
    }, []);
  },

  getPermissionsToRemove(permissionsFoundInDB, permissionsFoundInFiles) {
    return _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(permission => {
      const [type, controller, action, roleId] = permission.split('.');
      return { type, controller, action, roleId };
    });
  },

  getPermissionsToAdd(permissionsFoundInFiles, permissionsFoundInDB) {
    return _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(permission => {
      const [type, controller, action, roleId] = permission.split('.');
      return { type, controller, action, roleId };
    });
  },
};
```