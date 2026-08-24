internals.Server.prototype._validateDeps = function () {

    const validatePluginDep = (plugin, depName, depVersion, foundVersion, connectionInfo) => {
        if (version !== '*' &&
            !Somever.match(foundVersion, depVersion)) {

            const context = connectionInfo ? ' in connection: ' + connectionInfo : '';
            return new Error('Plugin ' + plugin + ' requires ' + depName + ' version ' + depVersion + ' but found ' + foundVersion + context);
        }
        return null;
    };

    const checkDeps = (registrations, plugin, dep, connectionInfo) => {
        const deps = Object.keys(plugin.deps);
        for (let j = 0; j < deps.length; ++j) {
            const depName = deps[j];
            const depVersion = plugin.deps[depName];
            const foundVersion = registrations[depName] && registrations[depName].version;

            if (!registrations[depName]) {
                const context = connectionInfo ? ' in connection: ' + connectionInfo : '';
                return new Error('Plugin ' + plugin.plugin + ' missing dependency ' + depName + context);
            }

            const error = validatePluginDep(plugin.plugin, depName, depVersion, foundVersion, connectionInfo);
            if (error) {
                return error;
            }
        }
        return null;
    };

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        if (dependency.connections) {
            for (let j = 0; j < dependency.connections.length; ++j) {
                const connection = dependency.connections[j];
                const error = checkDeps(connection.registrations, dependency, null, connection.info.uri);
                if (error) {
                    return error;
                }
            }
        }
        else {
            const error = checkDeps(this._registrations, dependency, null, null);
            if (error) {
                return error;
            }
        }
    }

    return null;
};