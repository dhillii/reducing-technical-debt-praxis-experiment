internals.Server.prototype._validateDeps = function () {

    for (const dependency of this._dependencies) {
        if (!dependency.connections) {
            const error = this._validateGlobalDependency(dependency);
            if (error) {
                return error;
            }
            continue;
        }

        for (const connection of dependency.connections) {
            const error = this._validateConnectionDependency(dependency, connection);
            if (error) {
                return error;
            }
        }
    }

    return null;
};

/**
 * Validates a global plugin dependency (no specific connections).
 * @param {Object} dependency - The dependency object.
 * @returns {Error|null} - Error if validation fails, null otherwise.
 */
internals.Server.prototype._validateGlobalDependency = function (dependency) {
    const deps = Object.keys(dependency.deps);

    for (const dep of deps) {
        const version = dependency.deps[dep];
        const registered = this._registrations[dep];

        if (!registered) {
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
        }

        if (!this._isVersionMatch(version, registered.version)) {
            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registered.version);
        }
    }

    return null;
};

/**
 * Validates a per-connection plugin dependency.
 * @param {Object} dependency - The dependency object.
 * @param {Connection} connection - The connection object.
 * @returns {Error|null} - Error if validation fails, null otherwise.
 */
internals.Server.prototype._validateConnectionDependency = function (dependency, connection) {
    const deps = Object.keys(dependency.deps);

    for (const dep of deps) {
        const version = dependency.deps[dep];
        const registered = connection.registrations[dep];

        if (!registered) {
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
        }

        if (!this._isVersionMatch(version, registered.version)) {
            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registered.version + ' in connection: ' + connection.info.uri);
        }
    }

    return null;
};

/**
 * Checks if the found version matches the required version constraint.
 * @param {string} required - Required version (e.g. "*", "1.2.3").
 * @param {string} found - Found version.
 * @returns {boolean}
 */
internals.Server.prototype._isVersionMatch = function (required, found) {
    if (required === '*') {
        return true;
    }

    return Somever.match(found, required);
};