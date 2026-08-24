const populatePermission = (acc, permission) => {
        _.set(
          acc,
          `${permission.type}.controllers.${permission.controller}.${permission.action}`,
          {
            enabled: _.toNumber(permission.enabled) === 1,
            policy: permission.policy,
          }
        );

        if (permission.type !== 'application' && !acc[permission.type].information) {
          acc[permission.type].information = {};
        }

        return acc;
      };

      const mergePluginInformation = (acc, permission, plugins) => {
        if (permission.type !== 'application' && !acc[permission.type].information) {
          acc[permission.type].information =
            plugins.find(plugin => plugin.id === permission.type) || {};
        }

        return acc;
      };

      const groupPermissionsByType = (permissions, plugins) => {
        return permissions.reduce((acc, permission) => {
          populatePermission(acc, permission);
          mergePluginInformation(acc, permission, plugins);

          return acc;
        }, {});
      };