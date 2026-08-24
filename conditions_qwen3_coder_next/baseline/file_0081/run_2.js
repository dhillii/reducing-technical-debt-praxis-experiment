internals.Server.prototype._validateDeps = function () {

    for (let i = 0; i < this._dependencies.length; ++i) {
        const error = this._validateDependency(this._dependencies[i]);
        if (error) {
            return error;
        }
    }

    return null;
};

internals.Server.prototype._validateDependency = function (dependency) {

    if (dependency.connections) {
        return this._validateConnectionDep(dependency);
    }

    return this._validateServerDep(dependency);
};

internals.Server.prototype._validateConnectionDep = function (dependency) {

    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        const depError = this._checkDependency(connection.registrations, dependency.plugin, dependency.deps, connection.info.uri);
        if (depError) {
            return depError;
        }
    }

    return null;
};

internals.Server.prototype._validateServerDep = function (dependency) {

    return this._checkDependency(this._registrations, dependency.plugin, dependency.deps, null);
};

internals.Server.prototype._checkDependency = function (registrations, pluginName, deps, context) {

    const depsKeys = Object.keys(deps);
    for (let k = 0; k < depsKeys.length; ++k) {
        const dep = depsKeys[k];
        const version = deps[dep];

        if (!registrations[dep]) {
            return new Error('Plugin ' + pluginName + ' missing dependency ' + dep + (context ? ' in connection: ' + context : ''));
        }

        if (version !== '*' &&
            !Somever.match(registrations[dep].version, version)) {

            return new Error('Plugin ' + pluginName + ' requires ' + dep + ' version ' + version + ' but found ' + registrations[dep].version + (context ? ' in connection: ' + context : ''));
        }
    }

    return null;
};