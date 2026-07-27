// ...

  async getRole(roleID, plugins) {
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ id: roleID }, ['permissions']);

    if (!role) {
      throw new Error('Cannot find this role');
    }

    // Group by `type`.
    const permissions = role.permissions.reduce((acc, permission) => {
      const isEnabled = isPermissionEnabledForRole(permission, role);
      _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
        enabled: isEnabled,
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

// ...

  /**
   * Checks if a permission is enabled for a given role.
   * @param {Object} permission - The permission to check.
   * @param {Object} role - The role to check against.
   * @returns {boolean} True if the permission is enabled, false otherwise.
   */
  const isPermissionEnabledForRole = (permission, role) => {
    return _.toNumber(permission.enabled) === 1;
  };

// ...