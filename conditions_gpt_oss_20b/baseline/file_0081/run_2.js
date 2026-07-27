internals.Server.prototype._validateDeps = function () {
    for (const dependency of this._dependencies) {
        const deps = Object.keys(dependency.deps);
        if (dependency.connections) {
            for (const connection of dependency.connections) {
                for (const dep of deps) {
                    const version = dependency.deps[dep];
                    const reg = connection.registrations[dep];
                    if (!reg) {
                        return new Error(`Plugin ${dependency.plugin} missing dependency ${dep} in connection: ${connection.info.uri}`);
                    }
                    if (version !== '*' && !Somever.match(reg.version, version)) {
                        return new Error(`Plugin ${dependency.plugin} requires ${dep} version ${version} but found ${reg.version} in connection: ${connection.info.uri}`);
                    }
                }
            }
        } else {
            for (const dep of deps) {
                const version = dependency.deps[dep];
                const reg = this._registrations[dep];
                if (!reg) {
                    return new Error(`Plugin ${dependency.plugin} missing dependency ${dep}`);
                }
                if (version !== '*' && !Somever.match(reg.version, version)) {
                    return new Error(`Plugin ${dependency.plugin} requires ${dep} version ${version} but found ${reg.version}`);
                }
            }
        }
    }
    return null;
};