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
  },

  async groupPermissionsByType(permissions, plugins) {
    const groupedPermissions = permissions.reduce((acc, permission) => {
      const key = `${permission.type}.controllers.${permission.controller}.${permission.action}`;
      _.set(acc, key, {
        enabled: this.isPermissionEnabledInGroup(permission),
        policy: permission.policy,
      });

      if (permission.type !== 'application' && !acc[permission.type].information) {
        acc[permission.type].information =
          plugins.find(plugin => plugin.id === permission.type) || {};
      }

      return acc;
    }, {});

    return groupedPermissions;
  },

  isPermissionEnabledInGroup(permission) {
    return _.toNumber(permission.enabled) === 1;
  },

// ...