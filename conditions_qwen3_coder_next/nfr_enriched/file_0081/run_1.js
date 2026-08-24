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
        return this._validateConnectionScopedDependency(dependency);
    }

    return this._validateGlobalScopedDependency(dependency);
};

internals.Server.prototype._validateConnectionScopedDependency = function (dependency) {

    for (let i = 0; i < dependency.connections.length; ++i) {
        const connection = dependency.connections[i];
        const error = this._validatePluginDependencies(dependency, connection);
        if (error) {
            return error;
        }
    }

    return null;
};

internals.Server.prototype._validateGlobalScopedDependency = function (dependency) {

    const error = this._validatePluginDependencies(dependency, this);
    if (error) {
        return error;
    }

    return null;
};

internals.Server.prototype._validatePluginDependencies = function (dependency, context) {

    const deps = Object.keys(dependency.deps);
    for (let i = 0; i < deps.length; ++i) {
        const dep = deps[i];
        const version = dependency.deps[dep];
        const registered = context.registrations[dep];

        if (!registered) {
            return this._missingDependencyError(dependency.plugin, dep, context);
        }

        if (version !== '*' && !Somever.match(registered.version, version)) {
            return this._versionMismatchError(dependency.plugin, dep, version, registered.version, context);
        }
    }

    return null;
};

internals.Server.prototype._missingDependencyError = function (plugin, dep, context) {

    if (context.info) {
        return new Error('Plugin ' + plugin + ' missing dependency ' + dep + ' in connection: ' + context.info.uri);
    }

    return new Error('Plugin ' + plugin + ' missing dependency ' + dep);
};

internals.Server.prototype._versionMismatchError = function (plugin, dep, required, found, context) {

    if (context.info) {
        return new Error('Plugin ' + plugin + ' requires ' + dep + ' version ' + required + ' but found ' + found + ' in connection: ' + context.info.uri);
    }

    return new Error('Plugin ' + plugin + ' requires ' + dep + ' version ' + required + ' but found ' + found);
};