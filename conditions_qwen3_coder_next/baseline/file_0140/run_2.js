const permissions = role.permissions.reduce((acc, permission) => {
      _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
        enabled: !!permission.enabled,
        policy: permission.policy,
      });