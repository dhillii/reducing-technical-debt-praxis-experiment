internals.Server.prototype._validateDeps = function () {
    for (const dependency of this._dependencies) {
        if (dependency.connections) {
            for (const connection of dependency.connections) {
                const deps = Object.keys(dependency.deps);
                for (const dep of deps) {
                    const error = this._checkDep(dep, dependency.deps[dep], connection, dependency.plugin);
                    if (error) {
                        return error;
                    }
                }
            }
        } else {
            const deps = Object.keys(dependency.deps);
            for (const dep of deps) {
                const error = this._checkDep(dep, dependency.deps[dep], null, dependency.plugin);
                if (error) {
                    return error;
                }
            }
        }
    }
    return null;
};

/**
 * Validate a single dependency against a registration.
 *
 * @param {string} dep - The dependency name.
 * @param {string} version - The required version string.
 * @param {Object|null} connection - The connection object or null for global.
 * @param {string} plugin - The plugin name.
 * @returns {Error|null} An error if validation fails, otherwise null.
 */
internals.Server.prototype._checkDep = function (dep, version, connection, plugin) {
    const registrations = connection ? connection.registrations : this._registrations;
    const registration = registrations[dep];
    if (!registration) {
        if (connection) {
            return new Error('Plugin ' + plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
        }
        return new Error('Plugin ' + plugin + ' missing dependency ' + dep);
    }
    if (version !== '*' && !Somever.match(registration.version, version)) {
        if (connection) {
            return new Error('Plugin ' + plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registration.version + ' in connection: ' + connection.info.uri);
        }
        return new Error('Plugin ' + plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registration.version);
    }
    return null;
};