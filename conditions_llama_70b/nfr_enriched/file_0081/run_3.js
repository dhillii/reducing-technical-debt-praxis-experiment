internals.Server.prototype._validateDeps = function () {
    // Check if any dependencies are missing
    const missingDeps = this._findMissingDeps();
    if (missingDeps.length > 0) {
        return new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
    }

    // Check if any dependencies have version conflicts
    const versionConflicts = this._findVersionConflicts();
    if (versionConflicts.length > 0) {
        return new Error(`Version conflicts: ${versionConflicts.join(', ')}`);
    }

    return null;
};

/**
 * Find missing dependencies for all plugins.
 * @returns {Array<string>} - List of missing dependencies.
 */
internals.Server.prototype._findMissingDeps = function () {
    const missingDeps = [];
    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        if (dependency.connections) {
            for (let j = 0; j < dependency.connections.length; ++j) {
                const connection = dependency.connections[j];
                const deps = Object.keys(dependency.deps);
                for (let k = 0; k < deps.length; ++k) {
                    const dep = deps[k];
                    if (!connection.registrations[dep]) {
                        missingDeps.push(`Plugin ${dependency.plugin} missing dependency ${dep} in connection: ${connection.info.uri}`);
                    }
                }
            }
        } else {
            const deps = Object.keys(dependency.deps);
            for (let j = 0; j < deps.length; ++j) {
                const dep = deps[j];
                if (!this._registrations[dep]) {
                    missingDeps.push(`Plugin ${dependency.plugin} missing dependency ${dep}`);
                }
            }
        }
    }
    return missingDeps;
};

/**
 * Find version conflicts for all plugins.
 * @returns {Array<string>} - List of version conflicts.
 */
internals.Server.prototype._findVersionConflicts = function () {
    const versionConflicts = [];
    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        if (dependency.connections) {
            for (let j = 0; j < dependency.connections.length; ++j) {
                const connection = dependency.connections[j];
                const deps = Object.keys(dependency.deps);
                for (let k = 0; k < deps.length; ++k) {
                    const dep = deps[k];
                    const version = dependency.deps[dep];
                    if (version !== '*' && !Somever.match(connection.registrations[dep].version, version)) {
                        versionConflicts.push(`Plugin ${dependency.plugin} requires ${dep} version ${version} but found ${connection.registrations[dep].version} in connection: ${connection.info.uri}`);
                    }
                }
            }
        } else {
            const deps = Object.keys(dependency.deps);
            for (let j = 0; j < deps.length; ++j) {
                const dep = deps[j];
                const version = dependency.deps[dep];
                if (version !== '*' && !Somever.match(this._registrations[dep].version, version)) {
                    versionConflicts.push(`Plugin ${dependency.plugin} requires ${dep} version ${version} but found ${this._registrations[dep].version}`);
                }
            }
        }
    }
    return versionConflicts;
};