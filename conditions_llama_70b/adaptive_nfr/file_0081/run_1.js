internals.Server.prototype._validateDeps = function () {
    if (this._dependencies.length === 0) {
        return null;
    }

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];

        if (!this._hasValidConnections(dependency)) {
            return this._getValidationError(dependency);
        }

        if (!this._hasValidDependencies(dependency)) {
            return this._getValidationError(dependency);
        }
    }

    return null;
};

/**
 * Checks if a dependency has valid connections.
 * @param {Object} dependency - The dependency to check.
 * @returns {Boolean} True if the dependency has valid connections, false otherwise.
 */
internals.Server.prototype._hasValidConnections = function (dependency) {
    if (!dependency.connections) {
        return true;
    }

    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        if (!connection.registrations) {
            return false;
        }
    }

    return true;
};

/**
 * Checks if a dependency has valid dependencies.
 * @param {Object} dependency - The dependency to check.
 * @returns {Boolean} True if the dependency has valid dependencies, false otherwise.
 */
internals.Server.prototype._hasValidDependencies = function (dependency) {
    const deps = Object.keys(dependency.deps);
    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];

        if (dependency.connections) {
            for (let k = 0; k < dependency.connections.length; ++k) {
                const connection = dependency.connections[k];
                if (!connection.registrations[dep]) {
                    return false;
                }

                if (version !== '*' &&
                    !Somever.match(connection.registrations[dep].version, version)) {
                    return false;
                }
            }
        } else {
            if (!this._registrations[dep]) {
                return false;
            }

            if (version !== '*' &&
                !Somever.match(this._registrations[dep].version, version)) {
                return false;
            }
        }
    }

    return true;
};

/**
 * Gets the validation error for a dependency.
 * @param {Object} dependency - The dependency to get the error for.
 * @returns {Error} The validation error.
 */
internals.Server.prototype._getValidationError = function (dependency) {
    if (dependency.connections) {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency in connection: ' + dependency.connections[0].info.uri);
    } else {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency');
    }
};