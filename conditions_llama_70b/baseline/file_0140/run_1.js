// Group by `type`.
const permissions = role.permissions.reduce((acc, permission) => {
  _.set(acc, `${permission.type}.controllers.${permission.controller}.${permission.action}`, {
    enabled: !!_.toNumber(permission.enabled),
    policy: permission.policy,
  });

  if (permission.type !== 'application' && !acc[permission.type].information) {
    acc[permission.type].information =
      plugins.find(plugin => plugin.id === permission.type) || {};
  }

  return acc;
}, {});