internals.Server.prototype._validateDeps = function () {
    if (this._dependencies.length === 0) {
        return null;
    }

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        const error = this._validateDependency(dependency);
        if (error) {
            return error;
        }
    }

    return null;
};

/**
 * Validate a single dependency.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Error|null} - An error if the dependency is invalid, null otherwise.
 */
internals.Server.prototype._validateDependency = function (dependency) {
    if (dependency.connections) {
        return this._validateConnectionDependencies(dependency);
    }
    else {
        return this._validateServerDependencies(dependency);
    }
};

/**
 * Validate connection dependencies.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Error|null} - An error if the dependency is invalid, null otherwise.
 */
internals.Server.prototype._validateConnectionDependencies = function (dependency) {
    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        const error = this._validateConnectionDependency(connection, dependency);
        if (error) {
            return error;
        }
    }

    return null;
};

/**
 * Validate a single connection dependency.
 * @param {Object} connection - The connection to validate.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Error|null} - An error if the dependency is invalid, null otherwise.
 */
internals.Server.prototype._validateConnectionDependency = function (connection, dependency) {
    const deps = Object.keys(dependency.deps);
    for (let k = 0; k < deps.length; ++k) {
        const dep = deps[k];
        const version = dependency.deps[dep];
        const error = this._validateDepVersion(connection, dep, version);
        if (error) {
            return error;
        }
    }

    return null;
};

/**
 * Validate a dependency version.
 * @param {Object} connection - The connection to validate.
 * @param {string} dep - The dependency name.
 * @param {string} version - The dependency version.
 * @returns {Error|null} - An error if the dependency is invalid, null otherwise.
 */
internals.Server.prototype._validateDepVersion = function (connection, dep, version) {
    if (!connection.registrations[dep]) {
        return new Error('Plugin ' + connection.info.uri + ' missing dependency ' + dep);
    }

    if (version !== '*' && !Somever.match(connection.registrations[dep].version, version)) {
        return new Error('Plugin ' + connection.info.uri + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version);
    }

    return null;
};

/**
 * Validate server dependencies.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Error|null} - An error if the dependency is invalid, null otherwise.
 */
internals.Server.prototype._validateServerDependencies = function (dependency) {
    const deps = Object.keys(dependency.deps);
    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];
        const error = this._validateServerDepVersion(dep, version);
        if (error) {
            return error;
        }
    }

    return null;
};

/**
 * Validate a server dependency version.
 * @param {string} dep - The dependency name.
 * @param {string} version - The dependency version.
 * @returns {Error|null} - An error if the dependency is invalid, null otherwise.
 */
internals.Server.prototype._validateServerDepVersion = function (dep, version) {
    if (!this._registrations[dep]) {
        return new Error('Plugin missing dependency ' + dep);
    }

    if (version !== '*' && !Somever.match(this._registrations[dep].version, version)) {
        return new Error('Plugin requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
    }

    return null;
};