internals.Server.prototype._validateDeps = function () {
    // Validate all plugin dependencies, returning the first error encountered or null if all are satisfied.
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
 * @param {Object} dependency - The dependency descriptor.
 * @returns {Error|null} An error if a dependency is missing or version mismatched, otherwise null.
 */
internals.Server.prototype._validateConnectionDeps = function (dependency) {
    for (const connection of dependency.connections) {
        const depKeys = Object.keys(dependency.deps);
        for (const dep of depKeys) {
            const requiredVersion = dependency.deps[dep];
            const registration = connection.registrations[dep];

            if (!registration) {
                return new Error(
                    'Plugin ' +
                        dependency.plugin +
                        ' missing dependency ' +
                        dep +
                        ' in connection: ' +
                        connection.info.uri
                );
            }

            if (
                requiredVersion !== '*' &&
                !Somever.match(registration.version, requiredVersion)
            ) {
                return new Error(
                    'Plugin ' +
                        dependency.plugin +
                        ' requires ' +
                        dep +
                        ' version ' +
                        requiredVersion +
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
 * Validate dependencies for a plugin that applies globally (no connection-specific dependencies).
 * @param {Object} dependency - The dependency descriptor.
 * @returns {Error|null} An error if a dependency is missing or version mismatched, otherwise null.
 */
internals.Server.prototype._validateGlobalDeps = function (dependency) {
    const depKeys = Object.keys(dependency.deps);
    for (const dep of depKeys) {
        const requiredVersion = dependency.deps[dep];
        const registration = this._registrations[dep];

        if (!registration) {
            return new Error(
                'Plugin ' + dependency.plugin + ' missing dependency ' + dep
            );
        }

        if (
            requiredVersion !== '*' &&
            !Somever.match(registration.version, requiredVersion)
        ) {
            return new Error(
                'Plugin ' +
                    dependency.plugin +
                    ' requires ' +
                    dep +
                    ' version ' +
                    requiredVersion +
                    ' but found ' +
                    registration.version
            );
        }
    }
    return null;
};