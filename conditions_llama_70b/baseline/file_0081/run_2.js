internals.Server.prototype._validateDeps = function () {
    const validateDependency = (dependency, connection) => {
        const deps = Object.keys(dependency.deps);
        for (let i = 0; i < deps.length; ++i) {
            const dep = deps[i];
            const version = dependency.deps[dep];

            if (!connection.registrations[dep]) {
                return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
            }

            if (version !== '*' &&
                !Somever.match(connection.registrations[dep].version, version)) {

                return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri);
            }
        }
    };

    const validatePlugin = (dependency) => {
        if (dependency.connections) {
            for (let i = 0; i < dependency.connections.length; ++i) {
                const connection = dependency.connections[i];
                const error = validateDependency(dependency, connection);
                if (error) {
                    return error;
                }
            }
        }
        else {
            const deps = Object.keys(dependency.deps);
            for (let i = 0; i < deps.length; ++i) {
                const dep = deps[i];
                const version = dependency.deps[dep];

                if (!this._registrations[dep]) {
                    return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
                }

                if (version !== '*' &&
                    !Somever.match(this._registrations[dep].version, version)) {

                    return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
                }
            }
        }
    };

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        const error = validatePlugin(dependency);
        if (error) {
            return error;
        }
    }

    return null;
};