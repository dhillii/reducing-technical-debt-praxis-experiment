// ...

async getRole(roleID, plugins) {
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

/**
 * Group permissions by type.
 * @param {Array} permissions - Array of permissions.
 * @param {Array} plugins - Array of plugins.
 * @returns {Object} Permissions grouped by type.
 */
function groupPermissionsByType(permissions, plugins) {
  return permissions.reduce((acc, permission) => {
    const permissionKey = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
    _.set(acc, permissionKey, {
      enabled: isPermissionEnabledForRole(permission, true),
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
 * Check if a permission is enabled for a role.
 * @param {Object} permission - Permission object.
 * @param {Boolean} enabled - Enabled status.
 * @returns {Boolean} True if permission is enabled, false otherwise.
 */
function isPermissionEnabledForRole(permission, enabled) {
  return _.toNumber(permission.enabled) === 1;
}

// ...