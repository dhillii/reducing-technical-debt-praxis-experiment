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
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Convert permission.enabled to a strict boolean.
 */
const toBoolean = value => Number(value) === 1;

/**
 * Build a permissions map for a role.
 */
function buildPermissionsMap(role, plugins) {
  return role.permissions.reduce((acc, permission) => {
    _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
      enabled: toBoolean(permission.enabled),
      policy: permission.policy,
    });

    if (permission.type !== 'application' && !acc[permission.type].information) {
      acc[permission.type].information =
        plugins.find(plugin => plugin.id === permission.type) || {};
    }

    return acc;
  }, {});
}

/**
 * Collect actions defined in core application controllers.
 */
function collectAppActions() {
  return Object.keys(strapi.api || {})
    .reduce((acc, api) => {
      const controllers = _.get(strapi.api[api], 'controllers', {});
      Object.keys(controllers).forEach(controller => {
        const actions = Object.keys(controllers[controller])
          .filter(action => _.isFunction(controllers[controller][action]))
          .map(action => `application.${controller}.${action.toLowerCase()}`);
        acc.push(...actions);
      });
      return acc;
    }, []);
}

/**
 * Collect actions defined in plugins controllers.
 */
function collectPluginActions() {
  return Object.keys(strapi.plugins)
    .reduce((acc, plugin) => {
      const controllers = strapi.plugins[plugin].controllers || {};
      Object.keys(controllers).forEach(controller => {
        const actions = Object.keys(controllers[controller])
          .filter(action => _.isFunction(controllers[controller][action]))
          .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);
        acc.push(...actions);
      });
      return acc;
    }, []);
}

/**
 * Compute differences between DB permissions and file‑based permissions.
 */
function computePermissionDiff(dbPermissions, filePermissions) {
  const dbSet = _.uniq(dbPermissions);
  const fileSet = _.uniq(filePermissions);
  const toAdd = _.difference(fileSet, dbSet);
  const toRemove = _.difference(dbSet, fileSet);
  const split = str => {
    const [type, controller, action, roleId] = str.split('.');
    return { type, controller, action, roleId };
  };
  return {
    toAdd: toAdd.map(split),
    toRemove: toRemove.map(split),
  };
}

/**
 * Apply permission additions to the database.
 */
async function applyPermissionAdditions(toAdd, rolesMap) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toAdd.map(p =>
      query.create({
        type: p.type,
        controller: p.controller,
        action: p.action,
        enabled: isPermissionEnabled(p, rolesMap[p.roleId]),
        policy: '',
        role: p.roleId,
      })
    )
  );
}

/**
 * Apply permission removals from the database.
 */
async function applyPermissionRemovals(toRemove) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toRemove.map(p => query.delete({ type: p.type, controller: p.controller, action: p.action, role: p.roleId }))
  );
}

/**
 * Update role permissions based on the incoming body.
 */
function collectPermissionUpdates(role, bodyPermissions, roleID) {
  const updates = [];
  Object.keys(bodyPermissions || {}).forEach(type => {
    const controllers = bodyPermissions[type].controllers || {};
    Object.keys(controllers).forEach(controller => {
      const actions = controllers[controller];
      Object.keys(actions).forEach(action => {
        const bodyAction = actions[action];
        const currentPath = `${type}.controllers.${controller}.${action}`;
        const currentAction = _.get(role.permissions, currentPath, {});
        if (!_.isEqual(bodyAction, currentAction)) {
          updates.push(
            strapi.query('permission', 'users-permissions').update(
              { role: roleID, type, controller, action: action.toLowerCase() },
              bodyAction
            )
          );
        }
      });
    });
  });
  return updates;
}

/**
 * UsersPermissions.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */
module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const permissionPromises = Object.keys(params.permissions || {}).reduce((acc, type) => {
      const controllers = params.permissions[type].controllers || {};
      Object.keys(controllers).forEach(controller => {
        const actions = controllers[controller];
        Object.keys(actions).forEach(action => {
          acc.push(
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
      return acc;
    }, []);

    if (params.users && params.users.length > 0) {
      permissionPromises.push(
        strapi.query('role', 'users-permissions').update({ id: role.id }, { users: params.users })
      );
    }

    return await Promise.all(permissionPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const userUpdates = role.users.map(user =>
      strapi.query('user', 'users-permissions').update({ id: user.id }, { role: publicRoleID })
    );

    const permissionDeletes = role.permissions.map(p =>
      strapi.query('permission', 'users-permissions').delete({ id: p.id })
    );

    const roleDelete = strapi.query('role', 'users-permissions').delete({ id: roleID });

    return await Promise.all([...userUpdates, ...permissionDeletes, roleDelete]);
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
    const generateActions = data =>
      Object.keys(data).reduce((acc, key) => {
        if (_.isFunction(data[key])) {
          acc[key] = { enabled: false, policy: '' };
        }
        return acc;
      }, {});

    const appControllers = Object.keys(strapi.api || {})
      .filter(key => !!strapi.api[key].controllers)
      .reduce((acc, key) => {
        Object.keys(strapi.api[key].controllers).forEach(controller => {
          acc.controllers[controller] = generateActions(strapi.api[key].controllers[controller]);
        });
        return acc;
      }, { controllers: {} });

    const pluginsPermissions = Object.keys(strapi.plugins).reduce((acc, key) => {
      const initialState = { controllers: {} };
      acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
        obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);
        return obj;
      }, initialState);
      return acc;
    }, {});

    const permissions = { application: { controllers: appControllers.controllers } };
    return _.merge(permissions, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const permissions = buildPermissionsMap(role, plugins);
    return { ...role, permissions };
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);
    await Promise.all(
      roles.map(r =>
        strapi
          .query('user', 'users-permissions')
          .count({ role: r.id })
          .then(count => {
            r.nb_users = count;
          })
      )
    );
    return roles;
  },

  async getRoutes() {
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);

    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = Object.keys(clonedPlugins || {}).reduce((acc, current) => {
      const routes = _.get(clonedPlugins, [current, 'config', 'routes'], []).reduce((list, curr) => {
        const prefix = curr.config.prefix;
        const path = prefix !== undefined ? `${prefix}${curr.path}` : `/${current}${curr.path}`;
        _.set(curr, 'path', path);
        return list.concat(curr);
      }, []);
      acc[current] = routes;
      return acc;
    }, {});

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });

    const dbPermissionKeys = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );

    const appActions = collectAppActions();
    const pluginActions = collectPluginActions();
    const allActions = appActions.concat(pluginActions);

    const filePermissionKeys = allActions.reduce(
      (acc, action) => acc.concat(roles.map(role => `${action}.${role[primaryKey]}`)),
      []
    );

    const { toAdd, toRemove } = computePermissionDiff(dbPermissionKeys, filePermissionKeys);

    if (toAdd.length || toRemove.length) {
      await applyPermissionAdditions(toAdd, rolesMap);
      await applyPermissionRemovals(toRemove);
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

    const permissionUpdates = collectPermissionUpdates(role, body.permissions, roleID);
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