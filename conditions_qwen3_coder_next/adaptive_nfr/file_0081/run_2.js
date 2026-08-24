internals.Server.prototype._validateDeps = function () {

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];

        if (dependency.connections) {
            const error = this._validateDependencyWithConnections(dependency);
            if (error) {
                return error;
            }
        }
        else {
            const error = this._validateDependencyWithoutConnections(dependency);
            if (error) {
                return error;
            }
        }
    }

    return null;
};

/**
 * Validates plugin dependencies for connections
 * @param {Object} dependency - Dependency object with connection list
 * @returns {Error|null} - Null if all checks pass, otherwise error
 */
internals.Server.prototype._validateDependencyWithConnections = function (dependency) {

    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        const deps = Object.keys(dependency.deps);

        for (let k = 0; k < deps.length; ++k) {
            const dep = deps[k];
            const version = dependency.deps[dep];

            if (!connection.registrations[dep]) {
                return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
            }

            if (version !== '*' &&
                !internals.Server.prototype._isVersionMatch(connection.registrations[dep].version, version)) {

                return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri);
            }
        }
    }

    return null;
};

/**
 * Validates plugin dependencies for server-wide registrations
 * @param {Object} dependency - Dependency object without specific connections
 * @returns {Error|null} - Null if all checks pass, otherwise error
 */
internals.Server.prototype._validateDependencyWithoutConnections = function (dependency) {

    const deps = Object.keys(dependency.deps);

    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];

        if (!this._registrations[dep]) {
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
        }

        if (version !== '*' &&
            !internals.Server.prototype._isVersionMatch(this._registrations[dep].version, version)) {

            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
        }
    }

    return null;
};

/**
 * Checks if actual version matches expected version constraint
 * @param {string} actualVersion - Actual registered plugin version
 * @param {string} expectedVersion - Expected version constraint
 * @returns {boolean} - True if version matches, false otherwise
 */
internals.Server.prototype._isVersionMatch = function (actualVersion, expectedVersion) {
    return Somever.match(actualVersion, expectedVersion);
};