// Group by `type`.
const groupPermissionsByType = (permissions, plugins) => {
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
};

/**
 * Retrieves a role by ID and enriches its permissions structure.
 * @param {string} roleID - The role identifier.
 * @param {Array} plugins - List of available plugins.
 * @returns {Promise<Object>} The role object with grouped permissions.
 */
async function getRoleWithGroupedPermissions(roleID, plugins) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = groupPermissionsByType(role.permissions, plugins);

  return {
    ...role,
    permissions,
  };
}

module.exports = {
  async createRole(params) {
    if (!params.type) {
      params.type = _.snakeCase(_.deburr(_.toLower(params.name)));
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .create(_.omit(params, ['users', 'permissions']));

    const arrayOfPromises = buildPermissionCreationPromises(params, role.id);

    if (params.users && params.users.length > 0) {
      arrayOfPromises.push(
        strapi.query('role', 'users-permissions').update(
          {
            id: role.id,
          },
          { users: params.users }
        )
      );
    }

    return await Promise.all(arrayOfPromises);
  },

  async deleteRole(roleID, publicRoleID) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['users', 'permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    const arrayOfPromises = moveUsersToPublicRole(role, publicRoleID);

    role.permissions.forEach(permission => {
      arrayOfPromises.push(
        strapi.query('permission', 'users-permissions').delete({
          id: permission.id,
        })
      );
    });

    arrayOfPromises.push(strapi.query('role', 'users-permissions').delete({ id: roleID }));

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

    const appControllers = buildAppControllers(generateActions);

    const pluginsPermissions = buildPluginsPermissions(generateActions);

    const permissions = {
      application: {
        controllers: appControllers.controllers,
      },
    };

    return _.merge(permissions, pluginsPermissions);
  },

  async getRole(roleID, plugins) {
    return getRoleWithGroupedPermissions(roleID, plugins);
  },

  async getRoles() {
    const roles = await strapi.query('role', 'users-permissions').find({ _sort: 'name' }, []);

    for (let i = 0; i < roles.length; ++i) {
      roles[i].nb_users = await strapi
        .query('user', 'users-permissions')
        .count({ role: roles[i].id });
    }

    return roles;
  },

  async getRoutes() {
    const routes = Object.keys(strapi.api || {}).reduce((acc, current) => {
      return acc.concat(_.get(strapi.api[current].config, 'routes', []));
    }, []);
    const clonedPlugins = _.cloneDeep(strapi.plugins);
    const pluginsRoutes = buildPluginsRoutes(clonedPlugins);

    return _.merge({ application: routes }, pluginsRoutes);
  },

  async updatePermissions() {
    const { primaryKey } = strapi.query('permission', 'users-permissions');
    const roles = await strapi.query('role', 'users-permissions').find({}, []);
    const rolesMap = roles.reduce((map, role) => ({ ...map, [role[primaryKey]]: role }), {});

    const dbPermissions = await strapi
      .query('permission', 'users-permissions')
      .find({ _limit: -1 });
    let permissionsFoundInDB = dbPermissions.map(
      p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`
    );
    permissionsFoundInDB = _.uniq(permissionsFoundInDB);

    const appActions = buildAppActions();
    const pluginsActions = buildPluginsActions();

    const actionsFoundInFiles = appActions.concat(pluginsActions);

    let permissionsFoundInFiles = actionsFoundInFiles.reduce(
      (acc, action) => [...acc, ...roles.map(role => `${action}.${role[primaryKey]}`)],
      []
    );
    permissionsFoundInFiles = _.uniq(permissionsFoundInFiles);

    if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
      const splitted = str => {
        const [type, controller, action, roleId] = str.split('.');

        return { type, controller, action, roleId };
      };

      const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitted);
      const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitted);

      const query = strapi.query('permission', 'users-permissions');

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

    await updateRolePermissions(roleID, role, body);

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

// Extracted helper functions

/**
 * Builds permission creation promises for role creation.
 * @param {Object} params - Request parameters.
 * @param {string} roleID - Role identifier.
 * @returns {Array} Array of promises.
 */
function buildPermissionCreationPromises(params, roleID) {
  return Object.keys(params.permissions || {}).reduce((acc, type) => {
    Object.keys(params.permissions[type].controllers).forEach(controller => {
      Object.keys(params.permissions[type].controllers[controller]).forEach(action => {
        acc.push(
          strapi.query('permission', 'users-permissions').create({
            role: roleID,
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
}

/**
 * Builds array of promises to move users to public role.
 * @param {Object} role - Role object.
 * @param {string} publicRoleID - Public role identifier.
 * @returns {Array} Array of promises.
 */
function moveUsersToPublicRole(role, publicRoleID) {
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
}

/**
 * Builds application controllers actions structure.
 * @param {Function} generateActions - Function to generate action structure.
 * @returns {Object} Application controllers structure.
 */
function buildAppControllers(generateActions) {
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
}

/**
 * Builds plugins permissions structure.
 * @param {Function} generateActions - Function to generate action structure.
 * @returns {Object} Plugins permissions structure.
 */
function buildPluginsPermissions(generateActions) {
  return Object.keys(strapi.plugins).reduce((acc, key) => {
    const initialState = {
      controllers: {},
    };

    acc[key] = Object.keys(strapi.plugins[key].controllers).reduce((obj, k) => {
      obj.controllers[k] = generateActions(strapi.plugins[key].controllers[k]);

      return obj;
    }, initialState);

    return acc;
  }, {});
}

/**
 * Builds plugins routes structure.
 * @param {Object} clonedPlugins - Cloned plugins object.
 * @returns {Object} Plugins routes structure.
 */
function buildPluginsRoutes(clonedPlugins) {
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
}

/**
 * Builds application actions list.
 * @returns {Array} List of application actions.
 */
function buildAppActions() {
  return Object.keys(strapi.api || {}).reduce((acc, api) => {
    Object.keys(_.get(strapi.api[api], 'controllers', {})).forEach(controller => {
      const actions = Object.keys(strapi.api[api].controllers[controller])
        .filter(action => _.isFunction(strapi.api[api].controllers[controller][action]))
        .map(action => `application.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });

    return acc;
  }, []);
}

/**
 * Builds plugins actions list.
 * @returns {Array} List of plugins actions.
 */
function buildPluginsActions() {
  return Object.keys(strapi.plugins).reduce((acc, plugin) => {
    Object.keys(strapi.plugins[plugin].controllers).forEach(controller => {
      const actions = Object.keys(strapi.plugins[plugin].controllers[controller])
        .filter(action => _.isFunction(strapi.plugins[plugin].controllers[controller][action]))
        .map(action => `${plugin}.${controller}.${action.toLowerCase()}`);

      acc = acc.concat(actions);
    });

    return acc;
  }, []);
}

/**
 * Updates role permissions based on request body.
 * @param {string} roleID - Role identifier.
 * @param {Object} role - Current role object.
 * @param {Object} body - Request body.
 * @returns {Promise<void>}
 */
async function updateRolePermissions(roleID, role, body) {
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
}