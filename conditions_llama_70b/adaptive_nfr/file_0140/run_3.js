// ...

async getRole(roleID, plugins) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = await this.groupPermissionsByType(role.permissions, plugins);
  return {
    ...role,
    permissions,
  };
}

/**
 * Group permissions by type.
 * @param {Array} permissions - Permissions to group.
 * @param {Array} plugins - Plugins to consider.
 * @returns {Object} Grouped permissions.
 */
async groupPermissionsByType(permissions, plugins) {
  return permissions.reduce((acc, permission) => {
    const key = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
    _.set(acc, key, {
      enabled: await this.isPermissionEnabled(permission),
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
 * Check if a permission is enabled.
 * @param {Object} permission - Permission to check.
 * @returns {Boolean} Whether the permission is enabled.
 */
async isPermissionEnabled(permission) {
  return _.toNumber(permission.enabled) === 1;
}

// ...