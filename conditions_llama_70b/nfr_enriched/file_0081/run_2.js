internals.Server.prototype._validateDeps = function () {
    // Check if any dependencies are missing
    const missingDeps = this._findMissingDeps();
    if (missingDeps.length > 0) {
        return this._createErrorForMissingDeps(missingDeps);
    }

    // Check if any dependencies have version mismatches
    const versionMismatches = this._findVersionMismatches();
    if (versionMismatches.length > 0) {
        return this._createErrorForVersionMismatches(versionMismatches);
    }

    return null;
};

/**
 * Find missing dependencies for all plugins.
 * @returns {Array} An array of objects containing plugin and dependency information.
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
                        missingDeps.push({ plugin: dependency.plugin, dep, connection: connection.info.uri });
                    }
                }
            }
        }
        else {
            const deps = Object.keys(dependency.deps);
            for (let j = 0; j < deps.length; ++j) {
                const dep = deps[j];
                if (!this._registrations[dep]) {
                    missingDeps.push({ plugin: dependency.plugin, dep });
                }
            }
        }
    }
    return missingDeps;
};

/**
 * Find version mismatches for all plugins.
 * @returns {Array} An array of objects containing plugin, dependency, and version information.
 */
internals.Server.prototype._findVersionMismatches = function () {
    const versionMismatches = [];
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
                        versionMismatches.push({ plugin: dependency.plugin, dep, version, connection: connection.info.uri, foundVersion: connection.registrations[dep].version });
                    }
                }
            }
        }
        else {
            const deps = Object.keys(dependency.deps);
            for (let j = 0; j < deps.length; ++j) {
                const dep = deps[j];
                const version = dependency.deps[dep];
                if (version !== '*' && !Somever.match(this._registrations[dep].version, version)) {
                    versionMismatches.push({ plugin: dependency.plugin, dep, version, foundVersion: this._registrations[dep].version });
                }
            }
        }
    }
    return versionMismatches;
};

/**
 * Create an error message for missing dependencies.
 * @param {Array} missingDeps An array of objects containing plugin and dependency information.
 * @returns {Error} An error object with a descriptive message.
 */
internals.Server.prototype._createErrorForMissingDeps = function (missingDeps) {
    const errorMessage = missingDeps.map((missingDep) => {
        return `Plugin ${missingDep.plugin} missing dependency ${missingDep.dep} in connection: ${missingDep.connection}`;
    }).join('\n');
    return new Error(errorMessage);
};

/**
 * Create an error message for version mismatches.
 * @param {Array} versionMismatches An array of objects containing plugin, dependency, and version information.
 * @returns {Error} An error object with a descriptive message.
 */
internals.Server.prototype._createErrorForVersionMismatches = function (versionMismatches) {
    const errorMessage = versionMismatches.map((versionMismatch) => {
        return `Plugin ${versionMismatch.plugin} requires ${versionMismatch.dep} version ${versionMismatch.version} but found ${versionMismatch.foundVersion} in connection: ${versionMismatch.connection}`;
    }).join('\n');
    return new Error(errorMessage);
};