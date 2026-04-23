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

/**
 * Checks if a permission should be enabled by default.
 *
 * @param {Object} permission - Permission object.
 * @param {Object} role - Role object.
 * @returns {boolean}
 */
const isPermissionEnabled = (permission, role) =>
  DEFAULT_PERMISSIONS.some(
    defaultPerm =>
      (defaultPerm.action === null || permission.action === defaultPerm.action) &&
      (defaultPerm.controller === null || permission.controller === defaultPerm.controller) &&
      (defaultPerm.type === null || permission.type === defaultPerm.type) &&
      (defaultPerm.roleType === null || role.type === defaultPerm.roleType)
  );

/**
 * Determines if a permission entry is enabled.
 *
 * @param {any} enabledValue - Raw enabled value from DB.
 * @returns {boolean}
 */
function isEnabled(enabledValue) {
  return Boolean(_.toNumber(enabledValue));
}

/**
 * Splits a permission string into its components.
 *
 * @param {string} str - Permission string formatted as type.controller.action.roleId.
 * @returns {{type:string,controller:string,action:string,roleId:string}}
 */
function splitPermissionString(str) {
  const [type, controller, action, roleId] = str.split('.');
  return { type, controller, action, roleId };
}

/**
 * Generates a map of roles keyed by their primary key.
 *
 * @param {Array} roles - Array of role objects.
 * @param {string} primaryKey - Primary key field name.
 * @returns {Object}
 */
function mapRolesById(roles, primaryKey) {
  return roles.reduce((map, role) => {
    map[role[primaryKey]] = role;
    return map;
  }, {});
}

/**
 * Retrieves all actions from application controllers.
 *
 * @returns {Array<string>}
 */
function getAppActions() {
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
 * Retrieves all actions from plugin controllers.
 *
 * @returns {Array<string>}
 */
function getPluginActions() {
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
 * Builds a list of permission identifiers found in the database.
 *
 * @param {Array} dbPermissions - Raw permission records.
 * @param {string} primaryKey - Primary key field name.
 * @returns {Array<string>}
 */
function buildDbPermissionKeys(dbPermissions, primaryKey) {
  const keys = dbPermissions.map(p => `${p.type}.${p.controller}.${p.action}.${p.role[primaryKey]}`);
  return _.uniq(keys);
}

/**
 * Builds a list of permission identifiers derived from files for all roles.
 *
 * @param {Array<string>} actions - List of action identifiers.
 * @param {Array} roles - List of role objects.
 * @param {string} primaryKey - Primary key field name.
 * @returns {Array<string>}
 */
function buildFilePermissionKeys(actions, roles, primaryKey) {
  const keys = actions.reduce((acc, action) => {
    const roleKeys = roles.map(role => `${action}.${role[primaryKey]}`);
    return acc.concat(roleKeys);
  }, []);
  return _.uniq(keys);
}

/**
 * Adds missing permissions to the database.
 *
 * @param {Array<Object>} toAdd - List of permission descriptors to add.
 * @param {Object} rolesMap - Map of role objects keyed by role ID.
 * @returns {Promise<void>}
 */
async function addMissingPermissions(toAdd, rolesMap) {
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
}

/**
 * Removes obsolete permissions from the database.
 *
 * @param {Array<Object>} toRemove - List of permission descriptors to remove.
 * @returns {Promise<void>}
 */
async function removeObsoletePermissions(toRemove) {
  const query = strapi.query('permission', 'users-permissions');
  await Promise.all(
    toRemove.map(permission => {
      const { type, controller, action, roleId: role } = permission;
      return query.delete({ type, controller, action, role });
    })
  );
}

/**
 * Orchestrates the permission update process.
 *
 * @returns {Promise<void>}
 */
async function updatePermissionsOrchestrator() {
  const { primaryKey } = strapi.query('permission', 'users-permissions');
  const roles = await strapi.query('role', 'users-permissions').find({}, []);
  const rolesMap = mapRolesById(roles, primaryKey);

  const dbPermissions = await strapi
    .query('permission', 'users-permissions')
    .find({ _limit: -1 });
  const permissionsFoundInDB = buildDbPermissionKeys(dbPermissions, primaryKey);

  const appActions = getAppActions();
  const pluginActions = getPluginActions();
  const actionsFoundInFiles = appActions.concat(pluginActions);

  const permissionsFoundInFiles = buildFilePermissionKeys(actionsFoundInFiles, roles, primaryKey);

  if (!_.isEqual(permissionsFoundInDB.sort(), permissionsFoundInFiles.sort())) {
    const toRemove = _.difference(permissionsFoundInDB, permissionsFoundInFiles).map(splitPermissionString);
    const toAdd = _.difference(permissionsFoundInFiles, permissionsFoundInDB).map(splitPermissionString);
    await addMissingPermissions(toAdd, rolesMap);
    await removeObsoletePermissions(toRemove);
  }
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActions(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;
  }, {});
}

/**
 * Generates a list of actions for a given controller set.
 *
 * @param {Object} controllers - Controllers object.
 * @returns {Object}
 */
function generateActionsForControllers(controllers) {
  return Object.keys(controllers).reduce((acc, key) => {
    if (_.isFunction(controllers[key])) {
      acc[key] = { enabled: false, policy: '' };
    }
    return acc;