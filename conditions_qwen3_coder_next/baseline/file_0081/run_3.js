internals.Server.prototype._validateDeps = function () {

    const validateConnectionDeps = (dependency) => {
        for (let j = 0; j < dependency.connections.length; ++j) {
            const connection = dependency.connections[j];
            for (const dep in dependency.deps) {
                const version = dependency.deps[dep];
                if (!connection.registrations[dep]) {
                    return 'Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri;
                }
                if (version !== '*' && !Somever.match(connection.registrations[dep].version, version)) {
                    return 'Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri;
                }
            }
        }
        return null;
    };

    const validateGlobalDeps = (dependency) => {
        for (const dep in dependency.deps) {
            const version = dependency.deps[dep];
            if (!this._registrations[dep]) {
                return 'Plugin ' + dependency.plugin + ' missing dependency ' + dep;
            }
            if (version !== '*' && !Somever.match(this._registrations[dep].version, version)) {
                return 'Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version;
            }
        }
        return null;
    };

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        const error = dependency.connections
            ? validateConnectionDeps(dependency)
            : validateGlobalDeps(dependency);
        if (error) {
            return new Error(error);
        }
    }

    return null;
};