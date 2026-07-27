internals.Server.prototype._validateDeps = function () {
    const { _dependencies, _registrations } = this;

    const validate = (dependency, reg, connectionUri) => {
        for (const dep of Object.keys(dependency.deps)) {
            const version = dependency.deps[dep];
            const regDep = reg[dep];
            if (!regDep) {
                return new Error(
                    `Plugin ${dependency.plugin} missing dependency ${dep}` +
                        (connectionUri ? ` in connection: ${connectionUri}` : '')
                );
            }
            if (version !== '*' && !Somever.match(regDep.version, version)) {
                return new Error(
                    `Plugin ${dependency.plugin} requires ${dep} version ${version} but found ${regDep.version}` +
                        (connectionUri ? ` in connection: ${connectionUri}` : '')
                );
            }
        }
        return null;
    };

    for (const dependency of _dependencies) {
        if (dependency.connections) {
            for (const connection of dependency.connections) {
                const err = validate(dependency, connection.registrations, connection.info.uri);
                if (err) {
                    return err;
                }
            }
        } else {
            const err = validate(dependency, _registrations, null);
            if (err) {
                return err;
            }
        }
    }

    return null;
};