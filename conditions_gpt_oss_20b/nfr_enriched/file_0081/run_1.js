internals.Server.prototype._validateDeps = function () {
    // Validate all plugin dependencies, delegating to specialized helpers
    for (const dependency of this._dependencies) {
        const error = dependency.connections
            ? this._validateConnectionDeps(dependency)
            : this._validateGlobalDeps(dependency);

        if (error) {
            return error;
        }
    }
    return null;
};

/**
 * Validate dependencies for a plugin that specifies connection-specific dependencies.
 * @param {Object} dependency - The plugin dependency descriptor.
 * @returns {Error|null} An error if validation fails, otherwise null.
 */
internals.Server.prototype._validateConnectionDeps = function (dependency) {
    for (const connection of dependency.connections) {
        const depKeys = Object.keys(dependency.deps);
        for (const depKey of depKeys) {
            const version = dependency.deps[depKey];
            const registration = connection.registrations[depKey];

            if (!registration) {
                return new Error(
                    'Plugin ' +
                        dependency.plugin +
                        ' missing dependency ' +
                        depKey +
                        ' in connection: ' +
                        connection.info.uri
                );
            }

            if (version !== '*' && !Somever.match(registration.version, version)) {
                return new Error(
                    'Plugin ' +
                        dependency.plugin +
                        ' requires ' +
                        depKey +
                        ' version ' +
                        version +
                        ' but found ' +
                        registration.version +
                        ' in connection: ' +
                        connection.info.uri
                );
            }
        }
    }
    return null;
};

/**
 * Validate dependencies for a plugin that applies globally (no connection-specific).
 * @param {Object} dependency - The plugin dependency descriptor.
 * @returns {Error|null} An error if validation fails, otherwise null.
 */
internals.Server.prototype._validateGlobalDeps = function (dependency) {
    const depKeys = Object.keys(dependency.deps);
    for (const depKey of depKeys) {
        const version = dependency.deps[depKey];
        const registration = this._registrations[depKey];

        if (!registration) {
            return new Error(
                'Plugin ' + dependency.plugin + ' missing dependency ' + depKey
            );
        }

        if (version !== '*' && !Somever.match(registration.version, version)) {
            return new Error(
                'Plugin ' +
                    dependency.plugin +
                    ' requires ' +
                    depKey +
                    ' version ' +
                    version +
                    ' but found ' +
                    registration.version
            );
        }
    }
    return null;
};