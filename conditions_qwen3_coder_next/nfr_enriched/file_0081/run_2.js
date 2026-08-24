internals.Server.prototype._validateDeps = function () {

    const checkConnectionDependency = this._prepareCheckConnectionDependency();
    const checkGlobalDependency = this._prepareCheckGlobalDependency();

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];

        if (dependency.connections) {
            const error = dependency.connections.some((connection) => checkConnectionDependency(dependency, connection));
            if (error) {
                return error;
            }
        }
        else {
            const error = checkGlobalDependency(dependency);
            if (error) {
                return error;
            }
        }
    }

    return null;
};

// Check dependencies for a specific connection
internals.Server.prototype._prepareCheckConnectionDependency = function () {

    const proxy = this;

    return function (dependency, connection) {

        const deps = Object.keys(dependency.deps);

        for (let k = 0; k < deps.length; ++k) {
            const dep = deps[k];
            const version = dependency.deps[dep];
            const registered = connection.registrations[dep];

            if (!registered) {
                return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
            }

            if (version !== '*' &&
                !Somever.match(registered.version, version)) {

                return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registered.version + ' in connection: ' + connection.info.uri);
            }
        }

        return null;
    };
};

// Check dependencies at the global (server) level
internals.Server.prototype._prepareCheckGlobalDependency = function () {

    const proxy = this;

    return function (dependency) {

        const deps = Object.keys(dependency.deps);

        for (let j = 0; j < deps.length; ++j) {
            const dep = deps[j];
            const version = dependency.deps[dep];
            const registered = proxy._registrations[dep];

            if (!registered) {
                return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
            }

            if (version !== '*' &&
                !Somever.match(registered.version, version)) {

                return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registered.version);
            }
        }

        return null;
    };
};