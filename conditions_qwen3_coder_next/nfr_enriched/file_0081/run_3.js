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
        const error = this._validateConnectionDependencies(connection, dependency);
        if (error) {
            return error;
        }
    }

    return null;
};

internals.Server.prototype._validateConnectionDependencies = function (connection, dependency) {

    const deps = Object.keys(dependency.deps);
    for (let i = 0; i < deps.length; ++i) {
        const error = this._validateSingleConnectionDependency(connection, dependency, deps[i]);
        if (error) {
            return error;
        }
    }

    return null;
};

internals.Server.prototype._validateSingleConnectionDependency = function (connection, dependency, dep) {

    const version = dependency.deps[dep];

    if (!connection.registrations[dep]) {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
    }

    if (version !== '*' &&
        !Somever.match(connection.registrations[dep].version, version)) {

        return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri);
    }

    return null;
};

internals.Server.prototype._validateGlobalScopedDependency = function (dependency) {

    const deps = Object.keys(dependency.deps);
    for (let i = 0; i < deps.length; ++i) {
        const error = this._validateSingleGlobalDependency(dependency, deps[i]);
        if (error) {
            return error;
        }
    }

    return null;
};

internals.Server.prototype._validateSingleGlobalDependency = function (dependency, dep) {

    const version = dependency.deps[dep];

    if (!this._registrations[dep]) {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
    }

    if (version !== '*' &&
        !Somever.match(this._registrations[dep].version, version)) {

        return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
    }

    return null;
};