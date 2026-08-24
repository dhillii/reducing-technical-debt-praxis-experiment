internals.Server.prototype._validateDeps = function () {

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];

        if (dependency.connections) {
            const error = this._validateConnectionDependencies(dependency);
            if (error) {
                return error;
            }
        }
        else {
            const error = this._validateGlobalDependencies(dependency);
            if (error) {
                return error;
            }
        }
    }

    return null;
};

/**
 * Validates plugin dependencies for a specific connection.
 * @param {Object} dependency - Dependency configuration object.
 * @returns {Error|null} - Error if validation fails, otherwise null.
 */
internals.Server.prototype._validateConnectionDependencies = function (dependency) {

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
                !this._isVersionMatch(connection.registrations[dep].version, version)) {

                return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri);
            }
        }
    }

    return null;
};

/**
 * Validates plugin dependencies for the server globally.
 * @param {Object} dependency - Dependency configuration object.
 * @returns {Error|null} - Error if validation fails, otherwise null.
 */
internals.Server.prototype._validateGlobalDependencies = function (dependency) {

    const deps = Object.keys(dependency.deps);

    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];

        if (!this._registrations[dep]) {
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
        }

        if (version !== '*' &&
            !this._isVersionMatch(this._registrations[dep].version, version)) {

            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
        }
    }

    return null;
};

/**
 * Checks if the registered version matches the required version.
 * @param {string} registeredVersion - The version registered by the plugin.
 * @param {string} requiredVersion - The version required by the dependency.
 * @returns {boolean} - True if version matches, otherwise false.
 */
internals.Server.prototype._isVersionMatch = function (registeredVersion, requiredVersion) {

    return Somever.match(registeredVersion, requiredVersion);
};