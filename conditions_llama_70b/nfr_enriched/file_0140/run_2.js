// ...

async getRole(roleID, plugins) {
  const role = await strapi
    .query('role', 'users-permissions')
    .findOne({ id: roleID }, ['permissions']);

  if (!role) {
    throw new Error('Cannot find this role');
  }

  const permissions = role.permissions.reduce((acc, permission) => {
    const permissionKey = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
    const permissionValue = {
      enabled: isPermissionEnabledForRole(permission, role),
      policy: permission.policy,
    };

    _.set(acc, permissionKey, permissionValue);

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
}

// Extracted function to check if a permission is enabled for a role
const isPermissionEnabledForRole = (permission, role) =>
  _.toNumber(permission.enabled) === 1;

// ...