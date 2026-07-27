internals.Server.prototype._validateDeps = function () {
    if (this._dependencies.length === 0) {
        return null;
    }

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];

        if (dependency.connections) {
            if (!this._validateConnectionDeps(dependency)) {
                return this._getDependencyError(dependency);
            }
        } else {
            if (!this._validateServerDeps(dependency)) {
                return this._getDependencyError(dependency);
            }
        }
    }

    return null;
};

/**
 * Validate connection dependencies.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Boolean} True if the dependency is valid, false otherwise.
 */
internals.Server.prototype._validateConnectionDeps = function (dependency) {
    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        if (!this._validateConnectionDep(connection, dependency)) {
            return false;
        }
    }

    return true;
};

/**
 * Validate a single connection dependency.
 * @param {Object} connection - The connection to validate.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Boolean} True if the dependency is valid, false otherwise.
 */
internals.Server.prototype._validateConnectionDep = function (connection, dependency) {
    const deps = Object.keys(dependency.deps);
    for (let k = 0; k < deps.length; ++k) {
        const dep = deps[k];
        const version = dependency.deps[dep];

        if (!connection.registrations[dep]) {
            return false;
        }

        if (version !== '*' && !Somever.match(connection.registrations[dep].version, version)) {
            return false;
        }
    }

    return true;
};

/**
 * Validate server dependencies.
 * @param {Object} dependency - The dependency to validate.
 * @returns {Boolean} True if the dependency is valid, false otherwise.
 */
internals.Server.prototype._validateServerDeps = function (dependency) {
    const deps = Object.keys(dependency.deps);
    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];

        if (!this._registrations[dep]) {
            return false;
        }

        if (version !== '*' && !Somever.match(this._registrations[dep].version, version)) {
            return false;
        }
    }

    return true;
};

/**
 * Get the dependency error message.
 * @param {Object} dependency - The dependency that caused the error.
 * @returns {Error} The error message.
 */
internals.Server.prototype._getDependencyError = function (dependency) {
    const dep = Object.keys(dependency.deps)[0];
    const version = dependency.deps[dep];

    if (dependency.connections) {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + dependency.connections[0].info.uri);
    } else {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
    }
};